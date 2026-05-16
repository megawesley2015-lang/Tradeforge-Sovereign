
/**
 * Middleware de autenticação — Next.js App Router + Supabase SSR
 *
 * USA: @supabase/ssr createServerClient com cookie helpers.
 * Isso resolve o "TypeError: Failed to convert value to 'Response'"
 * que ocorria quando o middleware usava o createClient padrão sem
 * suporte a cookies no Edge Runtime.
 *
 * O que este middleware faz:
 * 1. Lê e escreve cookies de sessão corretamente no Edge Runtime
 * 2. Renova o access_token automaticamente (via refresh_token)
 * 3. Redireciona para /auth/login se não autenticado em /trading/*
 * 4. Permite /auth/callback sem autenticação (necessário para PKCE)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

// Rotas que NÃO precisam de autenticação
const PUBLIC_PATHS = [
  '/',
  '/auth/login',
  '/auth/register',
  '/auth/callback',   // ← CRÍTICO: deve ser pública para troca de código PKCE
  '/api/cron',
  '/trading/api',     // ← API routes do módulo trading (backtest, sinais, etc.) são server-side; auth é responsabilidade delas
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Deixa passar assets e internals do Next.js
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.includes('.')           // arquivos estáticos (.svg, .png, etc.)
  ) {
    return NextResponse.next();
  }

  // Deixa passar rotas públicas
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return NextResponse.next();
  }

  // Só protege /trading/*
  if (!pathname.startsWith('/trading')) {
    return NextResponse.next();
  }

  // ── Guard: env vars do Supabase devem existir em runtime ──
  // Sem isso, o middleware crashava silenciosamente no Edge Runtime, podendo
  // produzir respostas inválidas que viravam chrome-error no navegador.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error(
      '[middleware] ❌ NEXT_PUBLIC_SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_ANON_KEY ausente. ' +
      'Confira .env.local em dev e as env vars na Vercel em produção.'
    );
    // Falha graciosamente: redireciona para o login com mensagem clara,
    // em vez de derrubar todas as requests com 500.
    const loginUrl = new URL('/auth/login', req.url);
    loginUrl.searchParams.set('error', 'Configuração do servidor incompleta.');
    return NextResponse.redirect(loginUrl);
  }

  // ── Cria response mutável (necessário para o SSR client atualizar cookies) ──
  let supabaseResponse = NextResponse.next({ request: req });

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          // Primeiro: atualiza os cookies no request (para que a route os veja)
          cookiesToSet.forEach(({ name, value }) =>
            req.cookies.set(name, value)
          );
          // Segundo: recria a response com os cookies atualizados
          supabaseResponse = NextResponse.next({ request: req });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANTE: getUser() é o método correto para middleware.
  // Não use getSession() aqui — ele não valida o JWT contra o servidor.
  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch (err) {
    // Supabase indisponível (paused, timeout, etc.) → redireciona para login
    // em vez de deixar o middleware crashar com 500.
    console.error('[middleware] ❌ supabase.auth.getUser() falhou:', err);
    const loginUrl = new URL('/auth/login', req.url);
    loginUrl.searchParams.set('error', 'Serviço de autenticação indisponível.');
    return NextResponse.redirect(loginUrl);
  }

  if (!user) {
    // Usuário não autenticado → redireciona para login
    const loginUrl = new URL('/auth/login', req.url);
    loginUrl.searchParams.set('redirect', pathname);

    // Clona os cookies de sessão para a response de redirect
    const redirectResponse = NextResponse.redirect(loginUrl);
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie.name, cookie.value, cookie);
    });
    return redirectResponse;
  }

  // Usuário autenticado → continua, mas RETORNA supabaseResponse
  // (não NextResponse.next()) para que os cookies atualizados sejam enviados
  return supabaseResponse;
}

export const config = {
  // Aplica o middleware em TODAS as rotas exceto assets estaticos
  // O filtro fino e feito dentro d
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
