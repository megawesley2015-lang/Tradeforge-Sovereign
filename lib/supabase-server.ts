/**
 * Cliente Supabase para SERVER Components e API Routes.
 * Usa createServerClient do @supabase/ssr com os cookies do Next.js.
 * Deve ser chamado dentro de funcoes async (nao no escopo de modulo).
 */

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // setAll pode falhar em Server Components (read-only context)
            // E seguro ignorar - o middleware cuida do refresh
          }
        },
      },
    }
  );
}
