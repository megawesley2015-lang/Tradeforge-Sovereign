"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  Activity, Radio, ChevronLeft, Filter,
  TrendingUp, TrendingDown, Minus, RefreshCw,
  Bell, BellOff, BarChart2, Zap
} from 'lucide-react';
import { getSupabaseBrowserClient } from '@/lib/supabase-browser';
import { SignalCard, SignalData } from '@/components/trading/SignalCard';
import { RiskGuard } from '@/components/trading/RiskGuard';
import { StatCard } from '@/components/trading/StatCard';

const supabase = getSupabaseBrowserClient();

// ─── Tipos internos ────────────────────────────────────────────
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

// ─── Helpers ─────────────────────────────────────────────────
function pulse(direction: 'BUY' | 'SELL' | 'HOLD') {
  if (direction === 'BUY')  return 'text-green-400';
  if (direction === 'SELL') return 'text-red-400';
  return 'text-gray-400';
}

// ─── Componente principal ─────────────────────────────────────
export default function SignalsDashboard() {
  const [signals, setSignals]           = useState<SignalData[]>([]);
  const [newSignalIds, setNewSignalIds] = useState<Set<string>>(new Set());
  const [filter, setFilter]             = useState<DirectionFilter>('ALL');
  const [isConnected, setIsConnected]   = useState(false);
  const [soundOn, setSoundOn]           = useState(false);
  const [loading, setLoading]           = useState(true);
  const [riskConfig, setRiskConfig]     = useState<RiskConfig | null>(null);
  const [openPositions, setOpenPositions] = useState(0);
  const [todayStats, setTodayStats]     = useState({ buys: 0, sells: 0, avgStrength: 0 });
  const audioRef = useRef<AudioContext | null>(null);

  // ─── Busca inicial de dados ─────────────────────────────────
  const fetchInitialData = useCallback(async () => {
    setLoading(true);
    try {
      // Sinais ativos
      const { data: signalsData } = await supabase
        .from('signals')
        .select('*')
        .eq('status', 'ACTIVE')
        .order('timestamp', { ascending: false })
        .limit(30);

      if (signalsData) {
        setSignals(signalsData as SignalData[]);

        // Estatísticas do dia
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todaySignals = signalsData.filter(
          (s) => new Date(s.timestamp) >= today
        );
        const buys   = todaySignals.filter((s) => s.direction === 'BUY').length;
        const sells  = todaySignals.filter((s) => s.direction === 'SELL').length;
        const avgStr = todaySignals.length > 0
          ? todaySignals.reduce((a, s) => a + s.strength, 0) / todaySignals.length
          : 0;
        setTodayStats({ buys, sells, avgStrength: Math.round(avgStr * 100) });
      }

      // Configuração de risco (pega primeiro registro disponível)
      const { data: riskData } = await supabase
        .from('risk_config')
        .select('*')
        .limit(1)
        .maybeSingle();

      if (riskData) setRiskConfig(riskData as RiskConfig);

      // Posições abertas
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

  // ─── Supabase Realtime — escuta novos sinais ────────────────
  useEffect(() => {
    fetchInitialData();

    const channel = supabase
      .channel('signals-live')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'signals' },
        (payload) => {
          const newSignal = payload.new as SignalData;

          // Adiciona ao topo da lista
          setSignals((prev) => [newSignal, ...prev.slice(0, 49)]);

          // Marca como novo por 10 segundos
          setNewSignalIds((prev) => new Set(prev).add(newSignal.id));
          setTimeout(() => {
            setNewSignalIds((prev) => {
              const next = new Set(prev);
              next.delete(newSignal.id);
              return next;
            });
          }, 10000);

          // Atualiza stats do dia
          setTodayStats((prev) => {
            const newBuys  = newSignal.direction === 'BUY'  ? prev.buys  + 1 : prev.buys;
            const newSells = newSignal.direction === 'SELL' ? prev.sells + 1 : prev.sells;
            return { buys: newBuys, sells: newSells, avgStrength: prev.avgStrength };
          });

          // Beep de notificação
          if (soundOn && newSignal.direction !== 'HOLD') {
            playBeep(newSignal.direction === 'BUY' ? 880 : 440);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'signals' },
        (payload) => {
          const updated = payload.new as SignalData;
          setSignals((prev) =>
            prev.map((s) => (s.id === updated.id ? updated : s))
          );
        }
      )
      .subscribe((status) => {
        setIsConnected(status === 'SUBSCRIBED');
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchInitialData, soundOn]);

  // ─── Beep de notificação ────────────────────────────────────
  function playBeep(freq: number) {
    try {
      if (!audioRef.current) {
        audioRef.current = new AudioContext();
      }
      const ctx = audioRef.current;
      const osc = ctx.createOscillator();
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

  // ─── Filtragem ──────────────────────────────────────────────
  const filteredSignals = signals.filter((s) =>
    filter === 'ALL' ? true : s.direction === filter
  );

  const buyCount  = signals.filter((s) => s.direction === 'BUY').length;
  const sellCount = signals.filter((s) => s.direction === 'SELL').length;

  // ─── Loading ────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-[#07070D] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-[#FF6B35] border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-500 text-sm font-mono">Conectando ao mercado...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#07070D] text-white p-6 font-sans">
      <div className="max-w-7xl mx-auto">

        {/* ─── HEADER ──────────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <Link
              href="/trading/dashboard"
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#FF6B35] transition-colors"
            >
              <ChevronLeft size={16} /> Dashboard
            </Link>
            <div>
              <h1 className="text-2xl font-black">
                Sinais <span className="text-[#FF6B35]">Ao Vivo</span>
              </h1>
              <p className="text-gray-600 text-xs font-mono">
                RSI · MACD · Bollinger Bands · ATR
              </p>
            </div>
          </div>

          {/* Status da conexão Realtime */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSoundOn((p) => !p)}
              className="p-2 rounded-xl bg-[#0F0F1A] border border-[#1F1F2E] text-gray-500 hover:text-[#FF6B35] transition-colors"
              title={soundOn ? 'Desativar sons' : 'Ativar sons'}
            >
              {soundOn ? <Bell size={16} /> : <BellOff size={16} />}
            </button>
            <button
              onClick={fetchInitialData}
              className="p-2 rounded-xl bg-[#0F0F1A] border border-[#1F1F2E] text-gray-500 hover:text-[#FF6B35] transition-colors"
              title="Atualizar"
            >
              <RefreshCw size={16} />
            </button>
            <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-xl border font-mono ${
              isConnected
                ? 'bg-green-500/10 border-green-500/30 text-green-400'
                : 'bg-red-500/10 border-red-500/30 text-red-400'
            }`}>
              <Radio size={12} className={isConnected ? 'animate-pulse' : ''} />
              {isConnected ? 'REALTIME ON' : 'RECONECTANDO...'}
            </div>
          </div>
        </div>

        {/* ─── STATS RÁPIDAS ────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <StatCard
            label="Sinais Hoje"
            value={`${todayStats.buys + todayStats.sells}`}
            icon={<Activity size={18} />}
            colorClass="text-[#FF6B35]"
          />
          <StatCard
            label="BUY / SELL"
            value={`${todayStats.buys} / ${todayStats.sells}`}
            icon={<Zap size={18} />}
            colorClass="text-white"
          />
          <StatCard
            label="Força Média"
            value={`${todayStats.avgStrength}%`}
            icon={<BarChart2 size={18} />}
            colorClass={
              todayStats.avgStrength >= 70 ? 'text-green-400' :
              todayStats.avgStrength >= 40 ? 'text-yellow-400' :
              'text-gray-400'
            }
          />
          <StatCard
            label="Capital"
            value={`R$ ${(riskConfig?.available_capital ?? 0).toFixed(2)}`}
            icon={<TrendingUp size={18} />}
            colorClass="text-white"
          />
        </div>

        {/* ─── LAYOUT PRINCIPAL ─────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* ─── COLUNA ESQUERDA: SINAIS ─────────────────── */}
          <div className="lg:col-span-2">

            {/* Filtros */}
            <div className="flex items-center gap-3 mb-4">
              <Filter size={14} className="text-gray-500" />
              {(['ALL', 'BUY', 'SELL'] as DirectionFilter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`text-xs px-4 py-1.5 rounded-full font-bold transition-all border ${
                    filter === f
                      ? f === 'BUY'
                        ? 'bg-green-500/20 text-green-400 border-green-500/40'
                        : f === 'SELL'
                        ? 'bg-red-500/20 text-red-400 border-red-500/40'
                        : 'bg-[#FF6B35]/20 text-[#FF6B35] border-[#FF6B35]/40'
                      : 'bg-transparent text-gray-500 border-[#1F1F2E] hover:border-gray-500'
                  }`}
                >
                  {f === 'ALL' ? `Todos (${signals.length})` :
                   f === 'BUY' ? `▲ BUY (${buyCount})` :
                   `▼ SELL (${sellCount})`}
                </button>
              ))}
            </div>

            {/* Feed de sinais */}
            <div className="space-y-4">
              {filteredSignals.length === 0 ? (
                <div className="bg-[#0F0F1A] border border-[#1F1F2E] rounded-2xl p-16 text-center">
                  <Activity size={32} className="text-gray-700 mx-auto mb-3" />
                  <p className="text-gray-600 font-mono text-sm">
                    Nenhum sinal ativo no momento.
                  </p>
                  <p className="text-gray-700 text-xs mt-1">
                    O engine analisa novos candles automaticamente.
                  </p>
                </div>
              ) : (
                filteredSignals.map((signal) => (
                  <SignalCard
                    key={signal.id}
                    signal={signal}
                    isNew={newSignalIds.has(signal.id)}
                  />
                ))
              )}
            </div>
          </div>

          {/* ─── COLUNA DIREITA: RISKGUARD ───────────────── */}
          <div className="space-y-6">
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

            {/* Como ler os sinais */}
            <div className="bg-[#0F0F1A] border border-[#1F1F2E] rounded-3xl p-5">
              <p className="text-sm font-bold mb-4 flex items-center gap-2">
                <Activity size={14} className="text-[#FF6B35]" />
                Como ler os sinais
              </p>
              <div className="space-y-3 text-xs font-mono">
                <div className="flex items-start gap-3">
                  <span className={`mt-0.5 shrink-0 ${pulse('BUY')}`}>
                    <TrendingUp size={12} />
                  </span>
                  <div>
                    <p className="text-green-400 font-bold">BUY</p>
                    <p className="text-gray-600">≥2 indicadores apontando compra. RSI &lt;30, MACD bullish cross ou BB na banda inferior.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className={`mt-0.5 shrink-0 ${pulse('SELL')}`}>
                    <TrendingDown size={12} />
                  </span>
                  <div>
                    <p className="text-red-400 font-bold">SELL</p>
                    <p className="text-gray-600">≥2 indicadores apontando venda. RSI &gt;70, MACD bearish cross ou BB na banda superior.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className={`mt-0.5 shrink-0 ${pulse('HOLD')}`}>
                    <Minus size={12} />
                  </span>
                  <div>
                    <p className="text-gray-400 font-bold">HOLD</p>
                    <p className="text-gray-600">Indicadores em conflito ou mercado sem tendência clara. Aguardar.</p>
                  </div>
                </div>
                <div className="border-t border-[#1F1F2E] pt-3 space-y-1 text-gray-600">
                  <p><span className="text-white">Força 0-40%</span> → sinal fraco, usar cautela</p>
                  <p><span className="text-yellow-400">Força 40-70%</span> → sinal moderado</p>
                  <p><span className="text-green-400">Força 70-100%</span> → sinal forte, vários indicadores concordando</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
