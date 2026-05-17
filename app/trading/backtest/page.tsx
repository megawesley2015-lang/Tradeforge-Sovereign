"use client";
import { useState } from 'react';
import { Play, TrendingUp, TrendingDown, Activity, BarChart2, ChevronLeft, Zap, Shield, Target } from 'lucide-react';
import Link from 'next/link';
import '@/components/dashboard/dashboard.css';

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
  config?: Record<string, boolean | number | string | null | undefined>;
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
  'BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT',
  'XRPUSDT','ADAUSDT','DOGEUSDT','AVAXUSDT',
  'LINKUSDT','MATICUSDT','DOTUSDT',
];
const INTERVALS = ['15m','1h','4h','1d'];

const ASSET_PROFILES = {
  conservador: {
    label: 'Conservador — BTC/ETH',
    description: 'Ativos maduros. ATR x1.5, R:R 2, risco 2%.',
    params: {
      symbol: 'BTCUSDT', useATRStop: true, atrMultiplier: 1.5,
      minRiskReward: 2, riskPerTrade: 2, stopLossPercent: 1.5,
      rsiLow: 30, rsiHigh: 70, trendFilter: true,
      trailingStop: true, trailRUnits: 2, scaledExits: true,
      progressiveRisk: true, fixedRiskAmount: true, circuitBreaker: 15,
    },
  },
  moderado: {
    label: 'Moderado — SOL/BNB/LINK',
    description: 'Altcoins mid-cap. ATR x2, R:R 3, risco 3%.',
    params: {
      symbol: 'SOLUSDT', useATRStop: true, atrMultiplier: 2.0,
      minRiskReward: 3, riskPerTrade: 3, stopLossPercent: 2.0,
      rsiLow: 35, rsiHigh: 72, trendFilter: true,
      trailingStop: true, trailRUnits: 2.5, scaledExits: true,
      progressiveRisk: true, fixedRiskAmount: true, circuitBreaker: 20,
    },
  },
  agressivo: {
    label: 'Agressivo — DOGE/SOL',
    description: 'Alta volatilidade. ATR x3, R:R 5, risco 5%.',
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
  symbol: 'BTCUSDT', initialBalance: 50, riskPerTrade: 2,
  stopLossPercent: 1.5, atrMultiplier: 2.0, useATRStop: true,
  minRiskReward: 2, rsiLow: 30, rsiHigh: 70, smaPeriod: 200,
  trendFilter: true, trailingStop: true, trailRUnits: 2.0,
  partialExit: false, scaledExits: true, fixedRiskAmount: true,
  progressiveRisk: true, circuitBreaker: 15, maxCandlesInTrade: 0,
  balanceTarget: 0, interval: '4h', limit: 1000,
};

export default function BacktestPage() {
  const [params, setParams]           = useState<Params>(DEFAULT_PARAMS);
  const [result, setResult]           = useState<BacktestResult | null>(null);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');
  const [activeProfile, setActiveProfile] = useState<string | null>(null);

  const applyProfile = (key: keyof typeof ASSET_PROFILES) => {
    setParams(prev => ({ ...prev, ...ASSET_PROFILES[key].params }));
    setActiveProfile(key);
  };

  const runBacktest = async () => {
    setLoading(true); setError(''); setResult(null);
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

  // Equity curve SVG
  const renderCurve = (curve: number[]) => {
    if (!curve || curve.length < 2) return null;
    const min = Math.min(...curve);
    const max = Math.max(...curve);
    const range = max - min || 1;
    const w = 400, h = 80;
    const points = curve.map((v, i) => {
      const x = (i / (curve.length - 1)) * w;
      const y = h - ((v - min) / range) * h;
      return `${x},${y}`;
    }).join(' ');
    const isProfit = curve[curve.length - 1] >= curve[0];
    const color = isProfit ? '#22C55E' : '#EF4444';
    return (
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 80 }}>
        <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" />
      </svg>
    );
  };

  const renderMCBar = (label: string, value: number, initial: number, cls: string) => {
    const pct = Math.min(100, Math.max(0, (value / (initial * 10)) * 100));
    return (
      <div className="dash-mc-bar-row">
        <span className="dash-mc-bar-label">{label}</span>
        <div className="dash-mc-bar-track">
          <div className={`dash-mc-bar-fill ${cls}`} style={{ width: `${pct}%` }} />
        </div>
        <span className="dash-mc-bar-val">${value.toFixed(2)}</span>
      </div>
    );
  };

  const FEATURE_FLAGS = [
    {
      key: 'trendFilter' as const,
      label: 'Filtro de Tendência (EMA200)',
      on:  'Só LONG acima da EMA200, só SHORT abaixo.',
      off: 'Sem filtro — permite trades contra tendência.',
    },
    {
      key: 'trailingStop' as const,
      label: 'Trailing Stop por R-units',
      on:  `Trail ${params.trailRUnits}R atrás do pico — trava lucro.`,
      off: 'Stop fixo no nível inicial.',
    },
    {
      key: 'scaledExits' as const,
      label: 'Saída 3 Camadas (30/30/40)',
      on:  '30% em TP1 · 30% em TP2 · 40% trailing.',
      off: 'Saída única 100% no alvo final.',
    },
    {
      key: 'fixedRiskAmount' as const,
      label: 'Risco Fixo em $ (capital inicial)',
      on:  'Arrisca X% do capital INICIAL.',
      off: 'Arrisca X% do saldo ATUAL (compounding).',
    },
    {
      key: 'progressiveRisk' as const,
      label: 'Risco Progressivo',
      on:  '2x banca=50% risco · 5x=25% · 10x=10%.',
      off: 'Risco fixo independente do crescimento.',
    },
  ] as const;

  return (
    <div className="dash-root">

      {/* ─── PAGE HEADER ─── */}
      <div className="dash-page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Link href="/trading/dashboard" className="dash-breadcrumb">
            <ChevronLeft size={12} /> Dashboard
          </Link>
          <div className="dash-page-title">
            <BarChart2 size={13} /> Backtester
          </div>
          <span className="dash-panel-badge live" style={{ fontSize: 8 }}>
            Dados Reais — Binance API
          </span>
        </div>
      </div>

      {/* ─── BODY ─── */}
      <div className="dash-bt-layout">

        {/* ── LEFT: PARAMS ── */}
        <div className="dash-bt-params">

          {/* Perfis */}
          <div className="dash-bt-section">
            <div className="dash-bt-section-title">Perfil do Ativo</div>
            {(Object.entries(ASSET_PROFILES) as [keyof typeof ASSET_PROFILES, typeof ASSET_PROFILES[keyof typeof ASSET_PROFILES]][]).map(([key, profile]) => (
              <button
                key={key}
                onClick={() => applyProfile(key)}
                className={`dash-profile-btn${activeProfile === key ? ' active' : ''}`}
              >
                <div className="dash-profile-btn-label">{profile.label}</div>
                <div className="dash-profile-btn-desc">{profile.description}</div>
              </button>
            ))}
          </div>

          {/* Ativo + Intervalo */}
          <div className="dash-bt-section">
            <div className="dash-bt-section-title">Configuração Base</div>
            <div className="dash-param-grid-2" style={{ marginBottom: 10 }}>
              <div>
                <label className="dash-field-label">Ativo</label>
                <select
                  value={params.symbol}
                  onChange={e => { setParams({ ...params, symbol: e.target.value }); setActiveProfile(null); }}
                  className="dash-input"
                >
                  {SYMBOLS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="dash-field-label">Intervalo</label>
                <select
                  value={params.interval}
                  onChange={e => setParams({ ...params, interval: e.target.value })}
                  className="dash-input"
                >
                  {INTERVALS.map(i => <option key={i} value={i}>{i}</option>)}
                </select>
              </div>
            </div>
            <div className="dash-field">
              <label className="dash-field-label">Banca Inicial ($)</label>
              <input type="number" value={params.initialBalance}
                onChange={e => setParams({ ...params, initialBalance: +e.target.value })}
                className="dash-input" />
            </div>
            <div className="dash-param-grid-2">
              <div>
                <label className="dash-field-label">Risco/Op (%)</label>
                <input type="number" step="0.5" value={params.riskPerTrade}
                  onChange={e => setParams({ ...params, riskPerTrade: +e.target.value })}
                  className="dash-input" />
              </div>
              <div>
                <label className="dash-field-label">Min R:R</label>
                <input type="number" step="0.5" value={params.minRiskReward}
                  onChange={e => setParams({ ...params, minRiskReward: +e.target.value })}
                  className="dash-input" />
              </div>
            </div>
          </div>

          {/* ATR Stop */}
          <div className="dash-bt-section">
            <div className="dash-bt-section-title">Stop Loss</div>
            <div className="dash-toggle-row" style={{ marginBottom: 12 }}>
              <div className="dash-toggle-info">
                <div className="dash-toggle-label">Stop Dinâmico (ATR)</div>
                <div className="dash-toggle-desc">
                  {params.useATRStop
                    ? `Stop = ATR × ${params.atrMultiplier} — se ajusta à volatilidade`
                    : `Stop fixo de ${params.stopLossPercent}% por candle`}
                </div>
              </div>
              <button
                onClick={() => setParams({ ...params, useATRStop: !params.useATRStop })}
                className={`dash-toggle${params.useATRStop ? ' on' : ''}`}
              >
                <span className="dash-toggle-thumb" />
              </button>
            </div>
            {params.useATRStop ? (
              <div className="dash-field">
                <label className="dash-field-label">Multiplicador ATR</label>
                <input type="number" step="0.5" min="0.5" max="5"
                  value={params.atrMultiplier}
                  onChange={e => setParams({ ...params, atrMultiplier: +e.target.value })}
                  className="dash-input" />
                <div className="dash-param-note">1.5 = conservador · 2 = padrão · 3 = volátil</div>
              </div>
            ) : (
              <div className="dash-field">
                <label className="dash-field-label">Stop Loss Fixo (%)</label>
                <input type="number" step="0.5"
                  value={params.stopLossPercent}
                  onChange={e => setParams({ ...params, stopLossPercent: +e.target.value })}
                  className="dash-input" />
              </div>
            )}
          </div>

          {/* Indicadores */}
          <div className="dash-bt-section">
            <div className="dash-bt-section-title">Indicadores</div>
            <div className="dash-param-grid-2" style={{ marginBottom: 10 }}>
              <div>
                <label className="dash-field-label">RSI Low</label>
                <input type="number" value={params.rsiLow}
                  onChange={e => setParams({ ...params, rsiLow: +e.target.value })}
                  className="dash-input" />
              </div>
              <div>
                <label className="dash-field-label">RSI High</label>
                <input type="number" value={params.rsiHigh}
                  onChange={e => setParams({ ...params, rsiHigh: +e.target.value })}
                  className="dash-input" />
              </div>
            </div>
            <div className="dash-param-grid-2">
              <div>
                <label className="dash-field-label">Trail (R-units)</label>
                <input type="number" step="0.5" min="1" max="5"
                  value={params.trailRUnits}
                  onChange={e => setParams({ ...params, trailRUnits: +e.target.value })}
                  className="dash-input" disabled={!params.trailingStop} />
              </div>
              <div>
                <label className="dash-field-label">Circuit Breaker (%)</label>
                <input type="number" step="5" min="0" max="50"
                  value={params.circuitBreaker}
                  onChange={e => setParams({ ...params, circuitBreaker: +e.target.value })}
                  className="dash-input" />
                <div className="dash-param-note">0 = desativado</div>
              </div>
            </div>
          </div>

          {/* Freios Avançados */}
          <div className="dash-bt-section">
            <div className="dash-bt-section-title"><Zap size={10} /> Freios Avançados</div>
            <div className="dash-field">
              <label className="dash-field-label">Saída por Tempo (candles) — 0 = sem limite</label>
              <input type="number" step="5" min="0" max="500"
                value={params.maxCandlesInTrade}
                onChange={e => setParams({ ...params, maxCandlesInTrade: +e.target.value })}
                className="dash-input" />
              <div className="dash-param-note">
                {params.maxCandlesInTrade > 0
                  ? `Fecha a mercado após ${params.maxCandlesInTrade} candles sem resolução`
                  : 'Trade fica aberto até stop ou alvo'}
              </div>
            </div>
            <div className="dash-field">
              <label className="dash-field-label">Meta de Banca (×) — 0 = sem meta</label>
              <input type="number" step="5" min="0" max="1000"
                value={params.balanceTarget}
                onChange={e => setParams({ ...params, balanceTarget: +e.target.value })}
                className="dash-input" />
              <div className="dash-param-note">
                {params.balanceTarget > 0
                  ? `Para ao atingir ${params.balanceTarget}× ($${(params.initialBalance * params.balanceTarget).toFixed(0)})`
                  : 'Opera até o fim dos candles históricos'}
              </div>
            </div>
            <div className="dash-field">
              <label className="dash-field-label">Candles Históricos (máx. 1000)</label>
              <input type="number"
                value={params.limit}
                onChange={e => setParams({ ...params, limit: Math.min(1000, +e.target.value) })}
                className="dash-input" />
            </div>
          </div>

          {/* Feature flags */}
          <div className="dash-bt-section">
            <div className="dash-bt-section-title">Gestão de Risco Avançada</div>
            {FEATURE_FLAGS.map(({ key, label, on, off }) => {
              const isOn = params[key];
              return (
                <div
                  key={key}
                  onClick={() => setParams({ ...params, [key]: !isOn })}
                  className={`dash-feature-flag${isOn ? ' active' : ''}`}
                >
                  <div className="dash-feature-checkbox">{isOn ? '✓' : ''}</div>
                  <div>
                    <div className="dash-feature-flag-label">{label}</div>
                    <div className="dash-feature-flag-desc">{isOn ? on : off}</div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Run button */}
          <div className="dash-bt-section">
            <button onClick={runBacktest} disabled={loading} className="dash-run-btn">
              {loading
                ? <><span className="dash-spinner" style={{ borderColor: 'rgba(8,12,18,0.3)', borderTopColor: '#080C12' }} /> Simulando...</>
                : <><Play size={13} fill="currentColor" /> Rodar Backtest</>
              }
            </button>
            {error && <div className="dash-error-msg">{error}</div>}
          </div>
        </div>

        {/* ── RIGHT: RESULTS ── */}
        <div className="dash-bt-results">

          {!result && !loading && (
            <div className="dash-bt-empty">
              <BarChart2 size={40} />
              <p>Configure os parâmetros e clique em</p>
              <p><span>Rodar Backtest</span> para ver os resultados.</p>
            </div>
          )}

          {result && (
            <>
              {/* KPI strip */}
              <div className="dash-kpi-strip">
                {[
                  { label: 'Win Rate',      value: `${result.winRate}%`,                     color: result.winRate >= 50 ? 'green' : 'red' },
                  { label: 'Profit Factor', value: result.profitFactor.toFixed(2),             color: result.profitFactor >= 1 ? 'green' : 'red' },
                  { label: 'Sharpe Ratio',  value: result.sharpeRatio?.toFixed(2) ?? '—',     color: (result.sharpeRatio ?? 0) >= 1 ? 'green' : 'amber' },
                  { label: 'Max Drawdown',  value: `${result.maxDrawdown}%`,                  color: result.maxDrawdown > 20 ? 'red' : 'amber' },
                  { label: 'Total Trades',  value: String(result.totalTrades),                color: 'amber' },
                ].map((m) => (
                  <div key={m.label} className="dash-kpi-card">
                    <div className="dash-kpi-label">{m.label}</div>
                    <div className={`dash-kpi-val ${m.color}`}>{m.value}</div>
                  </div>
                ))}
              </div>

              {/* Financial result */}
              <div className="dash-result-card">
                <div className="dash-result-card-header">
                  <span className="dash-result-card-title">
                    <TrendingUp size={12} /> Resultado Financeiro
                  </span>
                  <div className="dash-config-tags">
                    {result.config?.trendFilter !== undefined && (
                      <span className={`dash-config-tag ${result.config.trendFilter ? 'green' : 'red'}`}>
                        {result.config.trendFilter ? 'EMA200 ativo' : 'Sem EMA200'}
                      </span>
                    )}
                    {result.config?.useATRStop && (
                      <span className="dash-config-tag amber">ATR × {result.config.atrMultiplier as number}</span>
                    )}
                    {result.config?.scaledExits && (
                      <span className="dash-config-tag purple">3-tier exits</span>
                    )}
                  </div>
                </div>
                <div className="dash-result-card-body">
                  <div className="dash-fin-grid">
                    <div className="dash-fin-cell">
                      <div className="dash-fin-label">Banca Inicial</div>
                      <div className="dash-fin-val">${result.initialBalance.toFixed(2)}</div>
                    </div>
                    <div className="dash-fin-cell">
                      <div className="dash-fin-label">Pico da Banca</div>
                      <div className="dash-fin-val" style={{ color: '#A855F7' }}>${result.peakBalance.toFixed(2)}</div>
                    </div>
                    <div className="dash-fin-cell">
                      <div className="dash-fin-label">Banca Final</div>
                      <div className="dash-fin-val" style={{ color: result.finalBalance >= result.initialBalance ? 'var(--green)' : 'var(--red)' }}>
                        ${result.finalBalance.toFixed(2)}
                      </div>
                    </div>
                    <div className="dash-fin-cell">
                      <div className="dash-fin-label">Lucro Líquido</div>
                      <div className="dash-fin-val" style={{ color: result.netProfit >= 0 ? 'var(--green)' : 'var(--red)' }}>
                        {result.netProfit >= 0 ? '+' : ''}${result.netProfit.toFixed(2)}
                        <span style={{ fontSize: 12, marginLeft: 4 }}>({result.netProfitPct}%)</span>
                      </div>
                    </div>
                  </div>

                  {/* Equity curve */}
                  <div className="dash-equity-wrap">
                    <div className="dash-equity-label">Curva de Equity</div>
                    {renderCurve(result.balanceCurve)}
                  </div>

                  {/* Alerts */}
                  {result.haltCount > 0 && (
                    <div className="dash-alert warning">
                      <Zap size={11} />
                      <span>Circuit Breaker disparou <strong>{result.haltCount}×</strong> — bot suspenso após queda de {params.circuitBreaker}% desde o pico</span>
                    </div>
                  )}
                  {result.targetHit && (
                    <div className="dash-alert success">
                      <Target size={11} />
                      <span><strong>Meta de Banca Atingida!</strong> — Bot encerrou ao atingir {params.balanceTarget}× (${(params.initialBalance * params.balanceTarget).toFixed(0)})</span>
                    </div>
                  )}

                  {/* Meta info */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10 }} className="dash-barrier-desc">
                    <span>{result.symbol} | {result.interval} | {result.candlesAnalyzed} candles</span>
                    <span style={{ display: 'flex', gap: 10 }}>
                      <span style={{ color: 'var(--green)' }}>● {result.wins} wins</span>
                      <span style={{ color: 'var(--red)' }}>● {result.losses} losses</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Strategy health + Monte Carlo */}
              <div className="dash-result-2col">

                {/* Expectância */}
                <div className="dash-result-card">
                  <div className="dash-result-card-header">
                    <span className="dash-result-card-title"><Target size={12} /> Saúde da Estratégia</span>
                  </div>
                  <div className="dash-result-card-body">
                    <div className={`dash-expectancy ${result.expectancy >= 0 ? 'positive' : 'negative'}`}>
                      <div className="dash-expectancy-label">Expectância Matemática</div>
                      <div className="dash-expectancy-val" style={{ color: result.expectancy >= 0 ? 'var(--green)' : 'var(--red)' }}>
                        {result.expectancy >= 0 ? '+' : ''}${result.expectancy.toFixed(2)}
                      </div>
                      <div className="dash-expectancy-sub">por trade executado</div>
                    </div>

                    <div className="dash-stat-row">
                      <span className="dash-stat-row-label">Gain médio (win)</span>
                      <span style={{ color: 'var(--green)', fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 500 }}>+${result.avgWin.toFixed(2)}</span>
                    </div>
                    <div className="dash-stat-row">
                      <span className="dash-stat-row-label">Loss médio (loss)</span>
                      <span style={{ color: 'var(--red)', fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 500 }}>-${result.avgLoss.toFixed(2)}</span>
                    </div>
                    <div className="dash-stat-row">
                      <span className="dash-stat-row-label">R:R real médio</span>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 500, color: 'var(--text)' }}>
                        {result.avgLoss > 0 ? (result.avgWin / result.avgLoss).toFixed(2) : '∞'}
                      </span>
                    </div>

                    {result.exitBreakdown && Object.keys(result.exitBreakdown).length > 0 && (
                      <div style={{ marginTop: 14 }}>
                        <div className="dash-barriers-label">Motivos de Saída</div>
                        {Object.entries(result.exitBreakdown)
                          .sort(([, a], [, b]) => b - a)
                          .map(([reason, count]) => (
                            <div key={reason} className="dash-exit-bar-row">
                              <div className="dash-exit-bar-track">
                                <div className="dash-exit-bar-fill" style={{ width: `${(count / result.totalTrades) * 100}%` }} />
                              </div>
                              <span className="dash-exit-bar-count">{count}</span>
                              <span className="dash-exit-bar-label">{reason}</span>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Monte Carlo */}
                <div className="dash-result-card">
                  <div className="dash-result-card-header">
                    <span className="dash-result-card-title"><Shield size={12} /> Monte Carlo (1.000×)</span>
                  </div>
                  <div className="dash-result-card-body">
                    <div className={`dash-mc-prob ${
                      result.monteCarlo.ruinPct <= 5 ? 'safe'
                      : result.monteCarlo.ruinPct <= 20 ? 'caution'
                      : 'danger'
                    }`}>
                      <div className="dash-mc-prob-label">Probabilidade de Ruína</div>
                      <div className="dash-mc-prob-val" style={{
                        color: result.monteCarlo.ruinPct <= 5 ? 'var(--green)'
                          : result.monteCarlo.ruinPct <= 20 ? '#FACC15'
                          : 'var(--red)'
                      }}>
                        {result.monteCarlo.ruinPct}%
                      </div>
                      <div className="dash-mc-prob-sub">
                        {result.monteCarlo.ruinPct <= 5  ? 'Estrategia robusta'
                        : result.monteCarlo.ruinPct <= 20 ? 'Risco moderado'
                        : 'Alto risco de ruina'}
                      </div>
                    </div>

                    <div className="dash-barriers-label">Distribuição de Banca Final</div>
                    {renderMCBar('Pessimista (P10)', result.monteCarlo.p10,          result.initialBalance, 'p10')}
                    {renderMCBar('Mediana (P50)',    result.monteCarlo.medianFinal,   result.initialBalance, 'p50')}
                    {renderMCBar('Otimista (P90)',   result.monteCarlo.p90,           result.initialBalance, 'p90')}

                    <div className="dash-mc-insight">
                      Em 90% dos cenários a banca fica entre{' '}
                      <span style={{ color: 'var(--red)', fontWeight: 500 }}>${result.monteCarlo.p10.toFixed(2)}</span>
                      {' '}e{' '}
                      <span style={{ color: 'var(--green)', fontWeight: 500 }}>${result.monteCarlo.p90.toFixed(2)}</span>.
                      Mediana: <span style={{ color: 'var(--blue)', fontWeight: 500 }}>${result.monteCarlo.medianFinal.toFixed(2)}</span>.
                    </div>
                  </div>
                </div>
              </div>

              {/* Recent trades */}
              <div className="dash-result-card">
                <div className="dash-result-card-header">
                  <span className="dash-result-card-title"><Activity size={12} /> Últimas Operações Simuladas</span>
                </div>
                <div className="dash-result-card-body" style={{ padding: 0 }}>
                  <div className="dash-table-wrap">
                    <table className="dash-table">
                      <thead>
                        <tr>
                          <th>Dir.</th>
                          <th>Entrada</th>
                          <th>Saída</th>
                          <th>Motivo</th>
                          <th>PnL</th>
                          <th>Banca</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.recentTrades.slice().reverse().map((t, i) => (
                          <tr key={i}>
                            <td>
                              <span className={`dash-side ${t.signal === 'LONG' ? 'long' : 'short'}`}>
                                {t.signal === 'LONG'
                                  ? <TrendingUp size={9} style={{ display: 'inline', marginRight: 3 }} />
                                  : <TrendingDown size={9} style={{ display: 'inline', marginRight: 3 }} />}
                                {t.signal}
                              </span>
                            </td>
                            <td>${t.entryPrice.toFixed(2)}</td>
                            <td>${t.exitPrice.toFixed(2)}</td>
                            <td style={{ fontSize: 9, color: 'var(--muted)' }}>{t.exitReason ?? '—'}</td>
                            <td className={t.profit >= 0 ? 'dash-pnl-pos' : 'dash-pnl-neg'}>
                              {t.profit >= 0 ? '+' : ''}${t.profit.toFixed(2)}
                            </td>
                            <td style={{ color: 'var(--muted-hi)' }}>${t.balance.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
