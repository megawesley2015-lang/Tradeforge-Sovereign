
"use client";
import { useState } from 'react';
import { Play, TrendingUp, TrendingDown, Activity, BarChart2, ArrowLeft, Zap, Shield, Target } from 'lucide-react';
import Link from 'next/link';

interface MonteCarlo {
  ruinPct: number;
  medianFinal: number;
  p10: number;
  p90: number;
}

interface BacktestResult {
  symbol: string;
  interval: string;
  dataSource: string;
  candlesAnalyzed: number;
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  initialBalance: number;
  finalBalance: number;
  peakBalance: number;
  netProfit: number;
  netProfitPct: number;
  maxDrawdown: number;
  profitFactor: number;
  sharpeRatio: number;
  expectancy: number;
  avgWin: number;
  avgLoss: number;
  monteCarlo: MonteCarlo;
  haltCount: number;
  targetHit: boolean;
  exitBreakdown: Record<string, number>;
  balanceCurve: number[];
  recentTrades: {
    entryPrice: number;
    exitPrice: number;
    signal: string;
    profit: number;
    isWin: boolean;
    balance: number;
    exitReason: string;
  }[];
  trendFilterUsed?: boolean;
  config?: Record<string, unknown>;
}

interface Params {
  symbol: string;
  initialBalance: number;
  riskPerTrade: number;
  stopLossPercent: number;
  atrMultiplier: number;
  useATRStop: boolean;
  minRiskReward: number;
  rsiLow: number;
  rsiHigh: number;
  smaPeriod: number;
  trendFilter: boolean;
  trailingStop: boolean;
  trailRUnits: number;
  partialExit: boolean;
  scaledExits: boolean;
  fixedRiskAmount: boolean;
  progressiveRisk: boolean;
  circuitBreaker: number;
  maxCandlesInTrade: number;
  balanceTarget: number;
  interval: string;
  limit: number;
}

const SYMBOLS = [
  'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT',
  'XRPUSDT', 'ADAUSDT', 'DOGEUSDT', 'AVAXUSDT',
  'LINKUSDT', 'MATICUSDT', 'DOTUSDT',
];
const INTERVALS = ['15m', '1h', '4h', '1d'];

// Perfis de ativo: configurações pré-definidas por categoria de risco
const ASSET_PROFILES = {
  conservador: {
    label: '🔵 Conservador (BTC/ETH)',
    description: 'Ativos maduros com menor volatilidade. ATR × 1.5, R:R 2, risco 2%.',
    params: {
      symbol: 'BTCUSDT', useATRStop: true, atrMultiplier: 1.5,
      minRiskReward: 2, riskPerTrade: 2, stopLossPercent: 1.5,
      rsiLow: 30, rsiHigh: 70, trendFilter: true,
      trailingStop: true, trailRUnits: 2, scaledExits: true,
      progressiveRisk: true, fixedRiskAmount: true, circuitBreaker: 15,
    },
  },
  moderado: {
    label: '🟡 Moderado (SOL/BNB/LINK)',
    description: 'Altcoins de mid-cap. ATR × 2, R:R 3, risco 3%.',
    params: {
      symbol: 'SOLUSDT', useATRStop: true, atrMultiplier: 2.0,
      minRiskReward: 3, riskPerTrade: 3, stopLossPercent: 2.0,
      rsiLow: 35, rsiHigh: 72, trendFilter: true,
      trailingStop: true, trailRUnits: 2.5, scaledExits: true,
      progressiveRisk: true, fixedRiskAmount: true, circuitBreaker: 20,
    },
  },
  agressivo: {
    label: '🔴 Agressivo (DOGE/SOL/PEPE)',
    description: 'Ativos explosivos de alta volatilidade. ATR × 3, R:R 5, risco 5%.',
    params: {
      symbol: 'DOGEUSDT', useATRStop: true, atrMultiplier: 3.0,
      minRiskReward: 5, riskPerTrade: 5, stopLossPercent: 3.0,
      rsiLow: 40, rsiHigh: 75, trendFilter: true,
      trailingStop: true, trailRUnits: 3, scaledExits: true,
      progressiveRisk: true, fixedRiskAmount: false, circuitBreaker: 25,
    },
  },
} as const;

const DEFAULT_PARAMS: Params = {
  symbol: 'BTCUSDT',
  initialBalance: 50,
  riskPerTrade: 2,
  stopLossPercent: 1.5,
  atrMultiplier: 2.0,
  useATRStop: true,
  minRiskReward: 2,
  rsiLow: 30,
  rsiHigh: 70,
  smaPeriod: 200,
  trendFilter: true,
  trailingStop: true,
  trailRUnits: 2.0,
  partialExit: false,
  scaledExits: true,
  fixedRiskAmount: true,
  progressiveRisk: true,
  circuitBreaker: 15,
  maxCandlesInTrade: 0,
  balanceTarget: 0,
  interval: '4h',
  limit: 1000,
};

export default function BacktestPage() {
  const [params, setParams] = useState<Params>(DEFAULT_PARAMS);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeProfile, setActiveProfile] = useState<string | null>(null);

  const applyProfile = (profileKey: keyof typeof ASSET_PROFILES) => {
    const profile = ASSET_PROFILES[profileKey];
    setParams(prev => ({ ...prev, ...profile.params }));
    setActiveProfile(profileKey);
  };

  const runBacktest = async () => {
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch('/trading/api/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...params,
          riskPerTrade:    params.riskPerTrade / 100,
          stopLossPercent: params.stopLossPercent / 100,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResult(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  };

  const renderCurve = (curve: number[]) => {
    if (!curve || curve.length < 2) return null;
    const min = Math.min(...curve);
    const max = Math.max(...curve);
    const range = max - min || 1;
    const w = 400, h = 100;
    const points = curve.map((v, i) => {
      const x = (i / (curve.length - 1)) * w;
      const y = h - ((v - min) / range) * h;
      return `${x},${y}`;
    }).join(' ');
    const isProfit = curve[curve.length - 1] >= curve[0];
    return (
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-28">
        <defs>
          <linearGradient id="curveGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={isProfit ? '#22c55e' : '#ef4444'} stopOpacity="0.3" />
            <stop offset="100%" stopColor={isProfit ? '#22c55e' : '#ef4444'} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polyline
          points={points}
          fill="none"
          stroke={isProfit ? '#22c55e' : '#ef4444'}
          strokeWidth="2"
        />
      </svg>
    );
  };

  const inp = "w-full bg-[#161625] border border-[#2A2A3C] rounded-lg p-2 text-white outline-none focus:border-[#FF6B35] text-sm";
  const lbl = "text-xs text-gray-500 block mb-1";

  // Renderiza barra de Monte Carlo
  const renderMCBar = (label: string, value: number, initial: number, color: string) => {
    const pct = Math.min(100, Math.max(0, (value / (initial * 10)) * 100));
    return (
      <div className="flex items-center gap-3">
        <span className="text-xs text-gray-500 w-16 text-right shrink-0">{label}</span>
        <div className="flex-1 bg-[#161625] rounded-full h-2 overflow-hidden">
          <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
        </div>
        <span className="text-xs font-mono font-bold text-white w-20 shrink-0">${value.toFixed(2)}</span>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#07070D] text-white p-8 font-sans">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link href="/trading/dashboard" className="text-gray-500 hover:text-white transition-colors">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold">
                TradeForge <span className="text-[#FF6B35]">Backtester</span>
              </h1>
              <span className="text-xs font-bold px-3 py-1 rounded-full bg-green-500/15 text-green-400 border border-green-500/30">
                ● DADOS REAIS — Binance API
              </span>
            </div>
            <p className="text-gray-500 text-sm">RSI + MACD + Bollinger + EMA · ATR Stop Dinâmico · Saída 3 Camadas · Monte Carlo</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* ── Painel de parâmetros ─────────────────────────── */}
          <div className="bg-[#0F0F1A] border border-[#1F1F2E] rounded-3xl p-6 space-y-4">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <BarChart2 size={18} className="text-[#FF6B35]" /> Parâmetros
            </h2>

            {/* ── Perfis de Ativo ── */}
            <div>
              <p className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-2">Perfil do Ativo</p>
              <div className="space-y-2">
                {(Object.entries(ASSET_PROFILES) as [keyof typeof ASSET_PROFILES, typeof ASSET_PROFILES[keyof typeof ASSET_PROFILES]][]).map(([key, profile]) => (
                  <button
                    key={key}
                    onClick={() => applyProfile(key)}
                    className={`w-full text-left p-3 rounded-xl border transition-all ${
                      activeProfile === key
                        ? 'border-[#FF6B35]/50 bg-[#FF6B35]/10'
                        : 'border-[#2A2A3C] bg-[#161625] hover:border-[#FF6B35]/30'
                    }`}
                  >
                    <p className={`text-xs font-bold ${activeProfile === key ? 'text-[#FF6B35]' : 'text-gray-300'}`}>
                      {profile.label}
                    </p>
                    <p className="text-xs text-gray-600 mt-0.5">{profile.description}</p>
                  </button>
                ))}
              </div>
            </div>

            <hr className="border-[#1F1F2E]" />

            {/* ── Ativo + Intervalo ── */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Ativo</label>
                <select value={params.symbol}
                  onChange={e => { setParams({...params, symbol: e.target.value}); setActiveProfile(null); }}
                  className={inp}>
                  {SYMBOLS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className={lbl}>Intervalo</label>
                <select value={params.interval}
                  onChange={e => setParams({...params, interval: e.target.value})}
                  className={inp}>
                  {INTERVALS.map(i => <option key={i} value={i}>{i}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className={lbl}>Banca Inicial ($)</label>
              <input type="number" value={params.initialBalance}
                onChange={e => setParams({...params, initialBalance: +e.target.value})}
                className={inp} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Risco/Op (%)</label>
                <input type="number" step="0.5" value={params.riskPerTrade}
                  onChange={e => setParams({...params, riskPerTrade: +e.target.value})}
                  className={inp} />
              </div>
              <div>
                <label className={lbl}>Min R:R</label>
                <input type="number" step="0.5" value={params.minRiskReward}
                  onChange={e => setParams({...params, minRiskReward: +e.target.value})}
                  className={inp} />
              </div>
            </div>

            {/* ── ATR Stop ── */}
            <div className="p-3 rounded-xl border border-[#2A2A3C] space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-gray-300">Stop Dinâmico (ATR)</p>
                  <p className="text-xs text-gray-600 mt-0.5">
                    {params.useATRStop
                      ? `Stop = ATR × ${params.atrMultiplier} — se ajusta à volatilidade do ativo`
                      : `Stop fixo de ${params.stopLossPercent}% — igual para todos os candles`}
                  </p>
                </div>
                <button
                  onClick={() => setParams({...params, useATRStop: !params.useATRStop})}
                  className={`w-10 h-5 rounded-full transition-colors relative ${params.useATRStop ? 'bg-[#FF6B35]' : 'bg-gray-700'}`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform shadow ${params.useATRStop ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
              </div>
              {params.useATRStop ? (
                <div>
                  <label className={lbl}>Multiplicador ATR</label>
                  <input type="number" step="0.5" min="0.5" max="5" value={params.atrMultiplier}
                    onChange={e => setParams({...params, atrMultiplier: +e.target.value})}
                    className={inp} />
                  <p className="text-xs text-gray-600 mt-1">1.5 = conservador · 2 = padrão · 3 = volátil</p>
                </div>
              ) : (
                <div>
                  <label className={lbl}>Stop Loss fixo (%)</label>
                  <input type="number" step="0.5" value={params.stopLossPercent}
                    onChange={e => setParams({...params, stopLossPercent: +e.target.value})}
                    className={inp} />
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Trail (R-units)</label>
                <input type="number" step="0.5" min="1" max="5" value={params.trailRUnits}
                  onChange={e => setParams({...params, trailRUnits: +e.target.value})}
                  className={inp} disabled={!params.trailingStop} />
                <p className="text-xs text-gray-600 mt-1">Trail X R atrás do pico</p>
              </div>
              <div>
                <label className={lbl}>Circuit Breaker (%)</label>
                <input type="number" step="5" min="0" max="50" value={params.circuitBreaker}
                  onChange={e => setParams({...params, circuitBreaker: +e.target.value})}
                  className={inp} />
                <p className="text-xs text-gray-600 mt-1">0 = desativado</p>
              </div>
            </div>

            {/* ── Novos freios de segurança ── */}
            <div className="p-3 rounded-xl border border-[#2A2A3C] space-y-3 bg-[#0A0A14]">
              <p className="text-xs text-gray-500 font-bold uppercase tracking-wider flex items-center gap-1.5">
                <Zap size={11} className="text-yellow-400" /> Freios Avançados
              </p>

              <div>
                <label className={lbl}>
                  Saída por Tempo (candles) &nbsp;
                  <span className="text-gray-600">0 = sem limite</span>
                </label>
                <input
                  type="number" step="5" min="0" max="500"
                  value={params.maxCandlesInTrade}
                  onChange={e => setParams({...params, maxCandlesInTrade: +e.target.value})}
                  className={inp}
                />
                <p className="text-xs text-gray-600 mt-1">
                  {params.maxCandlesInTrade > 0
                    ? `Fecha a mercado se o trade não resolver em ${params.maxCandlesInTrade} candles (${
                        params.interval === '1h' ? `${params.maxCandlesInTrade}h` :
                        params.interval === '4h' ? `${params.maxCandlesInTrade * 4}h` :
                        params.interval === '1d' ? `${params.maxCandlesInTrade}d` :
                        `${params.maxCandlesInTrade} candles`
                      })`
                    : 'Trade fica aberto até atingir stop ou alvo (sem limite de tempo)'}
                </p>
              </div>

              <div>
                <label className={lbl}>
                  Meta de Banca (×) &nbsp;
                  <span className="text-gray-600">0 = sem meta</span>
                </label>
                <input
                  type="number" step="5" min="0" max="1000"
                  value={params.balanceTarget}
                  onChange={e => setParams({...params, balanceTarget: +e.target.value})}
                  className={inp}
                />
                <p className="text-xs text-gray-600 mt-1">
                  {params.balanceTarget > 0
                    ? `Bot para de operar ao atingir ${params.balanceTarget}× a banca inicial ($${(params.initialBalance * params.balanceTarget).toFixed(0)})`
                    : 'Bot opera até o fim dos candles históricos'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>RSI Low</label>
                <input type="number" value={params.rsiLow}
                  onChange={e => setParams({...params, rsiLow: +e.target.value})}
                  className={inp} />
              </div>
              <div>
                <label className={lbl}>RSI High</label>
                <input type="number" value={params.rsiHigh}
                  onChange={e => setParams({...params, rsiHigh: +e.target.value})}
                  className={inp} />
              </div>
            </div>

            <div>
              <label className={lbl}>Candles históricos</label>
              <input type="number" value={params.limit}
                onChange={e => setParams({...params, limit: Math.min(1000, +e.target.value)})}
                className={inp} />
              <p className="text-xs text-gray-600 mt-1">Máximo 1000 (limite da Binance)</p>
            </div>

            {/* ── Toggles ── */}
            <div className="space-y-2">
              <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Gestão de Risco Avançada</p>
              {([
                {
                  key: 'trendFilter' as const,
                  label: 'Filtro de Tendência (EMA200)',
                  on:  'Só LONG acima da EMA200, só SHORT abaixo — elimina trades contra tendência.',
                  off: 'Sem filtro: permite SHORT em uptrend (perigoso).',
                  color: 'green',
                },
                {
                  key: 'trailingStop' as const,
                  label: 'Trailing Stop por R-units',
                  on:  `Trail ${params.trailRUnits}R atrás do pico — trava lucro automaticamente.`,
                  off: 'Stop fixo no nível inicial — sem trava de lucro.',
                  color: 'blue',
                },
                {
                  key: 'scaledExits' as const,
                  label: 'Saída 3 Camadas (30/30/40)',
                  on:  '30% em TP1 (1:1) · 30% em TP2 (R:R/2) · 40% trailing até TP3.',
                  off: 'Saída única 100% no alvo final (tudo ou nada).',
                  color: 'purple',
                },
                {
                  key: 'fixedRiskAmount' as const,
                  label: 'Risco Fixo em $ (capital inicial)',
                  on:  'Arrisca X% do capital INICIAL — evita que $1M perca $100k em um stop.',
                  off: 'Arrisca X% do saldo ATUAL — compounding máximo mas drawdown proporcional.',
                  color: 'orange',
                },
                {
                  key: 'progressiveRisk' as const,
                  label: 'Risco Progressivo',
                  on:  '2× banca→50% risco · 5×→25% · 10×→10% · 20×→5%. Protege lucros.',
                  off: 'Risco fixo independente do crescimento da banca.',
                  color: 'green',
                },
              ] as const).map(({ key, label, on, off, color }) => {
                const isOn = params[key];
                const borderBg: Record<string, string> = {
                  green:  isOn ? 'border-green-500/40 bg-green-500/10' : 'border-[#2A2A3C] bg-[#161625]',
                  blue:   isOn ? 'border-blue-500/40 bg-blue-500/10'   : 'border-[#2A2A3C] bg-[#161625]',
                  purple: isOn ? 'border-purple-500/40 bg-purple-500/10': 'border-[#2A2A3C] bg-[#161625]',
                  orange: isOn ? 'border-[#FF6B35]/40 bg-[#FF6B35]/10' : 'border-[#2A2A3C] bg-[#161625]',
                };
                const txtColor: Record<string, string> = {
                  green: 'text-green-400', blue: 'text-blue-400',
                  purple: 'text-purple-400', orange: 'text-[#FF6B35]',
                };
                const chkColor: Record<string, string> = {
                  green: 'border-green-500 bg-green-500', blue: 'border-blue-500 bg-blue-500',
                  purple: 'border-purple-500 bg-purple-500', orange: 'border-[#FF6B35] bg-[#FF6B35]',
                };
                return (
                  <div key={key}
                    onClick={() => setParams({...params, [key]: !isOn})}
                    className={`cursor-pointer flex items-start gap-3 p-3 rounded-xl border transition-all ${borderBg[color]}`}
                  >
                    <div className={`mt-0.5 w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                      isOn ? chkColor[color] : 'border-gray-500'
                    }`}>
                      {isOn && <span className="text-black text-xs font-bold leading-none">✓</span>}
                    </div>
                    <div>
                      <p className={`text-xs font-bold ${isOn ? txtColor[color] : 'text-gray-400'}`}>{label}</p>
                      <p className="text-xs text-gray-600 mt-0.5">{isOn ? on : off}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            <button onClick={runBacktest} disabled={loading}
              className="w-full bg-[#FF6B35] hover:bg-[#e55a2a] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors">
              {loading
                ? <><span className="animate-spin">⚙️</span> Simulando...</>
                : <><Play size={16} fill="currentColor" /> Rodar Backtest</>}
            </button>

            {error && (
              <p className="text-red-400 text-xs bg-red-900/20 p-2 rounded-lg">{error}</p>
            )}
          </div>

          {/* ── Resultados ──────────────────────────────────────── */}
          <div className="lg:col-span-2 space-y-6">
            {!result && !loading && (
              <div className="bg-[#0F0F1A] border border-[#1F1F2E] rounded-3xl p-12 flex items-center justify-center">
                <div className="text-center">
                  <BarChart2 size={48} className="text-gray-700 mx-auto mb-4" />
                  <p className="text-gray-600 italic">
                    Configure os parâmetros ou escolha um perfil de ativo e clique em
                    <br /><span className="text-[#FF6B35]">Rodar Backtest</span> para ver os resultados.
                  </p>
                </div>
              </div>
            )}

            {result && (
              <>
                {/* ── Métricas top ── */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  {[
                    { label: 'Win Rate',     value: `${result.winRate}%`,          color: result.winRate >= 50 ? 'text-green-400' : 'text-red-400' },
                    { label: 'Profit Factor',value: result.profitFactor.toFixed(2), color: result.profitFactor >= 1 ? 'text-green-400' : 'text-red-400' },
                    { label: 'Sharpe Ratio', value: result.sharpeRatio?.toFixed(2) ?? '—', color: (result.sharpeRatio ?? 0) >= 1 ? 'text-green-400' : 'text-yellow-400' },
                    { label: 'Max Drawdown', value: `${result.maxDrawdown}%`,       color: result.maxDrawdown > 20 ? 'text-red-400' : 'text-yellow-400' },
                    { label: 'Total Trades', value: result.totalTrades,             color: 'text-[#FF6B35]' },
                  ].map((m) => (
                    <div key={m.label} className="bg-[#0F0F1A] border border-[#1F1F2E] rounded-2xl p-4">
                      <p className="text-xs text-gray-500 mb-1">{m.label}</p>
                      <p className={`text-2xl font-bold ${m.color}`}>{m.value}</p>
                    </div>
                  ))}
                </div>

                {/* ── Resultado financeiro ── */}
                <div className="bg-[#0F0F1A] border border-[#1F1F2E] rounded-3xl p-6">
                  <h3 className="text-base font-bold mb-4 flex items-center gap-2">
                    <TrendingUp size={16} className="text-[#FF6B35]" /> Resultado Financeiro
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 text-center">
                    <div>
                      <p className="text-xs text-gray-500">Banca Inicial</p>
                      <p className="text-lg font-mono font-bold">${result.initialBalance.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Pico da Banca</p>
                      <p className="text-lg font-mono font-bold text-purple-400">
                        ${result.peakBalance.toFixed(2)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Banca Final</p>
                      <p className={`text-lg font-mono font-bold ${result.finalBalance >= result.initialBalance ? 'text-green-400' : 'text-red-400'}`}>
                        ${result.finalBalance.toFixed(2)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Lucro Líquido</p>
                      <p className={`text-lg font-mono font-bold ${result.netProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {result.netProfit >= 0 ? '+' : ''}${result.netProfit.toFixed(2)}<br/>
                        <span className="text-sm">({result.netProfitPct}%)</span>
                      </p>
                    </div>
                  </div>

                  <div className="bg-[#07070D] rounded-xl p-3">
                    <p className="text-xs text-gray-500 mb-2">Curva de Equity</p>
                    {renderCurve(result.balanceCurve)}
                  </div>

                  {result.haltCount > 0 && (
                    <div className="mt-3 text-xs text-yellow-400/80 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-2 flex items-center gap-2">
                      <Zap size={12} />
                      <span>Circuit Breaker disparou <strong>{result.haltCount}×</strong> — bot suspenso por 1 dia após queda de {params.circuitBreaker}% desde o pico</span>
                    </div>
                  )}

                  {result.targetHit && (
                    <div className="mt-3 text-xs text-green-400/90 bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2 flex items-center gap-2">
                      <Target size={12} />
                      <span>
                        <strong>Meta de Banca Atingida!</strong> — Bot encerrou ao atingir {params.balanceTarget}× a banca inicial
                        {' '}(<strong>${(params.initialBalance * params.balanceTarget).toFixed(0)}</strong>).
                        Lucro protegido, sem devolver ao mercado.
                      </span>
                    </div>
                  )}

                  <div className="flex items-center justify-between mt-3 text-xs text-gray-500">
                    <span>{result.symbol} | {result.interval} | {result.candlesAnalyzed} candles</span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> {result.wins} wins
                      <span className="w-2 h-2 rounded-full bg-red-500 inline-block ml-2" /> {result.losses} losses
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-3 text-xs flex-wrap">
                    <span className="text-green-500/70 flex items-center gap-1">
                      <span>●</span>
                      <span>{result.dataSource ?? 'Binance API (dados reais)'}</span>
                    </span>
                    {result.config?.trendFilter !== undefined && (
                      <span className={`px-2 py-0.5 rounded-full font-bold ${
                        result.config.trendFilter
                          ? 'bg-green-500/15 text-green-400 border border-green-500/30'
                          : 'bg-red-500/15 text-red-400 border border-red-500/30'
                      }`}>
                        {result.config.trendFilter ? '✓ EMA200 filtro ativo' : '✗ Sem filtro EMA200'}
                      </span>
                    )}
                    {result.config?.useATRStop && (
                      <span className="px-2 py-0.5 rounded-full font-bold bg-orange-500/15 text-orange-400 border border-orange-500/30">
                        ⚡ ATR × {result.config.atrMultiplier as number}
                      </span>
                    )}
                    {result.config?.scaledExits && (
                      <span className="px-2 py-0.5 rounded-full font-bold bg-purple-500/15 text-purple-400 border border-purple-500/30">
                        🎯 3-tier exits
                      </span>
                    )}
                  </div>
                </div>

                {/* ── Saúde da Estratégia (Expectância + Monte Carlo) ── */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                  {/* Expectância Matemática */}
                  <div className="bg-[#0F0F1A] border border-[#1F1F2E] rounded-3xl p-6">
                    <h3 className="text-base font-bold mb-4 flex items-center gap-2">
                      <Target size={16} className="text-[#FF6B35]" /> Saúde da Estratégia
                    </h3>
                    <div className={`text-center p-4 rounded-2xl mb-4 ${result.expectancy >= 0 ? 'bg-green-500/10 border border-green-500/20' : 'bg-red-500/10 border border-red-500/20'}`}>
                      <p className="text-xs text-gray-400 mb-1">Expectância Matemática</p>
                      <p className={`text-4xl font-bold font-mono ${result.expectancy >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {result.expectancy >= 0 ? '+' : ''}${result.expectancy.toFixed(2)}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">por trade executado</p>
                    </div>
                    <div className="space-y-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Gain médio (win)</span>
                        <span className="text-green-400 font-mono font-bold">+${result.avgWin.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Loss médio (loss)</span>
                        <span className="text-red-400 font-mono font-bold">-${result.avgLoss.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">R:R real médio</span>
                        <span className="text-white font-mono font-bold">
                          {result.avgLoss > 0 ? (result.avgWin / result.avgLoss).toFixed(2) : '∞'}
                        </span>
                      </div>
                      <hr className="border-[#1F1F2E]" />
                      <p className="text-xs text-gray-600">
                        {result.expectancy >= 0
                          ? `A cada R$1 arriscado, esta estratégia gera R$${(result.expectancy / (result.avgLoss || 1)).toFixed(3)} de retorno esperado.`
                          : 'Estratégia com expectância negativa — ajuste os parâmetros.'}
                      </p>
                      {/* Distribuição de saídas */}
                      {result.exitBreakdown && Object.keys(result.exitBreakdown).length > 0 && (
                        <div className="mt-2">
                          <p className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-2">Motivos de Saída</p>
                          {Object.entries(result.exitBreakdown)
                            .sort(([,a],[,b]) => b - a)
                            .map(([reason, count]) => (
                            <div key={reason} className="flex items-center gap-2 mb-1">
                              <div className="flex-1 bg-[#161625] rounded-full h-1.5 overflow-hidden">
                                <div
                                  className="h-full bg-[#FF6B35]/60 rounded-full"
                                  style={{ width: `${(count / result.totalTrades) * 100}%` }}
                                />
                              </div>
                              <span className="text-xs text-gray-400 font-mono w-5 text-right">{count}</span>
                              <span className="text-xs text-gray-600 w-28 truncate">{reason}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Monte Carlo */}
                  <div className="bg-[#0F0F1A] border border-[#1F1F2E] rounded-3xl p-6">
                    <h3 className="text-base font-bold mb-4 flex items-center gap-2">
                      <Shield size={16} className="text-[#FF6B35]" /> Monte Carlo (1.000×)
                    </h3>
                    <p className="text-xs text-gray-500 mb-4">
                      Os mesmos {result.totalTrades} trades em ordem aleatória. Qual a chance de quebrar a conta?
                    </p>

                    {/* Probabilidade de ruína */}
                    <div className={`text-center p-4 rounded-2xl mb-4 ${
                      result.monteCarlo.ruinPct <= 5  ? 'bg-green-500/10 border border-green-500/20' :
                      result.monteCarlo.ruinPct <= 20 ? 'bg-yellow-500/10 border border-yellow-500/20' :
                                                        'bg-red-500/10 border border-red-500/20'
                    }`}>
                      <p className="text-xs text-gray-400 mb-1">Probabilidade de Ruína</p>
                      <p className={`text-4xl font-bold font-mono ${
                        result.monteCarlo.ruinPct <= 5  ? 'text-green-400' :
                        result.monteCarlo.ruinPct <= 20 ? 'text-yellow-400' :
                                                          'text-red-400'
                      }`}>
                        {result.monteCarlo.ruinPct}%
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {result.monteCarlo.ruinPct <= 5  ? '✓ Estratégia robusta' :
                         result.monteCarlo.ruinPct <= 20 ? '⚠ Risco moderado' :
                                                           '✗ Alto risco de ruína'}
                      </p>
                    </div>

                    {/* Distribuição de cenários */}
                    <div className="space-y-3">
                      <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Distribuição de Banca Final</p>
                      {renderMCBar('Pessimista (P10)', result.monteCarlo.p10, result.initialBalance, 'bg-red-500/70')}
                      {renderMCBar('Mediana (P50)', result.monteCarlo.medianFinal, result.initialBalance, 'bg-blue-500/70')}
                      {renderMCBar('Otimista (P90)', result.monteCarlo.p90, result.initialBalance, 'bg-green-500/70')}
                    </div>

                    <div className="mt-4 p-3 bg-[#07070D] rounded-xl">
                      <p className="text-xs text-gray-600">
                        Em 90% dos cenários a banca fica entre
                        <span className="text-red-400 font-mono"> ${result.monteCarlo.p10.toFixed(2)}</span> e
                        <span className="text-green-400 font-mono"> ${result.monteCarlo.p90.toFixed(2)}</span>.
                        Mediana: <span className="text-blue-400 font-mono">${result.monteCarlo.medianFinal.toFixed(2)}</span>.
                      </p>
                    </div>
                  </div>
                </div>

                {/* ── Últimas operações ── */}
                <div className="bg-[#0F0F1A] border border-[#1F1F2E] rounded-3xl p-6">
                  <h3 className="text-base font-bold mb-4 flex items-center gap-2">
                    <Activity size={16} className="text-[#FF6B35]" /> Últimas Operações Simuladas
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm font-mono">
                      <thead className="text-gray-500 border-b border-[#1F1F2E] text-xs">
                        <tr>
                          <th className="pb-2 text-left">Dir.</th>
                          <th className="pb-2 text-right">Entrada</th>
                          <th className="pb-2 text-right">Saída</th>
                          <th className="pb-2 text-left pl-2">Motivo</th>
                          <th className="pb-2 text-right">PnL</th>
                          <th className="pb-2 text-right">Banca</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.recentTrades.slice().reverse().map((t, i) => (
                          <tr key={i} className="border-b border-[#1F1F2E]/50">
                            <td className={`py-2 font-bold ${t.signal === 'LONG' ? 'text-green-400' : 'text-red-400'}`}>
                              {t.signal === 'LONG'
                                ? <TrendingUp size={12} className="inline mr-1" />
                                : <TrendingDown size={12} className="inline mr-1" />}
                              {t.signal}
                            </td>
                            <td className="py-2 text-right text-gray-400">${t.entryPrice.toFixed(2)}</td>
                            <td className="py-2 text-right text-gray-400">${t.exitPrice.toFixed(2)}</td>
                            <td className="py-2 pl-2 text-xs text-gray-500">{t.exitReason ?? '—'}</td>
                            <td className={`py-2 text-right font-bold ${t.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {t.profit >= 0 ? '+' : ''}${t.profit.toFixed(2)}
                            </td>
                            <td className="py-2 text-right text-gray-300">${t.balance.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
