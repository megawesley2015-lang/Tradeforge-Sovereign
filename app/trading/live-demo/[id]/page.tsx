"use client";
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ChevronLeft, TrendingUp, TrendingDown, Bot, RefreshCw,
} from 'lucide-react';
import '@/components/dashboard/dashboard.css';

// ─── Types ───────────────────────────────────────────────────

interface Trade {
  id: string; symbol: string; signal: 'LONG' | 'SHORT';
  entry_price: number; stop_price: number;
  tp1_price: number; tp2_price: number; tp3_price: number;
  exit_price?: number; profit_usd?: number; profit_pct?: number;
  risk_amount?: number;
  status: string; exit_reason?: string; interval: string;
  adx: number; volume_ratio: number; votes_long: number; votes_short: number;
  btc_regime: string; balance_before: number; balance_after?: number;
  opened_at: string; closed_at?: string; candle_timestamp?: number;
  notes?: string;
}

interface Candle {
  timestamp: number;
  open: number; high: number; low: number; close: number;
  volume: number;
}

interface PosLogEntry {
  ts:      string;
  event:   'opened' | 'stepped' | 'stop_moved' | 'tp1_hit' | 'tp2_hit' | 'closed';
  detail?: string;
}

// ─── Helpers ─────────────────────────────────────────────────

const fmt     = (n: number, d = 4) => n?.toFixed(d) ?? '—';
const fmtUSD  = (n: number) => `${n >= 0 ? '+' : ''}$${Math.abs(n).toFixed(2)}`;
const fmtDate = (s: string) => new Date(s).toLocaleString('pt-BR', {
  day: '2-digit', month: '2-digit', year: '2-digit',
  hour: '2-digit', minute: '2-digit',
});

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 2)   return 'agora';
  if (m < 60)  return `há ${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `há ${h}h`;
  return `há ${Math.floor(h / 24)}d`;
}

function parseLog(notes?: string): PosLogEntry[] {
  try { return JSON.parse(notes ?? '{}')?.log ?? []; } catch { return []; }
}

// ─── Candlestick Chart ────────────────────────────────────────

const LOG_EVENT_META: Record<PosLogEntry['event'], { label: string; color: string }> = {
  opened:     { label: 'Aberta',      color: '#60a5fa' },
  stepped:    { label: 'Stepada',     color: '#6b7280' },
  stop_moved: { label: 'Stop movido', color: '#f59e0b' },
  tp1_hit:    { label: 'TP1 ✓',       color: '#34d399' },
  tp2_hit:    { label: 'TP2 ✓',       color: '#10b981' },
  closed:     { label: 'Fechada',     color: '#a78bfa' },
};

function CandleChart({
  candles, trade,
}: {
  candles: Candle[];
  trade: Trade;
}) {
  // Encontra o candle de entrada pelo timestamp
  const entryTs   = trade.candle_timestamp;
  const entryIdx  = entryTs
    ? candles.findIndex(c => Math.abs(c.timestamp - entryTs) < 1_000 * 3600 * 2)
    : -1;

  // Corta: 8 candles antes da entrada até o fim (ou max 60)
  const startIdx  = Math.max(0, entryIdx >= 0 ? entryIdx - 8 : candles.length - 50);
  const slice     = candles.slice(startIdx, startIdx + 60);

  if (slice.length === 0) return null;

  // Preços relevantes para o range do eixo Y
  const levels = [
    trade.entry_price, trade.stop_price,
    trade.tp1_price,   trade.tp2_price, trade.tp3_price,
    trade.exit_price,
  ].filter((v): v is number => v != null && v > 0);

  const allLows  = [...slice.map(c => c.low),  ...levels];
  const allHighs = [...slice.map(c => c.high), ...levels];
  const minP = Math.min(...allLows)  * 0.998;
  const maxP = Math.max(...allHighs) * 1.002;
  const range = maxP - minP || 1;

  const W = 560, H = 200;
  const padL = 58, padR = 14, padT = 10, padB = 24;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const toY = (p: number) => padT + plotH - ((p - minP) / range) * plotH;
  const cw   = Math.max(3, (plotW / slice.length) * 0.75);
  const step = plotW / slice.length;

  // Índice relativo do candle de entrada dentro do slice
  const relEntry = entryIdx >= 0 ? entryIdx - startIdx : -1;

  // Linhas de nível
  const levelLines = [
    { price: trade.entry_price, color: '#60a5fa', label: 'Entry',  dash: '4 2' },
    { price: trade.stop_price,  color: '#ef4444', label: 'Stop',   dash: '3 3' },
    { price: trade.tp1_price,   color: '#86efac', label: 'TP1',    dash: '3 3' },
    { price: trade.tp2_price,   color: '#4ade80', label: 'TP2',    dash: '3 3' },
    { price: trade.tp3_price,   color: '#22c55e', label: 'TP3',    dash: '3 3' },
    ...(trade.exit_price ? [{ price: trade.exit_price, color: '#a78bfa', label: 'Exit', dash: '4 2' }] : []),
  ];

  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }}>

        {/* Fundo do range de trade (entre entry e exit candles) */}
        {relEntry >= 0 && (
          <rect
            x={padL + relEntry * step} y={padT}
            width={(slice.length - relEntry) * step} height={plotH}
            fill="rgba(96,165,250,0.04)"
          />
        )}

        {/* Grid */}
        {[0, 0.25, 0.5, 0.75, 1].map(frac => {
          const y = padT + plotH * frac;
          const v = maxP - frac * range;
          return (
            <g key={frac}>
              <line x1={padL} y1={y} x2={W - padR} y2={y}
                stroke="var(--border)" strokeWidth="0.4" />
              <text x={padL - 4} y={y + 3} textAnchor="end" fontSize="8" fill="var(--muted)">
                {v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v.toFixed(2)}`}
              </text>
            </g>
          );
        })}

        {/* Linhas de nível */}
        {levelLines.map(({ price, color, label, dash }) => {
          const y = toY(price);
          return (
            <g key={label}>
              <line x1={padL} y1={y} x2={W - padR} y2={y}
                stroke={color} strokeWidth="0.9" strokeDasharray={dash} opacity="0.85" />
              <text x={W - padR + 2} y={y + 3} fontSize="8" fill={color} fontWeight="600">
                {label}
              </text>
            </g>
          );
        })}

        {/* Candles */}
        {slice.map((c, i) => {
          const cx   = padL + (i + 0.5) * step;
          const isUp = c.close >= c.open;
          const fill = isUp ? '#22c55e' : '#ef4444';
          const bodyTop    = toY(Math.max(c.open, c.close));
          const bodyBottom = toY(Math.min(c.open, c.close));
          const bodyH      = Math.max(1, bodyBottom - bodyTop);
          const isEntryC   = i === relEntry;

          return (
            <g key={i}>
              {/* Wick */}
              <line cx={cx} x1={cx} x2={cx} y1={toY(c.high)} y2={toY(c.low)}
                stroke={isEntryC ? '#60a5fa' : fill} strokeWidth="1" />
              {/* Body */}
              <rect x={cx - cw / 2} y={bodyTop} width={cw} height={bodyH}
                fill={isEntryC ? '#60a5fa' : fill}
                opacity={isEntryC ? 1 : 0.85}
              />
            </g>
          );
        })}

        {/* Labels eixo X */}
        {[0, Math.floor(slice.length / 2), slice.length - 1].map(i => {
          const c = slice[i];
          if (!c) return null;
          const d = new Date(c.timestamp);
          const label = `${d.getDate()}/${d.getMonth() + 1}`;
          return (
            <text key={i} x={padL + (i + 0.5) * step} y={H - 4}
              textAnchor="middle" fontSize="8" fill="var(--muted)">
              {label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────

export default function TradeDetailPage() {
  const params   = useParams();
  const id       = params.id as string;

  const [trade,   setTrade]   = useState<Trade | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  useEffect(() => {
    if (!id) return;

    async function load() {
      try {
        setLoading(true); setError('');

        // Busca o trade
        const tradeRes  = await fetch(`/trading/api/live-demo/${id}`);
        const tradeData = await tradeRes.json();
        if (!tradeRes.ok) throw new Error(tradeData.error ?? 'Erro ao carregar trade');
        const t: Trade = tradeData.trade;
        setTrade(t);

        // Busca candles do mesmo símbolo e intervalo
        const candleRes  = await fetch(
          `/trading/api/candles?symbol=${t.symbol}&interval=${t.interval ?? '4h'}&limit=80`
        );
        const candleData = await candleRes.json();
        if (candleData.candles) setCandles(candleData.candles);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Erro desconhecido');
      } finally { setLoading(false); }
    }

    load();
  }, [id]);

  if (loading) {
    return (
      <div className="dash-root" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <RefreshCw size={20} style={{ animation: 'dash-spin 1s linear infinite', color: 'var(--muted)' }} />
      </div>
    );
  }

  if (error || !trade) {
    return (
      <div className="dash-root" style={{ padding: 32 }}>
        <Link href="/trading/live-demo" className="dash-breadcrumb" style={{ marginBottom: 16, display: 'inline-flex' }}>
          <ChevronLeft size={12} /> Live Demo
        </Link>
        <div className="dash-error-banner">{error || 'Trade não encontrado'}</div>
      </div>
    );
  }

  const isLong   = trade.signal === 'LONG';
  const isClosed = trade.status !== 'OPEN';
  const pnl      = trade.profit_usd ?? 0;
  const log      = parseLog(trade.notes);

  // Calcula R-múltiplo realizado
  const rd       = Math.abs(trade.entry_price - trade.stop_price);
  const priceDiff = isClosed && trade.exit_price
    ? (trade.exit_price - trade.entry_price) * (isLong ? 1 : -1)
    : 0;
  const rMultiple = rd > 0 && isClosed ? priceDiff / rd : null;

  const statusColor = trade.status === 'CLOSED_WIN'
    ? 'var(--green)' : trade.status === 'CLOSED_LOSS'
    ? 'var(--red)' : '#60a5fa';

  return (
    <div className="dash-root">

      {/* Header */}
      <div className="dash-page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link href="/trading/live-demo" className="dash-breadcrumb">
            <ChevronLeft size={12} /> Live Demo
          </Link>
          {isLong
            ? <TrendingUp  size={15} style={{ color: 'var(--green)', flexShrink: 0 }} />
            : <TrendingDown size={15} style={{ color: 'var(--red)',   flexShrink: 0 }} />}
          <span style={{ fontSize: 16, fontWeight: 700 }}>{trade.symbol}</span>
          <span style={{ fontSize: 12, color: isLong ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>
            {trade.signal}
          </span>
          <span style={{
            fontSize: 11, fontWeight: 700, padding: '2px 8px',
            borderRadius: 4, background: `${statusColor}22`, color: statusColor,
          }}>
            {trade.status}
          </span>
          <span className="dash-tc-interval">{trade.interval}</span>
        </div>
        {isClosed && (
          <span style={{
            fontSize: 15, fontWeight: 700, fontFamily: 'var(--mono)',
            color: pnl >= 0 ? 'var(--green)' : 'var(--red)',
          }}>
            {fmtUSD(pnl)}
          </span>
        )}
      </div>

      <div className="dash-live-body2">
        <div className="dash-live-inner" style={{ gap: 16 }}>

          {/* Métricas grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
            gap: 1, background: 'var(--border)', border: '1px solid var(--border)',
            borderRadius: 8, overflow: 'hidden',
          }}>
            {[
              { label: 'Entrada',    value: `$${fmt(trade.entry_price, 4)}`,  color: '#60a5fa' },
              { label: 'Stop',       value: `$${fmt(trade.stop_price,  4)}`,  color: 'var(--red)' },
              { label: 'TP1',        value: `$${fmt(trade.tp1_price,   4)}`,  color: '#86efac' },
              { label: 'TP2',        value: `$${fmt(trade.tp2_price,   4)}`,  color: '#4ade80' },
              { label: 'TP3',        value: `$${fmt(trade.tp3_price,   4)}`,  color: '#22c55e' },
              ...(isClosed && trade.exit_price ? [
                { label: 'Saída',    value: `$${fmt(trade.exit_price,  4)}`,  color: '#a78bfa' },
              ] : []),
              ...(isClosed ? [
                { label: 'P&L',      value: fmtUSD(pnl),                       color: pnl >= 0 ? 'var(--green)' : 'var(--red)' },
                ...(rMultiple !== null ? [
                  { label: 'R-Múltiplo', value: `${rMultiple >= 0 ? '+' : ''}${rMultiple.toFixed(2)}R`, color: rMultiple >= 0 ? 'var(--green)' : 'var(--red)' },
                ] : []),
              ] : []),
              { label: 'ADX',        value: String(trade.adx?.toFixed(0) ?? '—'), color: trade.adx > 40 ? 'var(--green)' : trade.adx > 25 ? '#f59e0b' : 'var(--muted-hi)' },
              { label: 'Volume',     value: `${(trade.volume_ratio ?? 0).toFixed(2)}x`, color: trade.volume_ratio >= 1 ? 'var(--green)' : 'var(--muted-hi)' },
              { label: 'Votos L/S',  value: `${trade.votes_long}L / ${trade.votes_short}S`, color: 'var(--muted-hi)' },
              { label: 'BTC Regime', value: trade.btc_regime ?? '—',           color: trade.btc_regime === 'RISK_OFF' ? '#f59e0b' : 'var(--muted-hi)' },
              ...(trade.exit_reason ? [
                { label: 'Motivo',   value: trade.exit_reason,                  color: 'var(--muted-hi)' },
              ] : []),
            ].map(({ label, value, color }) => (
              <div key={label} style={{
                background: 'var(--card)', padding: '10px 14px',
                display: 'flex', flexDirection: 'column', gap: 3,
              }}>
                <span style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {label}
                </span>
                <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--mono)', color }}>
                  {value}
                </span>
              </div>
            ))}
          </div>

          {/* Datas */}
          <div style={{ display: 'flex', gap: 24, fontSize: 11, color: 'var(--muted)' }}>
            <span>Aberta: <span style={{ color: 'var(--muted-hi)' }}>{fmtDate(trade.opened_at)}</span></span>
            {trade.closed_at && (
              <span>Fechada: <span style={{ color: 'var(--muted-hi)' }}>{fmtDate(trade.closed_at)}</span></span>
            )}
          </div>

          {/* Gráfico de velas */}
          {candles.length > 0 && (
            <div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6, fontWeight: 600 }}>
                GRÁFICO · {trade.symbol} · {trade.interval}
              </div>
              <CandleChart candles={candles} trade={trade} />
              <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 6, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                {[
                  { color: '#60a5fa', label: 'Entrada' },
                  { color: '#ef4444', label: 'Stop' },
                  { color: '#22c55e', label: 'TP3' },
                  ...(trade.exit_price ? [{ color: '#a78bfa', label: 'Saída' }] : []),
                ].map(({ color, label }) => (
                  <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 12, height: 2, background: color, display: 'inline-block', borderRadius: 1 }} />
                    {label}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Log completo */}
          {log.length > 0 && (
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
              <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)', fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>
                LOG DA POSIÇÃO · {log.length} EVENTO{log.length !== 1 ? 'S' : ''}
              </div>
              <div style={{ padding: '8px 0' }}>
                {[...log].reverse().map((entry, i) => {
                  const meta = LOG_EVENT_META[entry.event];
                  return (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'flex-start', gap: 10,
                      padding: '7px 14px',
                      borderBottom: i < log.length - 1 ? '1px solid var(--border)' : 'none',
                    }}>
                      <span style={{
                        width: 6, height: 6, borderRadius: '50%',
                        background: meta.color, flexShrink: 0, marginTop: 4,
                      }} />
                      <span style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--mono)', flexShrink: 0, width: 70 }}>
                        {timeAgo(entry.ts)}
                      </span>
                      <span style={{ fontSize: 11, color: meta.color, fontWeight: 700, flexShrink: 0, width: 90 }}>
                        {meta.label}
                      </span>
                      {entry.detail && (
                        <span style={{ fontSize: 11, color: 'var(--muted-hi)' }}>
                          {entry.detail}
                        </span>
                      )}
                      <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--muted)', flexShrink: 0 }}>
                        {new Date(entry.ts).toLocaleString('pt-BR', {
                          day: '2-digit', month: '2-digit',
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {log.length === 0 && (
            <div style={{ padding: '24px 0', textAlign: 'center' }}>
              <Bot size={20} style={{ opacity: 0.2, margin: '0 auto 8px' }} />
              <p style={{ fontSize: 12, color: 'var(--muted)' }}>
                Log indisponível — trade aberto antes da feature de log ser implantada.
              </p>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
