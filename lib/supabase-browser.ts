
/**
 * Cliente Supabase para componentes CLIENT ("use client").
 *
 * Usa createBrowserClient do @supabase/ssr que:
 * - Persiste sessão em cookies (não localStorage)
 * - Compatível com SSR/middleware do Next.js
 * - Atualiza cookies automaticamente a cada request
 *
 * Use este cliente em qualquer arquivo com "use client".
 */

import { createBrowserClient } from '@supabase/ssr';

export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// Singleton para uso direto
let _client: ReturnType<typeof createBrowserClient> | null = null;

export function getSupabaseBrowserClient() {
  if (!_client) {
    _client = createSupabaseBrowserClient();
  }
  return _client;
}
