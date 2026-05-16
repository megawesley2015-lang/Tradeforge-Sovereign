
"use client";
import { useState } from 'react';
import {
  Play, TrendingUp, TrendingDown, ArrowLeft, BarChart2,
  Shield, Zap, PieChart, AlertTriangle, Save, Clock, Target,
  Plus, X, User,
} from 'lucide-react';
import Link from 'next/link';

// ─── Tipos ───────────────────────────────────────────────────

interface AssetConfig {
  symbol: string;
  allocation: number;   // 0..1
  color: string;
  label: string;
}

interface AssetResult {
  symbol: string;
  allocation: number;
  initialBalance: number;
  finalBalance: number;
  netProfitPct: number;
  wins: number;
  losses: number;
  winRate: number;
  profitFactor: number;
  maxDrawdown: number;
  totalTrades: number;
  haltCount: number;
  targetHit: boolean;
  globalRiskCapHits: number;
  balanceCurve: number[];
  recentTrades: {
    entryPrice: number; exitPrice: number; signal: string;
    profit: number; isWin: boolean; balance: number; exitReason: string;
  }[];
}

interface BasketResult {
  dataSource: string;
  interval: string;
  candlesAnalyzed: number;
  initialBalance: number;
  finalBalance: number;
  peakBalance: number;
  netProfitPct: number;
  maxDrawdown: number;
  totalTrades: number;
  totalWins: number;
  totalLosses: number;
  portfolioProfitFactor: number;
  globalRiskCapHits: number;
  portfolioBalanceCurve: number[];
  assets: AssetResult[];
}

// ─── Paleta de cores para ativos customizados ─────────────────
const ASSET_COLORS = [
  '#FF6B35', '#4A90E2', '#50C878', '#9945FF', '#C2A633',
  '#E84142', '#627EEA', '#F7931A', '#76B900', '#00B4D8',
  '#FF6B8A', '#FFC107', '#17C3B2', '#6C5CE7',
];

// ─── Presets de baskets ───────────────────────────────────────

const BASKET_PRESETS: Record<string, { label: string; description: string; assets: AssetConfig[] }> = {
  conservador: {
    label: '🔵 Conservador',
    description: 'BTC 60% + ETH 40% — ativos maduros, baixa volatilidade, crescimento consistente.',
    assets: [
      { symbol: 'BTCUSDT', allocation: 0.60, color: '#F7931A', label: 'Bitcoin' },
      { symbol: 'ETHUSDT', allocation: 0.40, color: '#627EEA', label: 'Ethereum' },
    ],
  },
  diversificado: {
    label: '🟡 Diversificado',
    description: 'BTC 40% + ETH 30% + SOL 30% — mix de cap alta e mid-cap.',
    assets: [
      { symbol: 'BTCUSDT', allocation: 0.40, color: '#F7931A', label: 'Bitcoin' },
      { symbol: 'ETHUSDT', allocation: 0.30, color: '#627EEA', label: 'Ethereum' },
      { symbol: 'SOLUSDT', allocation: 0.30, color: '#9945FF', label: 'Solana' },
    ],
  },
  fundo_completo: {
    label: '🟠 Fundo Completo',
    description: 'BTC 40% + ETH 30% + DOGE 30% — o BTC segurar enquanto memecoins buscam alpha.',
    assets: [
      { symbol: 'BTCUSDT', allocation: 0.40, color: '#F7931A', label: 'Bitcoin' },
      { symbol: 'ETHUSDT', allocation: 0.30, color: '#627EEA', label: 'Ethereum' },
      { symbol: 'DOGEUSDT', allocation: 0.30, color: '#C2A633', label: 'Dogecoin' },
    ],
  },
  agressivo: {
    label: '🔴 Agressivo',
    description: 'SOL 35% + DOGE 35% + AVAX 30% — máximo alpha, máximo risco.',
    assets: [
      { symbol: 'SOLUSDT',  allocation: 0.35, color: '#9945FF', label: 'Solana' },
      { symbol: 'DOGEUSDT', allocation: 0.35, color: '#C2A633', label: 'Dogecoin' },
      { symbol: 'AVAXUSDT', allocation: 0.30, color: '#E84142', label: 'Avalanche' },
    ],
  },
  global: {
    label: '🌎 Global Portfolio',
    description: 'SPY 40% + QQQ 35% + NVDA 25% — S&P 500, Nasdaq e semicondutores via Yahoo Finance. Use intervalo 1d.',
    assets: [
      { symbol: 'SPY',  allocation: 0.40, color: '#4A90E2', label: 'S&P 500 ETF' },
      { symbol: 'QQQ',  allocation: 0.35, color: '#50C878', label: 'Nasdaq 100 ETF' },
      { symbol: 'NVDA', allocation: 0.25, color: '#76B900', label: 'NVIDIA' },
    ],
  },
  nyse_blue_chips: {
    label: '🏛️ NYSE Blue Chips',
    description: 'V + JPM + WMT + KO + JNJ — top 5 defensivas da NYSE. Use intervalo 1d.',
    assets: [
      { symbol: 'V',   allocation: 0.20, color: '#1A1F71', label: 'Visa' },
      { symbol: 'JPM', allocation: 0.20, color: '#005B9A', label: 'JPMorgan Chase' },
      { symbol: 'WMT', allocation: 0.20, color: '#007DC6', label: 'Walmart' },
      { symbol: 'KO',  allocation: 0.20, color: '#FF0000', label: 'Coca-Cola' },
      { symbol: 'JNJ', allocation: 0.20, color: '#CC0000', label: 'Johnson & Johnson' },
    ],
  },
};

const INTERVALS = ['15m', '1h', '4h', '1d'];

const inp = "w-full bg-[#161625] border border-[#2A2A3C] rounded-lg p-2 text-white outline-none focus:border-[#FF6B35] text-sm";
const lbl = "text-xs text-gray-500 block mb-1";

// ─── Helpers ──────────────────────────────────────────────────

function MiniCurve({ curve, color }: { curve: number[]; color: string }) {
  if (!curve || curve.length < 2) return null;
  const min = Math.min(...curve), max = Math.max(...curve);
  const range = max - min || 1;
  const w = 200, h = 50;
  const pts = curve.map((v, i) =>
    `${(i / (curve.length - 1)) * w},${h - ((v - min) / range) * h}`
  ).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-12">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}

function PortfolioCurve({ curve, initial }: { curve: number[]; initial: number }) {
  if (!curve || curve.length < 2) return null;
  const min = Math.min(...curve), max = Math.max(...curve);
  const range = max - min || 1;
  const w = 600, h = 120;
  const pts = curve.map((v, i) =>
    `${(i / (curve.length - 1)) * w},${h - ((v - min) / range) * (h - 4)}`
  ).join(' ');
  const isProfit = curve[curve.length - 1] >= initial;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-32">
      <defs>
        <linearGradient id="portfolioGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={isProfit ? '#22c55e' : '#ef4444'} stopOpacity="0.25" />
          <stop offset="100%" stopColor={isProfit ? '#22c55e' : '#ef4444'} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon
        points={`0,${h} ${pts} ${w},${h}`}
        fill="url(#portfolioGrad)"
      />
      <polyline
        points={pts}
        fill="none"
        stroke={isProfit ? '#22c55e' : '#ef4444'}
        strokeWidth="2"
      />
    </svg>
  );
}

// ─── Componente principal ─────────────────────────────────────

export default function BasketBacktestPage() {
  // ── Ativos dinâmicos (tag input) ─────────────────────────────
  // Começa com o preset padrão, mas o usuário pode adicionar/remover à vontade.
  const [customAssets, setCustomAssets] = useState<AssetConfig[]>(
    BASKET_PRESETS.fundo_completo.assets,
  );
  const [tickerInput, setTickerInput]   = useState('');
  const [lastPreset, setLastPreset]     = useState<string>('fundo_completo');

  // Carrega preset: substitui os ativos pelo preset escolhido
  const loadPreset = (key: string) => {
    setCustomAssets([...BASKET_PRESETS[key].assets]);
    setLastPreset(key);
  };

  // Bases cripto conhecidas sem sufixo USDT
  const CRYPTO_BASES = new Set([
    'BTC','ETH','BNB','SOL','DOGE','ADA','XRP','DOT','LINK',
    'AVAX','MATIC','UNI','LTC','BCH','ATOM','ALGO','FIL','TRX',
    'SHIB','PEPE','WIF','BONK','SUI','APT','ARB','OP','INJ','SEI',
    'TON','NOT','JUP','TIA','BLUR','IMX','SAND','MANA','AXS',
    'FTM','NEAR','HBAR','VET','EGLD','THETA','AAVE','MKR','SNX',
  ]);

  /**
   * Normaliza o símbolo digitado:
   *   DOGE      → DOGEUSDT  (cripto conhecida sem sufixo)
   *   PETR4     → PETR4.SA  (padrão B3)
   *   BTCUSDT   → BTCUSDT   (já correto)
   *   SPY, QQQ  → SPY, QQQ  (ações EUA, sem mudança)
   */
  const normalizeSymbol = (raw: string): string => {
    const s = raw.toUpperCase().trim();
    if (!s) return s;
    // Cripto base sem sufixo: DOGE → DOGEUSDT
    if (CRYPTO_BASES.has(s) && !/USDT$|BUSD$|BTC$|ETH$|BNB$/.test(s)) return `${s}USDT`;
    // Já tem sufixo (DOGEUSDT, PETR4.SA etc.)
    if (s.includes('.') || /USDT$|BUSD$/.test(s)) return s;
    // Padrão B3: 4 letras + 1-2 dígitos → PETR4.SA
    if (/^[A-Z]{4}\d{1,2}$/.test(s)) return `${s}.SA`;
    return s;
  };

  // Adiciona um ticker customizado com allocation igual (calculado ao usar)
  const addTicker = (raw: string) => {
    const symbol = normalizeSymbol(raw);
    if (!symbol) return;
    if (customAssets.some(a => a.symbol === symbol)) return; // evita duplicatas
    const color = ASSET_COLORS[customAssets.length % ASSET_COLORS.length];
    setCustomAssets(prev => [...prev, { symbol, allocation: 0, color, label: symbol }]);
    setTickerInput('');
  };

  const removeTicker = (symbol: string) =>
    setCustomAssets(prev => prev.filter(a => a.symbol !== symbol));

  // Alocação igual entre todos os ativos selecionados
  const assetsWithAlloc: AssetConfig[] = customAssets.map(a => ({
    ...a,
    allocation: customAssets.length > 0 ? 1 / customAssets.length : 1,
  }));

  const isSingleMode = customAssets.length === 1;

  const [initialBalance, setInitialBalance] = useState(100);
  const [globalRiskCap, setGlobalRiskCap] = useState(15);
  const [interval, setInterval] = useState('4h');
  const [limit, setLimit] = useState(1000);
  const [riskPerTrade, setRiskPerTrade] = useState(2);
  const [minRiskReward, setMinRiskReward] = useState(2);
  const [atrMultiplier, setAtrMultiplier] = useState(2.0);
  const [circuitBreaker, setCircuitBreaker] = useState(15);
  const [trendFilter, setTrendFilter] = useState(true);
  const [trailingStop, setTrailingStop] = useState(true);
  const [scaledExits, setScaledExits] = useState(true);
  const [progressiveRisk, setProgressiveRisk] = useState(true);
  // ── Novos controles (antes hardcoded no backend) ──────────
  const [useAdxFilter, setUseAdxFilter] = useState(true);
  const [adxMinStrength, setAdxMinStrength] = useState(20);
  const [slippage, setSlippage] = useState(0.10);           // % exibido (0.10 = 0.1%)
  const [balanceTarget, setBalanceTarget] = useState(0);
  const [useTimeExit, setUseTimeExit] = useState(false);
  const [maxCandlesInTrade, setMaxCandlesInTrade] = useState(48);
  const [marketMode, setMarketMode] = useState<'crypto' | 'stock'>('crypto');
  // ── Feedback do botão Salvar DNA ─────────────────────────
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'ok' | 'err'>('idle');

  const [result, setResult] = useState<BasketResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const runBacktest = async () => {
    if (customAssets.length === 0) { setError('Adicione pelo menos 1 ativo antes de rodar.'); return; }
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const payload = {
        assets: assetsWithAlloc.map(a => ({ symbol: a.symbol, allocation: a.allocation })),
        initialBalance,
        globalRiskCap,
        riskPerTrade:    riskPerTrade / 100,
        stopLossPercent: 0.015,
        atrMultiplier,
        useATRStop: true,
        minRiskReward,
        rsiLow: 30, rsiHigh: 70, smaPeriod: 200,
        trendFilter, trailingStop, trailRUnits: 2.0,
        scaledExits, fixedRiskAmount: true, progressiveRisk,
        circuitBreaker,
        useAdxFilter,
        adxMinStrength,
        slippage: slippage / 100,
        maxCandlesInTrade: useTimeExit ? maxCandlesInTrade : 0,
        balanceTarget,
        interval,
        limit: Math.min(limit, 1000),   // Binance klines: max 1000
      };
      const res = await fetch('/trading/api/backtest-basket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      // Lê o body primeiro — pode ser HTML (erro do Next.js) ou JSON
      const text = await res.text();
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(text);
      } catch {
        // Resposta não é JSON → provavelmente página de erro HTML do Next.js
        throw new Error(`Servidor retornou ${res.status}: ${text.slice(0, 200)}`);
      }
      if (!res.ok || data.error) {
        throw new Error(String(data.error ?? `HTTP ${res.status}`));
      }
      setResult(data as unknown as BasketResult);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  };

  const saveDNA = async () => {
    setSaveStatus('saving');
    try {
      const config = {
        rsiLow: 30, rsiHigh: 70, smaPeriod: 200, adxPeriod: 14,
        trendFilter, useAdxFilter, adxMinStrength,
        stopLossPercent: 0.015, atrMultiplier, useATRStop: true,
        minRiskReward,
        riskPerTrade: riskPerTrade / 100, fixedRiskAmount: true,
        trailingStop, trailRUnits: 2.0, scaledExits, partialExit: false,
        progressiveRisk, circuitBreaker,
        maxCandlesInTrade: useTimeExit ? maxCandlesInTrade : 0,
        balanceTarget,
        slippage: slippage / 100,
      };
      const assets = customAssets.map(a => a.symbol);
      const presetLabel = BASKET_PRESETS[lastPreset]?.label ?? 'Custom';
      const name   = `${presetLabel} — ${new Date().toLocaleDateString('pt-BR')}`;
      const res = await fetch('/trading/api/save-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, config, assets,
          backtestNetPct:  result?.netProfitPct,
          backtestWinRate: result ? (result.totalWins / (result.totalTrades || 1)) * 100 : undefined,
          backtestMaxDD:   result?.maxDrawdown,
        }),
      });
      if (!res.ok) throw new Error('Falha ao salvar');
      setSaveStatus('ok');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch {
      setSaveStatus('err');
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  };

  return (
    <div className="min-h-screen bg-[#07070D] text-white p-8 font-sans">
      <div className="max-w-7xl mx-auto">

        {/* ── Header ── */}
        <div className="flex items-center gap-4 mb-8">
          <Link href="/trading/dashboard" className="text-gray-500 hover:text-white transition-colors">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-3xl font-bold">
                TradeForge <span className="text-[#FF6B35]">Basket</span>
              </h1>
              <span className="text-xs font-bold px-3 py-1 rounded-full bg-green-500/15 text-green-400 border border-green-500/30">
                ● DADOS REAIS — Binance + Yahoo Finance
              </span>
              <span className="text-xs font-bold px-3 py-1 rounded-full bg-purple-500/15 text-purple-400 border border-purple-500/30">
                <PieChart size={10} className="inline mr-1" /> Multi-Ativo Sincronizado
              </span>
            </div>
            <p className="text-gray-500 text-sm mt-1">
              Simula múltiplos ativos simultaneamente · Risco Global · Correlação real de mercado
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* ── Painel de configuração ── */}
          <div className="bg-[#0F0F1A] border border-[#1F1F2E] rounded-3xl p-6 space-y-5">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <BarChart2 size={18} className="text-[#FF6B35]" /> Configuração do Portfólio
            </h2>

            {/* Presets — botões de carregamento rápido */}
            <div>
              <p className={lbl + ' font-bold uppercase tracking-wider'}>Presets Rápidos</p>
              <div className="space-y-1.5">
                {Object.entries(BASKET_PRESETS).map(([key, p]) => (
                  <button
                    key={key}
                    onClick={() => loadPreset(key)}
                    className={`w-full text-left p-2.5 rounded-xl border transition-all ${
                      lastPreset === key && customAssets.length === BASKET_PRESETS[key].assets.length
                        ? 'border-[#FF6B35]/50 bg-[#FF6B35]/10'
                        : 'border-[#2A2A3C] bg-[#161625] hover:border-[#FF6B35]/30'
                    }`}
                  >
                    <p className={`text-xs font-bold ${lastPreset === key ? 'text-[#FF6B35]' : 'text-gray-300'}`}>
                      {p.label}
                    </p>
                    <p className="text-xs text-gray-600 mt-0.5 leading-tight">{p.description}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Ativos ativos — chips removíveis */}
            <div className="bg-[#07070D] rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-500 font-bold flex items-center gap-1.5">
                  {isSingleMode
                    ? <><User size={10} className="text-cyan-400" /><span className="text-cyan-400">Modo Individual</span></>
                    : <><PieChart size={10} /><span>{customAssets.length} ativos selecionados</span></>}
                </p>
                <p className="text-xs text-gray-600 font-mono">
                  {customAssets.length > 0
                    ? `${Math.round(100 / customAssets.length)}% cada`
                    : '—'}
                </p>
              </div>

              {customAssets.length === 0 ? (
                <p className="text-xs text-gray-700 text-center py-2">
                  Carregue um preset acima ou adicione um ticker abaixo ↓
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {customAssets.map(a => (
                    <div
                      key={a.symbol}
                      className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold"
                      style={{
                        backgroundColor: a.color + '20',
                        border: `1px solid ${a.color}50`,
                        color: a.color,
                      }}
                    >
                      <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: a.color }} />
                      <span>{a.symbol}</span>
                      <button
                        onClick={() => removeTicker(a.symbol)}
                        className="hover:opacity-100 opacity-60 transition-opacity ml-0.5"
                      >
                        <X size={9} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Linha de alocação por ativo */}
              {customAssets.length > 0 && (
                <div className="space-y-1 pt-1 border-t border-[#1F1F2E]">
                  {assetsWithAlloc.map(a => (
                    <div key={a.symbol} className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: a.color }} />
                      <span className="text-xs text-gray-500 flex-1 truncate">{a.label !== a.symbol ? a.label : a.symbol}</span>
                      <span className="text-xs font-mono font-bold text-white">{(a.allocation * 100).toFixed(0)}%</span>
                      <span className="text-xs text-gray-700 font-mono">
                        ${(initialBalance * a.allocation).toFixed(0)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Input de ticker livre — o coração da feature */}
            <div className="space-y-1">
              <label className={lbl + ' font-bold'}>
                <Plus size={10} className="inline mr-1 text-[#FF6B35]" />
                Adicionar Ativo Livre
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={tickerInput}
                  onChange={e => setTickerInput(e.target.value.toUpperCase())}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTicker(tickerInput); } }}
                  placeholder="BTCUSDT, DOGE, NVDA, PETR4..."
                  className={inp + ' flex-1 placeholder:text-gray-700'}
                />
                <button
                  onClick={() => addTicker(tickerInput)}
                  className="bg-[#FF6B35] hover:bg-[#e55a2a] text-white rounded-lg px-3 flex items-center justify-center transition-colors"
                >
                  <Plus size={14} />
                </button>
              </div>
              <p className="text-xs text-gray-700">
                Auto-corrigido: <span className="text-gray-500">DOGE→DOGEUSDT · PETR4→PETR4.SA</span> · NYSE: SPY, NVDA · Evite S&amp;P (use SPY)
              </p>
            </div>

            <hr className="border-[#1F1F2E]" />

            {/* Parâmetros globais */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Banca Total ($)</label>
                <input type="number" value={initialBalance}
                  onChange={e => setInitialBalance(+e.target.value)}
                  className={inp} />
              </div>
              <div>
                <label className={lbl}>Intervalo</label>
                <select value={interval}
                  onChange={e => setInterval(e.target.value)}
                  className={inp}>
                  {INTERVALS.map(i => <option key={i} value={i}>{i}</option>)}
                </select>
              </div>
            </div>

            {/* Global Risk Cap — o coração do basket */}
            <div className="p-3 rounded-xl border border-yellow-500/30 bg-yellow-500/5">
              <label className="text-xs text-yellow-400 font-bold block mb-1 flex items-center gap-1">
                <Shield size={11} /> Cap de Risco Global (%)
              </label>
              <input
                type="number" step="5" min="5" max="50"
                value={globalRiskCap}
                onChange={e => setGlobalRiskCap(+e.target.value)}
                className={inp}
              />
              <p className="text-xs text-gray-600 mt-1.5">
                Se risco simultâneo total ≥ {globalRiskCap}% da banca, o robô não abre novos trades.
                Evita: 5 stops ao mesmo tempo = -{globalRiskCap}%+ em um candle.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Risco/Op (%)</label>
                <input type="number" step="0.5" value={riskPerTrade}
                  onChange={e => setRiskPerTrade(+e.target.value)}
                  className={inp} />
              </div>
              <div>
                <label className={lbl}>Min R:R</label>
                <input type="number" step="0.5" value={minRiskReward}
                  onChange={e => setMinRiskReward(+e.target.value)}
                  className={inp} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>ATR ×</label>
                <input type="number" step="0.5" min="1" max="5" value={atrMultiplier}
                  onChange={e => setAtrMultiplier(+e.target.value)}
                  className={inp} />
              </div>
              <div>
                <label className={lbl}>Circuit Breaker (%)</label>
                <input type="number" step="5" min="0" max="50" value={circuitBreaker}
                  onChange={e => setCircuitBreaker(+e.target.value)}
                  className={inp} />
              </div>
            </div>

            <div>
              <label className={lbl}>Candles históricos (máx 2000)</label>
              <input type="number" step="100" min="100" max="2000" value={limit}
                onChange={e => setLimit(Math.min(2000, Math.max(100, +e.target.value)))}
                className={inp} />
              <p className="text-xs text-gray-600 mt-1">
                {interval === '4h' && limit >= 1000
                  ? `≈ ${Math.round(limit / 6)} dias de histórico`
                  : interval === '1d' && limit >= 500
                  ? `≈ ${Math.round(limit / 250)} anos de histórico`
                  : interval === '1h'
                  ? `≈ ${Math.round(limit / 24)} dias de histórico`
                  : ''}
              </p>
            </div>

            {/* Toggles */}
            <div className="space-y-2">
              {([
                { key: 'trendFilter',    val: trendFilter,    set: setTrendFilter,    label: 'Filtro EMA200',       color: 'green'  },
                { key: 'trailingStop',   val: trailingStop,   set: setTrailingStop,   label: 'Trailing Stop 2R',    color: 'blue'   },
                { key: 'scaledExits',    val: scaledExits,    set: setScaledExits,    label: 'Saída 3 Camadas',     color: 'purple' },
                { key: 'progressiveRisk',val: progressiveRisk,set: setProgressiveRisk,label: 'Risco Progressivo',   color: 'orange' },
              ] as const).map(({ key, val, set, label, color }) => {
                const borderBg: Record<string, string> = {
                  green:  val ? 'border-green-500/40 bg-green-500/10'  : 'border-[#2A2A3C]',
                  blue:   val ? 'border-blue-500/40 bg-blue-500/10'    : 'border-[#2A2A3C]',
                  purple: val ? 'border-purple-500/40 bg-purple-500/10': 'border-[#2A2A3C]',
                  orange: val ? 'border-[#FF6B35]/40 bg-[#FF6B35]/10'  : 'border-[#2A2A3C]',
                };
                const txtColor: Record<string, string> = {
                  green: 'text-green-400', blue: 'text-blue-400',
                  purple: 'text-purple-400', orange: 'text-[#FF6B35]',
                };
                return (
                  <div key={key}
                    onClick={() => set(!val)}
                    className={`cursor-pointer flex items-center gap-3 p-2.5 rounded-xl border transition-all ${borderBg[color]}`}
                  >
                    <div className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center ${
                      val ? `border-current bg-current` : 'border-gray-500'
                    } ${val ? txtColor[color] : ''}`}>
                      {val && <span className="text-black text-xs font-bold leading-none">✓</span>}
                    </div>
                    <p className={`text-xs font-bold ${val ? txtColor[color] : 'text-gray-400'}`}>{label}</p>
                  </div>
                );
              })}
            </div>

            {/* ── Filtro ADX ────────────────────────────────── */}
            <hr className="border-[#1F1F2E]" />
            <div className="space-y-2">
              <p className={lbl + ' font-bold uppercase tracking-wider text-cyan-400/80'}>🔍 Filtro de Qualidade</p>
              <div
                onClick={() => setUseAdxFilter(!useAdxFilter)}
                className={`cursor-pointer flex items-center gap-3 p-2.5 rounded-xl border transition-all ${
                  useAdxFilter ? 'border-cyan-500/40 bg-cyan-500/10' : 'border-[#2A2A3C]'
                }`}
              >
                <div className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center ${
                  useAdxFilter ? 'border-cyan-400 bg-cyan-400' : 'border-gray-500'
                }`}>
                  {useAdxFilter && <span className="text-black text-xs font-bold leading-none">✓</span>}
                </div>
                <p className={`text-xs font-bold ${useAdxFilter ? 'text-cyan-400' : 'text-gray-400'}`}>
                  Filtro ADX — bloquear mercado lateral
                </p>
              </div>
              {useAdxFilter && (
                <div>
                  <label className={lbl}>Força Mínima ADX</label>
                  <input type="number" step="5" min="10" max="50" value={adxMinStrength}
                    onChange={e => setAdxMinStrength(+e.target.value)}
                    className={inp} />
                  <p className="text-xs text-gray-600 mt-1">
                    ADX &lt; {adxMinStrength} → lateral → sem trades
                  </p>
                </div>
              )}
            </div>

            {/* ── Slippage ──────────────────────────────────── */}
            <div className="p-3 rounded-xl border border-red-500/20 bg-red-500/5">
              <p className="text-xs text-red-400 font-bold mb-2">💰 Custo Real de Execução</p>
              <label className={lbl}>Slippage % (taxas + spread)</label>
              <input type="number" step="0.05" min="0" max="2" value={slippage}
                onChange={e => setSlippage(+e.target.value)}
                className={inp} />
              <p className="text-xs text-gray-600 mt-1.5">
                Cripto: ~0.1% · Ações US: ~0.05% · B3: ~0.2%
              </p>
            </div>

            {/* ── Freios Avançados ──────────────────────────── */}
            <hr className="border-[#1F1F2E]" />
            <div className="space-y-3">
              <p className={lbl + ' font-bold uppercase tracking-wider text-yellow-400/80'}>🎯 Freios Avançados</p>

              {/* Saída por Tempo */}
              <div
                onClick={() => setUseTimeExit(!useTimeExit)}
                className={`cursor-pointer flex items-center gap-3 p-2.5 rounded-xl border transition-all ${
                  useTimeExit ? 'border-yellow-500/40 bg-yellow-500/10' : 'border-[#2A2A3C]'
                }`}
              >
                <div className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center ${
                  useTimeExit ? 'border-yellow-400 bg-yellow-400' : 'border-gray-500'
                }`}>
                  {useTimeExit && <span className="text-black text-xs font-bold leading-none">✓</span>}
                </div>
                <div className="flex-1">
                  <p className={`text-xs font-bold ${useTimeExit ? 'text-yellow-400' : 'text-gray-400'}`}>
                    <Clock size={10} className="inline mr-1" />Saída por Tempo
                  </p>
                  <p className="text-xs text-gray-600">Fecha trade lateral após N candles</p>
                </div>
              </div>
              {useTimeExit && (
                <div>
                  <label className={lbl}>Máx. Candles por Trade</label>
                  <input type="number" step="1" min="1" max="500" value={maxCandlesInTrade}
                    onChange={e => setMaxCandlesInTrade(+e.target.value)}
                    className={inp} />
                  <p className="text-xs text-gray-600 mt-1">
                    {interval === '4h' ? `≈ ${(maxCandlesInTrade / 6).toFixed(0)} dias` :
                     interval === '1h' ? `≈ ${(maxCandlesInTrade / 24).toFixed(0)} dias` :
                     interval === '1d' ? `${maxCandlesInTrade} dias` : `${maxCandlesInTrade} candles`}
                    {' '}sem resolver → fecha a mercado
                  </p>
                </div>
              )}

              {/* Meta de Banca */}
              <div>
                <label className={lbl}>
                  <Target size={10} className="inline mr-1 text-green-400" />
                  Meta de Banca ($) — 0 = sem meta
                </label>
                <input type="number" step="100" min="0" value={balanceTarget}
                  onChange={e => setBalanceTarget(+e.target.value)}
                  className={inp} />
                {balanceTarget > 0 && initialBalance > 0 && (
                  <p className="text-xs text-green-400/70 mt-1">
                    Bot para ao atingir ${balanceTarget.toLocaleString()} · {(balanceTarget / initialBalance).toFixed(1)}× a banca inicial
                  </p>
                )}
              </div>
            </div>

            {/* ── Modo de Mercado ───────────────────────────── */}
            <div className="p-3 rounded-xl border border-[#2A2A3C] space-y-2">
              <p className={lbl + ' font-bold uppercase tracking-wider'}>🌍 Modo de Mercado</p>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { id: 'crypto', label: '₿ Cripto 24/7',     desc: 'Binance · 0.1% taxa' },
                  { id: 'stock',  label: '📈 Bolsa (Sessão)', desc: 'Yahoo · 0.2% taxa' },
                ] as const).map(m => (
                  <button
                    key={m.id}
                    onClick={() => {
                      setMarketMode(m.id);
                      if (m.id === 'stock')  { setSlippage(0.20); setInterval('1d'); }
                      else                   { setSlippage(0.10); }
                    }}
                    className={`p-2 rounded-lg border text-xs font-bold transition-all ${
                      marketMode === m.id
                        ? 'border-[#FF6B35]/50 bg-[#FF6B35]/10 text-[#FF6B35]'
                        : 'border-[#2A2A3C] text-gray-500 hover:border-[#FF6B35]/30'
                    }`}
                  >
                    <span className="block">{m.label}</span>
                    <span className="text-gray-600 font-normal">{m.desc}</span>
                  </button>
                ))}
              </div>
              {marketMode === 'stock' && (
                <p className="text-xs text-gray-600 mt-1">
                  Use intervalo <strong className="text-gray-400">1d</strong> para ações — evita distorção por gaps de abertura.
                </p>
              )}
            </div>

            <button onClick={runBacktest} disabled={loading || customAssets.length === 0}
              className="w-full bg-[#FF6B35] hover:bg-[#e55a2a] disabled:opacity-50 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors">
              {loading
                ? <><span className="animate-spin">⚙️</span> Simulando {customAssets.length} ativo{customAssets.length > 1 ? 's' : ''}...</>
                : isSingleMode
                ? <><User size={16} /> Rodar Backtest Individual — {customAssets[0]?.symbol}</>
                : <><Play size={16} fill="currentColor" /> Rodar Basket Backtest ({customAssets.length} ativos)</>}
            </button>

            {error && (
              <p className="text-red-400 text-xs bg-red-900/20 p-2 rounded-lg">{error}</p>
            )}

            {/* Salvar DNA no Supabase */}
            <button
              onClick={saveDNA}
              disabled={saveStatus === 'saving'}
              className={`w-full font-bold py-2.5 rounded-xl flex items-center justify-center gap-2 transition-colors border text-sm ${
                saveStatus === 'ok'  ? 'border-green-500/50 bg-green-500/10 text-green-400' :
                saveStatus === 'err' ? 'border-red-500/50 bg-red-500/10 text-red-400' :
                'border-[#2A2A3C] bg-[#161625] text-gray-400 hover:border-[#FF6B35]/30 hover:text-gray-200'
              }`}
            >
              <Save size={14} />
              {saveStatus === 'saving' ? 'Salvando...'
               : saveStatus === 'ok'   ? '✓ DNA salvo no Supabase'
               : saveStatus === 'err'  ? '✗ Erro ao salvar — veja o console'
               : 'Salvar DNA no Supabase'}
            </button>
            <p className="text-xs text-gray-700 text-center -mt-2">
              Salva esta configuração em <code className="text-gray-600">bot_configs</code> para o bot real herdar
            </p>

            <div className="text-center">
              <Link href="/trading/backtest" className="text-xs text-gray-600 hover:text-gray-400 transition-colors">
                ← Voltar ao backtest single-ativo
              </Link>
            </div>
          </div>

          {/* ── Resultados ── */}
          <div className="lg:col-span-2 space-y-6">
            {!result && !loading && (
              <div className="bg-[#0F0F1A] border border-[#1F1F2E] rounded-3xl p-12 flex items-center justify-center">
                <div className="text-center">
                  <PieChart size={48} className="text-gray-700 mx-auto mb-4" />
                  <p className="text-gray-600 italic">
                    Escolha uma cesta de ativos e clique em
                    <br /><span className="text-[#FF6B35]">Rodar Basket Backtest</span>.
                  </p>
                  <p className="text-gray-700 text-xs mt-3">
                    Todos os ativos são simulados <strong className="text-gray-600">ao mesmo tempo</strong>,<br />
                    candle a candle — correlação real de mercado.
                  </p>
                </div>
              </div>
            )}

            {result && (
              <>
                {/* ── Portfólio consolidado ── */}
                <div className="bg-[#0F0F1A] border border-[#1F1F2E] rounded-3xl p-6">
                  <h3 className="text-base font-bold mb-4 flex items-center gap-2">
                    <TrendingUp size={16} className="text-[#FF6B35]" /> Portfólio Consolidado
                    <span className="text-xs text-gray-500 font-normal ml-auto">
                      {result.interval} · {result.candlesAnalyzed} candles · {result.totalTrades} trades totais
                    </span>
                  </h3>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 text-center">
                    <div>
                      <p className="text-xs text-gray-500">Banca Inicial</p>
                      <p className="text-lg font-mono font-bold">${result.initialBalance.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Pico</p>
                      <p className="text-lg font-mono font-bold text-purple-400">${result.peakBalance.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Banca Final</p>
                      <p className={`text-lg font-mono font-bold ${result.finalBalance >= result.initialBalance ? 'text-green-400' : 'text-red-400'}`}>
                        ${result.finalBalance.toFixed(2)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Lucro Total</p>
                      <p className={`text-lg font-mono font-bold ${result.netProfitPct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {result.netProfitPct >= 0 ? '+' : ''}{result.netProfitPct}%
                      </p>
                    </div>
                  </div>

                  <div className="bg-[#07070D] rounded-xl p-3 mb-3">
                    <p className="text-xs text-gray-500 mb-2">Curva de Equity — Portfólio Total</p>
                    <PortfolioCurve curve={result.portfolioBalanceCurve} initial={result.initialBalance} />
                  </div>

                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="bg-[#07070D] rounded-xl p-3">
                      <p className="text-xs text-gray-500">Profit Factor</p>
                      <p className={`text-xl font-bold font-mono ${result.portfolioProfitFactor >= 1 ? 'text-green-400' : 'text-red-400'}`}>
                        {result.portfolioProfitFactor.toFixed(2)}
                      </p>
                    </div>
                    <div className="bg-[#07070D] rounded-xl p-3">
                      <p className="text-xs text-gray-500">Max Drawdown</p>
                      <p className={`text-xl font-bold font-mono ${result.maxDrawdown > 30 ? 'text-red-400' : 'text-yellow-400'}`}>
                        {result.maxDrawdown}%
                      </p>
                    </div>
                    <div className="bg-[#07070D] rounded-xl p-3">
                      <p className="text-xs text-gray-500">Win Rate Geral</p>
                      <p className={`text-xl font-bold font-mono ${(result.totalWins / (result.totalTrades || 1)) * 100 >= 50 ? 'text-green-400' : 'text-red-400'}`}>
                        {result.totalTrades > 0 ? ((result.totalWins / result.totalTrades) * 100).toFixed(1) : 0}%
                      </p>
                    </div>
                  </div>

                  {result.globalRiskCapHits > 0 && (
                    <div className="mt-3 text-xs text-yellow-400/80 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-2 flex items-center gap-2">
                      <Shield size={12} />
                      <span>
                        <strong>Risco Global bloqueou {result.globalRiskCapHits} trades</strong> —
                        sinais ignorados porque o risco simultâneo já atingia {globalRiskCap}% da banca.
                        Isso <span className="text-yellow-300">protegeu a banca</span> de stops simultâneos.
                      </span>
                    </div>
                  )}
                </div>

                {/* ── Breakdown por ativo ── */}
                <div>
                  <h3 className="text-base font-bold mb-3 flex items-center gap-2 px-1">
                    <PieChart size={16} className="text-[#FF6B35]" /> Performance por Ativo
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {result.assets.map((asset, idx) => {
                      const assetConfig = customAssets.find(a => a.symbol === asset.symbol);
                      const color = assetConfig?.color ?? ASSET_COLORS[idx % ASSET_COLORS.length];
                      const isWin = asset.finalBalance >= asset.initialBalance;
                      return (
                        <div key={asset.symbol}
                          className="bg-[#0F0F1A] border border-[#1F1F2E] rounded-2xl p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                              <span className="font-bold text-sm">{asset.symbol}</span>
                              <span className="text-xs text-gray-600">({(asset.allocation * 100).toFixed(0)}%)</span>
                            </div>
                            <span className={`text-sm font-bold font-mono ${isWin ? 'text-green-400' : 'text-red-400'}`}>
                              {asset.netProfitPct >= 0 ? '+' : ''}{asset.netProfitPct}%
                            </span>
                          </div>

                          {/* Mini curva */}
                          <div className="bg-[#07070D] rounded-lg p-2">
                            <MiniCurve curve={asset.balanceCurve} color={isWin ? '#22c55e' : '#ef4444'} />
                          </div>

                          {/* Métricas */}
                          <div className="grid grid-cols-3 gap-2 text-center text-xs">
                            <div>
                              <p className="text-gray-600">Win Rate</p>
                              <p className={`font-bold font-mono ${asset.winRate >= 50 ? 'text-green-400' : 'text-red-400'}`}>
                                {asset.winRate}%
                              </p>
                            </div>
                            <div>
                              <p className="text-gray-600">P.Factor</p>
                              <p className={`font-bold font-mono ${asset.profitFactor >= 1 ? 'text-green-400' : 'text-red-400'}`}>
                                {asset.profitFactor.toFixed(2)}
                              </p>
                            </div>
                            <div>
                              <p className="text-gray-600">Max DD</p>
                              <p className={`font-bold font-mono ${asset.maxDrawdown > 30 ? 'text-red-400' : 'text-yellow-400'}`}>
                                {asset.maxDrawdown}%
                              </p>
                            </div>
                          </div>

                          <div className="flex justify-between text-xs text-gray-600">
                            <span>
                              ${asset.initialBalance.toFixed(0)} → <span className={isWin ? 'text-green-400' : 'text-red-400'}>
                                ${asset.finalBalance.toFixed(2)}
                              </span>
                            </span>
                            <span>{asset.totalTrades} trades · {asset.wins}W/{asset.losses}L</span>
                          </div>

                          {asset.haltCount > 0 && (
                            <div className="flex items-center gap-1 text-xs text-yellow-400/70">
                              <Zap size={10} />
                              <span>Circuit Breaker disparou {asset.haltCount}×</span>
                            </div>
                          )}
                          {asset.globalRiskCapHits > 0 && (
                            <div className="flex items-center gap-1 text-xs text-blue-400/70">
                              <Shield size={10} />
                              <span>{asset.globalRiskCapHits} trades bloqueados pelo cap global</span>
                            </div>
                          )}
                          {asset.targetHit && (
                            <div className="flex items-center gap-1 text-xs text-green-400/70">
                              <span>🎯 Meta de banca atingida — bot encerrou</span>
                            </div>
                          )}

                          {/* Últimos trades do ativo */}
                          {asset.recentTrades.length > 0 && (
                            <details className="cursor-pointer">
                              <summary className="text-xs text-gray-600 hover:text-gray-400">
                                Ver últimos {asset.recentTrades.length} trades →
                              </summary>
                              <div className="mt-2 space-y-1">
                                {asset.recentTrades.slice().reverse().slice(0, 5).map((t, j) => (
                                  <div key={j} className="flex items-center justify-between text-xs font-mono">
                                    <span className={t.signal === 'LONG' ? 'text-green-400' : 'text-red-400'}>
                                      {t.signal === 'LONG' ? '▲' : '▼'} {t.signal}
                                    </span>
                                    <span className="text-gray-600">{t.exitReason}</span>
                                    <span className={t.profit >= 0 ? 'text-green-400' : 'text-red-400'}>
                                      {t.profit >= 0 ? '+' : ''}${t.profit.toFixed(2)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </details>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* ── Análise de correlação (oculto no Modo Individual) ── */}
                {!isSingleMode && (
                  <div className="bg-[#0F0F1A] border border-[#1F1F2E] rounded-3xl p-6">
                    <h3 className="text-base font-bold mb-4 flex items-center gap-2">
                      <AlertTriangle size={16} className="text-[#FF6B35]" /> Contribuição por Ativo
                    </h3>
                    <div className={`grid grid-cols-1 gap-4 text-center ${result.assets.length <= 3 ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
                      {result.assets.map((asset, idx) => {
                        const contribution = result.initialBalance > 0
                          ? ((asset.finalBalance - asset.initialBalance) / result.initialBalance) * 100
                          : 0;
                        const color = customAssets.find(a => a.symbol === asset.symbol)?.color
                          ?? ASSET_COLORS[idx % ASSET_COLORS.length];
                        return (
                          <div key={asset.symbol} className="bg-[#07070D] rounded-xl p-4">
                            <div className="flex items-center justify-center gap-2 mb-2">
                              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                              <span className="text-xs font-bold">{asset.symbol}</span>
                            </div>
                            <p className="text-xs text-gray-500 mb-1">Contribuição ao portfólio</p>
                            <p className={`text-2xl font-bold font-mono ${contribution >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {contribution >= 0 ? '+' : ''}{contribution.toFixed(1)}%
                            </p>
                            <p className="text-xs text-gray-600 mt-1">
                              {asset.globalRiskCapHits > 0
                                ? `${asset.globalRiskCapHits} trades bloqueados — protegeu o portfólio`
                                : 'Sem bloqueios por risco global'}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                    {result.globalRiskCapHits === 0 && (
                      <p className="text-xs text-gray-600 mt-4 text-center">
                        ℹ️ O cap de risco global de {globalRiskCap}% não foi atingido neste período.
                      </p>
                    )}
                    {result.globalRiskCapHits > 0 && (
                      <p className="text-xs text-gray-500 mt-4 text-center">
                        O Risco Global bloqueou <strong className="text-white">{result.globalRiskCapHits} entradas</strong> que
                        teriam aberto posições simultâneas acima de {globalRiskCap}% da banca.
                      </p>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
