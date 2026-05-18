import { createClient } from '@supabase/supabase-js';

const supabaseUrl        = process.env.NEXT_PUBLIC_SUPABASE_URL      ?? '';
const supabaseAnonKey    = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY  ?? '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY      ?? '';

// ⚠️  NÃO lançar throw aqui — um throw no nível do módulo faz o Next.js
// retornar uma página HTML de erro em vez de JSON, quebrando TODAS as rotas
// que importam este arquivo (cycle, backtest, price, etc.).
// A verificação de configuração é feita dentro das rotas quando necessário.
if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('[Supabase] Atenção: NEXT_PUBLIC_SUPABASE_URL e/ou NEXT_PUBLIC_SUPABASE_ANON_KEY não definidos. Funcionalidades do banco de dados ficarão indisponíveis.');
}

/** Cliente público (anon key) — respeita RLS. Usar no frontend. */
export const supabase = createClient(
  supabaseUrl  || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key',
);

/**
 * Cliente admin (service role key) — BYPASSA RLS completamente.
 * ⚠️  NUNCA expor no frontend. Usar APENAS em API routes server-side.
 *
 * Necessário para:
 *   - Scanner route (INSERT/UPDATE em live_demo_trades)
 *   - Cron job (leitura/escrita em qualquer tabela protegida)
 *   - Qualquer rota que precise escrever dados sem autenticação do usuário
 *
 * Fallback: se SUPABASE_SERVICE_ROLE_KEY não estiver configurada,
 * usa a anon key (leitura funciona, escrita pode falhar em tabelas com RLS).
 */
export const supabaseAdmin = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseServiceKey || supabaseAnonKey || 'placeholder-key',
  {
    auth: {
      // Service role nunca usa sessions de usuário
      autoRefreshToken:  false,
      persistSession:    false,
      detectSessionInUrl: false,
    },
  },
);
