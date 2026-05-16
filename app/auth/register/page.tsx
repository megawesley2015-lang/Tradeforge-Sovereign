
"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/lib/supabase-browser';
import { Zap, Mail, Lock, User, AlertCircle, CheckCircle } from 'lucide-react';
import Link from 'next/link';

export default function RegisterPage() {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();

  const [name,     setName]     = useState('');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [success,  setSuccess]  = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setError('As senhas não coincidem.');
      return;
    }
    if (password.length < 8) {
      setError('A senha deve ter pelo menos 8 caracteres.');
      return;
    }

    setLoading(true);
    setError('');

    // 1. Cria conta no Supabase Auth
    // emailRedirectTo aponta para /auth/callback que troca o code por sessão (PKCE)
    //
    // IMPORTANTE: usar window.location.origin (não NEXT_PUBLIC_APP_URL) garante
    // que o link do email SEMPRE aponta para o domínio em que o usuário está
    // de fato navegando. Evita o bug clássico de fazer signup em prod e o link
    // mandar para localhost porque NEXT_PUBLIC_APP_URL ficou desatualizada.
    // Pré-requisito: cadastrar o domínio em
    //   Supabase → Authentication → URL Configuration → Redirect URLs
    const origin = window.location.origin;
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data:            { full_name: name },
        emailRedirectTo: `${origin}/auth/callback`,
      },
    });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    // 2. Cria perfil com banca inicial de $1.000
    if (data.user) {
      await supabase.from('profiles').insert({
        user_id:        data.user.id,
        balance:        1000.00,
        peak_balance:   1000.00,
        account_status: 'ACTIVE',
      });
    }

    setSuccess(true);
    setLoading(false);

    // Se a confirmação de email estiver desativada no Supabase, vai direto
    if (data.session) {
      setTimeout(() => router.push('/trading/dashboard'), 1500);
    }
  };

  return (
    <div className="min-h-screen bg-[#07070D] flex items-center justify-center p-4">
      <div className="w-full max-w-md">

        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-[#FF6B35] rounded-xl flex items-center justify-center">
              <Zap size={20} className="text-white" fill="currentColor" />
            </div>
            <h1 className="text-2xl font-bold text-white">
              TradeForge <span className="text-[#FF6B35]">Sovereign</span>
            </h1>
          </div>
          <p className="text-gray-500 text-sm">Crie sua conta e comece a operar</p>
        </div>

        <div className="bg-[#0F0F1A] border border-[#1F1F2E] rounded-3xl p-8">

          {success ? (
            <div className="text-center py-6">
              <CheckCircle size={48} className="text-green-500 mx-auto mb-4" />
              <p className="text-white font-bold text-lg">Conta criada!</p>
              <p className="text-gray-500 text-sm mt-2">
                Verifique seu email para confirmar o cadastro.
              </p>
              <Link href="/auth/login" className="mt-6 inline-block text-[#FF6B35] hover:underline text-sm">
                Ir para login
              </Link>
            </div>
          ) : (
            <form onSubmit={handleRegister} className="space-y-5">

              {error && (
                <div className="flex items-center gap-2 bg-red-900/20 border border-red-800/40 text-red-400 text-sm p-3 rounded-xl">
                  <AlertCircle size={16} className="shrink-0" />
                  {error}
                </div>
              )}

              <div>
                <label className="text-xs text-gray-500 block mb-2">Nome</label>
                <div className="relative">
                  <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Seu nome"
                    required
                    className="w-full bg-[#161625] border border-[#2A2A3C] rounded-xl py-3 pl-9 pr-4 text-white outline-none focus:border-[#FF6B35] placeholder-gray-600 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-500 block mb-2">Email</label>
                <div className="relative">
                  <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seu@email.com"
                    required
                    className="w-full bg-[#161625] border border-[#2A2A3C] rounded-xl py-3 pl-9 pr-4 text-white outline-none focus:border-[#FF6B35] placeholder-gray-600 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-500 block mb-2">Senha</label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mínimo 8 caracteres"
                    required
                    className="w-full bg-[#161625] border border-[#2A2A3C] rounded-xl py-3 pl-9 pr-4 text-white outline-none focus:border-[#FF6B35] placeholder-gray-600 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-500 block mb-2">Confirmar senha</label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Repita a senha"
                    required
                    className="w-full bg-[#161625] border border-[#2A2A3C] rounded-xl py-3 pl-9 pr-4 text-white outline-none focus:border-[#FF6B35] placeholder-gray-600 text-sm"
                  />
                </div>
              </div>

              <div className="bg-[#161625] rounded-xl p-3 text-xs text-gray-500">
                🎁 Toda conta nova começa com <span className="text-[#FF6B35] font-bold">$1.000 simulados</span> para testar sem risco.
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#FF6B35] hover:bg-[#e55a2a] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl transition-colors"
              >
                {loading ? 'Criando conta...' : 'Criar conta gratuita'}
              </button>
            </form>
          )}

          {!success && (
            <p className="text-center text-gray-500 text-sm mt-6">
              Já tem conta?{' '}
              <Link href="/auth/login" className="text-[#FF6B35] hover:underline font-medium">
                Entrar
              </Link>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
