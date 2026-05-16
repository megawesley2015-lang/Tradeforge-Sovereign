
"use client";
import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/lib/supabase-browser';
import { Zap, Mail, Lock, AlertCircle } from 'lucide-react';
import Link from 'next/link';

// useSearchParams() precisa de Suspense boundary no Next.js App Router.
// Separamos a logica que usa searchParams em um componente interno.
function LoginForm() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const redirect     = searchParams.get('redirect') || '/trading/dashboard';
  const urlError     = searchParams.get('error');

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(urlError || '');

  const supabase = getSupabaseBrowserClient();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message === 'Invalid login credentials'
        ? 'Email ou senha incorretos.'
        : error.message);
      setLoading(false);
      return;
    }

    router.push(redirect);
    router.refresh();
  };

  return (
    <div className="bg-[#0F0F1A] border border-[#1F1F2E] rounded-3xl p-8">
      <form onSubmit={handleLogin} className="space-y-5">

        {error && (
          <div className="flex items-center gap-2 bg-red-900/20 border border-red-800/40 text-red-400 text-sm p-3 rounded-xl">
            <AlertCircle size={16} className="shrink-0" />
            {error}
          </div>
        )}

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
          <div className="flex justify-between items-center mb-2">
            <label className="text-xs text-gray-500">Senha</label>
          </div>
          <div className="relative">
            <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="w-full bg-[#161625] border border-[#2A2A3C] rounded-xl py-3 pl-9 pr-4 text-white outline-none focus:border-[#FF6B35] placeholder-gray-600 text-sm"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-[#FF6B35] hover:bg-[#e55a2a] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl transition-colors"
        >
          {loading ? 'Entrando...' : 'Entrar'}
        </button>
      </form>

      <p className="text-center text-gray-500 text-sm mt-6">
        Nao tem conta?{' '}
        <Link href="/auth/register" className="text-[#FF6B35] hover:underline font-medium">
          Cadastre-se
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-[#07070D] flex items-center justify-center p-4">
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-[#FF6B35] rounded-xl flex items-center justify-center">
              <Zap size={20} className="text-white" fill="currentColor" />
            </div>
            <h1 className="text-2xl font-bold text-white">
              TradeForge <span className="text-[#FF6B35]">Sovereign</span>
            </h1>
          </div>
          <p className="text-gray-500 text-sm">Acesse sua conta para continuar</p>
        </div>

        {/* Suspense necessario para useSearchParams no App Router */}
        <Suspense fallback={
          <div className="bg-[#0F0F1A] border border-[#1F1F2E] rounded-3xl p-8 animate-pulse">
            <div className="h-12 bg-[#161625] rounded-xl mb-4" />
            <div className="h-12 bg-[#161625] rounded-xl mb-4" />
            <div className="h-12 bg-[#FF6B35]/20 rounded-xl" />
          </div>
        }>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
