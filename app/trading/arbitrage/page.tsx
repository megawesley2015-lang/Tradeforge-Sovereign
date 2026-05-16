
"use client";

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, RefreshCw, TrendingUp, AlertTriangle,
  Zap, DollarSign, Activity, Clock
} from 'lucide-react';
import type { ScanResult, ArbitrageOpportunity, ExchangePrice } from '@/lib/trading/arbitrage-scanner';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number, digits = 2) {
  return n.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function fmtPct(n: number) {
  const sign = n >= 0 ? '+' : '';
  return `${sign}${n.toFixed(4)}%`;
}

const EXCHANGE_COLORS: Record<string, string> = {
  Binance:  '#F0B90B',
  Kraken:   '#5741D9',
  Coinbase: '#0052FF',
};

const EXCHANGE_BG: Record<string, string> = {
  Binance:  'bg-yellow-900/30 border-yellow-700/30',
  Kraken:   'bg-purple-900/30 border-purple-700/30',
  Coinbase: 'bg-blue-900/30  border-blue-700/30',
};

// ── Badge de exchange ─────────────────────────────────────────────────────────

function ExchangeBadge({ name }: { name: string }) {
  return (
    <span
      className="px-2 py-0.5 rounded-lg text-xs font-bold"
      style={{ color: EXCHANGE_COLORS[name] ?? '#aaa', background: `${EXCHANGE_COLORS[name] ?? '#aaa'}22` }}
    >
      {name}
    </span>
  );
}

// ── Card de oportunidade ──────────────────────────────────────────────────────

function OpportunityCard({ opp }: { opp: ArbitrageOpportunity }) {
  const profitable = opp.profitable;

  return (
    <div className={`rounded-2xl border p-5 transition-all ${
      profitable
        ? 'bg-green-900/15 border-green-700/40'
        : 'bg-[#0F0F1A] border-[#1F1F2E]'
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-white font-bold text-lg">{opp.symbol.replace('USDT', '')}</span>
          <span className="text-gray-500 text-sm">/ USDT</span>
          {profitable && (
            <span className="flex items-center gap-1 text-xs text-green-400 bg-green-900/30 border border-green-700/40 px-2 py-0.5 rounded-full">
              <Zap size={10} fill="currentColor" /> LUCRATIVO
            </span>
          )}
        </div>
        <div className={`text-right ${profitable ? 'text-green-400' : 'text-gray-400'}`}>
          <div className="text-xl font-bold font-mono">{fmtPct(opp.netSpreadPct)}</div>
          <div className="text-xs text-gray-500">spread líquido</div>
        </div>
      </div>

      {/* Rota de arbitragem */}
      <div className="flex items-center gap-2 mb-4">
        <div className="flex-1 bg-[#161625] rounded-xl p-3 text-center">
          <div className="text-xs text-gray-500 mb-1">Comprar em</div>
          <ExchangeBadge name={opp.buyOn} />
          <div className="text-white font-mono text-sm mt-1">${fmt(opp.buyAsk)}</div>
        </div>
        <div className="text-gray-600">
          <TrendingUp size={20} />
        </div>
        <div className="flex-1 bg-[#161625] rounded-xl p-3 text-center">
          <div className="text-xs text-gray-500 mb-1">Vender em</div>
          <ExchangeBadge name={opp.sellOn} />
          <div className="text-white font-mono text-sm mt-1">${fmt(opp.sellBid)}</div>
        </div>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-[#161625] rounded-xl p-2">
          <div className="text-xs text-gray-500">Spread Bruto</div>
          <div className="text-white text-sm font-mono">{fmtPct(opp.grossSpreadPct)}</div>
        </div>
        <div className="bg-[#161625] rounded-xl p-2">
          <div className="text-xs text-gray-500">Net / unidade</div>
          <div className={`text-sm font-mono ${opp.netSpreadUsd >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            ${fmt(opp.netSpreadUsd)}
          </div>
        </div>
        <div className="bg-[#161625] rounded-xl p-2">
          <div className="text-xs text-gray-500">Spread Bruto $</div>
          <div className="text-white text-sm font-mono">${fmt(opp.grossSpreadUsd)}</div>
        </div>
      </div>

      {/* Preços por exchange */}
      <div className="mt-3 space-y-1.5">
        {opp.prices.map((p) => (
          <div key={p.exchange} className={`flex items-center justify-between rounded-xl border px-3 py-2 text-xs ${EXCHANGE_BG[p.exchange] ?? 'bg-[#161625] border-[#2A2A3C]'}`}>
            <ExchangeBadge name={p.exchange} />
            <span className="text-gray-400">Bid: <span className="text-white font-mono">${fmt(p.bid)}</span></span>
            <span className="text-gray-400">Ask: <span className="text-white font-mono">${fmt(p.ask)}</span></span>
            <span className="text-gray-400">Mid: <span className="text-white font-mono">${fmt(p.mid)}</span></span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Radar global de preços ────────────────────────────────────────────────────

function PriceRadar({ allPrices }: { allPrices: Record<string, ExchangePrice[]> }) {
  const symbols = Object.keys(allPrices);
  if (!symbols.length) return null;

  return (
    <div className="bg-[#0F0F1A] border border-[#1F1F2E] rounded-3xl p-6">
      <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
        <Activity size={14} /> Radar de Preços
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-500 border-b border-[#1F1F2E]">
              <th className="text-left py-2 pr-4">Par</th>
              <th className="text-right py-2 px-3">Binance</th>
              <th className="text-right py-2 px-3">Kraken</th>
              <th className="text-right py-2 px-3">Coinbase</th>
              <th className="text-right py-2">Δ Max%</th>
            </tr>
          </thead>
          <tbody>
            {symbols.map((sym) => {
              const prices = allPrices[sym];
              const mids   = prices.map((p) => p.mid).filter(Boolean);
              const maxMid = Math.max(...mids);
              const minMid = Math.min(...mids);
              const deltaP = minMid > 0 ? ((maxMid - minMid) / minMid) * 100 : 0;

              const getPrice = (ex: string) =>
                prices.find((p) => p.exchange === ex)?.mid ?? null;

              return (
                <tr key={sym} className="border-b border-[#1F1F2E] hover:bg-[#161625] transition-colors">
                  <td className="py-2.5 pr-4 font-bold text-white">{sym.replace('USDT', '/USDT')}</td>
                  {['Binance', 'Kraken', 'Coinbase'].map((ex) => {
                    const mid = getPrice(ex);
                    return (
                      <td key={ex} className="text-right py-2.5 px-3">
                        {mid ? (
                          <span
                            className="font-mono"
                            style={{ color: EXCHANGE_COLORS[ex] }}
                          >
                            ${fmt(mid)}
                          </span>
                        ) : (
                          <span className="text-gray-600">—</span>
                        )}
                      </td>
                    );
                  })}
                  <td className={`text-right py-2.5 font-mono font-bold ${deltaP > 0.1 ? 'text-green-400' : 'text-gray-500'}`}>
                    {deltaP.toFixed(4)}%
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

// ── Página principal ──────────────────────────────────────────────────────────

const REFRESH_INTERVAL = 15_000; // 15s

export default function ArbitragePage() {
  const [data,      setData]      = useState<ScanResult | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');
  const [lastAt,    setLastAt]    = useState<Date | null>(null);
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL / 1000);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/trading/api/arbitrage');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: ScanResult = await res.json();
      setData(json);
      setLastAt(new Date());
      setCountdown(REFRESH_INTERVAL / 1000);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch inicial
  useEffect(() => { fetchData(); }, [fetchData]);

  // Auto-refresh
  useEffect(() => {
    const timer = setInterval(fetchData, REFRESH_INTERVAL);
    return () => clearInterval(timer);
  }, [fetchData]);

  // Countdown visual
  useEffect(() => {
    if (loading) return;
    const tick = setInterval(() => setCountdown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(tick);
  }, [loading]);

  const profitable = data?.opportunities.filter((o) => o.profitable) ?? [];

  return (
    <div className="min-h-screen bg-[#07070D] text-white p-6 font-sans">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/trading/dashboard" className="text-gray-500 hover:text-white transition-colors">
              <ArrowLeft size={20} />
            </Link>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <DollarSign size={22} className="text-[#FF6B35]" />
                Scanner de Arbitragem
              </h1>
              <p className="text-gray-500 text-sm">Comparação de preços em tempo real · Binance / Kraken / Coinbase</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {lastAt && (
              <span className="text-xs text-gray-500 flex items-center gap-1">
                <Clock size={11} /> Atualiza em {countdown}s
              </span>
            )}
            <button
              onClick={fetchData}
              disabled={loading}
              className="flex items-center gap-2 bg-[#0F0F1A] border border-[#1F1F2E] hover:border-[#FF6B35] text-white px-4 py-2 rounded-xl text-sm transition-colors disabled:opacity-50"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              Atualizar
            </button>
          </div>
        </div>

        {/* Status cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            {
              label: 'Pares Monitorados',
              value: data ? Object.keys(data.allPrices).length : '—',
              sub:   'BTC · ETH · SOL',
              icon:  <Activity size={16} className="text-blue-400" />,
            },
            {
              label: 'Oportunidades Lucrativas',
              value: profitable.length,
              sub:   profitable.length > 0 ? 'Acima do threshold' : 'Nenhuma no momento',
              icon:  <TrendingUp size={16} className="text-green-400" />,
            },
            {
              label: 'Maior Spread Líquido',
              value: data?.opportunities[0] ? fmtPct(data.opportunities[0].netSpreadPct) : '—',
              sub:   data?.opportunities[0]?.symbol ?? '',
              icon:  <Zap size={16} className="text-[#FF6B35]" />,
            },
            {
              label: 'Latência do Scan',
              value: data ? `${data.durationMs}ms` : '—',
              sub:   '3 exchanges simultâneas',
              icon:  <Clock size={16} className="text-purple-400" />,
            },
          ].map((card) => (
            <div key={card.label} className="bg-[#0F0F1A] border border-[#1F1F2E] rounded-2xl p-4">
              <div className="flex items-center gap-2 text-gray-500 text-xs mb-2">
                {card.icon} {card.label}
              </div>
              <div className="text-white text-xl font-bold font-mono">{card.value}</div>
              <div className="text-gray-600 text-xs mt-0.5">{card.sub}</div>
            </div>
          ))}
        </div>

        {/* Disclaimer MVP */}
        <div className="flex items-start gap-2 bg-yellow-900/15 border border-yellow-700/30 rounded-xl p-4 text-xs text-yellow-400">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <span>
            <strong>Radar de preços — MVP:</strong> Este scanner detecta spreads entre exchanges mas <strong>não executa arbitragem automaticamente</strong>.
            Arbitragem real requer contas simultâneas, capital separado e latência &lt;100ms.
            Use estes dados como inteligência de mercado.
          </span>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-900/20 border border-red-700/40 rounded-xl p-4 text-red-400 text-sm">
            ❌ {error}
          </div>
        )}

        {/* Loading inicial */}
        {loading && !data && (
          <div className="text-center py-20 text-gray-500">
            <RefreshCw size={32} className="animate-spin mx-auto mb-3 text-[#FF6B35]" />
            <p>Consultando Binance, Kraken e Coinbase...</p>
          </div>
        )}

        {/* Radar de preços */}
        {data && <PriceRadar allPrices={data.allPrices} />}

        {/* Oportunidades */}
        {data && data.opportunities.length > 0 && (
          <div>
            <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
              <TrendingUp size={14} /> Oportunidades Detectadas
              <span className="text-gray-600 font-normal">— ordenadas por spread líquido</span>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {data.opportunities.map((opp) => (
                <OpportunityCard key={`${opp.symbol}-${opp.buyOn}-${opp.sellOn}`} opp={opp} />
              ))}
            </div>
          </div>
        )}

        {/* Sem dados */}
        {data && data.opportunities.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <Activity size={32} className="mx-auto mb-3 opacity-30" />
            <p>Nenhuma oportunidade detectada no momento.</p>
            <p className="text-xs mt-1 text-gray-600">O mercado está com spreads dentro do custo das taxas.</p>
          </div>
        )}
      </div>
    </div>
  );
}
