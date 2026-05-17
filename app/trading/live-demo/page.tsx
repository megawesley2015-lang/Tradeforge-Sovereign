"use client";
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  ChevronLeft, RefreshCw, TrendingUp, TrendingDown,
  Activity, BarChart2, Clock, CheckCircle2, Bot, Wifi,
} from 'lucide-react';
import '@/components/dashboard/dashboard.css';

// ─── Tipos ───────────────────────────────────────────────────

interface Trade {
  id:             string;
  symbol:         string;
  signal:         'LONG' | 'SHORT';
  entry_price:    number;
  stop_price:     number;
  tp1_price:      number;
  tp3_price:      number;
  exit_price?:    number;
  profit_usd?:    number;
  profit_pct?:    number;
  status:         string;
  exit_reason?:   string;
  interval:       string;
  adx:            number;
  volume_ratio:   number;
  votes_long:     number;
  votes_short:    number;
  btc_regime:     string;
  balance_before: number;
  balance_after?: number;
  opened_at:      string;
  closed_at?:     string;
}

interface Analytics {
  symbol:          string;
  price:           number;
  trend:           'BULLISH' | 'BEARISH';
  adx:             number;
  adx_strength:    string;
  rsi:             number;
  volume_ratio:    number;
  signal:          string;
  votes_long:      number;
  votes_short:     number;
  pct_from_ema200: number;
  market_type:     string;
  analyzed_at:     string;
}

interface Summary {
  totalTrades:  number;
  openTrades:   number;
  closedTrades: number;
  wins:         number;
  losses:       number;
  winRatePct:   number;
  totalPnlUsd:  number;
  lastScanAt:   string | null;
}

// ─── Helpers ─────────────────────────────────────────────────

const fmt    = (n: number, d = 4) => n?.toFixed(d) ?? '—';
const fmtUSD = (n: number)        => `$${Math.abs(n).toFixed(2)}`;
const fmtPct = (n: number)        => `${n >= 0 ? '+' : ''}${n?.toFixed(1)}%`;
const fmtDate = (s: string)       => new Date(s).toLocaleString('pt-BR', {
  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
});

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: string }> = {
    OPEN:        { label: 'Aberta',    variant: 'open'  },
    CLOSED_WIN:  { label: 'Win ✓',    variant: 'win'   },
    CLOSED_LOSS: { label: 'Loss ✗',   variant: 'loss'  },
    CLOSED_TIME: { label: 'Tempo',    variant: 'time'  },
    CLOSED_EOD:  { label: 'Fim Dados', variant: 'other' },
  };
  const { label, variant } = map[status] ?? { label: status, variant: 'other' };
  return (
    <span className={`dash-trade-status-badge ${variant}`}>{label}</span>
  );
}

function AdxBar({ adx }: { adx: number }) {
  const color = adx > 40 ? 'var(--green)' : adx > 25 ? 'var(--amber)' : adx > 20 ? '#94a3b8' : '#475569';
  return (
    <div className="dash-adx-bar">
      <div className="dash-adx-track">
        <div
          className="dash-adx-fill"
          style={{ width: `${Math.min(adx, 100)}%`, background: color }}
        />
      </div>
      <span style={{ color, fontSize: 10 }}>{adx?.toFixed(0)}</span>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────

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
      setLoading(true);
      setError('');
      const res  = await fetch('/trading/api/live-demo?limit=100');
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setTrades(data.trades      ?? []);
      setAnalytics(data.analytics ?? []);
      setSummary(data.summary);
      setLastUpdate(new Date());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
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

      {/* ─── METRIC STRIP ─── */}
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

      {/* ─── INNER HEADER ─── */}
      <div className="dash-page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Link href="/trading/dashboard" className="dash-breadcrumb">
            <ChevronLeft size={12} /> Dashboard
          </Link>
          <div className="dash-page-title">
            <Bot size={13} /> Live Demo
          </div>
          <span className="dash-live-badge">
            <span className="dash-live-dot" />
            AO VIVO
          </span>
        </div>

        <div className="dash-page-actions">
          {lastUpdate && (
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>
              Atualizado {lastUpdate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button
            onClick={load}
            disabled={loading}
            className="dash-icon-btn"
            title="Atualizar"
          >
            <RefreshCw size={13} style={loading ? { animation: 'dash-spin 1s linear infinite' } : {}} />
          </button>
        </div>
      </div>

      {/* ─── BODY ─── */}
      <div className="dash-live-body">

        {/* Error banner */}
        {error && (
          <div className="dash-error-banner">{error}</div>
        )}

        {/* Tab bar */}
        <div className="dash-tab-bar">
          {(['trades', 'scanner'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`dash-tab-btn${tab === t ? ' active' : ''}`}
            >
              {t === 'trades'
                ? `Trades (${trades.length})`
                : `Scanner (${analytics.length})`}
            </button>
          ))}
        </div>

        {/* ── Tab: Trades ─────────────────────────────────── */}
        {tab === 'trades' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

            {/* Posições abertas */}
            {openTrades.length > 0 && (
              <div>
                <div className="dash-section-head">
                  <Wifi size={11} style={{ color: 'var(--blue)' }} />
                  Posições Abertas ({openTrades.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {openTrades.map(trade => (
                    <TradeCard key={trade.id} trade={trade} />
                  ))}
                </div>
              </div>
            )}

            {/* Histórico */}
            <div>
              <div className="dash-section-head">
                <Clock size={11} />
                Histórico ({closedTrades.length})
              </div>
              {closedTrades.length === 0 ? (
                <div className="dash-live-empty">
                  <Bot size={28} style={{ opacity: 0.3 }} />
                  <p>Nenhum trade fechado ainda.</p>
                  <p style={{ opacity: 0.5 }}>O bot está monitorando o mercado...</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {closedTrades.map(trade => (
                    <TradeCard key={trade.id} trade={trade} />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Tab: Scanner ──────────────────────────────── */}
        {tab === 'scanner' && (
          <div>
            {summary?.lastScanAt && (
              <p className="dash-scanner-note">
                Última varredura: {fmtDate(summary.lastScanAt)}
              </p>
            )}
            {analytics.length === 0 ? (
              <div className="dash-live-empty">
                <BarChart2 size={28} style={{ opacity: 0.3 }} />
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
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 11 }}>
                          {fmt(a.price, 4)}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {a.trend === 'BULLISH'
                            ? <span style={{ color: 'var(--green)', fontSize: 11 }}>▲ Alta</span>
                            : <span style={{ color: 'var(--red)', fontSize: 11 }}>▼ Baixa</span>}
                        </td>
                        <td><AdxBar adx={a.adx} /></td>
                        <td style={{ textAlign: 'right' }}>
                          <span style={{
                            color: a.rsi < 30 ? 'var(--green)' : a.rsi > 70 ? 'var(--red)' : 'var(--muted-hi)',
                          }}>
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
                        <td style={{
                          textAlign: 'right', fontSize: 11,
                          color: (a.pct_from_ema200 ?? 0) >= 0 ? 'var(--green)' : 'var(--red)',
                        }}>
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

// ─── TradeCard ────────────────────────────────────────────────

function TradeCard({ trade }: { trade: Trade }) {
  const isLong   = trade.signal === 'LONG';
  const isClosed = trade.status !== 'OPEN';
  const pnl      = trade.profit_usd ?? 0;

  return (
    <div className={`dash-trade-card ${isLong ? 'long' : 'short'}`}>

      {/* Head */}
      <div className="dash-trade-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {isLong
            ? <TrendingUp  size={15} style={{ color: 'var(--green)' }} />
            : <TrendingDown size={15} style={{ color: 'var(--red)' }} />}
          <span className="dash-trade-symbol">{trade.symbol}</span>
          <span className={`dash-trade-signal ${isLong ? 'long' : 'short'}`}>{trade.signal}</span>
          <StatusBadge status={trade.status} />
          {trade.btc_regime === 'RISK_OFF' && (
            <span className="dash-risk-off-tag">RISK_OFF</span>
          )}
        </div>
        <div style={{ textAlign: 'right' }}>
          {isClosed && (
            <div className={`dash-trade-pnl ${pnl >= 0 ? 'win' : 'loss'}`}>
              {pnl >= 0 ? '+' : ''}{fmtUSD(pnl)}
            </div>
          )}
          <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{trade.interval}</div>
        </div>
      </div>

      {/* Data grid */}
      <div className="dash-trade-data">
        <div>
          <span className="dash-trade-data-label">Entrada</span>
          <span className="dash-trade-data-val">${fmt(trade.entry_price, 4)}</span>
        </div>
        <div>
          <span className="dash-trade-data-label">Stop</span>
          <span className="dash-trade-data-val" style={{ color: 'var(--red)' }}>${fmt(trade.stop_price, 4)}</span>
        </div>
        <div>
          <span className="dash-trade-data-label">TP3</span>
          <span className="dash-trade-data-val" style={{ color: 'var(--green)' }}>${fmt(trade.tp3_price, 4)}</span>
        </div>
        {isClosed && trade.exit_price && (
          <div>
            <span className="dash-trade-data-label">Saída</span>
            <span className="dash-trade-data-val">${fmt(trade.exit_price, 4)}</span>
          </div>
        )}
        <div>
          <span className="dash-trade-data-label">ADX</span>
          <AdxBar adx={trade.adx ?? 0} />
        </div>
        <div>
          <span className="dash-trade-data-label">Volume</span>
          <span className="dash-trade-data-val" style={{
            color: trade.volume_ratio >= 1 ? 'var(--green)' : 'var(--muted)',
          }}>
            {(trade.volume_ratio ?? 0).toFixed(2)}x
          </span>
        </div>
      </div>

      {/* Footer */}
      <div className="dash-trade-footer">
        <span>
          L{trade.votes_long}/{trade.votes_short}S
          {trade.exit_reason && ` · ${trade.exit_reason}`}
        </span>
        <span>{fmtDate(trade.opened_at)}</span>
      </div>
    </div>
  );
}
