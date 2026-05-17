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
  const dir = signal.direction.toLowerCase() as 'buy' | 'sell' | 'hold';

  const strengthPct = Math.round(signal.strength * 100);
  const strengthClass =
    strengthPct >= 70 ? 'strong' : strengthPct >= 40 ? 'moderate' : 'weak';

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
    <div className={`dash-signal-card ${dir}${isNew ? ' is-new' : ''}`}>
      {isNew && <span className="dash-signal-new-badge">Novo</span>}

      {/* Head */}
      <div className="dash-signal-head">
        <div className="dash-signal-left">
          <div className={`dash-signal-icon ${dir}`}>
            {dir === 'buy'  && <TrendingUp  size={16} />}
            {dir === 'sell' && <TrendingDown size={16} />}
            {dir === 'hold' && <Minus        size={16} />}
          </div>
          <div>
            <div className="dash-signal-ticker">{signal.ticker}</div>
            <div className={`dash-signal-dir ${dir}`}>{signal.direction}</div>
          </div>
        </div>

        <div className="dash-signal-strength">
          <div className="dash-strength-label">Força</div>
          <div className="dash-strength-row">
            <div className="dash-strength-track">
              <div
                className={`dash-strength-fill ${strengthClass}`}
                style={{ width: `${strengthPct}%` }}
              />
            </div>
            <span className={`dash-strength-val ${strengthClass}`}>{strengthPct}%</span>
          </div>
          <div className="dash-signal-time">{timeAgo}</div>
        </div>
      </div>

      {/* Prices */}
      <div className="dash-signal-prices">
        <div className="dash-signal-price-cell">
          <div className="dash-signal-price-label">
            <Zap size={8} /> Entrada
          </div>
          <div className="dash-signal-price-val">
            R$ {signal.entry_price.toFixed(2)}
          </div>
        </div>
        <div className="dash-signal-price-cell">
          <div className="dash-signal-price-label stop">
            <StopCircle size={8} /> Stop
          </div>
          <div className="dash-signal-price-val stop">
            {signal.stop_loss ? `R$ ${signal.stop_loss.toFixed(2)}` : '—'}
          </div>
        </div>
        <div className="dash-signal-price-cell">
          <div className="dash-signal-price-label target">
            <Target size={8} /> Alvo
          </div>
          <div className="dash-signal-price-val target">
            {signal.take_profit ? `R$ ${signal.take_profit.toFixed(2)}` : '—'}
          </div>
        </div>
      </div>

      {/* Indicator tags */}
      {signal.indicators_fired && signal.indicators_fired.length > 0 && (
        <div className="dash-signal-tags">
          {signal.indicators_fired.map((ind) => (
            <span key={ind} className="dash-signal-tag">{ind}</span>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="dash-signal-footer">
        <div className="dash-signal-meta">
          {rrRatio && (
            <span style={{ color: rrRatio >= 1.5 ? 'var(--green)' : '#FACC15' }}>
              RR 1:{rrRatio.toFixed(1)}
            </span>
          )}
          {signal.rsi_value && (
            <span style={{
              color: signal.rsi_value < 30 ? 'var(--green)'
                   : signal.rsi_value > 70 ? 'var(--red)'
                   : 'var(--muted-hi)'
            }}>
              RSI {signal.rsi_value}
            </span>
          )}
        </div>
        {signal.suggested_size && (
          <div className="dash-signal-size">
            <Shield size={9} />
            R$ {signal.suggested_size.toFixed(2)}
          </div>
        )}
      </div>
    </div>
  );
}
