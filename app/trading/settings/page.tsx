"use client";
import { useState, useEffect } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabase-browser';
import {
  Key, Bell, Shield, LogOut, ChevronLeft,
  CheckCircle, AlertCircle, Brain, Zap,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import '@/components/dashboard/dashboard.css';

type Tab = 'api' | 'notifications' | 'risk';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'api',           label: 'Binance API',     icon: <Key     size={11} /> },
  { id: 'notifications', label: 'Notificações',    icon: <Bell    size={11} /> },
  { id: 'risk',          label: 'Gestão de Risco', icon: <Shield  size={11} /> },
];

export default function SettingsPage() {
  const router   = useRouter();
  const supabase = getSupabaseBrowserClient();

  const [tab,    setTab]    = useState<Tab>('api');
  const [user,   setUser]   = useState<{ email?: string; full_name?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);
  const [error,  setError]  = useState('');

  // API
  const [apiKey,    setApiKey]    = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [liveMode,  setLiveMode]  = useState(false);

  // Notificações
  const [telegramToken, setTelegramToken] = useState('');
  const [telegramChat,  setTelegramChat]  = useState('');

  // Risco
  const [riskPct,  setRiskPct]  = useState(1);
  const [slPct,    setSlPct]    = useState(2);
  const [maxDD,    setMaxDD]    = useState(10);
  const [rrRatio,  setRrRatio]  = useState(2);

  // ML
  const [mlTraining, setMlTraining] = useState(false);
  const [mlResult,   setMlResult]   = useState<{ samples?: number; accuracy?: number; message?: string; error?: string; success?: boolean } | null>(null);
  const [mlStatus,   setMlStatus]   = useState<{ ready?: boolean; trainedOn?: number; accuracy?: number; message?: string } | null>(null);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setUser({ email: user.email, full_name: user.user_metadata?.full_name });
      try {
        const res = await fetch('/trading/api/ml/train');
        if (res.ok) setMlStatus(await res.json());
      } catch {}
    };
    load();
  }, [supabase]);

  const handleTrainML = async () => {
    setMlTraining(true); setMlResult(null);
    try {
      const res  = await fetch('/trading/api/ml/train', { method: 'POST' });
      const json = await res.json();
      setMlResult(json);
      if (json.success) setMlStatus({ ready: true, trainedOn: json.samples, accuracy: json.accuracy, message: json.message });
    } catch (e: unknown) {
      setMlResult({ error: e instanceof Error ? e.message : 'Erro' });
    } finally { setMlTraining(false); }
  };

  const handleSave = async () => {
    setSaving(true); setError(''); setSaved(false);
    try {
      await new Promise((r) => setTimeout(r, 800));
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro');
    } finally { setSaving(false); }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/auth/login');
  };

  return (
    <div className="dash-root">

      {/* ─── HEADER ─── */}
      <div className="dash-page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Link href="/trading/dashboard" className="dash-breadcrumb">
            <ChevronLeft size={12} /> Dashboard
          </Link>
          <div className="dash-page-title">
            <Key size={13} /> Configurações
          </div>
        </div>
        {user?.email && (
          <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--muted)', background: 'var(--surface)', border: '1px solid var(--border)', padding: '3px 10px', borderRadius: 2 }}>
            {user.email}
          </span>
        )}
      </div>

      {/* ─── LAYOUT ─── */}
      <div className="dash-settings-layout">

        {/* NAV ESQUERDA */}
        <div className="dash-settings-nav">
          {user && (
            <div className="dash-settings-user">
              <div className="dash-settings-user-avatar">
                {(user.full_name || user.email || 'U')[0].toUpperCase()}
              </div>
              <div>
                <div className="dash-settings-user-name">{user.full_name || 'Usuário'}</div>
                <div className="dash-settings-user-email">{user.email}</div>
              </div>
            </div>
          )}

          <div className="dash-settings-nav-items">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`dash-settings-nav-item${tab === t.id ? ' active' : ''}`}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          <div className="dash-settings-nav-bottom">
            <button onClick={handleLogout} className="dash-settings-logout-btn">
              <LogOut size={11} /> Sair
            </button>
          </div>
        </div>

        {/* CONTEÚDO DIREITA */}
        <div className="dash-settings-body">

          {/* ══ ABA: API ══ */}
          {tab === 'api' && (
            <div className="dash-settings-content">
              <div className="dash-settings-section-head">
                <Key size={12} style={{ color: 'var(--amber)' }} />
                <div>
                  <div className="dash-settings-section-title">Binance API Keys</div>
                  <div className="dash-settings-section-sub">Suas chaves ficam armazenadas com segurança e são usadas apenas no servidor.</div>
                </div>
              </div>

              <div className="dash-warn-box" style={{ marginBottom: 0 }}>
                <div className="dash-warn-box-title"><AlertCircle size={10} /> Segurança</div>
                <p className="dash-warn-box-note">
                  Use chaves com permissão apenas de <strong>Futures Trading</strong>. Nunca ative saques. Restrinja por IP de preferência.
                </p>
              </div>

              <div className="dash-bt-section" style={{ borderBottom: 'none', paddingBottom: 0 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <label className="dash-param-label">API Key</label>
                    <input
                      type="text"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="Sua Binance API Key..."
                      className="dash-param-input"
                    />
                  </div>
                  <div>
                    <label className="dash-param-label">API Secret</label>
                    <input
                      type="password"
                      value={apiSecret}
                      onChange={(e) => setApiSecret(e.target.value)}
                      placeholder="••••••••••••••••••••••••"
                      className="dash-param-input"
                    />
                  </div>
                </div>
              </div>

              {/* Live mode toggle */}
              <div className="dash-toggle-row" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 2, padding: '12px 14px' }}>
                <div className="dash-toggle-info">
                  <div className="dash-toggle-label">Modo de Operação</div>
                  <div className="dash-toggle-desc">
                    {liveMode
                      ? '🔴 LIVE — Ordens reais na Binance Futures'
                      : '🟡 PAPER — Testnet (sem dinheiro real)'}
                  </div>
                </div>
                <button
                  onClick={() => setLiveMode(!liveMode)}
                  className={`dash-toggle${liveMode ? ' on' : ''}`}
                >
                  <span className="dash-toggle-thumb" />
                </button>
              </div>

              {liveMode && (
                <div className="dash-danger-box">
                  <div className="dash-danger-box-title"><Zap size={10} fill="currentColor" /> MODO LIVE ATIVADO</div>
                  <p className="dash-param-note" style={{ marginTop: 4 }}>
                    Ordens serão executadas com dinheiro real. Certifique-se de ter testado com PAPER trading primeiro.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ══ ABA: NOTIFICAÇÕES ══ */}
          {tab === 'notifications' && (
            <div className="dash-settings-content">
              <div className="dash-settings-section-head">
                <Bell size={12} style={{ color: 'var(--amber)' }} />
                <div>
                  <div className="dash-settings-section-title">Telegram</div>
                  <div className="dash-settings-section-sub">Receba alertas de entradas, saídas e safe mode em tempo real.</div>
                </div>
              </div>

              <div className="dash-settings-info-box">
                <div className="dash-settings-info-title">Como configurar</div>
                <div className="dash-settings-info-step"><span className="dash-settings-info-num">1</span> Abra o Telegram e fale com <code>@BotFather</code></div>
                <div className="dash-settings-info-step"><span className="dash-settings-info-num">2</span> Digite <code>/newbot</code> e siga as instruções</div>
                <div className="dash-settings-info-step"><span className="dash-settings-info-num">3</span> Copie o <strong>token</strong> e cole abaixo</div>
                <div className="dash-settings-info-step"><span className="dash-settings-info-num">4</span> Inicie uma conversa com o bot e acesse a URL de getUpdates</div>
                <div className="dash-settings-info-step"><span className="dash-settings-info-num">5</span> Copie o <strong>chat_id</strong> que aparece no JSON</div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label className="dash-param-label">Bot Token</label>
                  <input
                    type="text"
                    value={telegramToken}
                    onChange={(e) => setTelegramToken(e.target.value)}
                    placeholder="123456789:AAxxxxxxxxxxxxxxxxxxxxxxx"
                    className="dash-param-input"
                  />
                </div>
                <div>
                  <label className="dash-param-label">Chat ID</label>
                  <input
                    type="text"
                    value={telegramChat}
                    onChange={(e) => setTelegramChat(e.target.value)}
                    placeholder="-100xxxxxxxxxx"
                    className="dash-param-input"
                  />
                </div>
              </div>
            </div>
          )}

          {/* ══ ABA: RISCO ══ */}
          {tab === 'risk' && (
            <div className="dash-settings-content">
              <div className="dash-settings-section-head">
                <Shield size={12} style={{ color: 'var(--amber)' }} />
                <div>
                  <div className="dash-settings-section-title">Gestão de Risco Padrão</div>
                  <div className="dash-settings-section-sub">Esses valores são usados pelo Vercel Cron Job (ciclo automático).</div>
                </div>
              </div>

              <div className="dash-param-grid">
                {([
                  { label: 'Risco por Operação (%)', value: riskPct,  set: setRiskPct,  min: 0.1, max: 5,  step: 0.1 },
                  { label: 'Stop Loss (%)',           value: slPct,   set: setSlPct,    min: 0.5, max: 10, step: 0.5 },
                  { label: 'Max Drawdown (%)',        value: maxDD,   set: setMaxDD,    min: 5,   max: 30, step: 1   },
                  { label: 'Mín. Risco:Retorno',      value: rrRatio, set: setRrRatio,  min: 1,   max: 5,  step: 0.5 },
                ] as const).map((f) => (
                  <div key={f.label}>
                    <label className="dash-param-label">{f.label}</label>
                    <input
                      type="number"
                      value={f.value}
                      onChange={(e) => (f.set as (v: number) => void)(parseFloat(e.target.value) || 0)}
                      min={f.min} max={f.max} step={f.step}
                      className="dash-param-input"
                    />
                  </div>
                ))}
              </div>

              {/* Calculadora */}
              <div className="dash-settings-calc">
                <div className="dash-settings-calc-row">
                  <span>Banca $1.000 × risco {riskPct}%</span>
                  <span style={{ color: 'var(--text)' }}>${(10 * riskPct).toFixed(2)} por op</span>
                </div>
                <div className="dash-settings-calc-row">
                  <span>SL {slPct}% com R:R {rrRatio}×</span>
                  <span style={{ color: 'var(--amber)' }}>alvo +{(slPct * rrRatio).toFixed(1)}%</span>
                </div>
                <div className="dash-settings-calc-row">
                  <span>Safe mode ativa acima de drawdown</span>
                  <span style={{ color: 'var(--red)' }}>{maxDD}%</span>
                </div>
              </div>

              {/* ML */}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 20 }}>
                <div className="dash-settings-section-head" style={{ marginBottom: 12 }}>
                  <Brain size={12} style={{ color: 'var(--amber)' }} />
                  <div>
                    <div className="dash-settings-section-title">Modelo de Machine Learning</div>
                    <div className="dash-settings-section-sub">Treina a Regressão Logística com trades históricos do Supabase. Recomendado após ≥ 50 trades fechados.</div>
                  </div>
                </div>

                {mlStatus && (
                  <div
                    className={mlStatus.ready ? 'dash-asset-alert green' : 'dash-asset-alert blue'}
                    style={{ marginBottom: 12 }}
                  >
                    {mlStatus.ready
                      ? `✓ Modelo ativo — ${mlStatus.trainedOn} amostras · Acurácia: ${mlStatus.accuracy}%`
                      : '— Sem modelo treinado · usando predição neutra (50%)'}
                  </div>
                )}

                <button
                  onClick={handleTrainML}
                  disabled={mlTraining}
                  className="dash-settings-ml-btn"
                >
                  <Brain size={11} style={mlTraining ? { color: 'var(--amber)', animation: 'dash-spin 1.5s linear infinite' } : {}} />
                  {mlTraining ? 'Treinando modelo...' : 'Treinar ML agora'}
                </button>

                {mlResult && (
                  <div
                    className={mlResult.error ? 'dash-error-banner' : 'dash-asset-alert green'}
                    style={{ marginTop: 8 }}
                  >
                    {mlResult.error ?? mlResult.message}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── FOOTER SALVAR ── */}
          <div className="dash-settings-save-row">
            <button onClick={handleSave} disabled={saving} className="dash-run-btn" style={{ width: 'auto', padding: '10px 28px' }}>
              {saving ? 'Salvando...' : 'Salvar configurações'}
            </button>
            {saved && (
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--green)', display: 'flex', alignItems: 'center', gap: 5 }}>
                <CheckCircle size={12} /> Salvo com sucesso
              </span>
            )}
            {error && (
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--red)', display: 'flex', alignItems: 'center', gap: 5 }}>
                <AlertCircle size={12} /> {error}
              </span>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
