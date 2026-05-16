import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import LandingPage from '@/components/landing/LandingPage';

/**
 * Rota raiz — Landing page publica.
 * Usuarios autenticados sao redirecionados automaticamente para o dashboard.
 */
export default async function RootPage() {
  const cookieStore = await cookies();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Se as env vars estao presentes, verifica a sessao
  if (supabaseUrl && supabaseAnonKey) {
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {
          // Nao precisamos escrever cookies aqui — so lemos
        },
      },
    });

    const { data: { user } } = await supabase.auth.getUser();

    // Usuario autenticado → vai direto pro dashboard
    if (user) {
      redirect('/trading/dashboard');
    }
  }

  // Nao autenticado → exibe a landing page
  return <LandingPage />;
}
