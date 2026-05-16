
import { redirect } from 'next/navigation';

/**
 * Rota raiz — redireciona automaticamente para o dashboard.
 * O middleware irá interceptar e redirecionar para /auth/login
 * caso o usuário não esteja autenticado.
 */
export default function RootPage() {
  redirect('/trading/dashboard');
}
