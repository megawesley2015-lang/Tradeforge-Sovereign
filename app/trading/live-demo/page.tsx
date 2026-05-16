"use client";
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, RefreshCw, TrendingUp, TrendingDown,
  Activity, BarChart2, Clock, CheckCircle2, XCircle,
  Minus, Bot, Wifi,
} from 'lucide-react';

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
  symbol:        string;
  price:         number;
  trend:         'BULLISH' | 'BEARISH';
  adx:           number;
  adx_strength:  string;
  rsi:           number;
  volume_ratio:  number;
  signal:        string;
  votes_long:    number;
  votes_short:   number;
  pct_from_ema200: number;
  market_type:   string;
  analyzed_at:   string;
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

const fmt  = (n: number, d = 4)  => n?.toFixed(d) ?? '—';
const fmtUSD = (n: number)       => `$${Math.abs(n).toFixed(2)}`;
const fmtPct = (n: number)       => `${n >= 0 ? '+' : ''}${n?.toFixed(1)}%`;
const fmtDate = (s: string)      => new Date(s).toLocaleString('pt-BR', {
  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
});

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    OPEN:        { label: 'Aberta',  cls: 'bg-blue-500/20 text-blue-400 border border-blue-500/30' },
    CLOSED_WIN:  { label: 'Win ✓',   cls: 'bg-green-500/20 text-green-400 border border-green-500/30' },
    CLOSED_LOSS: { label: 'Loss ✗',  cls: 'bg-red-500/20 text-red-400 border border-red-500/30' },
    CLOSED_TIME: { label: 'Tempo',   cls: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' },
    CLOSED_EOD:  { label: 'Fim Dados', cls: 'bg-gray-500/20 text-gray-400 border border-gray-500/30' },
  };
  const { label, cls } = map[status] ?? { label: status, cls: 'bg-gray-500/20 text-gray-400' };
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cls}`}>{label}</span>;
}

function AdxBar({ adx }: { adx: number }) {
  const color = adx > 40 ? '#22c55e' : adx > 25 ? '#f59e0b' : adx > 20 ? '#94a3b8' : '#475569';
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-16 h-1.5 bg-[#1a1a2e] rounded-full overflow-hidden">
        <div style={{ width: `${Math.min(adx, 100)}%`, background: color }} className="h-full rounded-full" />
      </div>
      <span className="text-xs" style={{ color }}>{adx?.toFixed(0)}</span>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────

export default function LiveDemoPage() {
  const [trades,    setTrades]    = useState<Trade[]>([]);
  const [analytics, setAnalytics] = useState<Analytics[]>([]);
  const [summary,   setSummary]   = useState<Summary | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [tab,       setTab]       = useState<'trades' | 'scanner'>('trades');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const res  = await fetch('/trading/api/live-demo?limit=100');
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setTrades(data.trades    ?? []);
      setAnalytics(data.analytics ?? []);
      setSummary(data.summary);
      setLastUpdate(new Date());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  }, []);

  // Carrega na montagem e auto-atualiza a cada 5 min
  useEffect(() => {
    load();
    const id = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [load]);

  const openTrades   = trades.filter(t => t.status === 'OPEN');
  const closedTrades = trades.filter(t => t.status !== 'OPEN');

  return (
    <div className="min-h-screen bg-[#0A0A14] text-white">
      {/* Header */}
      <div className="bg-[#0F0F1E] border-b border-[#1E1E3A] px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/trading" className="text-gray-500 hover:text-white transition-colors">
              <ArrowLeft size={18} />
            </Link>
            <Bot size={20} className="text-[#FF6B35]" />
            <div>
              <h1 className="text-lg font-bold">Monitoramento ao Vivo</h1>
              <p className="text-xs text-gray-500">Paper Trading — Dry Run Mode</p>
            </div>
            {/* Indicador de live */}
            <span className="flex items-center gap-1.5 text-xs text-green-400 bg-green-400/10 px-2 py-1 rounded-full border border-green-400/20">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              AO VIVO
            </span>
          </div>
          <div className="flex items-center gap-3">
            {lastUpdate && (
              <span className="text-xs text-gray-600">
                Atualizado {lastUpdate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            <button
              onClick={load}
              disabled={loading}
              className="flex items-center gap-2 px-3 py-1.5 bg-[#1A1A2E] border border-[#2A2A3C] rounded-lg text-sm hover:border-[#FF6B35] transition-colors disabled:opacity-50"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              Atualizar
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* Cards de resumo */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            {[
              { icon: <Activity size={16}/>, label: 'Total Trades', value: summary.totalTrades, color: 'text-white' },
              { icon: <Wifi size={16}/>,     label: 'Posições Abertas', value: summary.openTrades, color: 'text-blue-400' },
              { icon: <CheckCircle2 size={16}/>, label: 'Fechados', value: summary.closedTrades, color: 'text-gray-400' },
              { icon: <TrendingUp size={16}/>,   label: 'Wins',    value: summary.wins,    color: 'text-green-400' },
              { icon: <TrendingDown size={16}/>, label: 'Losses',  value: summary.losses,  color: 'text-red-400' },
              { icon: <BarChart2 size={16}/>, label: 'Win Rate', value: `${summary.winRatePct}%`, color: summary.winRatePct >= 50 ? 'text-green-400' : 'text-red-400' },
              {
                icon:  <span className="text-base">{summary.totalPnlUsd >= 0 ? '💰' : '📉'}</span>,
                label: 'P&L Total',
                value: `${summary.totalPnlUsd >= 0 ? '+' : '-'}${fmtUSD(summary.totalPnlUsd)}`,
                color: summary.totalPnlUsd >= 0 ? 'text-green-400' : 'text-red-400',
              },
            ].map((card, i) => (
              <div key={i} className="bg-[#0F0F1E] border border-[#1E1E3A] rounded-xl p-3">
                <div className="flex items-center gap-1.5 text-gray-500 mb-1.5">
                  {card.icon}
                  <span className="text-xs">{card.label}</span>
                </div>
                <div className={`text-xl font-bold ${card.color}`}>{card.value}</div>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 bg-[#0F0F1E] border border-[#1E1E3A] rounded-xl p-1 w-fit">
          {(['trades', 'scanner'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                tab === t
                  ? 'bg-[#FF6B35] text-white'
                  : 'text-gray-500 hover:text-white'
              }`}
            >
              {t === 'trades' ? `Trades (${trades.length})` : `Scanner (${analytics.length})`}
            </button>
          ))}
        </div>

        {/* ── Tab: Trades ────────────────────────────────── */}
        {tab === 'trades' && (
          <div className="space-y-4">

            {/* Posições abertas */}
            {openTrades.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-gray-400 mb-2 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                  Posições Abertas ({openTrades.length})
                </h2>
                <div className="space-y-2">
                  {openTrades.map(trade => (
                    <TradeCard key={trade.id} trade={trade} />
                  ))}
                </div>
              </div>
            )}

            {/* Histórico */}
            <div>
              <h2 className="text-sm font-semibold text-gray-400 mb-2 flex items-center gap-2">
                <Clock size={14} />
                Histórico ({closedTrades.length})
              </h2>
              {closedTrades.length === 0 ? (
                <div className="text-center py-12 text-gray-600">
                  <Bot size={32} className="mx-auto mb-3 opacity-30" />
                  <p>Nenhum trade fechado ainda.</p>
                  <p className="text-sm mt-1">O bot está monitorando o mercado...</p>
                </div>
              ) : (
                <div className="space-y-2">
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
              <p className="text-xs text-gray-600 mb-3">
                Última varredura: {fmtDate(summary.lastScanAt)}
              </p>
            )}
            {analytics.length === 0 ? (
              <div className="text-center py-12 text-gray-600">
                <BarChart2 size={32} className="mx-auto mb-3 opacity-30" />
                <p>Nenhum dado de scanner ainda.</p>
                <p className="text-sm mt-1">O scanner roda a cada 4 horas.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-500 border-b border-[#1E1E3A]">
                      <th className="text-left py-2 px-3">Ativo</th>
                      <th className="text-right px-3">Preço</th>
                      <th className="text-center px-3">Tendência</th>
                      <th className="text-center px-3">ADX</th>
                      <th className="text-right px-3">RSI</th>
                      <th className="text-right px-3">Vol</th>
                      <th className="text-center px-3">Sinal</th>
                      <th className="text-right px-3">EMA200 Δ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.map((a, i) => (
                      <tr key={i} className="border-b border-[#1E1E3A]/50 hover:bg-[#0F0F1E] transition-colors">
                        <td className="py-2 px-3 font-medium">{a.symbol}</td>
                        <td className="px-3 text-right font-mono text-xs">{fmt(a.price, 4)}</td>
                        <td className="px-3 text-center">
                          {a.trend === 'BULLISH'
                            ? <span className="text-green-400 text-xs font-medium">▲ Alta</span>
                            : <span className="text-red-400 text-xs font-medium">▼ Baixa</span>}
                        </td>
                        <td className="px-3"><AdxBar adx={a.adx} /></td>
                        <td className="px-3 text-right">
                          <span className={a.rsi < 30 ? 'text-green-400' : a.rsi > 70 ? 'text-red-400' : 'text-gray-400'}>
                            {a.rsi?.toFixed(1)}
                          </span>
                        </td>
                        <td className="px-3 text-right">
                          <span className={a.volume_ratio >= 1 ? 'text-green-400' : 'text-gray-500'}>
                            {a.volume_ratio?.toFixed(2)}x
                          </span>
                        </td>
                        <td className="px-3 text-center">
                          {a.signal === 'LONG'    && <span className="text-green-400 text-xs font-bold">▲ LONG</span>}
                          {a.signal === 'SHORT'   && <span className="text-red-400 text-xs font-bold">▼ SHORT</span>}
                          {a.signal === 'NEUTRAL' && <span className="text-gray-600 text-xs">—</span>}
                        </td>
                        <td className={`px-3 text-right text-xs ${(a.pct_from_ema200 ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
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
    <div className="bg-[#0F0F1E] border border-[#1E1E3A] rounded-xl p-4 hover:border-[#2A2A3C] transition-colors">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {isLong
            ? <TrendingUp  size={16} className="text-green-400" />
            : <TrendingDown size={16} className="text-red-400" />}
          <span className="font-bold">{trade.symbol}</span>
          <span className={`text-xs font-semibold ${isLong ? 'text-green-400' : 'text-red-400'}`}>
            {trade.signal}
          </span>
          <StatusBadge status={trade.status} />
          {trade.btc_regime === 'RISK_OFF' && (
            <span className="text-xs bg-orange-500/20 text-orange-400 px-1.5 py-0.5 rounded border border-orange-500/20">
              RISK_OFF
            </span>
          )}
        </div>
        <div className="text-right">
          {isClosed && (
            <div className={`text-base font-bold ${pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {pnl >= 0 ? '+' : ''}{fmtUSD(pnl)}
            </div>
          )}
          <div className="text-xs text-gray-500">{trade.interval}</div>
        </div>
      </div>

      <div className="grid grid-cols-3 md:grid-cols-6 gap-3 text-xs">
        <div>
          <span className="text-gray-600 block">Entrada</span>
          <span className="font-mono">${fmt(trade.entry_price, 4)}</span>
        </div>
        <div>
          <span className="text-gray-600 block">Stop</span>
          <span className="font-mono text-red-400">${fmt(trade.stop_price, 4)}</span>
        </div>
        <div>
          <span className="text-gray-600 block">TP3</span>
          <span className="font-mono text-green-400">${fmt(trade.tp3_price, 4)}</span>
        </div>
        {isClosed && trade.exit_price && (
          <div>
            <span className="text-gray-600 block">Saída</span>
            <span className="font-mono">${fmt(trade.exit_price, 4)}</span>
          </div>
        )}
        <div>
          <span className="text-gray-600 block">ADX</span>
          <AdxBar adx={trade.adx ?? 0} />
        </div>
        <div>
          <span className="text-gray-600 block">Volume</span>
          <span className={trade.volume_ratio >= 1 ? 'text-green-400' : 'text-gray-500'}>
            {(trade.volume_ratio ?? 0).toFixed(2)}x
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between mt-2 text-xs text-gray-600">
        <span>
          L{trade.votes_long}/{trade.votes_short}S
          {trade.exit_reason && ` · ${trade.exit_reason}`}
        </span>
        <span>{fmtDate(trade.opened_at)}</span>
      </div>
    </div>
  );
}
