import { createClient } from '@supabase/supabase-js';

const supabaseUrl     = process.env.NEXT_PUBLIC_SUPABASE_URL     ?? '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

// ⚠️  NÃO lançar throw aqui — um throw no nível do módulo faz o Next.js
// retornar uma página HTML de erro em vez de JSON, quebrando TODAS as rotas
// que importam este arquivo (cycle, backtest, price, etc.).
// A verificação de configuração é feita dentro das rotas quando necessário.
if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('[Supabase] Atenção: NEXT_PUBLIC_SUPABASE_URL e/ou NEXT_PUBLIC_SUPABASE_ANON_KEY não definidos. Funcionalidades do banco de dados ficarão indisponíveis.');
}

export const supabase = createClient(
  supabaseUrl  || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key',
);
