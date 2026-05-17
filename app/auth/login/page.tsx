"use client";
import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/lib/supabase-browser';
import { Mail, Lock, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import '@/components/auth/auth.css';

function passwordStrength(pw: string): 0 | 1 | 2 | 3 {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 8)  score++;
  if (/[A-Z]/.test(pw) || /[0-9]/.test(pw)) score++;
  if (pw.length >= 12) score++;
  return score as 0 | 1 | 2 | 3;
}

function StrengthBar({ pw }: { pw: string }) {
  const s = passwordStrength(pw);
  if (!pw) return null;
  const cls = s === 1 ? 'weak' : s === 2 ? 'medium' : 'strong';
  return (
    <div className="tf-auth-strength">
      {[1, 2, 3].map((i) => (
        <div key={i} className={`tf-auth-strength-bar${i <= s ? ` ${cls}` : ''}`} />
      ))}
    </div>
  );
}

function LoginForm() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const redirectTo   = searchParams.get('redirect') || '/trading/dashboard';
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
    router.push(redirectTo);
    router.refresh();
  };

  return (
    <form onSubmit={handleLogin} className="tf-auth-form">
      {error && (
        <div className="tf-auth-error">
          <AlertCircle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
          {error}
        </div>
      )}

      <div className="tf-auth-field">
        <label className="tf-auth-label">Email</label>
        <div className="tf-auth-input-wrap">
          <span className="tf-auth-input-icon"><Mail size={13} /></span>
          <input
            type="email"
            name="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="seu@email.com"
            required
            className="tf-auth-input"
          />
        </div>
      </div>

      <div className="tf-auth-field">
        <label className="tf-auth-label">Senha</label>
        <div className="tf-auth-input-wrap">
          <span className="tf-auth-input-icon"><Lock size={13} /></span>
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            className="tf-auth-input"
          />
        </div>
      </div>

      <button type="submit" disabled={loading} className="tf-auth-btn">
        {loading ? 'Entrando...' : 'Entrar'}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="tf-auth">
      <div className="tf-auth-wrap">

        <div className="tf-auth-logo">
          <div className="tf-auth-logo-text">trade<span>forge</span></div>
          <span className="tf-auth-logo-tag">Plataforma de trading automatizado</span>
        </div>

        <div className="tf-auth-card">
          <div className="tf-auth-card-head">
            <div className="tf-auth-card-title">Acessar conta</div>
            <div className="tf-auth-card-sub">Entre com suas credenciais para continuar</div>
          </div>

          <Suspense fallback={
            <div className="tf-auth-form" style={{ gap: 12 }}>
              <div style={{ height: 42, background: 'var(--surface2)', borderRadius: 2 }} />
              <div style={{ height: 42, background: 'var(--surface2)', borderRadius: 2 }} />
              <div style={{ height: 42, background: 'var(--amber-dim)', borderRadius: 2 }} />
            </div>
          }>
            <LoginForm />
          </Suspense>

          <div className="tf-auth-footer">
            Não tem conta?{' '}
            <Link href="/auth/register">Criar conta grátis</Link>
          </div>
        </div>

      </div>
    </div>
  );
}
