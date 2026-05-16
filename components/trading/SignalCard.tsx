"use client";

import { TrendingUp, TrendingDown, Minus, Shield, Target, StopCircle, Zap } from 'lucide-react';

export interface SignalData {
  id: string;
  ticker: string;
  direction: 'BUY' | 'SELL' | 'HOLD';
  strength: number;
  entry_price: number;
  stop_loss: number | null;
  take_profit: number | null;
  suggested_size: number | null;
  indicators_fired: string[];
  rsi_value: number | null;
  macd_histogram: number | null;
  atr_value: number | null;
  timestamp: string;
  status: 'ACTIVE' | 'TRIGGERED' | 'EXPIRED' | 'CANCELLED';
}

interface SignalCardProps {
  signal: SignalData;
  isNew?: boolean;
}

export function SignalCard({ signal, isNew = false }: SignalCardProps) {
  const isBuy  = signal.direction === 'BUY';
  const isSell = signal.direction === 'SELL';
  const isHold = signal.direction === 'HOLD';

  const directionColor = isBuy
    ? 'text-green-400'
    : isSell
    ? 'text-red-400'
    : 'text-gray-400';

  const borderColor = isBuy
    ? 'border-green-500/30'
    : isSell
    ? 'border-red-500/30'
    : 'border-[#1F1F2E]';

  const bgGlow = isBuy
    ? 'bg-green-500/5'
    : isSell
    ? 'bg-red-500/5'
    : 'bg-[#0F0F1A]';

  const strengthPct = Math.round(signal.strength * 100);

  // Calcula RR ratio
  const rrRatio =
    signal.stop_loss && signal.take_profit
      ? Math.abs(signal.take_profit - signal.entry_price) /
        Math.abs(signal.entry_price - signal.stop_loss)
      : null;

  const timeAgo = (() => {
    const diff = Date.now() - new Date(signal.timestamp).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'agora';
    if (mins < 60) return `${mins}m atrás`;
    return `${Math.floor(mins / 60)}h atrás`;
  })();

  return (
    <div
      className={`
        relative border rounded-2xl p-5 transition-all duration-500
        ${bgGlow} ${borderColor}
        ${isNew ? 'animate-pulse ring-1 ring-[#FF6B35]/40' : ''}
      `}
    >
      {/* Badge NOVO */}
      {isNew && (
        <span className="absolute -top-2 -right-2 bg-[#FF6B35] text-black text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
          NOVO
        </span>
      )}

      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          {/* Ícone de direção */}
          <div className={`p-2 rounded-xl ${isBuy ? 'bg-green-500/15' : isSell ? 'bg-red-500/15' : 'bg-gray-500/15'}`}>
            {isBuy  && <TrendingUp  size={20} className="text-green-400" />}
            {isSell && <TrendingDown size={20} className="text-red-400"  />}
            {isHold && <Minus        size={20} className="text-gray-400"  />}
          </div>
          <div>
            <p className="text-xs text-gray-500 font-mono uppercase tracking-widest">
              {signal.ticker}
            </p>
            <p className={`text-xl font-black ${directionColor}`}>
              {signal.direction}
            </p>
          </div>
        </div>

        {/* Força do sinal */}
        <div className="text-right">
          <p className="text-xs text-gray-500 mb-1">Força</p>
          <div className="flex items-center gap-2">
            <div className="w-16 h-1.5 bg-[#1F1F2E] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  strengthPct >= 70 ? 'bg-green-400' :
                  strengthPct >= 40 ? 'bg-yellow-400' :
                  'bg-gray-500'
                }`}
                style={{ width: `${strengthPct}%` }}
              />
            </div>
            <span className={`text-sm font-bold font-mono ${
              strengthPct >= 70 ? 'text-green-400' :
              strengthPct >= 40 ? 'text-yellow-400' :
              'text-gray-400'
            }`}>{strengthPct}%</span>
          </div>
          <p className="text-xs text-gray-600 mt-1 font-mono">{timeAgo}</p>
        </div>
      </div>

      {/* Preços */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-[#161625] rounded-xl p-3 text-center">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1 flex items-center justify-center gap-1">
            <Zap size={9} /> Entrada
          </p>
          <p className="text-sm font-bold font-mono text-white">
            R$ {signal.entry_price.toFixed(2)}
          </p>
        </div>
        <div className="bg-[#161625] rounded-xl p-3 text-center">
          <p className="text-[10px] text-red-400/70 uppercase tracking-wider mb-1 flex items-center justify-center gap-1">
            <StopCircle size={9} /> Stop
          </p>
          <p className="text-sm font-bold font-mono text-red-400">
            {signal.stop_loss ? `R$ ${signal.stop_loss.toFixed(2)}` : '—'}
          </p>
        </div>
        <div className="bg-[#161625] rounded-xl p-3 text-center">
          <p className="text-[10px] text-green-400/70 uppercase tracking-wider mb-1 flex items-center justify-center gap-1">
            <Target size={9} /> Alvo
          </p>
          <p className="text-sm font-bold font-mono text-green-400">
            {signal.take_profit ? `R$ ${signal.take_profit.toFixed(2)}` : '—'}
          </p>
        </div>
      </div>

      {/* Indicadores disparados */}
      {signal.indicators_fired && signal.indicators_fired.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {signal.indicators_fired.map((ind) => (
            <span
              key={ind}
              className="text-[10px] font-mono bg-[#161625] border border-[#2A2A3C] text-gray-400 px-2 py-0.5 rounded-full"
            >
              {ind}
            </span>
          ))}
        </div>
      )}

      {/* Rodapé: RR + Tamanho + RSI */}
      <div className="flex items-center justify-between pt-3 border-t border-[#1F1F2E] text-xs font-mono">
        <div className="flex items-center gap-4">
          {rrRatio && (
            <span className="text-gray-500">
              RR:{' '}
              <span className={`font-bold ${rrRatio >= 1.5 ? 'text-green-400' : 'text-yellow-400'}`}>
                1:{rrRatio.toFixed(1)}
              </span>
            </span>
          )}
          {signal.rsi_value && (
            <span className="text-gray-500">
              RSI:{' '}
              <span className={`font-bold ${
                signal.rsi_value < 30 ? 'text-green-400' :
                signal.rsi_value > 70 ? 'text-red-400' :
                'text-gray-300'
              }`}>{signal.rsi_value}</span>
            </span>
          )}
        </div>
        {signal.suggested_size && (
          <div className="flex items-center gap-1 bg-[#FF6B35]/10 border border-[#FF6B35]/20 px-2.5 py-1 rounded-lg">
            <Shield size={10} className="text-[#FF6B35]" />
            <span className="text-[#FF6B35] font-bold">
              R$ {signal.suggested_size.toFixed(2)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
