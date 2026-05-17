"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/lib/supabase-browser';
import { Mail, Lock, User, AlertCircle, CheckCircle } from 'lucide-react';
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

export default function RegisterPage() {
  const router   = useRouter();
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
    if (password !== confirm) { setError('As senhas não coincidem.'); return; }
    if (password.length < 8)  { setError('A senha deve ter pelo menos 8 caracteres.'); return; }

    setLoading(true); setError('');

    const origin = window.location.origin;
    const { data, error: signUpError } = await supabase.auth.signUp({
      email, password,
      options: {
        data: { full_name: name },
        emailRedirectTo: `${origin}/auth/callback`,
      },
    });

    if (signUpError) { setError(signUpError.message); setLoading(false); return; }

    if (data.user) {
      await supabase.from('profiles').insert({
        user_id: data.user.id, balance: 1000.00,
        peak_balance: 1000.00, account_status: 'ACTIVE',
      });
    }

    setSuccess(true); setLoading(false);
    if (data.session) setTimeout(() => router.push('/trading/dashboard'), 1500);
  };

  return (
    <div className="tf-auth">
      <div className="tf-auth-wrap">

        <div className="tf-auth-logo">
          <div className="tf-auth-logo-text">trade<span>forge</span></div>
          <span className="tf-auth-logo-tag">Plataforma de trading automatizado</span>
        </div>

        <div className="tf-auth-card">
          <div className="tf-auth-card-head">
            <div className="tf-auth-card-title">Criar conta</div>
            <div className="tf-auth-card-sub">7 dias grátis · sem cartão de crédito</div>
          </div>

          {success ? (
            <div className="tf-auth-success">
              <CheckCircle size={40} className="tf-auth-success-icon" />
              <div className="tf-auth-success-title">Conta criada!</div>
              <p className="tf-auth-success-sub">
                Verifique seu email para confirmar o cadastro.<br />
                Você será redirecionado em instantes.
              </p>
              <Link href="/auth/login" style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--amber)', textDecoration: 'none', marginTop: 8 }}>
                Ir para login →
              </Link>
            </div>
          ) : (
            <form onSubmit={handleRegister} className="tf-auth-form">
              {error && (
                <div className="tf-auth-error">
                  <AlertCircle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                  {error}
                </div>
              )}

              <div className="tf-auth-field">
                <label className="tf-auth-label">Nome</label>
                <div className="tf-auth-input-wrap">
                  <span className="tf-auth-input-icon"><User size={13} /></span>
                  <input
                    type="text"
                    name="name"
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Seu nome"
                    required
                    className="tf-auth-input"
                  />
                </div>
              </div>

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
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mínimo 8 caracteres"
                    required
                    className="tf-auth-input"
                  />
                </div>
                <StrengthBar pw={password} />
              </div>

              <div className="tf-auth-field">
                <label className="tf-auth-label">Confirmar senha</label>
                <div className="tf-auth-input-wrap">
                  <span className="tf-auth-input-icon"><Lock size={13} /></span>
                  <input
                    type="password"
                    name="confirm-password"
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Repita a senha"
                    required
                    className="tf-auth-input"
                  />
                </div>
              </div>

              <div className="tf-auth-bonus">
                🎁 Toda conta começa com <span>$1.000 simulados</span> para testar sem risco.
              </div>

              <button type="submit" disabled={loading} className="tf-auth-btn">
                {loading ? 'Criando conta...' : 'Criar conta gratuita'}
              </button>
            </form>
          )}

          {!success && (
            <div className="tf-auth-footer">
              Já tem conta?{' '}
              <Link href="/auth/login">Entrar</Link>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
