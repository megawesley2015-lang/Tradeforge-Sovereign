"use client";

import { Shield, ShieldAlert, ShieldCheck, AlertTriangle, CheckCircle2, XCircle, Lock } from 'lucide-react';

interface RiskGuardProps {
  capital: number;              // capital atual em R$
  dailyLoss: number;            // perda acumulada hoje em R$
  openPositions: number;        // posições abertas agora
  capitalFloor?: number;        // mínimo configurado
  maxRiskPct?: number;          // % máx por trade (padrão: 2%)
  maxDailyLossPct?: number;     // % máx de perda/dia (padrão: 6%)
  maxOpenPositions?: number;    // posições máximas (padrão: 3)
  tradingHalted?: boolean;      // sistema pausado por risco?
}

interface Barrier {
  id: number;
  name: string;
  description: string;
  value: string;
  limit: string;
  status: 'OK' | 'WARNING' | 'DANGER' | 'HALTED';
  pct: number; // 0-100 para a barra
}

export function RiskGuard({
  capital,
  dailyLoss,
  openPositions,
  capitalFloor = 0,
  maxRiskPct = 0.02,
  maxDailyLossPct = 0.06,
  maxOpenPositions = 3,
  tradingHalted = false,
}: RiskGuardProps) {
  const positionLimit   = capital * maxRiskPct;
  const dailyLossLimit  = capital * maxDailyLossPct;
  const dailyLossPct    = dailyLossLimit > 0 ? (dailyLoss / dailyLossLimit) * 100 : 0;
  const positionsPct    = (openPositions / maxOpenPositions) * 100;
  const floorPct        = capitalFloor > 0
    ? Math.min(((capital - capitalFloor) / capital) * 100, 100)
    : 100;

  const barriers: Barrier[] = [
    {
      id: 1,
      name: 'Kelly — Tamanho por Trade',
      description: `Máx R$ ${positionLimit.toFixed(2)} por trade (${(maxRiskPct * 100).toFixed(0)}% do capital)`,
      value: `R$ ${positionLimit.toFixed(2)}`,
      limit: `${(maxRiskPct * 100).toFixed(0)}% do capital`,
      status: 'OK',
      pct: maxRiskPct * 100,
    },
    {
      id: 2,
      name: 'Stop Loss ATR',
      description: 'Calculado dinamicamente pela volatilidade real do ativo',
      value: 'Automático',
      limit: 'ATR × 2',
      status: 'OK',
      pct: 100,
    },
    {
      id: 3,
      name: 'Limite de Perda Diária',
      description: `Uso: R$ ${dailyLoss.toFixed(2)} de R$ ${dailyLossLimit.toFixed(2)}`,
      value: `R$ ${dailyLoss.toFixed(2)}`,
      limit: `R$ ${dailyLossLimit.toFixed(2)} (${(maxDailyLossPct * 100).toFixed(0)}%)`,
      status: dailyLossPct >= 100 ? 'HALTED' : dailyLossPct >= 80 ? 'DANGER' : dailyLossPct >= 50 ? 'WARNING' : 'OK',
      pct: Math.min(dailyLossPct, 100),
    },
    {
      id: 4,
      name: 'Capital Floor (Mínimo)',
      description: capitalFloor > 0
        ? `Nunca opera abaixo de R$ ${capitalFloor.toFixed(2)}`
        : 'Sem floor configurado',
      value: capitalFloor > 0 ? `R$ ${capitalFloor.toFixed(2)}` : 'Não definido',
      limit: `Atual: R$ ${capital.toFixed(2)}`,
      status: capitalFloor > 0
        ? capital <= capitalFloor * 1.05 ? 'DANGER' : capital <= capitalFloor * 1.2 ? 'WARNING' : 'OK'
        : 'WARNING',
      pct: floorPct,
    },
    {
      id: 5,
      name: 'Posições Simultâneas',
      description: `${openPositions} abertas de ${maxOpenPositions} permitidas`,
      value: `${openPositions} abertas`,
      limit: `Máx ${maxOpenPositions}`,
      status: openPositions >= maxOpenPositions ? 'DANGER' : openPositions >= maxOpenPositions - 1 ? 'WARNING' : 'OK',
      pct: Math.min(positionsPct, 100),
    },
  ];

  const overallStatus = tradingHalted
    ? 'HALTED'
    : barriers.some((b) => b.status === 'DANGER')
    ? 'DANGER'
    : barriers.some((b) => b.status === 'WARNING')
    ? 'WARNING'
    : 'OK';

  return (
    <div className="bg-[#0F0F1A] border border-[#1F1F2E] rounded-3xl p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Shield size={20} className="text-[#FF6B35]" />
          Proteção de Capital
        </h2>
        <div className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-full font-bold ${
          overallStatus === 'HALTED' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
          overallStatus === 'DANGER' ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' :
          overallStatus === 'WARNING' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' :
          'bg-green-500/20 text-green-400 border border-green-500/30'
        }`}>
          {overallStatus === 'HALTED' && <><Lock size={10} /> SISTEMA PAUSADO</>}
          {overallStatus === 'DANGER' && <><AlertTriangle size={10} /> ATENÇÃO</>}
          {overallStatus === 'WARNING' && <><AlertTriangle size={10} /> ALERTA</>}
          {overallStatus === 'OK' && <><ShieldCheck size={10} /> PROTEGIDO</>}
        </div>
      </div>

      {/* Capital highlight */}
      <div className="bg-[#161625] border border-[#2A2A3C] rounded-2xl p-4 mb-6 flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-500 mb-1">Capital Disponível</p>
          <p className="text-3xl font-black text-white font-mono">R$ {capital.toFixed(2)}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-500 mb-1">Perda Máx. por Trade</p>
          <p className="text-lg font-bold text-[#FF6B35] font-mono">
            R$ {(positionLimit * 0.015).toFixed(3)}
          </p>
          <p className="text-[10px] text-gray-600">stop 1.5% × posição {(maxRiskPct*100).toFixed(0)}%</p>
        </div>
      </div>

      {/* 5 Barreiras */}
      <div className="space-y-3">
        <p className="text-xs text-gray-500 uppercase tracking-wider font-bold mb-4">
          5 Barreiras Anti Saldo Negativo
        </p>
        {barriers.map((barrier) => (
          <div key={barrier.id} className="group">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                {/* Status icon */}
                {barrier.status === 'OK'     && <CheckCircle2 size={13} className="text-green-400 shrink-0" />}
                {barrier.status === 'WARNING' && <AlertTriangle size={13} className="text-yellow-400 shrink-0" />}
                {barrier.status === 'DANGER'  && <XCircle size={13} className="text-red-400 shrink-0" />}
                {barrier.status === 'HALTED'  && <Lock size={13} className="text-red-500 shrink-0" />}
                <span className="text-xs font-bold text-gray-300">
                  {barrier.id}. {barrier.name}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-gray-500 hidden group-hover:block transition-all">
                  {barrier.value}
                </span>
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                  barrier.status === 'OK'      ? 'text-green-400 bg-green-500/10' :
                  barrier.status === 'WARNING' ? 'text-yellow-400 bg-yellow-500/10' :
                  barrier.status === 'DANGER'  ? 'text-red-400 bg-red-500/10' :
                  'text-red-500 bg-red-500/15'
                }`}>
                  {barrier.status}
                </span>
              </div>
            </div>
            {/* Barra de progresso */}
            <div className="w-full bg-[#161625] rounded-full h-1.5 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${
                  barrier.status === 'OK'      ? 'bg-green-500' :
                  barrier.status === 'WARNING' ? 'bg-yellow-500' :
                  barrier.status === 'DANGER'  ? 'bg-red-500 animate-pulse' :
                  'bg-red-600 animate-pulse'
                }`}
                style={{ width: `${barrier.pct}%` }}
              />
            </div>
            <p className="text-[10px] text-gray-600 mt-1">{barrier.description}</p>
          </div>
        ))}
      </div>

      {/* Simulação do pior caso */}
      <div className="mt-6 bg-[#161625] border border-[#2A2A3C] rounded-xl p-4">
        <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-3 font-bold">
          Simulação do pior caso
        </p>
        <div className="grid grid-cols-2 gap-3 text-xs font-mono">
          <div>
            <p className="text-gray-500">Perda por trade (stop)</p>
            <p className="text-white font-bold">R$ {(positionLimit * 0.015).toFixed(3)}</p>
          </div>
          <div>
            <p className="text-gray-500">Trades p/ parar o dia</p>
            <p className="text-white font-bold">
              {dailyLossLimit > 0
                ? Math.floor(dailyLossLimit / (positionLimit * 0.015))
                : '—'} consecutivos
            </p>
          </div>
          <div>
            <p className="text-gray-500">Capital após parada</p>
            <p className="text-green-400 font-bold">
              R$ {(capital - dailyLossLimit).toFixed(2)}
            </p>
          </div>
          <div>
            <p className="text-gray-500">Saldo negativo?</p>
            <p className={`font-bold ${capital - dailyLossLimit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {capital - dailyLossLimit >= 0 ? '✓ Impossível' : '✗ Risco!'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
