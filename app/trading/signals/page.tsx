"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  Activity, Radio, ChevronLeft, Filter,
  TrendingUp, TrendingDown, Minus, RefreshCw,
  Bell, BellOff
} from 'lucide-react';
import { getSupabaseBrowserClient } from '@/lib/supabase-browser';
import { SignalCard, SignalData } from '@/components/trading/SignalCard';
import { RiskGuard } from '@/components/trading/RiskGuard';
import '@/components/dashboard/dashboard.css';

const supabase = getSupabaseBrowserClient();

interface RiskConfig {
  available_capital: number;
  daily_loss_amount: number;
  max_risk_per_trade: number;
  max_daily_loss_pct: number;
  max_open_positions: number;
  min_capital_floor: number | null;
  trading_halted: boolean;
}

type DirectionFilter = 'ALL' | 'BUY' | 'SELL';

export default function SignalsDashboard() {
  const [signals, setSignals]             = useState<SignalData[]>([]);
  const [newSignalIds, setNewSignalIds]   = useState<Set<string>>(new Set());
  const [filter, setFilter]               = useState<DirectionFilter>('ALL');
  const [isConnected, setIsConnected]     = useState(false);
  const [soundOn, setSoundOn]             = useState(false);
  const [loading, setLoading]             = useState(true);
  const [riskConfig, setRiskConfig]       = useState<RiskConfig | null>(null);
  const [openPositions, setOpenPositions] = useState(0);
  const [todayStats, setTodayStats]       = useState({ buys: 0, sells: 0, avgStrength: 0 });
  const audioRef = useRef<AudioContext | null>(null);

  const fetchInitialData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: signalsData } = await supabase
        .from('signals')
        .select('*')
        .eq('status', 'ACTIVE')
        .order('timestamp', { ascending: false })
        .limit(30);

      if (signalsData) {
        setSignals(signalsData as SignalData[]);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todaySignals = signalsData.filter((s) => new Date(s.timestamp) >= today);
        const buys   = todaySignals.filter((s) => s.direction === 'BUY').length;
        const sells  = todaySignals.filter((s) => s.direction === 'SELL').length;
        const avgStr = todaySignals.length > 0
          ? todaySignals.reduce((a, s) => a + s.strength, 0) / todaySignals.length
          : 0;
        setTodayStats({ buys, sells, avgStrength: Math.round(avgStr * 100) });
      }

      const { data: riskData } = await supabase
        .from('risk_config')
        .select('*')
        .limit(1)
        .maybeSingle();
      if (riskData) setRiskConfig(riskData as RiskConfig);

      const { count } = await supabase
        .from('positions')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'OPEN');
      setOpenPositions(count ?? 0);
    } catch (err) {
      console.error('[Signals] Erro ao buscar dados:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInitialData();

    const channel = supabase
      .channel('signals-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'signals' }, (payload) => {
        const newSignal = payload.new as SignalData;
        setSignals((prev) => [newSignal, ...prev.slice(0, 49)]);
        setNewSignalIds((prev) => new Set(prev).add(newSignal.id));
        setTimeout(() => {
          setNewSignalIds((prev) => {
            const next = new Set(prev);
            next.delete(newSignal.id);
            return next;
          });
        }, 10000);
        setTodayStats((prev) => ({
          buys:  newSignal.direction === 'BUY'  ? prev.buys  + 1 : prev.buys,
          sells: newSignal.direction === 'SELL' ? prev.sells + 1 : prev.sells,
          avgStrength: prev.avgStrength,
        }));
        if (soundOn && newSignal.direction !== 'HOLD') {
          playBeep(newSignal.direction === 'BUY' ? 880 : 440);
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'signals' }, (payload) => {
        const updated = payload.new as SignalData;
        setSignals((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      })
      .subscribe((status) => setIsConnected(status === 'SUBSCRIBED'));

    return () => { supabase.removeChannel(channel); };
  }, [fetchInitialData, soundOn]);

  function playBeep(freq: number) {
    try {
      if (!audioRef.current) audioRef.current = new AudioContext();
      const ctx  = audioRef.current;
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } catch (_) {}
  }

  const filteredSignals = signals.filter((s) =>
    filter === 'ALL' ? true : s.direction === filter
  );

  const buyCount  = signals.filter((s) => s.direction === 'BUY').length;
  const sellCount = signals.filter((s) => s.direction === 'SELL').length;

  if (loading) {
    return <div style={{ minHeight: '100vh', background: '#080C12', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="dash-spinner" style={{ width: 20, height: 20, borderColor: 'rgba(245,166,35,0.2)', borderTopColor: '#F5A623' }} />
    </div>;
  }

  return (
    <div className="dash-root">

      {/* ─── METRIC STRIP (stats do dia) ─── */}
      <div className="dash-metrics">
        <div className="dash-metric">
          <span className="dash-metric-label">Sinais Hoje</span>
          <span className="dash-metric-val amber">{todayStats.buys + todayStats.sells}</span>
        </div>
        <div className="dash-metric">
          <span className="dash-metric-label">Compras</span>
          <span className="dash-metric-val green">{todayStats.buys}</span>
        </div>
        <div className="dash-metric">
          <span className="dash-metric-label">Vendas</span>
          <span className="dash-metric-val red">{todayStats.sells}</span>
        </div>
        <div className="dash-metric">
          <span className="dash-metric-label">Força Média</span>
          <span className={`dash-metric-val ${
            todayStats.avgStrength >= 70 ? 'green'
            : todayStats.avgStrength >= 40 ? 'amber'
            : ''
          }`}>{todayStats.avgStrength}%</span>
        </div>
        <div className="dash-metric">
          <span className="dash-metric-label">Capital</span>
          <span className="dash-metric-val">R$ {(riskConfig?.available_capital ?? 0).toFixed(2)}</span>
        </div>
        <div className="dash-metric" style={{ borderRight: 'none', marginLeft: 'auto' }}>
          {/* empty slot — could add more metrics later */}
        </div>
      </div>

      {/* ─── INNER HEADER ─── */}
      <div className="dash-page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Link href="/trading/dashboard" className="dash-breadcrumb">
            <ChevronLeft size={12} /> Dashboard
          </Link>
          <div className="dash-page-title">
            <Radio size={13} /> Sinais Ao Vivo
          </div>
        </div>

        <div className="dash-page-actions">
          <button
            onClick={() => setSoundOn((p) => !p)}
            className={`dash-icon-btn${soundOn ? ' active' : ''}`}
            title={soundOn ? 'Desativar som' : 'Ativar som'}
          >
            {soundOn ? <Bell size={13} /> : <BellOff size={13} />}
          </button>
          <button onClick={fetchInitialData} className="dash-icon-btn" title="Atualizar">
            <RefreshCw size={13} />
          </button>
          <div className={`dash-realtime-badge ${isConnected ? 'on' : 'off'}`}>
            <Radio size={10} style={isConnected ? { animation: 'dash-blink 2s infinite' } : {}} />
            {isConnected ? 'Realtime On' : 'Reconectando...'}
          </div>
        </div>
      </div>

      {/* ─── BODY ─── */}
      <div className="dash-signals-body">

        {/* LEFT: filter + feed */}
        <div className="dash-signals-left">

          {/* Filter bar */}
          <div className="dash-filter-bar">
            <Filter size={12} className="dash-filter-icon" />
            {(['ALL', 'BUY', 'SELL'] as DirectionFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`dash-filter-btn${filter === f ? ` active-${f.toLowerCase()}` : ''}`}
              >
                {f === 'ALL'  ? `Todos (${signals.length})`
                 : f === 'BUY' ? `Compra (${buyCount})`
                 : `Venda (${sellCount})`}
              </button>
            ))}
          </div>

          {/* Signal feed */}
          {filteredSignals.length === 0 ? (
            <div className="dash-signal-empty">
              <Activity size={28} />
              <p>Nenhum sinal ativo no momento.</p>
              <p style={{ opacity: 0.5 }}>O engine analisa novos candles automaticamente.</p>
            </div>
          ) : (
            <div className="dash-signal-feed">
              {filteredSignals.map((signal) => (
                <SignalCard
                  key={signal.id}
                  signal={signal}
                  isNew={newSignalIds.has(signal.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* RIGHT: risk guard + legend */}
        <div className="dash-signals-right">
          <RiskGuard
            capital={riskConfig?.available_capital ?? 0}
            dailyLoss={riskConfig?.daily_loss_amount ?? 0}
            openPositions={openPositions}
            capitalFloor={riskConfig?.min_capital_floor ?? undefined}
            maxRiskPct={riskConfig?.max_risk_per_trade ?? 0.02}
            maxDailyLossPct={riskConfig?.max_daily_loss_pct ?? 0.06}
            maxOpenPositions={riskConfig?.max_open_positions ?? 3}
            tradingHalted={riskConfig?.trading_halted ?? false}
          />

          {/* Legend */}
          <div className="dash-legend">
            <div className="dash-legend-title">
              <Activity size={11} /> Como ler os sinais
            </div>
            <div className="dash-legend-item">
              <span className="dash-legend-item-dir" style={{ color: 'var(--green)' }}>
                <TrendingUp size={11} /> BUY
              </span>
              <span className="dash-legend-item-desc">
                ≥2 indicadores apontando compra. RSI &lt;30, MACD bullish ou BB banda inferior.
              </span>
            </div>
            <div className="dash-legend-item">
              <span className="dash-legend-item-dir" style={{ color: 'var(--red)' }}>
                <TrendingDown size={11} /> SELL
              </span>
              <span className="dash-legend-item-desc">
                ≥2 indicadores apontando venda. RSI &gt;70, MACD bearish ou BB banda superior.
              </span>
            </div>
            <div className="dash-legend-item">
              <span className="dash-legend-item-dir" style={{ color: 'var(--muted-hi)' }}>
                <Minus size={11} /> HOLD
              </span>
              <span className="dash-legend-item-desc">
                Indicadores em conflito. Aguardar confirmação.
              </span>
            </div>
            <div className="dash-legend-divider" />
            <div className="dash-legend-strength">
              <span style={{ color: 'var(--muted-hi)' }}>0–40%</span> sinal fraco, usar cautela<br />
              <span style={{ color: '#FACC15' }}>40–70%</span> sinal moderado<br />
              <span style={{ color: 'var(--green)' }}>70–100%</span> sinal forte, múltiplos indicadores
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
