
/**
 * GET /auth/callback
 *
 * Rota de callback para o fluxo PKCE do Supabase.
 * Chamada automaticamente pelo Supabase após:
 *  - Confirmação de email (signup)
 *  - Magic link
 *  - OAuth (Google, GitHub, etc.)
 *
 * O Supabase redireciona para esta URL com ?code=... (PKCE)
 * ou com #access_token=... (implicit flow legado).
 *
 * Esta rota troca o `code` por uma sessão real e cria os cookies
 * de sessão corretos antes de redirecionar para o dashboard.
 *
 * Configuração necessária no Supabase Dashboard:
 *   Authentication → URL Configuration → Redirect URLs
 *   Adicionar: http://localhost:3000/auth/callback
 *   Adicionar: https://seu-dominio.vercel.app/auth/callback
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);

  const code     = searchParams.get('code');
  const next     = searchParams.get('next') ?? '/trading/dashboard';
  const errorMsg = searchParams.get('error_description');

  // Erro retornado pelo Supabase (ex: link expirado)
  if (errorMsg) {
    const loginUrl = new URL('/auth/login', origin);
    loginUrl.searchParams.set('error', errorMsg);
    return NextResponse.redirect(loginUrl);
  }

  if (!code) {
    // Sem code → pode ser implicit flow com hash (#access_token=...)
    // O hash é processado pelo cliente JS — redireciona para o dashboard
    // e o Supabase browser client vai detectar o token automaticamente
    return NextResponse.redirect(new URL('/trading/dashboard', origin));
  }

  // PKCE: troca o `code` por uma sessão
  const cookieStore = await cookies();

  let supabaseResponse = NextResponse.redirect(new URL(next, origin));

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error('❌ Auth callback exchangeCodeForSession error:', error.message);
    const loginUrl = new URL('/auth/login', origin);
    loginUrl.searchParams.set('error', 'Link inválido ou expirado. Faça login novamente.');
    return NextResponse.redirect(loginUrl);
  }

  // Sessão criada com sucesso → redireciona para o dashboard
  // Os cookies de sessão já foram definidos pelo setAll acima
  return supabaseResponse;
}
