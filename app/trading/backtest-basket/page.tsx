"use client";
import { useState } from 'react';
import {
  Play, TrendingUp, TrendingDown, ChevronLeft, BarChart2,
  Shield, Zap, PieChart, AlertTriangle, Save, Clock, Target,
  Plus, X, User,
} from 'lucide-react';
import Link from 'next/link';
import '@/components/dashboard/dashboard.css';

// ─── Tipos ───────────────────────────────────────────────────

interface AssetConfig {
  symbol: string; allocation: number; color: string; label: string;
}
interface AssetResult {
  symbol: string; allocation: number; initialBalance: number; finalBalance: number;
  netProfitPct: number; wins: number; losses: number; winRate: number;
  profitFactor: number; maxDrawdown: number; totalTrades: number;
  haltCount: number; targetHit: boolean; globalRiskCapHits: number;
  balanceCurve: number[];
  recentTrades: { entryPrice: number; exitPrice: number; signal: string; profit: number; isWin: boolean; balance: number; exitReason: string; }[];
}
interface BasketResult {
  dataSource: string; interval: string; candlesAnalyzed: number;
  initialBalance: number; finalBalance: number; peakBalance: number;
  netProfitPct: number; maxDrawdown: number; totalTrades: number;
  totalWins: number; totalLosses: number; portfolioProfitFactor: number;
  globalRiskCapHits: number; portfolioBalanceCurve: number[];
  assets: AssetResult[];
}

const ASSET_COLORS = [
  '#FF6B35','#4A90E2','#50C878','#9945FF','#C2A633',
  '#E84142','#627EEA','#F7931A','#76B900','#00B4D8',
];

const BASKET_PRESETS: Record<string, { label: string; desc: string; assets: AssetConfig[] }> = {
  conservador:   { label: 'Conservador',   desc: 'BTC 60% + ETH 40% — maduros, baixa volatilidade.',    assets: [{ symbol:'BTCUSDT', allocation:0.60, color:'#F7931A', label:'Bitcoin'   }, { symbol:'ETHUSDT', allocation:0.40, color:'#627EEA', label:'Ethereum'  }] },
  diversificado: { label: 'Diversificado', desc: 'BTC 40% + ETH 30% + SOL 30% — cap alta + mid-cap.',   assets: [{ symbol:'BTCUSDT', allocation:0.40, color:'#F7931A', label:'Bitcoin'   }, { symbol:'ETHUSDT', allocation:0.30, color:'#627EEA', label:'Ethereum'  }, { symbol:'SOLUSDT',  allocation:0.30, color:'#9945FF', label:'Solana'    }] },
  fundo_completo:{ label: 'Fundo Completo',desc: 'BTC 40% + ETH 30% + DOGE 30% — BTC ancora + alpha.',  assets: [{ symbol:'BTCUSDT', allocation:0.40, color:'#F7931A', label:'Bitcoin'   }, { symbol:'ETHUSDT', allocation:0.30, color:'#627EEA', label:'Ethereum'  }, { symbol:'DOGEUSDT', allocation:0.30, color:'#C2A633', label:'Dogecoin'  }] },
  agressivo:     { label: 'Agressivo',     desc: 'SOL 35% + DOGE 35% + AVAX 30% — máximo alpha.',      assets: [{ symbol:'SOLUSDT',  allocation:0.35, color:'#9945FF', label:'Solana'    }, { symbol:'DOGEUSDT', allocation:0.35, color:'#C2A633', label:'Dogecoin'  }, { symbol:'AVAXUSDT', allocation:0.30, color:'#E84142', label:'Avalanche' }] },
  global:        { label: 'Global Portfolio',desc:'SPY 40% + QQQ 35% + NVDA 25% — use intervalo 1d.',  assets: [{ symbol:'SPY',  allocation:0.40, color:'#4A90E2', label:'S&P 500'   }, { symbol:'QQQ',  allocation:0.35, color:'#50C878', label:'Nasdaq 100'}, { symbol:'NVDA', allocation:0.25, color:'#76B900', label:'NVIDIA'   }] },
  nyse_blue_chips:{ label:'NYSE Blue Chips',desc:'V+JPM+WMT+KO+JNJ — top 5 defensivas. Intervalo 1d.',  assets: [{ symbol:'V',   allocation:0.20, color:'#1A1F71', label:'Visa'         }, { symbol:'JPM', allocation:0.20, color:'#005B9A', label:'JPMorgan'     }, { symbol:'WMT', allocation:0.20, color:'#007DC6', label:'Walmart'     }, { symbol:'KO',  allocation:0.20, color:'#FF0000', label:'Coca-Cola'   }, { symbol:'JNJ', allocation:0.20, color:'#CC0000', label:'J&J'         }] },
};

const INTERVALS = ['15m', '1h', '4h', '1d'];

function MiniCurve({ curve, color }: { curve: number[]; color: string }) {
  if (!curve || curve.length < 2) return null;
  const min = Math.min(...curve), max = Math.max(...curve);
  const range = max - min || 1;
  const w = 200, h = 50;
  const pts = curve.map((v, i) => `${(i / (curve.length - 1)) * w},${h - ((v - min) / range) * h}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 48 }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}

function PortfolioCurve({ curve, initial }: { curve: number[]; initial: number }) {
  if (!curve || curve.length < 2) return null;
  const min = Math.min(...curve), max = Math.max(...curve);
  const range = max - min || 1;
  const w = 600, h = 120;
  const pts = curve.map((v, i) => `${(i / (curve.length - 1)) * w},${h - ((v - min) / range) * (h - 4)}`).join(' ');
  const isProfit = curve[curve.length - 1] >= initial;
  const strokeColor = isProfit ? 'var(--green)' : 'var(--red)';
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 120 }}>
      <defs>
        <linearGradient id="pgGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={isProfit ? '#22c55e' : '#ef4444'} stopOpacity="0.20" />
          <stop offset="100%" stopColor={isProfit ? '#22c55e' : '#ef4444'} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${h} ${pts} ${w},${h}`} fill="url(#pgGrad)" />
      <polyline points={pts} fill="none" stroke={strokeColor} strokeWidth="2" />
    </svg>
  );
}

// ─── Toggle helper ────────────────────────────────────────────

function Toggle({ val, onChange, label, desc }: { val: boolean; onChange: () => void; label: string; desc?: string }) {
  return (
    <div className={`dash-feature-flag${val ? ' active' : ''}`} onClick={onChange}>
      <div className={`dash-feature-checkbox${val ? ' checked' : ''}`}>
        {val && <span style={{ color: '#000', fontSize: 9, fontWeight: 700, lineHeight: 1 }}>✓</span>}
      </div>
      <div>
        <div className="dash-feature-flag-label">{label}</div>
        {desc && <div className="dash-feature-flag-desc">{desc}</div>}
      </div>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────

export default function BasketBacktestPage() {
  const [customAssets, setCustomAssets] = useState<AssetConfig[]>(BASKET_PRESETS.fundo_completo.assets);
  const [tickerInput, setTickerInput]   = useState('');
  const [lastPreset,  setLastPreset]    = useState('fundo_completo');

  const loadPreset = (key: string) => { setCustomAssets([...BASKET_PRESETS[key].assets]); setLastPreset(key); };

  const CRYPTO_BASES = new Set(['BTC','ETH','BNB','SOL','DOGE','ADA','XRP','DOT','LINK','AVAX','MATIC','UNI','LTC','BCH','ATOM','ALGO','FIL','TRX','SHIB','PEPE','WIF','BONK','SUI','APT','ARB','OP','INJ','SEI','TON','NOT','JUP','TIA','BLUR','IMX','SAND','MANA','AXS','FTM','NEAR','HBAR','VET','EGLD','THETA','AAVE','MKR','SNX']);

  const normalizeSymbol = (raw: string): string => {
    const s = raw.toUpperCase().trim();
    if (!s) return s;
    if (CRYPTO_BASES.has(s) && !/USDT$|BUSD$|BTC$|ETH$|BNB$/.test(s)) return `${s}USDT`;
    if (s.includes('.') || /USDT$|BUSD$/.test(s)) return s;
    if (/^[A-Z]{4}\d{1,2}$/.test(s)) return `${s}.SA`;
    return s;
  };

  const addTicker = (raw: string) => {
    const symbol = normalizeSymbol(raw);
    if (!symbol || customAssets.some(a => a.symbol === symbol)) return;
    const color = ASSET_COLORS[customAssets.length % ASSET_COLORS.length];
    setCustomAssets(prev => [...prev, { symbol, allocation: 0, color, label: symbol }]);
    setTickerInput('');
  };

  const removeTicker = (symbol: string) => setCustomAssets(prev => prev.filter(a => a.symbol !== symbol));

  const assetsWithAlloc: AssetConfig[] = customAssets.map(a => ({
    ...a, allocation: customAssets.length > 0 ? 1 / customAssets.length : 1,
  }));

  const isSingleMode = customAssets.length === 1;

  const [initialBalance,    setInitialBalance]    = useState(100);
  const [globalRiskCap,     setGlobalRiskCap]     = useState(15);
  const [interval,          setInterval]          = useState('4h');
  const [limit,             setLimit]             = useState(1000);
  const [riskPerTrade,      setRiskPerTrade]      = useState(2);
  const [minRiskReward,     setMinRiskReward]     = useState(2);
  const [atrMultiplier,     setAtrMultiplier]     = useState(2.0);
  const [circuitBreaker,    setCircuitBreaker]    = useState(15);
  const [trendFilter,       setTrendFilter]       = useState(true);
  const [trailingStop,      setTrailingStop]      = useState(true);
  const [scaledExits,       setScaledExits]       = useState(true);
  const [progressiveRisk,   setProgressiveRisk]   = useState(true);
  const [useAdxFilter,      setUseAdxFilter]      = useState(true);
  const [adxMinStrength,    setAdxMinStrength]    = useState(20);
  const [slippage,          setSlippage]          = useState(0.10);
  const [balanceTarget,     setBalanceTarget]     = useState(0);
  const [useTimeExit,       setUseTimeExit]       = useState(false);
  const [maxCandlesInTrade, setMaxCandlesInTrade] = useState(48);
  const [marketMode,        setMarketMode]        = useState<'crypto' | 'stock'>('crypto');
  const [saveStatus,        setSaveStatus]        = useState<'idle' | 'saving' | 'ok' | 'err'>('idle');
  const [result,            setResult]            = useState<BasketResult | null>(null);
  const [loading,           setLoading]           = useState(false);
  const [error,             setError]             = useState('');

  const runBacktest = async () => {
    if (customAssets.length === 0) { setError('Adicione pelo menos 1 ativo antes de rodar.'); return; }
    setLoading(true); setError(''); setResult(null);
    try {
      const payload = {
        assets: assetsWithAlloc.map(a => ({ symbol: a.symbol, allocation: a.allocation })),
        initialBalance, globalRiskCap, riskPerTrade: riskPerTrade / 100,
        stopLossPercent: 0.015, atrMultiplier, useATRStop: true, minRiskReward,
        rsiLow: 30, rsiHigh: 70, smaPeriod: 200,
        trendFilter, trailingStop, trailRUnits: 2.0,
        scaledExits, fixedRiskAmount: true, progressiveRisk, circuitBreaker,
        useAdxFilter, adxMinStrength, slippage: slippage / 100,
        maxCandlesInTrade: useTimeExit ? maxCandlesInTrade : 0,
        balanceTarget, interval, limit: Math.min(limit, 1000),
      };
      const res  = await fetch('/trading/api/backtest-basket', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const text = await res.text();
      let data: Record<string, unknown>;
      try { data = JSON.parse(text); } catch { throw new Error(`Servidor retornou ${res.status}: ${text.slice(0, 200)}`); }
      if (!res.ok || data.error) throw new Error(String(data.error ?? `HTTP ${res.status}`));
      setResult(data as unknown as BasketResult);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido');
    } finally { setLoading(false); }
  };

  const saveDNA = async () => {
    setSaveStatus('saving');
    try {
      const config = {
        rsiLow: 30, rsiHigh: 70, smaPeriod: 200, adxPeriod: 14,
        trendFilter, useAdxFilter, adxMinStrength,
        stopLossPercent: 0.015, atrMultiplier, useATRStop: true, minRiskReward,
        riskPerTrade: riskPerTrade / 100, fixedRiskAmount: true,
        trailingStop, trailRUnits: 2.0, scaledExits, partialExit: false,
        progressiveRisk, circuitBreaker,
        maxCandlesInTrade: useTimeExit ? maxCandlesInTrade : 0,
        balanceTarget, slippage: slippage / 100,
      };
      const name = `${BASKET_PRESETS[lastPreset]?.label ?? 'Custom'} — ${new Date().toLocaleDateString('pt-BR')}`;
      const res  = await fetch('/trading/api/save-config', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, config, assets: customAssets.map(a => a.symbol),
          backtestNetPct: result?.netProfitPct,
          backtestWinRate: result ? (result.totalWins / (result.totalTrades || 1)) * 100 : undefined,
          backtestMaxDD: result?.maxDrawdown }),
      });
      if (!res.ok) throw new Error('Falha ao salvar');
      setSaveStatus('ok');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch { setSaveStatus('err'); setTimeout(() => setSaveStatus('idle'), 3000); }
  };

  const candleHint = () => {
    if (interval === '4h' && limit >= 1000) return `≈ ${Math.round(limit / 6)} dias`;
    if (interval === '1d' && limit >= 500)  return `≈ ${Math.round(limit / 250)} anos`;
    if (interval === '1h')                  return `≈ ${Math.round(limit / 24)} dias`;
    return '';
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
            <PieChart size={13} /> Basket Backtest
          </div>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--green)', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', padding: '2px 8px', borderRadius: 2 }}>
            ● DADOS REAIS — Binance + Yahoo Finance
          </span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--blue)', background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)', padding: '2px 8px', borderRadius: 2 }}>
            Multi-Ativo Sincronizado
          </span>
        </div>
        <div className="dash-page-actions">
          <Link href="/trading/backtest" style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--muted)' }}>
            ← Single-ativo
          </Link>
        </div>
      </div>

      {/* ─── LAYOUT ─── */}
      <div className="dash-bt-layout">

        {/* ─── LEFT: configuração ─── */}
        <div className="dash-bt-params">

          {/* Presets */}
          <div className="dash-bt-section">
            <div className="dash-bt-section-title"><BarChart2 size={11} /> Presets Rápidos</div>
            {Object.entries(BASKET_PRESETS).map(([key, p]) => {
              const isActive = lastPreset === key && customAssets.length === BASKET_PRESETS[key].assets.length;
              return (
                <button key={key} onClick={() => loadPreset(key)} className={`dash-profile-btn${isActive ? ' active' : ''}`}>
                  <div className="dash-profile-btn-label">{p.label}</div>
                  <div className="dash-profile-btn-desc">{p.desc}</div>
                </button>
              );
            })}
          </div>

          {/* Ativos selecionados */}
          <div className="dash-bt-section">
            <div className="dash-bt-section-title">
              {isSingleMode
                ? <><User size={10} style={{ color: 'var(--blue)' }} /> Modo Individual</>
                : <><PieChart size={10} /> {customAssets.length} Ativos Selecionados</>}
              <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--muted)', fontWeight: 400 }}>
                {customAssets.length > 0 ? `${Math.round(100 / customAssets.length)}% cada` : '—'}
              </span>
            </div>

            {customAssets.length === 0 ? (
              <p style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--muted)', textAlign: 'center', padding: '8px 0' }}>
                Carregue um preset ou adicione tickers abaixo
              </p>
            ) : (
              <>
                <div className="dash-chip-wrap" style={{ marginBottom: 8 }}>
                  {customAssets.map(a => (
                    <div key={a.symbol} className="dash-chip" style={{ background: a.color + '18', border: `1px solid ${a.color}40`, color: a.color }}>
                      <div className="dash-chip-dot" style={{ background: a.color }} />
                      {a.symbol}
                      <button className="dash-chip-remove" onClick={() => removeTicker(a.symbol)}>
                        <X size={8} />
                      </button>
                    </div>
                  ))}
                </div>
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {assetsWithAlloc.map(a => (
                    <div key={a.symbol} className="dash-alloc-row">
                      <div className="dash-alloc-dot" style={{ background: a.color }} />
                      <span className="dash-alloc-name">{a.label !== a.symbol ? a.label : a.symbol}</span>
                      <span className="dash-alloc-pct">{(a.allocation * 100).toFixed(0)}%</span>
                      <span className="dash-alloc-usd">${(initialBalance * a.allocation).toFixed(0)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Add ticker */}
            <div style={{ marginTop: 8 }}>
              <div className="dash-param-label" style={{ marginBottom: 4 }}>Adicionar Ativo Livre</div>
              <div className="dash-ticker-row">
                <input
                  type="text" value={tickerInput}
                  onChange={e => setTickerInput(e.target.value.toUpperCase())}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTicker(tickerInput); } }}
                  placeholder="BTCUSDT, DOGE, NVDA, PETR4..."
                  className="dash-param-input"
                  style={{ flex: 1 }}
                />
                <button className="dash-ticker-add-btn" onClick={() => addTicker(tickerInput)}>
                  <Plus size={13} />
                </button>
              </div>
              <p className="dash-param-note" style={{ marginTop: 4 }}>
                Auto: DOGE→DOGEUSDT · PETR4→PETR4.SA · NYSE: SPY, NVDA
              </p>
            </div>
          </div>

          {/* Parâmetros globais */}
          <div className="dash-bt-section">
            <div className="dash-bt-section-title"><BarChart2 size={11} /> Parâmetros Globais</div>
            <div className="dash-param-grid">
              <div>
                <label className="dash-param-label">Banca Total ($)</label>
                <input type="number" value={initialBalance} onChange={e => setInitialBalance(+e.target.value)} className="dash-param-input" />
              </div>
              <div>
                <label className="dash-param-label">Intervalo</label>
                <select value={interval} onChange={e => setInterval(e.target.value)} className="dash-param-select">
                  {INTERVALS.map(i => <option key={i} value={i}>{i}</option>)}
                </select>
              </div>
              <div>
                <label className="dash-param-label">Risco/Op (%)</label>
                <input type="number" step="0.5" value={riskPerTrade} onChange={e => setRiskPerTrade(+e.target.value)} className="dash-param-input" />
              </div>
              <div>
                <label className="dash-param-label">Min R:R</label>
                <input type="number" step="0.5" value={minRiskReward} onChange={e => setMinRiskReward(+e.target.value)} className="dash-param-input" />
              </div>
              <div>
                <label className="dash-param-label">ATR ×</label>
                <input type="number" step="0.5" min="1" max="5" value={atrMultiplier} onChange={e => setAtrMultiplier(+e.target.value)} className="dash-param-input" />
              </div>
              <div>
                <label className="dash-param-label">Circuit Breaker (%)</label>
                <input type="number" step="5" min="0" max="50" value={circuitBreaker} onChange={e => setCircuitBreaker(+e.target.value)} className="dash-param-input" />
              </div>
            </div>
            <div style={{ marginTop: 8 }}>
              <label className="dash-param-label">Candles históricos (máx 2000)</label>
              <input type="number" step="100" min="100" max="2000" value={limit} onChange={e => setLimit(Math.min(2000, Math.max(100, +e.target.value)))} className="dash-param-input" />
              {candleHint() && <p className="dash-param-note" style={{ marginTop: 3 }}>{candleHint()} de histórico</p>}
            </div>
          </div>

          {/* Cap de Risco Global */}
          <div className="dash-bt-section">
            <div className="dash-warn-box">
              <div className="dash-warn-box-title"><Shield size={10} /> Cap de Risco Global (%)</div>
              <input type="number" step="5" min="5" max="50" value={globalRiskCap} onChange={e => setGlobalRiskCap(+e.target.value)} className="dash-param-input" />
              <p className="dash-warn-box-note">
                Se risco simultâneo total ≥ {globalRiskCap}% da banca, nenhum novo trade é aberto.
                Evita {customAssets.length} stops ao mesmo tempo = -{globalRiskCap}%+ em um candle.
              </p>
            </div>
          </div>

          {/* Estratégia */}
          <div className="dash-bt-section">
            <div className="dash-bt-section-title">Estratégia</div>
            <Toggle val={trendFilter}     onChange={() => setTrendFilter(!trendFilter)}         label="Filtro EMA200"    desc="Opera só a favor da tendência de longo prazo" />
            <Toggle val={trailingStop}    onChange={() => setTrailingStop(!trailingStop)}       label="Trailing Stop 2R" desc="Stop deslizante protege lucro após 2R" />
            <Toggle val={scaledExits}     onChange={() => setScaledExits(!scaledExits)}         label="Saída 3 Camadas"  desc="TP1/TP2/TP3 para saída escalonada" />
            <Toggle val={progressiveRisk} onChange={() => setProgressiveRisk(!progressiveRisk)} label="Risco Progressivo" desc="Aumenta tamanho após sequência de wins" />
          </div>

          {/* Filtro ADX */}
          <div className="dash-bt-section">
            <div className="dash-bt-section-title">Filtro de Qualidade</div>
            <Toggle val={useAdxFilter} onChange={() => setUseAdxFilter(!useAdxFilter)} label="Filtro ADX" desc="Bloquear trades em mercado lateral" />
            {useAdxFilter && (
              <div style={{ marginTop: 8 }}>
                <label className="dash-param-label">Força Mínima ADX</label>
                <input type="number" step="5" min="10" max="50" value={adxMinStrength} onChange={e => setAdxMinStrength(+e.target.value)} className="dash-param-input" />
                <p className="dash-param-note" style={{ marginTop: 3 }}>ADX &lt; {adxMinStrength} → lateral → sem trades</p>
              </div>
            )}
          </div>

          {/* Custo de execução */}
          <div className="dash-bt-section">
            <div className="dash-danger-box">
              <div className="dash-danger-box-title">Custo Real de Execução</div>
              <label className="dash-param-label">Slippage % (taxas + spread)</label>
              <input type="number" step="0.05" min="0" max="2" value={slippage} onChange={e => setSlippage(+e.target.value)} className="dash-param-input" />
              <p className="dash-param-note" style={{ marginTop: 4 }}>Cripto: ~0.1% · Ações US: ~0.05% · B3: ~0.2%</p>
            </div>
          </div>

          {/* Freios avançados */}
          <div className="dash-bt-section">
            <div className="dash-bt-section-title">Freios Avançados</div>
            <Toggle val={useTimeExit} onChange={() => setUseTimeExit(!useTimeExit)} label="Saída por Tempo" desc="Fecha trade lateral após N candles" />
            {useTimeExit && (
              <div style={{ marginTop: 8 }}>
                <label className="dash-param-label">Máx. Candles por Trade</label>
                <input type="number" step="1" min="1" max="500" value={maxCandlesInTrade} onChange={e => setMaxCandlesInTrade(+e.target.value)} className="dash-param-input" />
              </div>
            )}
            <div style={{ marginTop: 8 }}>
              <label className="dash-param-label">Meta de Banca ($) — 0 = sem meta</label>
              <input type="number" step="100" min="0" value={balanceTarget} onChange={e => setBalanceTarget(+e.target.value)} className="dash-param-input" />
              {balanceTarget > 0 && initialBalance > 0 && (
                <p className="dash-param-note" style={{ marginTop: 3, color: 'var(--green)' }}>
                  Bot para ao atingir ${balanceTarget.toLocaleString()} · {(balanceTarget / initialBalance).toFixed(1)}× a banca
                </p>
              )}
            </div>
          </div>

          {/* Modo de mercado */}
          <div className="dash-bt-section">
            <div className="dash-bt-section-title">Modo de Mercado</div>
            <div className="dash-mode-grid">
              {([
                { id: 'crypto', label: 'Cripto 24/7',   desc: 'Binance · 0.1% taxa' },
                { id: 'stock',  label: 'Bolsa (Sessão)', desc: 'Yahoo · 0.2% taxa'   },
              ] as const).map(m => (
                <button key={m.id} className={`dash-mode-btn${marketMode === m.id ? ' active' : ''}`}
                  onClick={() => { setMarketMode(m.id); if (m.id === 'stock') { setSlippage(0.20); setInterval('1d'); } else { setSlippage(0.10); } }}>
                  <span className="dash-mode-btn-label">{m.label}</span>
                  <span className="dash-mode-btn-desc">{m.desc}</span>
                </button>
              ))}
            </div>
            {marketMode === 'stock' && (
              <p className="dash-param-note" style={{ marginTop: 6 }}>
                Use intervalo <strong style={{ color: 'var(--muted-hi)' }}>1d</strong> para ações — evita distorção por gaps.
              </p>
            )}
          </div>

          {/* Run + Save */}
          <div className="dash-bt-section">
            <button onClick={runBacktest} disabled={loading || customAssets.length === 0} className="dash-run-btn" style={{ marginBottom: 8 }}>
              {loading
                ? <>⚙️ Simulando {customAssets.length} ativo{customAssets.length > 1 ? 's' : ''}...</>
                : isSingleMode
                ? <><User size={13} /> Backtest Individual — {customAssets[0]?.symbol}</>
                : <><Play size={13} fill="currentColor" /> Basket ({customAssets.length} ativos)</>}
            </button>
            {error && <div className="dash-error-banner" style={{ marginBottom: 8 }}>{error}</div>}
            <button onClick={saveDNA} disabled={saveStatus === 'saving'} className={`dash-save-btn${saveStatus !== 'idle' ? ` ${saveStatus}` : ''}`}>
              <Save size={11} />
              {saveStatus === 'saving' ? 'Salvando...' : saveStatus === 'ok' ? '✓ DNA salvo no Supabase' : saveStatus === 'err' ? '✗ Erro ao salvar' : 'Salvar DNA no Supabase'}
            </button>
            <p className="dash-param-note" style={{ textAlign: 'center', marginTop: 4 }}>
              Salva em <code style={{ color: 'var(--muted-hi)' }}>bot_configs</code> para o bot real herdar
            </p>
          </div>

        </div>

        {/* ─── RIGHT: resultados ─── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {!result && !loading && (
            <div className="dash-result-empty">
              <PieChart size={36} style={{ opacity: 0.2 }} />
              <p>Escolha uma cesta de ativos e clique em</p>
              <p style={{ color: 'var(--amber)' }}>Basket Backtest</p>
              <p style={{ opacity: 0.5, marginTop: 4 }}>
                Todos os ativos são simulados ao mesmo tempo, candle a candle — correlação real de mercado.
              </p>
            </div>
          )}

          {result && (
            <>
              {/* ── Portfolio consolidado ── */}
              <div className="dash-result-card">
                <div className="dash-result-card-header">
                  <div className="dash-result-card-title"><TrendingUp size={12} /> Portfólio Consolidado</div>
                  <span className="dash-portfolio-meta">{result.interval} · {result.candlesAnalyzed} candles · {result.totalTrades} trades</span>
                </div>
                <div className="dash-result-card-body">
                  <div className="dash-portfolio-4col" style={{ marginBottom: 12 }}>
                    <div className="dash-portfolio-kpi">
                      <div className="dash-portfolio-kpi-lbl">Banca Inicial</div>
                      <div className="dash-portfolio-kpi-val">${result.initialBalance.toFixed(2)}</div>
                    </div>
                    <div className="dash-portfolio-kpi">
                      <div className="dash-portfolio-kpi-lbl">Pico</div>
                      <div className="dash-portfolio-kpi-val" style={{ color: '#A78BFA' }}>${result.peakBalance.toFixed(2)}</div>
                    </div>
                    <div className="dash-portfolio-kpi">
                      <div className="dash-portfolio-kpi-lbl">Banca Final</div>
                      <div className="dash-portfolio-kpi-val" style={{ color: result.finalBalance >= result.initialBalance ? 'var(--green)' : 'var(--red)' }}>
                        ${result.finalBalance.toFixed(2)}
                      </div>
                    </div>
                    <div className="dash-portfolio-kpi">
                      <div className="dash-portfolio-kpi-lbl">Lucro Total</div>
                      <div className="dash-portfolio-kpi-val" style={{ color: result.netProfitPct >= 0 ? 'var(--green)' : 'var(--red)' }}>
                        {result.netProfitPct >= 0 ? '+' : ''}{result.netProfitPct}%
                      </div>
                    </div>
                  </div>

                  <div className="dash-equity-wrap" style={{ marginBottom: 12 }}>
                    <div className="dash-equity-label">Curva de Equity — Portfólio Total</div>
                    <PortfolioCurve curve={result.portfolioBalanceCurve} initial={result.initialBalance} />
                  </div>

                  <div className="dash-bt-3col">
                    <div className="dash-bt-stat">
                      <div className="dash-bt-stat-lbl">Profit Factor</div>
                      <div className="dash-bt-stat-val" style={{ color: result.portfolioProfitFactor >= 1 ? 'var(--green)' : 'var(--red)' }}>
                        {result.portfolioProfitFactor.toFixed(2)}
                      </div>
                    </div>
                    <div className="dash-bt-stat">
                      <div className="dash-bt-stat-lbl">Max Drawdown</div>
                      <div className="dash-bt-stat-val" style={{ color: result.maxDrawdown > 30 ? 'var(--red)' : '#FACC15' }}>
                        {result.maxDrawdown}%
                      </div>
                    </div>
                    <div className="dash-bt-stat">
                      <div className="dash-bt-stat-lbl">Win Rate Geral</div>
                      <div className="dash-bt-stat-val" style={{ color: result.totalTrades > 0 && (result.totalWins / result.totalTrades) * 100 >= 50 ? 'var(--green)' : 'var(--red)' }}>
                        {result.totalTrades > 0 ? ((result.totalWins / result.totalTrades) * 100).toFixed(1) : 0}%
                      </div>
                    </div>
                  </div>

                  {result.globalRiskCapHits > 0 && (
                    <div className="dash-warn-box" style={{ marginTop: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--amber)' }}>
                        <Shield size={10} />
                        <span>Risco Global bloqueou <strong>{result.globalRiskCapHits} trades</strong> — protegeu a banca de stops simultâneos.</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* ── Breakdown por ativo ── */}
              <div className="dash-result-card">
                <div className="dash-result-card-header">
                  <div className="dash-result-card-title"><PieChart size={12} /> Performance por Ativo</div>
                </div>
                <div className="dash-result-card-body">
                  <div className="dash-asset-grid">
                    {result.assets.map((asset, idx) => {
                      const color   = customAssets.find(a => a.symbol === asset.symbol)?.color ?? ASSET_COLORS[idx % ASSET_COLORS.length];
                      const isWin   = asset.finalBalance >= asset.initialBalance;
                      const pnlColor = isWin ? 'var(--green)' : 'var(--red)';
                      return (
                        <div key={asset.symbol} className="dash-asset-card">
                          <div className="dash-asset-card-head">
                            <div className="dash-asset-card-id">
                              <div className="dash-asset-card-dot" style={{ background: color }} />
                              <span className="dash-asset-card-sym">{asset.symbol}</span>
                              <span className="dash-asset-card-alloc">({(asset.allocation * 100).toFixed(0)}%)</span>
                            </div>
                            <span className="dash-asset-card-pnl" style={{ color: pnlColor }}>
                              {asset.netProfitPct >= 0 ? '+' : ''}{asset.netProfitPct}%
                            </span>
                          </div>

                          <div className="dash-asset-mini-curve">
                            <MiniCurve curve={asset.balanceCurve} color={isWin ? 'var(--green)' : 'var(--red)'} />
                          </div>

                          <div className="dash-asset-3col">
                            <div>
                              <div className="dash-asset-3col-lbl">Win Rate</div>
                              <div className="dash-asset-3col-val" style={{ color: asset.winRate >= 50 ? 'var(--green)' : 'var(--red)' }}>{asset.winRate}%</div>
                            </div>
                            <div>
                              <div className="dash-asset-3col-lbl">P.Factor</div>
                              <div className="dash-asset-3col-val" style={{ color: asset.profitFactor >= 1 ? 'var(--green)' : 'var(--red)' }}>{asset.profitFactor.toFixed(2)}</div>
                            </div>
                            <div>
                              <div className="dash-asset-3col-lbl">Max DD</div>
                              <div className="dash-asset-3col-val" style={{ color: asset.maxDrawdown > 30 ? 'var(--red)' : '#FACC15' }}>{asset.maxDrawdown}%</div>
                            </div>
                          </div>

                          <div className="dash-asset-footer2">
                            <span>${asset.initialBalance.toFixed(0)} → <span style={{ color: pnlColor }}>${asset.finalBalance.toFixed(2)}</span></span>
                            <span>{asset.totalTrades} trades · {asset.wins}W/{asset.losses}L</span>
                          </div>

                          {asset.haltCount > 0 && <div className="dash-asset-alert"><Zap size={9} /> Circuit Breaker disparou {asset.haltCount}×</div>}
                          {asset.globalRiskCapHits > 0 && <div className="dash-asset-alert blue"><Shield size={9} /> {asset.globalRiskCapHits} trades bloqueados pelo cap global</div>}
                          {asset.targetHit && <div className="dash-asset-alert green">🎯 Meta de banca atingida — bot encerrou</div>}

                          {asset.recentTrades.length > 0 && (
                            <details className="dash-trades-acc">
                              <summary>Ver últimos {asset.recentTrades.length} trades →</summary>
                              <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
                                {asset.recentTrades.slice().reverse().slice(0, 5).map((t, j) => (
                                  <div key={j} className="dash-trades-acc-row">
                                    <span style={{ color: t.signal === 'LONG' ? 'var(--green)' : 'var(--red)' }}>
                                      {t.signal === 'LONG' ? '▲' : '▼'} {t.signal}
                                    </span>
                                    <span style={{ color: 'var(--muted)' }}>{t.exitReason}</span>
                                    <span style={{ color: t.profit >= 0 ? 'var(--green)' : 'var(--red)' }}>
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
              </div>

              {/* ── Contribuição (só multi-ativo) ── */}
              {!isSingleMode && (
                <div className="dash-result-card">
                  <div className="dash-result-card-header">
                    <div className="dash-result-card-title"><AlertTriangle size={12} /> Contribuição por Ativo</div>
                  </div>
                  <div className="dash-result-card-body">
                    <div className="dash-contrib-grid">
                      {result.assets.map((asset, idx) => {
                        const contribution = result.initialBalance > 0
                          ? ((asset.finalBalance - asset.initialBalance) / result.initialBalance) * 100 : 0;
                        const color = customAssets.find(a => a.symbol === asset.symbol)?.color ?? ASSET_COLORS[idx % ASSET_COLORS.length];
                        return (
                          <div key={asset.symbol} className="dash-contrib-card">
                            <div className="dash-contrib-id">
                              <div className="dash-contrib-dot" style={{ background: color }} />
                              <span className="dash-contrib-sym">{asset.symbol}</span>
                            </div>
                            <div className="dash-contrib-lbl">Contribuição ao portfólio</div>
                            <div className="dash-contrib-val" style={{ color: contribution >= 0 ? 'var(--green)' : 'var(--red)' }}>
                              {contribution >= 0 ? '+' : ''}{contribution.toFixed(1)}%
                            </div>
                            <div className="dash-contrib-note">
                              {asset.globalRiskCapHits > 0 ? `${asset.globalRiskCapHits} trades bloqueados` : 'Sem bloqueios globais'}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <p className="dash-param-note" style={{ marginTop: 10, textAlign: 'center' }}>
                      {result.globalRiskCapHits === 0
                        ? `Cap de risco de ${globalRiskCap}% não foi atingido neste período.`
                        : `Risco Global bloqueou ${result.globalRiskCapHits} entradas acima de ${globalRiskCap}% da banca.`}
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
