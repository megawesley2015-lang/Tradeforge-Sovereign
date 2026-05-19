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
  risk_amount?: number;
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

      <div className="dash-tc-footer">
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
  // Mapa symbol → preço atual ao vivo (atualizado a cada 30s)
  const [livePrices, setLivePrices] = useState<Record<string, number>>({});

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
        </div>
      </div>

      {/* Tab pills */}
      <div className="dash-tab-pills">
        {(['trades', 'scanner'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`dash-tab-pill${tab === t ? ' active' : ''}`}>
            {t === 'trades' ? `Trades (${trades.length})` : `Scanner (${analytics.length})`}
          </button>
        ))}
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

        </div>
      </div>
    </div>
  );
}
