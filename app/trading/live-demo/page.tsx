"use client";
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  ChevronLeft, RefreshCw, TrendingUp, TrendingDown,
  BarChart2, Clock, Bot, Wifi,
} from 'lucide-react';
import '@/components/dashboard/dashboard.css';

interface Trade {
  id: string; symbol: string; signal: 'LONG' | 'SHORT';
  entry_price: number; stop_price: number; tp1_price: number; tp3_price: number;
  exit_price?: number; profit_usd?: number; profit_pct?: number;
  status: string; exit_reason?: string; interval: string;
  adx: number; volume_ratio: number; votes_long: number; votes_short: number;
  btc_regime: string; balance_before: number; balance_after?: number;
  opened_at: string; closed_at?: string;
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

const fmt     = (n: number, d = 4) => n?.toFixed(d) ?? '—';
const fmtUSD  = (n: number)        => `$${Math.abs(n).toFixed(2)}`;
const fmtPct  = (n: number)        => `${n >= 0 ? '+' : ''}${n?.toFixed(1)}%`;
const fmtDate = (s: string)        => new Date(s).toLocaleString('pt-BR', {
  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
});

const LBL: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 7, textTransform: 'uppercase',
  letterSpacing: '0.08em', color: 'var(--muted)', marginBottom: 3,
  display: 'block',
};
const VAL: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 500, color: 'var(--muted-hi)',
};

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
      <div style={{ width: 40, height: 3, background: 'var(--border)', borderRadius: 1, overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(adx, 100)}%`, height: '100%', background: color }} />
      </div>
      <span style={{ color, fontSize: 10, fontFamily: 'var(--mono)' }}>{adx?.toFixed(0)}</span>
    </div>
  );
}

function TradeCard({ trade }: { trade: Trade }) {
  const isLong   = trade.signal === 'LONG';
  const isClosed = trade.status !== 'OPEN';
  const pnl      = trade.profit_usd ?? 0;
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderLeft: `3px solid ${isLong ? 'var(--green)' : 'var(--red)'}`,
      borderRadius: 2, padding: '14px 16px', marginBottom: 6,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {isLong
            ? <TrendingUp  size={15} style={{ color: 'var(--green)' }} />
            : <TrendingDown size={15} style={{ color: 'var(--red)' }} />}
          <span style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 600 }}>{trade.symbol}</span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 600, letterSpacing: '0.08em', color: isLong ? 'var(--green)' : 'var(--red)' }}>
            {trade.signal}
          </span>
          <StatusBadge status={trade.status} />
          {trade.btc_regime === 'RISK_OFF' && <span className="dash-risk-off-tag">RISK_OFF</span>}
        </div>
        <div style={{ textAlign: 'right' }}>
          {isClosed && (
            <div style={{ fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 600, color: pnl >= 0 ? 'var(--green)' : 'var(--red)' }}>
              {pnl >= 0 ? '+' : ''}{fmtUSD(pnl)}
            </div>
          )}
          <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--muted)', marginTop: 2 }}>{trade.interval}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '8px 12px', marginBottom: 10 }}>
        <div>
          <span style={LBL}>Entrada</span>
          <span style={{ ...VAL, color: 'var(--text)' }}>${fmt(trade.entry_price, 4)}</span>
        </div>
        <div>
          <span style={LBL}>Stop</span>
          <span style={{ ...VAL, color: 'var(--red)' }}>${fmt(trade.stop_price, 4)}</span>
        </div>
        <div>
          <span style={LBL}>TP3</span>
          <span style={{ ...VAL, color: 'var(--green)' }}>${fmt(trade.tp3_price, 4)}</span>
        </div>
        {isClosed && trade.exit_price ? (
          <div>
            <span style={LBL}>Saída</span>
            <span style={VAL}>${fmt(trade.exit_price, 4)}</span>
          </div>
        ) : <div />}
        <div>
          <span style={LBL}>ADX</span>
          <AdxBar adx={trade.adx ?? 0} />
        </div>
        <div>
          <span style={LBL}>Volume</span>
          <span style={{ ...VAL, color: trade.volume_ratio >= 1 ? 'var(--green)' : 'var(--muted)' }}>
            {(trade.volume_ratio ?? 0).toFixed(2)}x
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--muted)', paddingTop: 8, borderTop: '1px solid var(--border)' }}>
        <span>L{trade.votes_long}/{trade.votes_short}S{trade.exit_reason && ` \xb7 ${trade.exit_reason}`}</span>
        <span>{fmtDate(trade.opened_at)}</span>
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
  const [tab,        setTab]        = useState<'trades' | 'scanner'>('trades');

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

  useEffect(() => {
    load();
    const id = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [load]);

  const openTrades   = trades.filter(t => t.status === 'OPEN');
  const closedTrades = trades.filter(t => t.status !== 'OPEN');

  return (
    <div className="dash-root">

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
            <span className={`dash-metric-val ${summary.winRatePct >= 50 ? 'green' : 'red'}`}>{summary.winRatePct}%</span>
          </div>
          <div className="dash-metric" style={{ borderRight: 'none' }}>
            <span className="dash-metric-label">P&amp;L Total</span>
            <span className={`dash-metric-val ${summary.totalPnlUsd >= 0 ? 'green' : 'red'}`}>
              {summary.totalPnlUsd >= 0 ? '+' : '-'}{fmtUSD(summary.totalPnlUsd)}
            </span>
          </div>
        </div>
      )}

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
        </div>
      </div>

      <div className="dash-tab-bar">
        {(['trades', 'scanner'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`dash-tab-btn${tab === t ? ' active' : ''}`}>
            {t === 'trades' ? `Trades (${trades.length})` : `Scanner (${analytics.length})`}
          </button>
        ))}
      </div>

      <div className="dash-live-body">
        {error && <div className="dash-error-banner">{error}</div>}

        {tab === 'trades' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {openTrades.length > 0 && (
              <div>
                <div className="dash-section-head">
                  <Wifi size={11} style={{ color: 'var(--blue)' }} />
                  Posições Abertas ({openTrades.length})
                </div>
                {openTrades.map(trade => <TradeCard key={trade.id} trade={trade} />)}
              </div>
            )}
            <div>
              <div className="dash-section-head">
                <Clock size={11} /> Histórico ({closedTrades.length})
              </div>
              {closedTrades.length === 0 ? (
                <div className="dash-live-empty">
                  <Bot size={28} />
                  <p>Nenhum trade fechado ainda.</p>
                  <p style={{ opacity: 0.5 }}>O bot está monitorando o mercado...</p>
                </div>
              ) : closedTrades.map(trade => <TradeCard key={trade.id} trade={trade} />)}
            </div>
          </div>
        )}

        {tab === 'scanner' && (
          <div>
            {summary?.lastScanAt && (
              <p className="dash-scanner-note">Última varredura: {fmtDate(summary.lastScanAt)}</p>
            )}
            {analytics.length === 0 ? (
              <div className="dash-live-empty">
                <BarChart2 size={28} />
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
                            : <span style={{ color: 'var(--red)', fontSize: 11 }}>▼ Baixa</span>}
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
      </div>
    </div>
  );
}
