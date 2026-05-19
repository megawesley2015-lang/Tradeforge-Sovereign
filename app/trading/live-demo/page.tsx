"use client";
import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  ChevronLeft, RefreshCw, TrendingUp, TrendingDown,
  BarChart2, Clock, Bot, Wifi, Activity, Zap, Bell,
} from 'lucide-react';
import '@/components/dashboard/dashboard.css';

interface PosLogEntry {
  ts:      string;
  event:   'opened' | 'stepped' | 'stop_moved' | 'tp1_hit' | 'tp2_hit' | 'closed';
  detail?: string;
}


interface AlertItem {
  id:         string;
  type:       string;
  symbol:     string;
  signal?:    string;
  message:    string;
  pnl_usd?:   number;
  trade_id?:  string;
  status:     'unread' | 'read';
  created_at: string;
}

interface Trade {
  id: string; symbol: string; signal: 'LONG' | 'SHORT';
  entry_price: number; stop_price: number; tp1_price: number; tp3_price: number;
  risk_amount?: number;
  exit_price?: number; profit_usd?: number; profit_pct?: number;
  status: string; exit_reason?: string; interval: string;
  adx: number; volume_ratio: number; votes_long: number; votes_short: number;
  btc_regime: string; balance_before: number; balance_after?: number;
  opened_at: string; closed_at?: string;
  notes?: string;
}
interface Analytics {
  symbol: string; price: number; trend: 'BULLISH' | 'BEARISH';
  adx: number; adx_strength: string; rsi: number; volume_ratio: number;
  signal: string; votes_long: number; votes_short: number;
  pct_from_ema200: number; market_type: string; analyzed_at: string;
}
interface Summary {
  totalTrades: number; openTrades: number; closedTrades: number;
  wins: number; losses: number; winRatePct: number;
  totalPnlUsd: number; lastScanAt: string | null;
}

// Portfólio monitorado (espelha PORTFOLIO do scanner/route.ts)
const PORTFOLIO = [
  'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT',
  'DOGEUSDT', 'ADAUSDT', 'XRPUSDT',
  'SPY', 'QQQ', 'NVDA', 'AAPL', 'MSFT',
  'BBAS3.SA', 'MGLU3.SA', 'ITUB4.SA',
  'LINKUSDT', 'DOTUSDT', 'MATICUSDT', 'AVAXUSDT',
];

// Parâmetros para o backtest — idênticos ao DEMO_CONFIG do scanner
const COMPARE_BT_PARAMS = {
  initialBalance:    1000,
  riskPerTrade:      0.02,
  stopLossPercent:   0.015,
  atrMultiplier:     2.0,
  useATRStop:        true,
  minRiskReward:     2.0,
  rsiLow:            30,
  rsiHigh:           70,
  smaPeriod:         200,
  trendFilter:       true,
  useAdxFilter:      true,
  adxMinStrength:    20,
  trailingStop:      true,
  trailRUnits:       2.0,
  scaledExits:       true,
  partialExit:       false,
  fixedRiskAmount:   false,
  progressiveRisk:   false,
  circuitBreaker:    0,
  maxCandlesInTrade: 0,
  balanceTarget:     0,
  slippage:          0.001,
  interval:          '4h',
  limit:             500,
};

interface BacktestCompareResult {
  symbol:       string;
  totalTrades:  number;
  wins:         number;
  losses:       number;
  winRate:      number;
  netProfit:    number;
  netProfitPct: number;
  maxDrawdown:  number;
  profitFactor: number;
  sharpeRatio:  number;
  expectancy:   number;
  avgWin:       number;
  avgLoss:      number;
}

interface LiveMetrics {
  totalTrades:  number;
  wins:         number;
  losses:       number;
  winRate:      number;
  netPnl:       number;
  profitFactor: number;
  sharpeRatio:  number;
  avgWin:       number;
  avgLoss:      number;
  expectancy:   number;
}

function calcLiveMetrics(trades: Trade[], symbol: string): LiveMetrics {
  const closed = trades.filter(t => t.status !== 'OPEN' && t.symbol === symbol);
  const wins   = closed.filter(t => t.status === 'CLOSED_WIN');
  const losses = closed.filter(t => t.status !== 'CLOSED_WIN');

  const grossWin  = wins.reduce((s, t)   => s + (t.profit_usd ?? 0), 0);
  const grossLoss = losses.reduce((s, t) => s + Math.abs(t.profit_usd ?? 0), 0);
  const winRate   = closed.length > 0 ? (wins.length / closed.length) * 100 : 0;
  const avgWin    = wins.length   > 0 ? grossWin  / wins.length   : 0;
  const avgLoss   = losses.length > 0 ? grossLoss / losses.length : 0;
  const pf        = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 999 : 0;
  const wr        = winRate / 100;
  const exp       = (wr * avgWin) - ((1 - wr) * avgLoss);

  // Sharpe simplificado (retornos relativos ao saldo inicial demo = $1000)
  let sharpe = 0;
  if (closed.length > 2) {
    const rets = closed.map(t => (t.profit_usd ?? 0) / 1000);
    const avg  = rets.reduce((a, b) => a + b, 0) / rets.length;
    const std  = Math.sqrt(rets.reduce((s, r) => s + (r - avg) ** 2, 0) / rets.length);
    sharpe     = std > 0 ? (avg / std) * Math.sqrt(252) : 0;
  }

  return {
    totalTrades:  closed.length,
    wins:         wins.length,
    losses:       losses.length,
    winRate:      Math.round(winRate * 10) / 10,
    netPnl:       Math.round((grossWin - grossLoss) * 100) / 100,
    profitFactor: Math.round(pf * 100) / 100,
    sharpeRatio:  Math.round(sharpe * 100) / 100,
    avgWin:       Math.round(avgWin  * 100) / 100,
    avgLoss:      Math.round(avgLoss * 100) / 100,
    expectancy:   Math.round(exp * 100) / 100,
  };
}

const fmt     = (n: number, d = 4) => n?.toFixed(d) ?? '—';
const fmtUSD  = (n: number)        => `$${Math.abs(n).toFixed(2)}`;
const fmtPct  = (n: number)        => `${n >= 0 ? '+' : ''}${n?.toFixed(1)}%`;
const fmtDate = (s: string)        => new Date(s).toLocaleString('pt-BR', {
  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
});

// ── Performance Stats ─────────────────────────────────────────

function calcPerformanceStats(trades: Trade[]) {
  const closed = [...trades]
    .filter(t => t.status !== 'OPEN' && t.closed_at != null)
    .sort((a, b) => new Date(a.closed_at!).getTime() - new Date(b.closed_at!).getTime());

  if (closed.length === 0) return null;

  const wins   = closed.filter(t => t.status === 'CLOSED_WIN');
  const losses = closed.filter(t => t.status !== 'CLOSED_WIN');

  const grossWin  = wins.reduce((s, t)   => s + (t.profit_usd ?? 0), 0);
  const grossLoss = losses.reduce((s, t) => s + Math.abs(t.profit_usd ?? 0), 0);
  const winRate   = closed.length > 0 ? (wins.length / closed.length) * 100 : 0;
  const avgWin    = wins.length   > 0 ? grossWin  / wins.length   : 0;
  const avgLoss   = losses.length > 0 ? grossLoss / losses.length : 0;
  const pf        = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 999 : 0;
  const wr        = winRate / 100;
  const expectancy = (wr * avgWin) - ((1 - wr) * avgLoss);

  // Sharpe (retornos por trade / saldo inicial)
  const initial = closed[0].balance_before ?? 1000;
  let sharpe = 0;
  if (closed.length > 2) {
    const rets = closed.map(t => (t.profit_usd ?? 0) / initial);
    const avg  = rets.reduce((a, b) => a + b, 0) / rets.length;
    const std  = Math.sqrt(rets.reduce((s, r) => s + (r - avg) ** 2, 0) / rets.length);
    sharpe     = std > 0 ? (avg / std) * Math.sqrt(252) : 0;
  }

  // Max Drawdown a partir da curva de saldo
  const curve = [initial, ...closed.map(t => t.balance_after ?? initial)];
  let peak = curve[0], maxDD = 0;
  for (const b of curve) {
    if (b > peak) peak = b;
    const dd = ((peak - b) / peak) * 100;
    if (dd > maxDD) maxDD = dd;
  }

  // Streaks
  let curStreak = 0, curType = '', maxWinStreak = 0, maxLossStreak = 0;
  let tmpStreak = 0, tmpType = '';
  for (const t of closed) {
    const type = t.status === 'CLOSED_WIN' ? 'win' : 'loss';
    if (type === tmpType) tmpStreak++;
    else { tmpStreak = 1; tmpType = type; }
    if (type === 'win')  maxWinStreak  = Math.max(maxWinStreak,  tmpStreak);
    if (type === 'loss') maxLossStreak = Math.max(maxLossStreak, tmpStreak);
  }
  curType   = tmpType;
  curStreak = tmpStreak;

  // Duração média dos trades (em horas)
  const durations = closed
    .filter(t => t.closed_at)
    .map(t => (new Date(t.closed_at!).getTime() - new Date(t.opened_at).getTime()) / 3_600_000);
  const avgDurationH = durations.length > 0
    ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;

  // LONG vs SHORT
  const longs  = closed.filter(t => t.signal === 'LONG');
  const shorts = closed.filter(t => t.signal === 'SHORT');
  const longWR  = longs.length  > 0 ? longs.filter( t => t.status === 'CLOSED_WIN').length / longs.length  * 100 : 0;
  const shortWR = shorts.length > 0 ? shorts.filter(t => t.status === 'CLOSED_WIN').length / shorts.length * 100 : 0;
  const longPnl  = longs.reduce( (s, t) => s + (t.profit_usd ?? 0), 0);
  const shortPnl = shorts.reduce((s, t) => s + (t.profit_usd ?? 0), 0);

  // Exit reason breakdown
  const exitBreakdown: Record<string, number> = {};
  for (const t of closed) {
    const r = t.exit_reason ?? 'Outros';
    exitBreakdown[r] = (exitBreakdown[r] ?? 0) + 1;
  }

  // Best / worst trades
  const sorted = [...closed].sort((a, b) => (b.profit_usd ?? 0) - (a.profit_usd ?? 0));
  const best3  = sorted.slice(0, 3);
  const worst3 = sorted.slice(-3).reverse();

  return {
    closed, wins, losses, winRate, avgWin, avgLoss, pf, expectancy,
    sharpe, maxDD, curStreak, curType, maxWinStreak, maxLossStreak,
    avgDurationH, longs, shorts, longWR, shortWR, longPnl, shortPnl,
    exitBreakdown, best3, worst3, grossWin, grossLoss, initial,
  };
}

function StatCard({ label, value, sub, color }: {
  label: string; value: string; sub?: string; color?: string;
}) {
  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 8, padding: '12px 14px',
      display: 'flex', flexDirection: 'column', gap: 3,
    }}>
      <span style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </span>
      <span style={{ fontSize: 17, fontWeight: 700, fontFamily: 'var(--mono)', color: color ?? 'var(--text)' }}>
        {value}
      </span>
      {sub && <span style={{ fontSize: 10, color: 'var(--muted)' }}>{sub}</span>}
    </div>
  );
}

function MiniBar({ label, value, total, color }: {
  label: string; value: number; total: number; color: string;
}) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 11, color: 'var(--muted)', minWidth: 80, flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 2 }} />
      </div>
      <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--muted-hi)', minWidth: 32, textAlign: 'right' }}>
        {value}
      </span>
    </div>
  );
}

function PerformanceStats({ trades }: { trades: Trade[] }) {
  const s = calcPerformanceStats(trades);

  if (!s) {
    return (
      <div className="dash-tc-empty" style={{ paddingTop: 32 }}>
        <Zap size={24} style={{ opacity: 0.2 }} />
        <p>Nenhum trade fechado ainda.</p>
        <p style={{ opacity: 0.5, fontSize: 11 }}>As stats aparecem após o primeiro fechamento.</p>
      </div>
    );
  }

  const exitEntries = Object.entries(s.exitBreakdown)
    .sort((a, b) => b[1] - a[1]);
  const maxExit = Math.max(...exitEntries.map(e => e[1]));

  const fmtDur = (h: number) =>
    h < 24 ? `${h.toFixed(0)}h` : `${(h / 24).toFixed(1)}d`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Grid de métricas chave */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8 }}>
        <StatCard
          label="Win Rate" value={`${s.winRate.toFixed(1)}%`}
          sub={`${s.wins.length}W / ${s.losses.length}L`}
          color={s.winRate >= 50 ? 'var(--green)' : 'var(--red)'}
        />
        <StatCard
          label="Profit Factor" value={s.pf >= 999 ? '∞' : s.pf.toFixed(2)}
          sub={`$${s.grossWin.toFixed(0)} / $${s.grossLoss.toFixed(0)}`}
          color={s.pf >= 1.5 ? 'var(--green)' : s.pf >= 1 ? '#f59e0b' : 'var(--red)'}
        />
        <StatCard
          label="Expectativa" value={`${s.expectancy >= 0 ? '+' : ''}$${s.expectancy.toFixed(2)}`}
          sub="por trade"
          color={s.expectancy >= 0 ? 'var(--green)' : 'var(--red)'}
        />
        <StatCard
          label="Sharpe Ratio" value={s.sharpe.toFixed(2)}
          sub="anualizado aprox."
          color={s.sharpe >= 1.5 ? 'var(--green)' : s.sharpe >= 0.5 ? '#f59e0b' : s.sharpe > 0 ? 'var(--muted-hi)' : 'var(--red)'}
        />
        <StatCard
          label="Max Drawdown" value={`-${s.maxDD.toFixed(1)}%`}
          sub="do pico"
          color={s.maxDD > 25 ? 'var(--red)' : s.maxDD > 15 ? '#f59e0b' : 'var(--muted-hi)'}
        />
        <StatCard
          label="Avg Win" value={`+$${s.avgWin.toFixed(2)}`}
          sub={`Avg Loss: $${s.avgLoss.toFixed(2)}`}
          color="var(--green)"
        />
        <StatCard
          label="Ratio W/L" value={(s.avgWin / (s.avgLoss || 1)).toFixed(2)}
          sub="win/loss ratio"
          color={(s.avgWin / (s.avgLoss || 1)) >= 1.5 ? 'var(--green)' : 'var(--muted-hi)'}
        />
        <StatCard
          label="Duração Média" value={fmtDur(s.avgDurationH)}
          sub={`${s.closed.length} trades`}
          color="var(--muted-hi)"
        />
      </div>

      {/* Sequência atual + recordes */}
      <div style={{
        background: 'var(--card)', border: '1px solid var(--border)',
        borderRadius: 8, padding: '12px 16px',
        display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap',
      }}>
        <div>
          <span style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4 }}>
            Sequência Atual
          </span>
          <span style={{
            fontSize: 18, fontWeight: 800, fontFamily: 'var(--mono)',
            color: s.curType === 'win' ? 'var(--green)' : 'var(--red)',
          }}>
            {s.curStreak}× {s.curType === 'win' ? '✓ WIN' : '✗ LOSS'}
          </span>
        </div>
        <div style={{ width: 1, height: 36, background: 'var(--border)' }} />
        <div>
          <span style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4 }}>
            Recorde Wins
          </span>
          <span style={{ fontSize: 16, fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--green)' }}>
            {s.maxWinStreak}× consecutivos
          </span>
        </div>
        <div style={{ width: 1, height: 36, background: 'var(--border)' }} />
        <div>
          <span style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4 }}>
            Recorde Losses
          </span>
          <span style={{ fontSize: 16, fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--red)' }}>
            {s.maxLossStreak}× consecutivos
          </span>
        </div>
      </div>

      {/* LONG vs SHORT */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {[
          { label: 'LONG', trades: s.longs,  wr: s.longWR,  pnl: s.longPnl,  color: 'var(--green)' },
          { label: 'SHORT', trades: s.shorts, wr: s.shortWR, pnl: s.shortPnl, color: 'var(--red)' },
        ].map(({ label, trades: ts, wr, pnl, color }) => (
          <div key={label} style={{
            background: 'var(--card)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '12px 14px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              {label === 'LONG'
                ? <TrendingUp  size={13} style={{ color }} />
                : <TrendingDown size={13} style={{ color }} />}
              <span style={{ fontSize: 12, fontWeight: 700, color }}>{label}</span>
              <span style={{ fontSize: 10, color: 'var(--muted)', marginLeft: 'auto' }}>
                {ts.length} trades
              </span>
            </div>
            <div style={{ display: 'flex', gap: 16 }}>
              <div>
                <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 2 }}>Win Rate</div>
                <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'var(--mono)', color: wr >= 50 ? 'var(--green)' : 'var(--red)' }}>
                  {ts.length > 0 ? `${wr.toFixed(1)}%` : '—'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 2 }}>P&L Total</div>
                <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'var(--mono)', color: pnl >= 0 ? 'var(--green)' : 'var(--red)' }}>
                  {ts.length > 0 ? `${pnl >= 0 ? '+' : ''}$${Math.abs(pnl).toFixed(2)}` : '—'}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Motivos de saída */}
      {exitEntries.length > 0 && (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 16px' }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Motivos de Saída
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {exitEntries.map(([reason, count]) => (
              <MiniBar
                key={reason}
                label={reason}
                value={count}
                total={maxExit}
                color={reason.includes('TP') || reason.includes('Trailing') ? 'var(--green)' : reason.includes('Stop') ? 'var(--red)' : '#60a5fa'}
              />
            ))}
          </div>
        </div>
      )}

      {/* Best / Worst trades */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {[
          { title: '🏆 Top 3 Melhores', trades: s.best3,  color: 'var(--green)' },
          { title: '💀 Top 3 Piores',   trades: s.worst3, color: 'var(--red)'   },
        ].map(({ title, trades: ts, color }) => (
          <div key={title} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 600, color: 'var(--muted)' }}>
              {title}
            </div>
            {ts.map((t, i) => {
              const pnl = t.profit_usd ?? 0;
              return (
                <div key={t.id} style={{
                  padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  borderBottom: i < 2 ? '1px solid var(--border)' : 'none',
                }}>
                  <div>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>{t.symbol}</span>
                    <span style={{ fontSize: 10, color: t.signal === 'LONG' ? 'var(--green)' : 'var(--red)', marginLeft: 6 }}>
                      {t.signal}
                    </span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--mono)', color }}>
                      {pnl >= 0 ? '+' : ''}${Math.abs(pnl).toFixed(2)}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--muted)' }}>{t.exit_reason ?? '—'}</div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

    </div>
  );
}

// ── Equity Curve ─────────────────────────────────────────────

function EquityStatChip({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 700, fontFamily: 'var(--mono)', color }}>{value}</span>
    </div>
  );
}

function EquityCurve({ trades }: { trades: Trade[] }) {
  const [hovered, setHovered] = useState<number | null>(null);

  // Trades fechados ordenados cronologicamente com balance_after
  const closed = [...trades]
    .filter(t => t.status !== 'OPEN' && t.balance_after != null && t.closed_at != null)
    .sort((a, b) => new Date(a.closed_at!).getTime() - new Date(b.closed_at!).getTime());

  if (closed.length === 0) {
    return (
      <div className="dash-tc-empty" style={{ paddingTop: 32 }}>
        <Activity size={28} style={{ opacity: 0.2 }} />
        <p>Nenhum trade fechado ainda.</p>
        <p style={{ opacity: 0.5, fontSize: 11 }}>A curva aparece após o primeiro trade ser finalizado.</p>
      </div>
    );
  }

  const initialBalance = closed[0].balance_before ?? 1000;
  const points: number[] = [initialBalance, ...closed.map(t => t.balance_after!)];

  // Dimensões do SVG
  const W = 560, H = 200;
  const padL = 58, padR = 16, padT = 14, padB = 32;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const minVal = Math.min(...points) * 0.985;
  const maxVal = Math.max(...points) * 1.015;
  const range  = maxVal - minVal || 1;

  const toX = (i: number) => padL + (i / (points.length - 1 || 1)) * plotW;
  const toY = (v: number) => padT + plotH - ((v - minVal) / range) * plotH;

  const baseY    = toY(initialBalance);
  const lastVal  = points[points.length - 1];
  const peakVal  = Math.max(...points);
  const totalRet = ((lastVal - initialBalance) / initialBalance) * 100;
  const ddPeak   = ((peakVal - lastVal)        / peakVal)        * 100;
  const lineColor = lastVal >= initialBalance ? 'var(--green)' : 'var(--red)';

  const linePoints = points.map((v, i) => `${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(' ');
  const areaPath   =
    `M ${toX(0).toFixed(1)},${baseY.toFixed(1)} ` +
    points.map((v, i) => `L ${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(' ') +
    ` L ${toX(points.length - 1).toFixed(1)},${baseY.toFixed(1)} Z`;

  // Y-axis labels: 4 gridlines
  const gridVals = [0, 1, 2, 3].map(k => minVal + (range * k) / 3);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Stats strip */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))',
        gap: 12, background: 'var(--card)', border: '1px solid var(--border)',
        borderRadius: 8, padding: '12px 16px',
      }}>
        <EquityStatChip label="Saldo Atual"      value={`$${lastVal.toFixed(2)}`}   color={lastVal >= initialBalance ? 'var(--green)' : 'var(--red)'} />
        <EquityStatChip label="Retorno Total"    value={`${totalRet >= 0 ? '+' : ''}${totalRet.toFixed(2)}%`} color={totalRet >= 0 ? 'var(--green)' : 'var(--red)'} />
        <EquityStatChip label="Pico"             value={`$${peakVal.toFixed(2)}`}   color="var(--muted-hi)" />
        <EquityStatChip label="Drawdown do Pico" value={`-${ddPeak.toFixed(1)}%`}   color={ddPeak > 20 ? 'var(--red)' : ddPeak > 10 ? '#f59e0b' : 'var(--muted-hi)'} />
        <EquityStatChip label="Trades Fechados"  value={String(closed.length)}      color="var(--muted-hi)" />
      </div>

      {/* SVG Chart */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', position: 'relative' }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }}>
          <defs>
            <linearGradient id="eq-green" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="#22c55e" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#22c55e" stopOpacity="0.02" />
            </linearGradient>
            <linearGradient id="eq-red" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="#ef4444" stopOpacity="0.02" />
              <stop offset="100%" stopColor="#ef4444" stopOpacity="0.20" />
            </linearGradient>
          </defs>

          {/* Grid horizontais */}
          {gridVals.map((v, k) => (
            <g key={k}>
              <line x1={padL} y1={toY(v)} x2={W - padR} y2={toY(v)}
                stroke="var(--border)" strokeWidth="0.5" />
              <text x={padL - 5} y={toY(v) + 3.5}
                textAnchor="end" fontSize="8.5" fill="var(--muted)">
                ${v.toFixed(0)}
              </text>
            </g>
          ))}

          {/* Linha de baseline ($1000) */}
          <line x1={padL} y1={baseY} x2={W - padR} y2={baseY}
            stroke="var(--border)" strokeWidth="1" strokeDasharray="4 3" />
          <text x={padL - 5} y={baseY + 3.5} textAnchor="end" fontSize="8" fill="var(--muted)" opacity="0.6">
            ${initialBalance}
          </text>

          {/* Área preenchida */}
          <path d={areaPath} fill={lastVal >= initialBalance ? 'url(#eq-green)' : 'url(#eq-red)'} />

          {/* Linha da equity */}
          <polyline points={linePoints} fill="none" stroke={lineColor} strokeWidth="1.8" strokeLinejoin="round" />

          {/* Dots por trade */}
          {points.map((v, i) => {
            if (i === 0) return null;
            const trade = closed[i - 1];
            const isWin = trade.status === 'CLOSED_WIN';
            const cx = toX(i), cy = toY(v);
            const isHov = hovered === i;
            return (
              <circle key={i} cx={cx} cy={cy} r={isHov ? 5.5 : 3}
                fill={isWin ? '#22c55e' : '#ef4444'}
                stroke="var(--card)" strokeWidth="1.5"
                style={{ cursor: 'pointer', transition: 'r 0.1s' }}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
              />
            );
          })}

          {/* Tooltip no hover */}
          {hovered !== null && (() => {
            const trade = closed[hovered - 1];
            if (!trade) return null;
            const cx   = toX(hovered);
            const cy   = toY(points[hovered]);
            const flip = cx > W * 0.68;
            const tx   = flip ? cx - 122 : cx + 10;
            const ty   = Math.max(padT, cy - 40);
            const isWin = trade.status === 'CLOSED_WIN';
            const pnl   = trade.profit_usd ?? 0;
            return (
              <g>
                <rect x={tx} y={ty} width={116} height={46} rx={5}
                  fill="var(--card)" stroke="var(--border)" strokeWidth="0.8" />
                <text x={tx + 7} y={ty + 14} fontSize="10" fontWeight="700"
                  fill={isWin ? '#22c55e' : '#ef4444'}>
                  {trade.symbol} {trade.signal}
                </text>
                <text x={tx + 7} y={ty + 26} fontSize="9" fill="var(--muted-hi)">
                  {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)} ({trade.exit_reason ?? '—'})
                </text>
                <text x={tx + 7} y={ty + 38} fontSize="9" fill="var(--muted)">
                  Saldo: ${points[hovered].toFixed(2)}
                </text>
              </g>
            );
          })()}

          {/* Eixo X: labels */}
          <text x={padL}       y={H - 6} fontSize="9" fill="var(--muted)">0</text>
          <text x={W - padR}   y={H - 6} textAnchor="end" fontSize="9" fill="var(--muted)">{closed.length} trades</text>
          {closed.length >= 4 && (
            <text x={W / 2} y={H - 6} textAnchor="middle" fontSize="9" fill="var(--muted)">
              {Math.floor(closed.length / 2)}
            </text>
          )}
        </svg>
      </div>

      {/* Tabela dos últimos 10 trades fechados */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)', fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>
          ÚLTIMOS TRADES FECHADOS
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['#', 'Ativo', 'Dir.', 'P&L', 'Saída', 'Saldo'].map(h => (
                <th key={h} style={{ padding: '6px 10px', textAlign: h === '#' ? 'center' : 'right', fontSize: 10, color: 'var(--muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {closed.slice(-10).reverse().map((t, i) => {
              const pnl = t.profit_usd ?? 0;
              return (
                <tr key={t.id} style={{ borderBottom: i < 9 ? '1px solid var(--border)' : 'none' }}>
                  <td style={{ padding: '6px 10px', textAlign: 'center', fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
                    {closed.length - i}
                  </td>
                  <td style={{ padding: '6px 10px', textAlign: 'right', fontSize: 11, fontWeight: 600 }}>{t.symbol}</td>
                  <td style={{ padding: '6px 10px', textAlign: 'right', fontSize: 10, color: t.signal === 'LONG' ? 'var(--green)' : 'var(--red)' }}>{t.signal}</td>
                  <td style={{ padding: '6px 10px', textAlign: 'right', fontSize: 11, fontFamily: 'var(--mono)', fontWeight: 600, color: pnl >= 0 ? 'var(--green)' : 'var(--red)' }}>
                    {pnl >= 0 ? '+' : ''}${Math.abs(pnl).toFixed(2)}
                  </td>
                  <td style={{ padding: '6px 10px', textAlign: 'right', fontSize: 10, color: 'var(--muted)' }}>{t.exit_reason ?? '—'}</td>
                  <td style={{ padding: '6px 10px', textAlign: 'right', fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--muted-hi)' }}>
                    ${(t.balance_after ?? 0).toFixed(2)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Comparação: linha de métrica ──────────────────────────────
function CompareRow({
  label, bt, live, fmt: fmtFn, higherIsBetter = true, unit = '',
}: {
  label: string;
  bt:   number | null;
  live: number | null;
  fmt?: (n: number) => string;
  higherIsBetter?: boolean;
  unit?: string;
}) {
  const f = fmtFn ?? ((n: number) => `${n.toFixed(2)}${unit}`);
  const btVal   = bt   !== null ? f(bt)   : '—';
  const liveVal = live !== null ? f(live) : '—';

  let btColor   = 'var(--muted-hi)';
  let liveColor = 'var(--muted-hi)';

  if (bt !== null && live !== null && bt !== live) {
    const btBetter   = higherIsBetter ? bt   > live : bt   < live;
    const liveBetter = higherIsBetter ? live > bt   : live < bt;
    if (btBetter)   btColor   = 'var(--green)';
    if (liveBetter) liveColor = 'var(--green)';
    if (!btBetter)  btColor   = 'var(--red)';
    if (!liveBetter)liveColor = 'var(--red)';
  }

  return (
    <tr>
      <td style={{ color: 'var(--muted)', fontSize: 12, paddingRight: 12 }}>{label}</td>
      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12, color: btColor, fontWeight: 600 }}>
        {btVal}
      </td>
      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12, color: liveColor, fontWeight: 600 }}>
        {liveVal}
      </td>
    </tr>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: string }> = {
    OPEN:        { label: 'Aberta',     variant: 'open'  },
    CLOSED_WIN:  { label: 'Win',        variant: 'win'   },
    CLOSED_LOSS: { label: 'Loss',       variant: 'loss'  },
    CLOSED_TIME: { label: 'Tempo',      variant: 'time'  },
    CLOSED_EOD:  { label: 'Fim Dados',  variant: 'other' },
  };
  const { label, variant } = map[status] ?? { label: status, variant: 'other' };
  return <span className={`dash-trade-status-badge ${variant}`}>{label}</span>;
}

function AdxBar({ adx }: { adx: number }) {
  const color = adx > 40 ? 'var(--green)' : adx > 25 ? 'var(--amber)' : '#6b7280';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <div style={{ width: 44, height: 3, background: 'var(--border)', borderRadius: 1, overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(adx, 100)}%`, height: '100%', background: color }} />
      </div>
      <span style={{ color, fontSize: 10, fontFamily: 'var(--mono)' }}>{adx?.toFixed(0)}</span>
    </div>
  );
}

function SectionHead({ icon, label, count, dotColor }: { icon: React.ReactNode; label: string; count: number; dotColor?: string }) {
  return (
    <div className="dash-section-head2">
      {dotColor && <span style={{ width: 6, height: 6, borderRadius: '50%', background: dotColor, flexShrink: 0, animation: 'dash-blink 1.5s infinite' }} />}
      {icon}
      <span className="dash-section-head2-label">{label}</span>
      <span className="dash-section-head2-count">{count}</span>
      <span className="dash-section-head2-line" />
    </div>
  );
}

// ── Position Life Log ─────────────────────────────────────────

function parseTradeLog(notes?: string): PosLogEntry[] {
  if (!notes) return [];
  try {
    const parsed = JSON.parse(notes);
    return Array.isArray(parsed?.log) ? (parsed.log as PosLogEntry[]) : [];
  } catch { return []; }
}

function timeAgo(ts: string): string {
  const diffMs  = Date.now() - new Date(ts).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 2)   return 'agora';
  if (diffMin < 60)  return `há ${diffMin}min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24)    return `há ${diffH}h`;
  return `há ${Math.floor(diffH / 24)}d`;
}

const LOG_EVENT_META: Record<PosLogEntry['event'], { label: string; color: string }> = {
  opened:     { label: 'Aberta',      color: '#60a5fa' }, // azul
  stepped:    { label: 'Stepada',     color: '#6b7280' }, // cinza
  stop_moved: { label: 'Stop movido', color: '#f59e0b' }, // âmbar
  tp1_hit:    { label: 'TP1 ✓',       color: '#34d399' }, // verde claro
  tp2_hit:    { label: 'TP2 ✓',       color: '#10b981' }, // verde
  closed:     { label: 'Fechada',     color: '#a78bfa' }, // roxo
};

function PositionLog({ notes }: { notes?: string }) {
  const log = parseTradeLog(notes);
  if (log.length === 0) return null;

  // Último step para o badge "stepada há X"
  const lastStep = [...log].reverse().find(e => e.event === 'stepped');
  // Últimas 5 entradas (excluindo "stepped" puro — muito verboso — a não ser que único)
  const significant = log.filter(e => e.event !== 'stepped');
  const lastStepped = log.filter(e => e.event === 'stepped').at(-1);
  // Mostra: todos os eventos significativos + último step (para saber quando rodou)
  const visible = [...significant, ...(lastStepped ? [lastStepped] : [])]
    .sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime())
    .slice(-5)
    .reverse();

  return (
    <div style={{
      borderTop: '1px solid var(--border)',
      marginTop: 6,
      paddingTop: 6,
    }}>
      {/* Badge resumo: última vez stepada */}
      {lastStep && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
          <span style={{
            width: 5, height: 5, borderRadius: '50%',
            background: '#6b7280', flexShrink: 0,
          }} />
          <span style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
            Último ciclo: <span style={{ color: 'var(--muted-hi)' }}>{timeAgo(lastStep.ts)}</span>
          </span>
        </div>
      )}
      {/* Entradas do log */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {visible.map((entry, i) => {
          const meta = LOG_EVENT_META[entry.event];
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, lineHeight: 1.3 }}>
              <span style={{
                width: 5, height: 5, borderRadius: '50%',
                background: meta.color, flexShrink: 0, marginTop: 3,
              }} />
              <span style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--mono)', flexShrink: 0 }}>
                {timeAgo(entry.ts)}
              </span>
              <span style={{ fontSize: 10, color: meta.color, flexShrink: 0, fontWeight: 600 }}>
                {meta.label}
              </span>
              {entry.detail && (
                <span style={{ fontSize: 10, color: 'var(--muted-hi)', wordBreak: 'break-all' }}>
                  {entry.detail}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── P&L não realizado ─────────────────────────────────────────
// Calcula o ganho/perda atual em dólar e % para posições abertas.
// Usa a mesma lógica do stepPosition: rUnits × riskAmount.
// Se risk_amount não estiver disponível, exibe só o % de preço.
function calcUnrealizedPnl(trade: Trade, currentPrice: number) {
  const dir      = trade.signal === 'LONG' ? 1 : -1;
  const entry    = trade.entry_price;
  const pricePct = ((currentPrice - entry) / entry) * dir * 100;

  // Cálculo em dólar via R-units (mais preciso que % simples)
  const rd          = Math.abs(entry - trade.stop_price);
  const riskAmount  = trade.risk_amount ?? 0;
  const rUnits      = rd > 0 ? ((currentPrice - entry) * dir) / rd : 0;
  const dollarPnl   = riskAmount > 0 ? rUnits * riskAmount : null;

  return { pricePct, dollarPnl };
}

function TradeCard({ trade, currentPrice }: { trade: Trade; currentPrice?: number }) {
  const isLong   = trade.signal === 'LONG';
  const isClosed = trade.status !== 'OPEN';
  const pnl      = trade.profit_usd ?? 0;

  // P&L não realizado (só para posições abertas com preço disponível)
  const unrealized = !isClosed && currentPrice
    ? calcUnrealizedPnl(trade, currentPrice)
    : null;
  const unrealColor = unrealized
    ? (unrealized.pricePct >= 0 ? 'var(--green)' : 'var(--red)')
    : undefined;

  return (
    <div className={`dash-trade-card2 ${isLong ? 'long' : 'short'}`}>
      <div className="dash-tc-head">
        <div className="dash-tc-left">
          {isLong
            ? <TrendingUp  size={16} style={{ color: 'var(--green)', flexShrink: 0 }} />
            : <TrendingDown size={16} style={{ color: 'var(--red)',   flexShrink: 0 }} />}
          <span className="dash-tc-symbol">{trade.symbol}</span>
          <span className="dash-tc-dir" style={{ color: isLong ? 'var(--green)' : 'var(--red)' }}>
            {trade.signal}
          </span>
          <StatusBadge status={trade.status} />
          {trade.btc_regime === 'RISK_OFF' && <span className="dash-risk-off-tag">RISK_OFF</span>}
        </div>
        <div className="dash-tc-right">
          {/* P&L realizado (trade fechado) */}
          {isClosed && (
            <span className="dash-tc-pnl" style={{ color: pnl >= 0 ? 'var(--green)' : 'var(--red)' }}>
              {pnl >= 0 ? '+' : ''}{fmtUSD(pnl)}
            </span>
          )}
          {/* P&L não realizado (trade aberto) */}
          {unrealized && (
            <span className="dash-tc-pnl" style={{ color: unrealColor }}>
              {unrealized.dollarPnl !== null
                ? `${unrealized.dollarPnl >= 0 ? '+' : ''}$${Math.abs(unrealized.dollarPnl).toFixed(2)}`
                : ''}
              <span style={{ fontSize: 10, marginLeft: 4, opacity: 0.8 }}>
                ({unrealized.pricePct >= 0 ? '+' : ''}{unrealized.pricePct.toFixed(2)}%)
              </span>
            </span>
          )}
          <span className="dash-tc-interval">{trade.interval}</span>
        </div>
      </div>

      <div className="dash-tc-data">
        <div className="dash-tc-cell">
          <div className="dash-tc-cell-lbl">Entrada</div>
          <div className="dash-tc-cell-val">${fmt(trade.entry_price, 4)}</div>
        </div>
        <div className="dash-tc-cell">
          <div className="dash-tc-cell-lbl">Stop</div>
          <div className="dash-tc-cell-val" style={{ color: 'var(--red)' }}>${fmt(trade.stop_price, 4)}</div>
        </div>
        <div className="dash-tc-cell">
          <div className="dash-tc-cell-lbl">TP3</div>
          <div className="dash-tc-cell-val" style={{ color: 'var(--green)' }}>${fmt(trade.tp3_price, 4)}</div>
        </div>
        {/* Preço atual para posições abertas */}
        {!isClosed && currentPrice && (
          <div className="dash-tc-cell">
            <div className="dash-tc-cell-lbl">Atual</div>
            <div className="dash-tc-cell-val" style={{ color: unrealColor }}>
              ${fmt(currentPrice, 4)}
            </div>
          </div>
        )}
        {isClosed && trade.exit_price && (
          <div className="dash-tc-cell">
            <div className="dash-tc-cell-lbl">Saída</div>
            <div className="dash-tc-cell-val">${fmt(trade.exit_price, 4)}</div>
          </div>
        )}
        <div className="dash-tc-cell">
          <div className="dash-tc-cell-lbl">ADX</div>
          <AdxBar adx={trade.adx ?? 0} />
        </div>
        <div className="dash-tc-cell">
          <div className="dash-tc-cell-lbl">Volume</div>
          <div className="dash-tc-cell-val" style={{ color: trade.volume_ratio >= 1 ? 'var(--green)' : 'var(--muted)' }}>
            {(trade.volume_ratio ?? 0).toFixed(2)}x
          </div>
        </div>
      </div>

      {/* Log de vida da posição */}
      <PositionLog notes={trade.notes} />

      <div className="dash-tc-footer">
        <span>L{trade.votes_long}/{trade.votes_short}S{trade.exit_reason && ` \xb7 ${trade.exit_reason}`}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span>{fmtDate(trade.opened_at)}</span>
          <Link
            href={`/trading/live-demo/${trade.id}`}
            style={{ fontSize: 10, color: 'var(--blue)', textDecoration: 'none', opacity: 0.8 }}
          >
            detalhes →
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function LiveDemoPage() {
  const [trades,     setTrades]     = useState<Trade[]>([]);
  const [analytics,  setAnalytics]  = useState<Analytics[]>([]);
  const [summary,    setSummary]    = useState<Summary | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [tab,        setTab]        = useState<'trades' | 'scanner' | 'compare' | 'equity' | 'stats'>('trades');
  // Mapa symbol → preço atual ao vivo (atualizado a cada 30s)
  const [livePrices, setLivePrices] = useState<Record<string, number>>({});
  // Alertas de posição fechada
  const [alerts,       setAlerts]       = useState<AlertItem[]>([]);
  const [unreadCount,  setUnreadCount]  = useState(0);
  const [showAlerts,   setShowAlerts]   = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);
  // Backtest vs Live comparison
  const [compareSymbol, setCompareSymbol] = useState('BTCUSDT');
  const [btResult,      setBtResult]      = useState<BacktestCompareResult | null>(null);
  const [btLoading,     setBtLoading]     = useState(false);
  const [btError,       setBtError]       = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true); setError('');
      const res  = await fetch('/trading/api/live-demo?limit=100');
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setTrades(data.trades ?? []);
      setAnalytics(data.analytics ?? []);
      setSummary(data.summary);
      setLastUpdate(new Date());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar dados');
    } finally { setLoading(false); }
  }, []);

  // Busca preços ao vivo para todas as posições abertas
  const fetchLivePrices = useCallback(async (openTrades: Trade[]) => {
    if (openTrades.length === 0) return;
    // Deduplicar símbolos (ex: 2 posições no mesmo ativo → 1 chamada)
    const symbols = [...new Set(openTrades.map(t => t.symbol))];
    const results: Record<string, number> = {};
    await Promise.allSettled(
      symbols.map(async (symbol) => {
        try {
          const res  = await fetch(`/trading/api/price?symbol=${symbol}`);
          const data = await res.json();
          if (data.price) results[symbol] = parseFloat(data.price);
        } catch { /* silenciado — preço não crítico */ }
      })
    );
    setLivePrices(prev => ({ ...prev, ...results }));
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [load]);

  // Atualiza preços ao vivo a cada 30 segundos
  useEffect(() => {
    const open = trades.filter(t => t.status === 'OPEN');
    if (open.length === 0) return;
    fetchLivePrices(open);
    const id = setInterval(() => fetchLivePrices(open), 30_000);
    return () => clearInterval(id);
  }, [trades, fetchLivePrices]);

  const fetchAlerts = useCallback(async () => {
    try {
      const res  = await fetch('/trading/api/alerts?limit=20');
      const data = await res.json();
      if (!res.ok) return;
      setAlerts(data.alerts ?? []);
      setUnreadCount(data.unreadCount ?? 0);
    } catch { /* silenciado */ }
  }, []);

  const markAllRead = useCallback(async () => {
    try {
      await fetch('/trading/api/alerts', { method: 'PATCH' });
      setUnreadCount(0);
      setAlerts(prev => prev.map(a => ({ ...a, status: 'read' as const })));
    } catch { /* silenciado */ }
  }, []);

  // Fecha dropdown ao clicar fora
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setShowAlerts(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Busca alertas na carga e a cada 60s
  useEffect(() => {
    fetchAlerts();
    const id = setInterval(fetchAlerts, 60_000);
    return () => clearInterval(id);
  }, [fetchAlerts]);

  const runCompare = async () => {
    setBtLoading(true); setBtError(''); setBtResult(null);
    try {
      const res  = await fetch('/trading/api/backtest', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ ...COMPARE_BT_PARAMS, symbol: compareSymbol }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setBtResult(data as BacktestCompareResult);
    } catch (e: unknown) {
      setBtError(e instanceof Error ? e.message : 'Erro ao rodar backtest');
    } finally { setBtLoading(false); }
  };

  const openTrades   = trades.filter(t => t.status === 'OPEN');
  const closedTrades = trades.filter(t => t.status !== 'OPEN');

  return (
    <div className="dash-root">

      {/* Metric strip */}
      {summary && (
        <div className="dash-metrics">
          <div className="dash-metric">
            <span className="dash-metric-label">Total Trades</span>
            <span className="dash-metric-val">{summary.totalTrades}</span>
          </div>
          <div className="dash-metric">
            <span className="dash-metric-label">Abertas</span>
            <span className="dash-metric-val amber">{summary.openTrades}</span>
          </div>
          <div className="dash-metric">
            <span className="dash-metric-label">Fechados</span>
            <span className="dash-metric-val">{summary.closedTrades}</span>
          </div>
          <div className="dash-metric">
            <span className="dash-metric-label">Wins</span>
            <span className="dash-metric-val green">{summary.wins}</span>
          </div>
          <div className="dash-metric">
            <span className="dash-metric-label">Losses</span>
            <span className="dash-metric-val red">{summary.losses}</span>
          </div>
          <div className="dash-metric">
            <span className="dash-metric-label">Win Rate</span>
            <span className={`dash-metric-val ${summary.winRatePct >= 50 ? 'green' : 'red'}`}>
              {summary.winRatePct}%
            </span>
          </div>
          <div className="dash-metric" style={{ borderRight: 'none' }}>
            <span className="dash-metric-label">P&amp;L Total</span>
            <span className={`dash-metric-val ${summary.totalPnlUsd >= 0 ? 'green' : 'red'}`}>
              {summary.totalPnlUsd >= 0 ? '+' : '-'}{fmtUSD(summary.totalPnlUsd)}
            </span>
          </div>
        </div>
      )}

      {/* Page header */}
      <div className="dash-page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Link href="/trading/dashboard" className="dash-breadcrumb">
            <ChevronLeft size={12} /> Dashboard
          </Link>
          <div className="dash-page-title">
            <Bot size={13} /> Live Demo
          </div>
          <span className="dash-live-badge">
            <span className="dash-live-dot" /> AO VIVO
          </span>
        </div>
        <div className="dash-page-actions">
          {lastUpdate && (
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>
              Atualizado {lastUpdate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button onClick={load} disabled={loading} className="dash-icon-btn" title="Atualizar">
            <RefreshCw size={13} style={loading ? { animation: 'dash-spin 1s linear infinite' } : {}} />
          </button>

          {/* Bell — alertas de posição fechada */}
          <div ref={bellRef} style={{ position: 'relative' }}>
            <button
              className="dash-icon-btn"
              title="Alertas"
              onClick={() => {
                const opening = !showAlerts;
                setShowAlerts(opening);
                if (opening && unreadCount > 0) markAllRead();
              }}
              style={{ position: 'relative' }}
            >
              <Bell size={13} />
              {unreadCount > 0 && (
                <span style={{
                  position: 'absolute', top: -4, right: -4,
                  minWidth: 14, height: 14, borderRadius: 7,
                  background: '#ef4444', color: '#fff',
                  fontSize: 9, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: '0 3px', lineHeight: 1, pointerEvents: 'none',
                }}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {showAlerts && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 8px)', right: 0,
                width: 320, maxHeight: 400,
                background: 'var(--card)', border: '1px solid var(--border)',
                borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
                zIndex: 999, overflow: 'hidden', display: 'flex', flexDirection: 'column',
              }}>
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 14px', borderBottom: '1px solid var(--border)',
                }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>
                    Alertas recentes
                  </span>
                  {alerts.some(a => a.status === 'unread') && (
                    <button onClick={markAllRead} style={{
                      fontSize: 10, color: 'var(--blue)', background: 'none',
                      border: 'none', cursor: 'pointer', padding: 0,
                    }}>
                      Marcar todos lidos
                    </button>
                  )}
                </div>
                <div style={{ overflowY: 'auto', flex: 1 }}>
                  {alerts.length === 0 ? (
                    <div style={{ padding: '24px 16px', textAlign: 'center', fontSize: 12, color: 'var(--muted)' }}>
                      Nenhum alerta ainda.<br />
                      <span style={{ fontSize: 10, opacity: 0.6 }}>Aparecem ao fechar posições.</span>
                    </div>
                  ) : alerts.map(alert => {
                    const pnl   = alert.pnl_usd ?? 0;
                    const isWin = pnl >= 0;
                    const isNew = alert.status === 'unread';
                    return (
                      <div key={alert.id} style={{
                        padding: '9px 14px', borderBottom: '1px solid var(--border)',
                        background: isNew ? 'rgba(96,165,250,0.05)' : 'transparent',
                        display: 'flex', flexDirection: 'column', gap: 3,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {isNew && (
                            <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#60a5fa', flexShrink: 0 }} />
                          )}
                          <span style={{ fontSize: 11, fontWeight: 600, color: isWin ? 'var(--green)' : 'var(--red)', flex: 1 }}>
                            {alert.symbol}{alert.signal ? ` ${alert.signal}` : ''}
                            {' '}
                            <span style={{ fontFamily: 'var(--mono)' }}>
                              {pnl >= 0 ? '+' : ''}${Math.abs(pnl).toFixed(2)}
                            </span>
                          </span>
                          <span style={{ fontSize: 9, color: 'var(--muted)', flexShrink: 0 }}>
                            {timeAgo(alert.created_at)}
                          </span>
                        </div>
                        <span style={{ fontSize: 10, color: 'var(--muted-hi)', paddingLeft: isNew ? 11 : 0 }}>
                          {alert.message}
                        </span>
                        {alert.trade_id && (
                          <Link
                            href={`/trading/live-demo/${alert.trade_id}`}
                            style={{ fontSize: 10, color: 'var(--blue)', paddingLeft: isNew ? 11 : 0, textDecoration: 'none' }}
                            onClick={() => setShowAlerts(false)}
                          >
                            Ver detalhes →
                          </Link>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tab pills */}
      <div className="dash-tab-pills">
        <button onClick={() => setTab('trades')}  className={`dash-tab-pill${tab === 'trades'  ? ' active' : ''}`}>
          Trades ({trades.length})
        </button>
        <button onClick={() => setTab('scanner')} className={`dash-tab-pill${tab === 'scanner' ? ' active' : ''}`}>
          Scanner ({analytics.length})
        </button>
        <button onClick={() => setTab('compare')} className={`dash-tab-pill${tab === 'compare' ? ' active' : ''}`}>
          Backtest vs Live
        </button>
        <button onClick={() => setTab('equity')} className={`dash-tab-pill${tab === 'equity' ? ' active' : ''}`}>
          Equity Curve
        </button>
        <button onClick={() => setTab('stats')} className={`dash-tab-pill${tab === 'stats' ? ' active' : ''}`}>
          Performance
        </button>
      </div>

      {/* Body */}
      <div className="dash-live-body2">
        <div className="dash-live-inner">

          {error && <div className="dash-error-banner">{error}</div>}

          {/* Tab: Trades */}
          {tab === 'trades' && (
            <>
              {openTrades.length > 0 && (
                <div>
                  <SectionHead
                    icon={<Wifi size={11} style={{ color: 'var(--blue)' }} />}
                    label="Posições Abertas"
                    count={openTrades.length}
                    dotColor="var(--blue)"
                  />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {openTrades.map(trade => (
                      <TradeCard
                        key={trade.id}
                        trade={trade}
                        currentPrice={livePrices[trade.symbol]}
                      />
                    ))}
                  </div>
                </div>
              )}

              <div>
                <SectionHead
                  icon={<Clock size={11} />}
                  label="Histórico"
                  count={closedTrades.length}
                />
                {closedTrades.length === 0 ? (
                  <div className="dash-tc-empty">
                    <Bot size={24} style={{ opacity: 0.25 }} />
                    <p>Nenhum trade fechado ainda.</p>
                    <p style={{ opacity: 0.5 }}>O bot está monitorando o mercado...</p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {closedTrades.map(trade => <TradeCard key={trade.id} trade={trade} />)}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Tab: Scanner */}
          {tab === 'scanner' && (
            <div>
              {summary?.lastScanAt && (
                <p className="dash-scanner-note" style={{ marginBottom: 12 }}>
                  Última varredura: {fmtDate(summary.lastScanAt)}
                </p>
              )}
              {analytics.length === 0 ? (
                <div className="dash-tc-empty">
                  <BarChart2 size={24} style={{ opacity: 0.25 }} />
                  <p>Nenhum dado de scanner ainda.</p>
                  <p style={{ opacity: 0.5 }}>O scanner roda a cada 4 horas.</p>
                </div>
              ) : (
                <div className="dash-scanner-wrap">
                  <table className="dash-table">
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left' }}>Ativo</th>
                        <th style={{ textAlign: 'right' }}>Preço</th>
                        <th style={{ textAlign: 'center' }}>Tendência</th>
                        <th style={{ textAlign: 'center' }}>ADX</th>
                        <th style={{ textAlign: 'right' }}>RSI</th>
                        <th style={{ textAlign: 'right' }}>Vol</th>
                        <th style={{ textAlign: 'center' }}>Sinal</th>
                        <th style={{ textAlign: 'right' }}>EMA200 Δ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analytics.map((a, i) => (
                        <tr key={i}>
                          <td style={{ fontWeight: 600 }}>{a.symbol}</td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 11 }}>{fmt(a.price, 4)}</td>
                          <td style={{ textAlign: 'center' }}>
                            {a.trend === 'BULLISH'
                              ? <span style={{ color: 'var(--green)', fontSize: 11 }}>▲ Alta</span>
                              : <span style={{ color: 'var(--red)',   fontSize: 11 }}>▼ Baixa</span>}
                          </td>
                          <td><AdxBar adx={a.adx} /></td>
                          <td style={{ textAlign: 'right' }}>
                            <span style={{ color: a.rsi < 30 ? 'var(--green)' : a.rsi > 70 ? 'var(--red)' : 'var(--muted-hi)' }}>
                              {a.rsi?.toFixed(1)}
                            </span>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <span style={{ color: a.volume_ratio >= 1 ? 'var(--green)' : 'var(--muted)' }}>
                              {a.volume_ratio?.toFixed(2)}x
                            </span>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            {a.signal === 'LONG'    && <span style={{ color: 'var(--green)', fontSize: 11, fontWeight: 700 }}>▲ LONG</span>}
                            {a.signal === 'SHORT'   && <span style={{ color: 'var(--red)',   fontSize: 11, fontWeight: 700 }}>▼ SHORT</span>}
                            {a.signal === 'NEUTRAL' && <span style={{ color: 'var(--muted)', fontSize: 11 }}>—</span>}
                          </td>
                          <td style={{ textAlign: 'right', fontSize: 11, color: (a.pct_from_ema200 ?? 0) >= 0 ? 'var(--green)' : 'var(--red)' }}>
                            {fmtPct(a.pct_from_ema200 ?? 0)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Tab: Performance Stats */}
          {tab === 'stats' && (
            <div>
              <SectionHead
                icon={<Zap size={11} style={{ color: '#f59e0b' }} />}
                label="Estatísticas de Performance"
                count={trades.filter(t => t.status !== 'OPEN').length}
              />
              <PerformanceStats trades={trades} />
            </div>
          )}

          {/* Tab: Equity Curve */}
          {tab === 'equity' && (
            <div>
              <SectionHead
                icon={<Activity size={11} style={{ color: 'var(--green)' }} />}
                label="Evolução do Saldo"
                count={trades.filter(t => t.status !== 'OPEN').length}
              />
              <EquityCurve trades={trades} />
            </div>
          )}

          {/* Tab: Backtest vs Live */}
          {tab === 'compare' && (() => {
            const live = calcLiveMetrics(trades, compareSymbol);
            const bt   = btResult;
            const lowSample = live.totalTrades < 5;
            return (
              <div>
                {/* Controles */}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
                  <select
                    value={compareSymbol}
                    onChange={e => { setCompareSymbol(e.target.value); setBtResult(null); }}
                    style={{
                      background: 'var(--card)', border: '1px solid var(--border)',
                      color: 'var(--text)', borderRadius: 6, padding: '6px 10px',
                      fontSize: 12, fontFamily: 'var(--mono)',
                    }}
                  >
                    {PORTFOLIO.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <button
                    onClick={runCompare}
                    disabled={btLoading}
                    className="dash-icon-btn"
                    style={{ padding: '6px 14px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}
                  >
                    {btLoading
                      ? <><RefreshCw size={12} style={{ animation: 'dash-spin 1s linear infinite' }} /> Rodando...</>
                      : <><BarChart2 size={12} /> Rodar Backtest</>}
                  </button>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                    500 candles · 4h · mesma config do scanner
                  </span>
                </div>

                {btError && <div className="dash-error-banner">{btError}</div>}

                {lowSample && live.totalTrades > 0 && (
                  <div style={{
                    background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)',
                    borderRadius: 6, padding: '8px 12px', fontSize: 11, color: '#f59e0b', marginBottom: 12,
                  }}>
                    ⚠️ Apenas {live.totalTrades} trade(s) ao vivo para {compareSymbol} — amostra pequena, comparação estatística limitada.
                  </div>
                )}

                {!bt && !btLoading && (
                  <div className="dash-tc-empty" style={{ paddingTop: 32 }}>
                    <BarChart2 size={28} style={{ opacity: 0.2 }} />
                    <p>Selecione um ativo e clique em &quot;Rodar Backtest&quot;</p>
                    <p style={{ opacity: 0.5, fontSize: 11 }}>O backtest usa os mesmos parâmetros do scanner ao vivo</p>
                  </div>
                )}

                {bt && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {/* Cabeçalho da tabela */}
                    <div style={{
                      display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
                      background: 'var(--card)', border: '1px solid var(--border)',
                      borderRadius: '6px 6px 0 0', borderBottom: 'none', overflow: 'hidden',
                    }}>
                      <div style={{ padding: '10px 14px', fontSize: 11, color: 'var(--muted)', fontWeight: 700 }}>MÉTRICA</div>
                      <div style={{ padding: '10px 14px', textAlign: 'right', fontSize: 11, color: '#60a5fa', fontWeight: 700, borderLeft: '1px solid var(--border)' }}>
                        📊 BACKTEST ({bt.symbol})
                      </div>
                      <div style={{ padding: '10px 14px', textAlign: 'right', fontSize: 11, color: '#34d399', fontWeight: 700, borderLeft: '1px solid var(--border)' }}>
                        🤖 LIVE DEMO
                      </div>
                    </div>

                    {/* Corpo da tabela */}
                    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '0 0 6px 6px', overflow: 'hidden', marginTop: -12 }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <colgroup>
                          <col style={{ width: '40%' }} />
                          <col style={{ width: '30%' }} />
                          <col style={{ width: '30%' }} />
                        </colgroup>
                        <tbody>
                          {/* Linha sem comparação: trades fechados */}
                          <tr style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '9px 14px', color: 'var(--muted)', fontSize: 12 }}>Trades Fechados</td>
                            <td style={{ padding: '9px 14px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--muted-hi)', borderLeft: '1px solid var(--border)' }}>{bt.totalTrades}</td>
                            <td style={{ padding: '9px 14px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--muted-hi)', borderLeft: '1px solid var(--border)' }}>{live.totalTrades}</td>
                          </tr>
                          {[
                            { label: 'Win Rate',          btV: bt.winRate,      liveV: live.winRate,      f: (n: number) => `${n.toFixed(1)}%`, higher: true  },
                            { label: 'Avg Win',           btV: bt.avgWin,       liveV: live.avgWin,       f: (n: number) => `$${n.toFixed(2)}`, higher: true  },
                            { label: 'Avg Loss',          btV: bt.avgLoss,      liveV: live.avgLoss,      f: (n: number) => `$${n.toFixed(2)}`, higher: false },
                            { label: 'Profit Factor',     btV: bt.profitFactor, liveV: live.profitFactor, f: (n: number) => n.toFixed(2),       higher: true  },
                            { label: 'Sharpe Ratio',      btV: bt.sharpeRatio,  liveV: live.sharpeRatio,  f: (n: number) => n.toFixed(2),       higher: true  },
                            { label: 'Expectativa/trade', btV: bt.expectancy,   liveV: live.expectancy,   f: (n: number) => `$${n.toFixed(2)}`, higher: true  },
                            { label: 'Net P&L',           btV: bt.netProfit,    liveV: live.netPnl,       f: (n: number) => `${n >= 0 ? '+' : ''}$${Math.abs(n).toFixed(2)}`, higher: true },
                            { label: 'Max Drawdown',      btV: bt.maxDrawdown,  liveV: null,              f: (n: number) => `${n.toFixed(1)}%`, higher: false },
                          ].map((row, i) => {
                            const hasLive    = row.liveV !== null && live.totalTrades > 0;
                            const btBetter   = hasLive ? (row.higher ? row.btV > row.liveV! : row.btV < row.liveV!) : false;
                            const liveBetter = hasLive ? (row.higher ? row.liveV! > row.btV : row.liveV! < row.btV) : false;
                            return (
                              <tr key={i} style={{ borderBottom: i < 7 ? '1px solid var(--border)' : 'none' }}>
                                <td style={{ padding: '9px 14px', color: 'var(--muted)', fontSize: 12 }}>{row.label}</td>
                                <td style={{
                                  padding: '9px 14px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600,
                                  borderLeft: '1px solid var(--border)',
                                  color: !hasLive ? 'var(--muted-hi)' : btBetter ? 'var(--green)' : liveBetter ? 'var(--red)' : 'var(--muted-hi)',
                                }}>
                                  {row.f(row.btV)}
                                </td>
                                <td style={{
                                  padding: '9px 14px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600,
                                  borderLeft: '1px solid var(--border)',
                                  color: row.liveV === null ? 'var(--muted)' : !hasLive ? 'var(--muted-hi)' : liveBetter ? 'var(--green)' : btBetter ? 'var(--red)' : 'var(--muted-hi)',
                                }}>
                                  {row.liveV !== null && live.totalTrades > 0 ? row.f(row.liveV) : '—'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    <p style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.6, margin: 0 }}>
                      Verde = melhor valor. Max Drawdown só disponível no backtest (precisa de curva histórica).
                      Sharpe ao vivo é aproximação (retornos por trade, não por dia).
                    </p>
                  </div>
                )}
              </div>
            );
          })()}

        </div>
      </div>
    </div>
  );
}
