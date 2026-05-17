"use client";

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  ChevronLeft, RefreshCw, TrendingUp, AlertTriangle,
  Zap, DollarSign, Activity, Clock,
} from 'lucide-react';
import type { ScanResult, ArbitrageOpportunity, ExchangePrice } from '@/lib/trading/arbitrage-scanner';
import '@/components/dashboard/dashboard.css';

// ─── Helpers ─────────────────────────────────────────────────

function fmt(n: number, digits = 2) {
  return n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
function fmtPct(n: number) {
  return `${n >= 0 ? '+' : ''}${n.toFixed(4)}%`;
}

const EX_COLOR: Record<string, string> = {
  Binance:  '#F0B90B',
  Kraken:   '#8B5CF6',
  Coinbase: '#3B82F6',
};

// ─── Sub-components ──────────────────────────────────────────

function ExchangeBadge({ name }: { name: string }) {
  const color = EX_COLOR[name] ?? '#94a3b8';
  return (
    <span
      className="dash-ex-badge"
      style={{ color, background: `${color}18`, border: `1px solid ${color}30` }}
    >
      {name}
    </span>
  );
}

function OpportunityCard({ opp }: { opp: ArbitrageOpportunity }) {
  const { profitable } = opp;
  return (
    <div className={`dash-arb-card${profitable ? ' profitable' : ''}`}>

      {/* Head */}
      <div className="dash-arb-card-head">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="dash-arb-symbol">{opp.symbol.replace('USDT', '')}</span>
            <span className="dash-arb-pair">/ USDT</span>
            {profitable && (
              <span className="dash-arb-profitable-badge">
                <Zap size={8} fill="currentColor" /> LUCRATIVO
              </span>
            )}
          </div>
        </div>
        <div>
          <div className="dash-arb-spread-pct" style={{ color: profitable ? 'var(--green)' : 'var(--muted-hi)' }}>
            {fmtPct(opp.netSpreadPct)}
          </div>
          <div className="dash-arb-spread-lbl">spread líquido</div>
        </div>
      </div>

      {/* Rota */}
      <div className="dash-arb-route">
        <div className="dash-arb-route-node">
          <div className="dash-arb-route-node-lbl">Comprar em</div>
          <ExchangeBadge name={opp.buyOn} />
          <div className="dash-arb-route-node-price">${fmt(opp.buyAsk)}</div>
        </div>
        <div className="dash-arb-route-arrow">
          <TrendingUp size={16} />
        </div>
        <div className="dash-arb-route-node">
          <div className="dash-arb-route-node-lbl">Vender em</div>
          <ExchangeBadge name={opp.sellOn} />
          <div className="dash-arb-route-node-price">${fmt(opp.sellBid)}</div>
        </div>
      </div>

      {/* Métricas */}
      <div className="dash-arb-metrics">
        <div className="dash-arb-metric">
          <div className="dash-arb-metric-lbl">Spread Bruto</div>
          <div className="dash-arb-metric-val">{fmtPct(opp.grossSpreadPct)}</div>
        </div>
        <div className="dash-arb-metric">
          <div className="dash-arb-metric-lbl">Net / unidade</div>
          <div className="dash-arb-metric-val" style={{ color: opp.netSpreadUsd >= 0 ? 'var(--green)' : 'var(--red)' }}>
            ${fmt(opp.netSpreadUsd)}
          </div>
        </div>
        <div className="dash-arb-metric">
          <div className="dash-arb-metric-lbl">Spread Bruto $</div>
          <div className="dash-arb-metric-val">${fmt(opp.grossSpreadUsd)}</div>
        </div>
      </div>

      {/* Preços por exchange */}
      <div className="dash-arb-prices">
        {opp.prices.map((p) => (
          <div key={p.exchange} className="dash-arb-price-row">
            <ExchangeBadge name={p.exchange} />
            <span className="dash-arb-price-item">Bid: <span>${fmt(p.bid)}</span></span>
            <span className="dash-arb-price-item">Ask: <span>${fmt(p.ask)}</span></span>
            <span className="dash-arb-price-item">Mid: <span>${fmt(p.mid)}</span></span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PriceRadar({ allPrices }: { allPrices: Record<string, ExchangePrice[]> }) {
  const symbols = Object.keys(allPrices);
  if (!symbols.length) return null;

  return (
    <div>
      <div className="dash-section-head2" style={{ marginBottom: 10 }}>
        <Activity size={11} />
        <span className="dash-section-head2-label">Radar de Preços</span>
        <span className="dash-section-head2-line" />
      </div>
      <div className="dash-scanner-wrap">
        <table className="dash-table">
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>Par</th>
              <th style={{ textAlign: 'right' }}>Binance</th>
              <th style={{ textAlign: 'right' }}>Kraken</th>
              <th style={{ textAlign: 'right' }}>Coinbase</th>
              <th style={{ textAlign: 'right' }}>Δ Max%</th>
            </tr>
          </thead>
          <tbody>
            {symbols.map((sym) => {
              const prices = allPrices[sym];
              const mids   = prices.map((p) => p.mid).filter(Boolean);
              const maxMid = Math.max(...mids);
              const minMid = Math.min(...mids);
              const deltaP = minMid > 0 ? ((maxMid - minMid) / minMid) * 100 : 0;
              const getPrice = (ex: string) => prices.find((p) => p.exchange === ex)?.mid ?? null;

              return (
                <tr key={sym}>
                  <td style={{ fontWeight: 600 }}>{sym.replace('USDT', '/USDT')}</td>
                  {(['Binance', 'Kraken', 'Coinbase'] as const).map((ex) => {
                    const mid = getPrice(ex);
                    return (
                      <td key={ex} style={{ textAlign: 'right' }}>
                        {mid
                          ? <span style={{ color: EX_COLOR[ex], fontFamily: 'var(--mono)', fontSize: 11 }}>${fmt(mid)}</span>
                          : <span style={{ color: 'var(--muted)' }}>—</span>}
                      </td>
                    );
                  })}
                  <td style={{ textAlign: 'right' }}>
                    <span style={{
                      fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 600,
                      color: deltaP > 0.1 ? 'var(--green)' : 'var(--muted)',
                    }}>
                      {deltaP.toFixed(4)}%
                    </span>
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

// ─── Página principal ─────────────────────────────────────────

const REFRESH_INTERVAL = 15_000;

export default function ArbitragePage() {
  const [data,       setData]       = useState<ScanResult | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [lastAt,     setLastAt]     = useState<Date | null>(null);
  const [countdown,  setCountdown]  = useState(REFRESH_INTERVAL / 1000);

  const fetchData = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res  = await fetch('/trading/api/arbitrage');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: ScanResult = await res.json();
      setData(json);
      setLastAt(new Date());
      setCountdown(REFRESH_INTERVAL / 1000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar dados');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    const timer = setInterval(fetchData, REFRESH_INTERVAL);
    return () => clearInterval(timer);
  }, [fetchData]);

  useEffect(() => {
    if (loading) return;
    const tick = setInterval(() => setCountdown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(tick);
  }, [loading]);

  const profitable = data?.opportunities.filter((o) => o.profitable) ?? [];
  const pairsCount = data ? Object.keys(data.allPrices).length : 0;

  return (
    <div className="dash-root">

      {/* ─── METRIC STRIP ─── */}
      <div className="dash-metrics">
        <div className="dash-metric">
          <span className="dash-metric-label">Pares Monitorados</span>
          <span className="dash-metric-val amber">{pairsCount || '—'}</span>
        </div>
        <div className="dash-metric">
          <span className="dash-metric-label">Lucrativas</span>
          <span className={`dash-metric-val ${profitable.length > 0 ? 'green' : ''}`}>{profitable.length}</span>
        </div>
        <div className="dash-metric">
          <span className="dash-metric-label">Maior Spread</span>
          <span className={`dash-metric-val ${data?.opportunities[0]?.profitable ? 'green' : ''}`}>
            {data?.opportunities[0] ? fmtPct(data.opportunities[0].netSpreadPct) : '—'}
          </span>
        </div>
        <div className="dash-metric" style={{ borderRight: 'none', marginLeft: 'auto' }}>
          <span className="dash-metric-label">Latência do Scan</span>
          <span className="dash-metric-val">{data ? `${data.durationMs}ms` : '—'}</span>
        </div>
      </div>

      {/* ─── INNER HEADER ─── */}
      <div className="dash-page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Link href="/trading/dashboard" className="dash-breadcrumb">
            <ChevronLeft size={12} /> Dashboard
          </Link>
          <div className="dash-page-title">
            <DollarSign size={13} /> Arbitragem
          </div>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--muted)' }}>
            Binance · Kraken · Coinbase
          </span>
        </div>
        <div className="dash-page-actions">
          {lastAt && (
            <div className="dash-countdown">
              <Clock size={9} /> Atualiza em {countdown}s
            </div>
          )}
          <button onClick={fetchData} disabled={loading} className="dash-icon-btn" title="Atualizar">
            <RefreshCw size={13} style={loading ? { animation: 'dash-spin 1s linear infinite' } : {}} />
          </button>
        </div>
      </div>

      {/* ─── BODY ─── */}
      <div className="dash-live-body2">
        <div className="dash-live-inner">

          {/* Disclaimer */}
          <div className="dash-disclaimer">
            <AlertTriangle size={13} />
            <span>
              <strong>Radar de preços — MVP:</strong> Este scanner detecta spreads entre exchanges mas{' '}
              <strong>não executa arbitragem automaticamente</strong>. Arbitragem real requer contas
              simultâneas, capital separado e latência &lt;100ms. Use estes dados como inteligência de mercado.
            </span>
          </div>

          {/* Error */}
          {error && <div className="dash-error-banner">{error}</div>}

          {/* Loading */}
          {loading && !data && (
            <div className="dash-arb-empty">
              <RefreshCw size={24} style={{ animation: 'dash-spin 1s linear infinite', opacity: 0.4 }} />
              <p>Consultando Binance, Kraken e Coinbase...</p>
            </div>
          )}

          {/* Price Radar */}
          {data && <PriceRadar allPrices={data.allPrices} />}

          {/* Oportunidades */}
          {data && data.opportunities.length > 0 && (
            <div>
              <div className="dash-section-head2" style={{ marginBottom: 12 }}>
                <TrendingUp size={11} style={{ color: 'var(--green)' }} />
                <span className="dash-section-head2-label">Oportunidades Detectadas</span>
                <span className="dash-section-head2-count">{data.opportunities.length}</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--muted)' }}>
                  ordenadas por spread líquido
                </span>
                <span className="dash-section-head2-line" />
              </div>
              <div className="dash-arb-grid">
                {data.opportunities.map((opp) => (
                  <OpportunityCard key={`${opp.symbol}-${opp.buyOn}-${opp.sellOn}`} opp={opp} />
                ))}
              </div>
            </div>
          )}

          {/* Empty */}
          {data && data.opportunities.length === 0 && (
            <div className="dash-arb-empty">
              <Activity size={24} style={{ opacity: 0.25 }} />
              <p>Nenhuma oportunidade detectada no momento.</p>
              <p style={{ opacity: 0.5 }}>O mercado está com spreads dentro do custo das taxas.</p>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
