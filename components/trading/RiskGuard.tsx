"use client";

import { Shield, ShieldCheck, AlertTriangle, CheckCircle2, XCircle, Lock } from 'lucide-react';

interface RiskGuardProps {
  capital: number;
  dailyLoss: number;
  openPositions: number;
  capitalFloor?: number;
  maxRiskPct?: number;
  maxDailyLossPct?: number;
  maxOpenPositions?: number;
  tradingHalted?: boolean;
}

type BarrierStatus = 'OK' | 'WARNING' | 'DANGER' | 'HALTED';

interface Barrier {
  id: number;
  name: string;
  description: string;
  value: string;
  status: BarrierStatus;
  pct: number;
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
  const positionLimit  = capital * maxRiskPct;
  const dailyLossLimit = capital * maxDailyLossPct;
  const dailyLossPct   = dailyLossLimit > 0 ? (dailyLoss / dailyLossLimit) * 100 : 0;
  const positionsPct   = (openPositions / maxOpenPositions) * 100;
  const floorPct       = capitalFloor > 0
    ? Math.min(((capital - capitalFloor) / capital) * 100, 100)
    : 100;

  const barriers: Barrier[] = [
    {
      id: 1,
      name: 'Kelly — Tamanho/Trade',
      description: `Máx R$ ${positionLimit.toFixed(2)} por trade (${(maxRiskPct * 100).toFixed(0)}% do capital)`,
      value: `R$ ${positionLimit.toFixed(2)}`,
      status: 'OK',
      pct: maxRiskPct * 100,
    },
    {
      id: 2,
      name: 'Stop Loss ATR',
      description: 'Calculado dinamicamente pela volatilidade do ativo',
      value: 'Automático',
      status: 'OK',
      pct: 100,
    },
    {
      id: 3,
      name: 'Perda Diária',
      description: `Uso: R$ ${dailyLoss.toFixed(2)} de R$ ${dailyLossLimit.toFixed(2)} (${(maxDailyLossPct * 100).toFixed(0)}%)`,
      value: `R$ ${dailyLoss.toFixed(2)}`,
      status: dailyLossPct >= 100 ? 'HALTED' : dailyLossPct >= 80 ? 'DANGER' : dailyLossPct >= 50 ? 'WARNING' : 'OK',
      pct: Math.min(dailyLossPct, 100),
    },
    {
      id: 4,
      name: 'Capital Floor',
      description: capitalFloor > 0
        ? `Nunca opera abaixo de R$ ${capitalFloor.toFixed(2)} — atual: R$ ${capital.toFixed(2)}`
        : 'Sem floor configurado',
      value: capitalFloor > 0 ? `R$ ${capitalFloor.toFixed(2)}` : 'Não definido',
      status: capitalFloor > 0
        ? capital <= capitalFloor * 1.05 ? 'DANGER' : capital <= capitalFloor * 1.2 ? 'WARNING' : 'OK'
        : 'WARNING',
      pct: floorPct,
    },
    {
      id: 5,
      name: 'Posições Simultâneas',
      description: `${openPositions} abertas de ${maxOpenPositions} permitidas`,
      value: `${openPositions}/${maxOpenPositions}`,
      status: openPositions >= maxOpenPositions ? 'DANGER' : openPositions >= maxOpenPositions - 1 ? 'WARNING' : 'OK',
      pct: Math.min(positionsPct, 100),
    },
  ];

  const overallStatus: BarrierStatus = tradingHalted
    ? 'HALTED'
    : barriers.some((b) => b.status === 'DANGER') ? 'DANGER'
    : barriers.some((b) => b.status === 'WARNING') ? 'WARNING'
    : 'OK';

  const overallClass = overallStatus.toLowerCase();

  function statusClass(s: BarrierStatus) { return s.toLowerCase(); }

  function StatusIcon({ s }: { s: BarrierStatus }) {
    if (s === 'OK')      return <CheckCircle2 size={11} style={{ color: 'var(--green)' }} />;
    if (s === 'WARNING') return <AlertTriangle size={11} style={{ color: '#FACC15' }} />;
    if (s === 'DANGER')  return <XCircle size={11} style={{ color: 'var(--red)' }} />;
    return <Lock size={11} style={{ color: 'var(--red)' }} />;
  }

  return (
    <div className="dash-side-panel">
      {/* Title + overall badge */}
      <div className="dash-side-title" style={{ justifyContent: 'space-between' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Shield size={13} /> Proteção de Capital
        </span>
        <span className={`dash-overall-badge ${overallClass}`}>
          {overallStatus === 'HALTED'  && <><Lock size={9} /> Pausado</>}
          {overallStatus === 'DANGER'  && <><AlertTriangle size={9} /> Atenção</>}
          {overallStatus === 'WARNING' && <><AlertTriangle size={9} /> Alerta</>}
          {overallStatus === 'OK'      && <><ShieldCheck size={9} /> Protegido</>}
        </span>
      </div>

      {/* Capital highlight */}
      <div className="dash-risk-capital">
        <div>
          <div className="dash-risk-capital-label">Capital Disponível</div>
          <div className="dash-risk-capital-val">R$ {capital.toFixed(2)}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="dash-risk-capital-sub">R$ {(positionLimit * 0.015).toFixed(3)}</div>
          <div className="dash-risk-capital-sub-label">perda máx/trade</div>
        </div>
      </div>

      {/* Barriers */}
      <div className="dash-barriers-label">5 Barreiras Anti Saldo Negativo</div>
      {barriers.map((b) => (
        <div key={b.id} className="dash-barrier">
          <div className="dash-barrier-head">
            <div className="dash-barrier-name">
              <StatusIcon s={b.status} />
              {b.id}. {b.name}
            </div>
            <span className={`dash-barrier-status ${statusClass(b.status)}`}>
              {b.status}
            </span>
          </div>
          <div className="dash-barrier-track">
            <div
              className={`dash-barrier-fill ${statusClass(b.status)}`}
              style={{ width: `${b.pct}%` }}
            />
          </div>
          <div className="dash-barrier-desc">{b.description}</div>
        </div>
      ))}

      {/* Worst-case simulation */}
      <div className="dash-risk-sim">
        <div className="dash-risk-sim-label">Simulação do pior caso</div>
        <div className="dash-risk-sim-grid">
          <div>
            <div className="dash-risk-sim-item-label">Perda/trade (stop)</div>
            <div className="dash-risk-sim-item-val">R$ {(positionLimit * 0.015).toFixed(3)}</div>
          </div>
          <div>
            <div className="dash-risk-sim-item-label">Trades p/ parar</div>
            <div className="dash-risk-sim-item-val">
              {dailyLossLimit > 0
                ? `${Math.floor(dailyLossLimit / (positionLimit * 0.015))}x`
                : '—'}
            </div>
          </div>
          <div>
            <div className="dash-risk-sim-item-label">Capital após parada</div>
            <div className="dash-risk-sim-item-val" style={{ color: 'var(--green)' }}>
              R$ {(capital - dailyLossLimit).toFixed(2)}
            </div>
          </div>
          <div>
            <div className="dash-risk-sim-item-label">Saldo negativo?</div>
            <div className="dash-risk-sim-item-val"
              style={{ color: capital - dailyLossLimit >= 0 ? 'var(--green)' : 'var(--red)' }}>
              {capital - dailyLossLimit >= 0 ? 'Impossivel' : 'Risco!'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
