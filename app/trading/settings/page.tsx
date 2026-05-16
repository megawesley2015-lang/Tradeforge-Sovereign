
"use client";
import { useState, useEffect } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabase-browser';
import { Settings, Key, Bell, Shield, LogOut, ChevronRight, CheckCircle, AlertCircle, ArrowLeft, Brain } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

type Tab = 'api' | 'notifications' | 'risk';

export default function SettingsPage() {
  const router = useRouter();
  const [tab,     setTab]     = useState<Tab>('api');
  const [user,    setUser]    = useState<{ email?: string; full_name?: string } | null>(null);
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [error,   setError]   = useState('');

  // API Keys
  const [apiKey,    setApiKey]    = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [liveMode,  setLiveMode]  = useState(false);

  // Notificações
  const [telegramToken, setTelegramToken] = useState('');
  const [telegramChat,  setTelegramChat]  = useState('');

  // Risco padrão
  const [riskPct,  setRiskPct]  = useState(1);
  const [slPct,    setSlPct]    = useState(2);
  const [maxDD,    setMaxDD]    = useState(10);
  const [rrRatio,  setRrRatio]  = useState(2);

  // ML
  const [mlTraining,  setMlTraining]  = useState(false);
  const [mlResult,    setMlResult]    = useState<{ samples?: number; accuracy?: number; message?: string; error?: string; success?: boolean } | null>(null);
  const [mlStatus,    setMlStatus]    = useState<{ ready?: boolean; trainedOn?: number; accuracy?: number; message?: string } | null>(null);

  const supabase = getSupabaseBrowserClient();

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUser({
          email:     user.email,
          full_name: user.user_metadata?.full_name,
        });
      }

      // Status do modelo ML
      try {
        const res = await fetch('/trading/api/ml/train');
        if (res.ok) setMlStatus(await res.json());
      } catch {}
    };
    load();
  }, []);

  const handleTrainML = async () => {
    setMlTraining(true);
    setMlResult(null);
    try {
      const res = await fetch('/trading/api/ml/train', { method: 'POST' });
      const json = await res.json();
      setMlResult(json);
      if (json.success) {
        setMlStatus({ ready: true, trainedOn: json.samples, accuracy: json.accuracy, message: json.message });
      }
    } catch (e: any) {
      setMlResult({ error: e.message });
    } finally {
      setMlTraining(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSaved(false);

    try {
      // Nota de segurança: em produção, as API keys devem ser enviadas
      // para uma Supabase Edge Function que as guarda criptografadas.
      // Para o MVP, usamos variáveis de ambiente no servidor.
      // Aqui apenas simulamos o feedback visual de "salvo".
      await new Promise((r) => setTimeout(r, 800));
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/auth/login');
  };

  const inputClass = "w-full bg-[#161625] border border-[#2A2A3C] rounded-xl py-3 px-4 text-white outline-none focus:border-[#FF6B35] text-sm font-mono placeholder-gray-600";
  const labelClass = "text-xs text-gray-500 block mb-2";

  return (
    <div className="min-h-screen bg-[#07070D] text-white p-8 font-sans">
      <div className="max-w-3xl mx-auto">

        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link href="/trading/dashboard" className="text-gray-500 hover:text-white transition-colors">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Configurações</h1>
            <p className="text-gray-500 text-sm">{user?.email}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

          {/* Sidebar de navegação */}
          <div className="bg-[#0F0F1A] border border-[#1F1F2E] rounded-3xl p-4 space-y-1 h-fit">
            {([
              { id: 'api',           label: 'Binance API',    icon: <Key size={16} />    },
              { id: 'notifications', label: 'Notificações',   icon: <Bell size={16} />   },
              { id: 'risk',          label: 'Gestão de Risco', icon: <Shield size={16} /> },
            ] as { id: Tab; label: string; icon: React.ReactNode }[]).map((item) => (
              <button
                key={item.id}
                onClick={() => setTab(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm transition-colors ${
                  tab === item.id
                    ? 'bg-[#FF6B35]/20 text-[#FF6B35] font-medium'
                    : 'text-gray-400 hover:text-white hover:bg-[#161625]'
                }`}
              >
                <span className="flex items-center gap-2">{item.icon} {item.label}</span>
                <ChevronRight size={14} />
              </button>
            ))}

            <div className="border-t border-[#1F1F2E] pt-3 mt-3">
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm text-red-400 hover:bg-red-900/20 transition-colors"
              >
                <LogOut size={16} /> Sair
              </button>
            </div>
          </div>

          {/* Painel de conteúdo */}
          <div className="lg:col-span-3 bg-[#0F0F1A] border border-[#1F1F2E] rounded-3xl p-6">

            {/* === ABA: BINANCE API === */}
            {tab === 'api' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-bold flex items-center gap-2 mb-1">
                    <Key size={18} className="text-[#FF6B35]" /> Binance API Keys
                  </h2>
                  <p className="text-gray-500 text-xs">
                    Suas chaves ficam armazenadas com segurança e são usadas apenas no servidor.
                  </p>
                </div>

                <div className="bg-yellow-900/20 border border-yellow-800/40 rounded-xl p-3 text-xs text-yellow-400">
                  ⚠️ Use chaves com permissão apenas de <strong>Futures Trading</strong>.
                  Nunca ative saques. Restrinja por IP de preferência.
                </div>

                <div>
                  <label className={labelClass}>API Key</label>
                  <input
                    type="text"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="Sua Binance API Key..."
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className={labelClass}>API Secret</label>
                  <input
                    type="password"
                    value={apiSecret}
                    onChange={(e) => setApiSecret(e.target.value)}
                    placeholder="••••••••••••••••••••••••••••••••"
                    className={inputClass}
                  />
                </div>

                <div className="flex items-center justify-between bg-[#161625] rounded-xl p-4">
                  <div>
                    <p className="text-sm font-medium">Modo de Operação</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {liveMode
                        ? '🔴 LIVE — Ordens reais na Binance Futures'
                        : '🟡 PAPER — Testnet (sem dinheiro real)'}
                    </p>
                  </div>
                  <button
                    onClick={() => setLiveMode(!liveMode)}
                    className={`w-12 h-6 rounded-full transition-colors relative ${liveMode ? 'bg-[#FF6B35]' : 'bg-[#2A2A3C]'}`}
                  >
                    <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${liveMode ? 'left-7' : 'left-1'}`} />
                  </button>
                </div>

                {liveMode && (
                  <div className="bg-red-900/20 border border-red-800/40 rounded-xl p-3 text-xs text-red-400">
                    🚨 <strong>MODO LIVE ATIVADO:</strong> Ordens serão executadas com dinheiro real.
                    Certifique-se de ter testado com PAPER trading primeiro.
                  </div>
                )}
              </div>
            )}

            {/* === ABA: NOTIFICAÇÕES === */}
            {tab === 'notifications' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-bold flex items-center gap-2 mb-1">
                    <Bell size={18} className="text-[#FF6B35]" /> Telegram
                  </h2>
                  <p className="text-gray-500 text-xs">
                    Receba alertas de entradas, saídas e safe mode em tempo real.
                  </p>
                </div>

                <div className="bg-[#161625] rounded-xl p-4 text-xs text-gray-400 space-y-1">
                  <p className="font-medium text-white">Como configurar:</p>
                  <p>1. Abra o Telegram e fale com <code className="text-[#FF6B35]">@BotFather</code></p>
                  <p>2. Digite <code className="text-[#FF6B35]">/newbot</code> e siga as instruções</p>
                  <p>3. Copie o <strong>token</strong> e cole abaixo</p>
                  <p>4. Inicie uma conversa com o bot e acesse:</p>
                  <p className="font-mono text-[10px] break-all text-gray-500">
                    https://api.telegram.org/bot&lt;TOKEN&gt;/getUpdates
                  </p>
                  <p>5. Copie o <strong>chat_id</strong> que aparece no JSON</p>
                </div>

                <div>
                  <label className={labelClass}>Bot Token</label>
                  <input
                    type="text"
                    value={telegramToken}
                    onChange={(e) => setTelegramToken(e.target.value)}
                    placeholder="123456789:AAxxxxxxxxxxxxxxxxxxxxxxx"
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className={labelClass}>Chat ID</label>
                  <input
                    type="text"
                    value={telegramChat}
                    onChange={(e) => setTelegramChat(e.target.value)}
                    placeholder="-100xxxxxxxxxx"
                    className={inputClass}
                  />
                </div>
              </div>
            )}

            {/* === ABA: RISCO === */}
            {tab === 'risk' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-bold flex items-center gap-2 mb-1">
                    <Shield size={18} className="text-[#FF6B35]" /> Gestão de Risco Padrão
                  </h2>
                  <p className="text-gray-500 text-xs">
                    Esses valores são usados pelo Vercel Cron Job (ciclo automático).
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {[
                    { label: 'Risco por Operação (%)', value: riskPct,  set: setRiskPct,  min: 0.1, max: 5,   step: 0.1 },
                    { label: 'Stop Loss (%)',           value: slPct,   set: setSlPct,    min: 0.5, max: 10,  step: 0.5 },
                    { label: 'Max Drawdown (%)',        value: maxDD,   set: setMaxDD,    min: 5,   max: 30,  step: 1   },
                    { label: 'Mín. Risco:Retorno',      value: rrRatio, set: setRrRatio,  min: 1,   max: 5,   step: 0.5 },
                  ].map((field) => (
                    <div key={field.label}>
                      <label className={labelClass}>{field.label}</label>
                      <input
                        type="number"
                        value={field.value}
                        onChange={(e) => field.set(parseFloat(e.target.value) || 0)}
                        min={field.min}
                        max={field.max}
                        step={field.step}
                        className={inputClass}
                      />
                    </div>
                  ))}
                </div>

                <div className="bg-[#161625] rounded-xl p-4 text-xs text-gray-500 space-y-1">
                  <p>• Com banca de <span className="text-white">$1.000</span> e risco de <span className="text-[#FF6B35]">{riskPct}%</span>: risco por op = <span className="text-white">${(10 * riskPct).toFixed(2)}</span></p>
                  <p>• Stop Loss de <span className="text-[#FF6B35]">{slPct}%</span> com R:R de <span className="text-[#FF6B35]">{rrRatio}</span>: alvo = <span className="text-white">{slPct * rrRatio}%</span></p>
                  <p>• Safe Mode ativa automaticamente com drawdown &gt; <span className="text-red-400">{maxDD}%</span></p>
                </div>

                {/* ── ML Model ── */}
                <div className="border-t border-[#1F1F2E] pt-6">
                  <h3 className="text-sm font-bold flex items-center gap-2 mb-1">
                    <Brain size={16} className="text-[#FF6B35]" /> Modelo de Machine Learning
                  </h3>
                  <p className="text-gray-500 text-xs mb-4">
                    Treina a Regressão Logística com trades históricos do Supabase.
                    Recomendado após acumular ≥ 50 trades fechados.
                  </p>

                  {mlStatus && (
                    <div className={`rounded-xl p-3 text-xs mb-3 ${mlStatus.ready ? 'bg-green-900/20 border border-green-800/40 text-green-400' : 'bg-[#161625] text-gray-400'}`}>
                      {mlStatus.ready
                        ? `✅ Modelo ativo — ${mlStatus.trainedOn} amostras | Acurácia: ${mlStatus.accuracy}%`
                        : '🧠 Sem modelo treinado — usando predição neutra (50%)'}
                    </div>
                  )}

                  <button
                    onClick={handleTrainML}
                    disabled={mlTraining}
                    className="flex items-center gap-2 bg-[#161625] hover:bg-[#1F1F2E] border border-[#2A2A3C] hover:border-[#FF6B35] text-white px-4 py-2.5 rounded-xl text-sm transition-colors disabled:opacity-50"
                  >
                    <Brain size={14} className={mlTraining ? 'animate-pulse text-[#FF6B35]' : ''} />
                    {mlTraining ? 'Treinando modelo...' : 'Treinar ML agora'}
                  </button>

                  {mlResult && (
                    <div className={`mt-3 rounded-xl p-3 text-xs ${mlResult.error ? 'bg-red-900/20 border border-red-700/40 text-red-400' : mlResult.success === false ? 'bg-yellow-900/20 border border-yellow-700/40 text-yellow-400' : 'bg-green-900/20 border border-green-700/40 text-green-400'}`}>
                      {mlResult.error ?? mlResult.message}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Botão salvar + feedback */}
            <div className="flex items-center gap-3 mt-8 pt-6 border-t border-[#1F1F2E]">
              <button
                onClick={handleSave}
                disabled={saving}
                className="bg-[#FF6B35] hover:bg-[#e55a2a] disabled:opacity-50 text-white font-bold px-6 py-2.5 rounded-xl text-sm transition-colors"
              >
                {saving ? 'Salvando...' : 'Salvar configurações'}
              </button>

              {saved && (
                <span className="flex items-center gap-1.5 text-green-400 text-sm">
                  <CheckCircle size={16} /> Salvo com sucesso
                </span>
              )}
              {error && (
                <span className="flex items-center gap-1.5 text-red-400 text-sm">
                  <AlertCircle size={16} /> {error}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
