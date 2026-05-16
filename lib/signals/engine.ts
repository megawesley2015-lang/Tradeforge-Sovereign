// =============================================================
// TRADEFORGE SOVEREIGN — SignalEngine
// O que faz: Orquestra todos os indicadores e gera sinais de trading
// Por que existe: É o "cérebro" do sistema — transforma dados em decisões
// Fluxo: candles → indicadores → lógica → sinal → Supabase → Realtime
// =============================================================

import {
  OHLCVCandle,
  calcRSI,
  calcMACD,
  calcBollingerBands,
  calcATR,
  calcVolumeStrength,
} from '../indicators';
import { calcKellyPosition } from '../risk/kelly';
import { calcStopLoss } from '../risk/stopLoss';
import { createClient } from '@supabase/supabase-js';

export interface SignalEngineConfig {
  // Parâmetros dos indicadores
  rsiPeriod?: number;
  rsiOversold?: number;    // abaixo = sobrevendido → BUY
  rsiOverbought?: number;  // acima = sobrecomprado → SELL
  macdFast?: number;
  macdSlow?: number;
  macdSignalPeriod?: number;
  bbPeriod?: number;
  bbStdDev?: number;
  atrPeriod?: number;

  // Parâmetros de risco
  capitalTotal?: number;
  maxRiskPct?: number;
  winRate?: number;
  avgWinPct?: number;
  avgLossPct?: number;

  // Quantos sinais devem concordar para disparar (padrão: 2 de N)
  minIndicatorsToFire?: number;
}

export interface SignalResult {
  ticker: string;
  direction: 'BUY' | 'SELL' | 'HOLD';
  strength: number;             // 0 a 1 — confiança do sinal
  indicatorsFired: string[];    // quais indicadores geraram o sinal
  currentPrice: number;

  // Indicadores calculados (para debug/log)
  indicators: {
    rsi: number | null;
    macdHistogram: number | null;
    macdBullishCross: boolean;
    macdBearishCross: boolean;
    bbPercentB: number | null;
    bbSqueeze: boolean;
    volumeRatio: number;
    atr: number | null;
  };

  // Níveis de entrada/saída
  entryPrice: number;
  stopLoss: number | null;
  takeProfit: number | null;
  riskRewardRatio: number | null;

  // Sizing (baseado em Kelly)
  suggestedPositionSizeR$: number | null;
  maxLossR$: number | null;

  timestamp: string;
}

const DEFAULT_CONFIG: Required<SignalEngineConfig> = {
  rsiPeriod: 14,
  rsiOversold: 30,
  rsiOverbought: 70,
  macdFast: 12,
  macdSlow: 26,
  macdSignalPeriod: 9,
  bbPeriod: 20,
  bbStdDev: 2,
  atrPeriod: 14,
  capitalTotal: 50,
  maxRiskPct: 0.02,
  winRate: 0.55,
  avgWinPct: 0.03,
  avgLossPct: 0.015,
  minIndicatorsToFire: 2,
};

// =============================================================
// FUNÇÃO PRINCIPAL: runSignalEngine
// Recebe candles e retorna um sinal completo com sizing e proteções
// =============================================================
export function runSignalEngine(
  ticker: string,
  candles: OHLCVCandle[],
  config: SignalEngineConfig = {}
): SignalResult {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const closes = candles.map((c) => c.close);
  const currentPrice = closes[closes.length - 1];

  // ─── CALCULAR INDICADORES ────────────────────────────────────
  const rsi = calcRSI(closes, cfg.rsiPeriod);
  const macd = calcMACD(closes, cfg.macdFast, cfg.macdSlow, cfg.macdSignalPeriod);
  const bb = calcBollingerBands(closes, cfg.bbPeriod, cfg.bbStdDev);
  const atr = calcATR(candles, cfg.atrPeriod);
  const volume = calcVolumeStrength(candles, 20);

  // ─── LÓGICA DE SINAL ─────────────────────────────────────────
  const buyIndicators: string[] = [];
  const sellIndicators: string[] = [];

  // RSI Oversold → BUY
  if (rsi !== null && rsi < cfg.rsiOversold) {
    buyIndicators.push(`RSI_OVERSOLD(${rsi})`);
  }
  // RSI Overbought → SELL
  if (rsi !== null && rsi > cfg.rsiOverbought) {
    sellIndicators.push(`RSI_OVERBOUGHT(${rsi})`);
  }

  // MACD Bullish Cross → BUY
  if (macd?.bullishCross) {
    buyIndicators.push('MACD_BULLISH_CROSS');
  }
  // MACD Bearish Cross → SELL
  if (macd?.bearishCross) {
    sellIndicators.push('MACD_BEARISH_CROSS');
  }
  // MACD Histogram positivo e crescendo → BUY
  if (macd && macd.histogram > 0) {
    buyIndicators.push(`MACD_HIST_POSITIVE(${macd.histogram.toFixed(4)})`);
  }
  // MACD Histogram negativo e caindo → SELL
  if (macd && macd.histogram < 0) {
    sellIndicators.push(`MACD_HIST_NEGATIVE(${macd.histogram.toFixed(4)})`);
  }

  // Bollinger Bands: preço na banda inferior → BUY
  if (bb && bb.percentB < 0.05) {
    buyIndicators.push(`BB_LOWER_TOUCH(${bb.percentB})`);
  }
  // Bollinger Bands: preço na banda superior → SELL
  if (bb && bb.percentB > 0.95) {
    sellIndicators.push(`BB_UPPER_TOUCH(${bb.percentB})`);
  }

  // Volume confirma? (bônus de força — não conta como indicador)
  const volumeBonus = volume.isAboveAverage ? 0.1 : 0;

  // ─── DETERMINAÇÃO DO SINAL ──────────────────────────────────
  let direction: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
  let indicatorsFired: string[] = [];
  let strength = 0;

  if (buyIndicators.length >= cfg.minIndicatorsToFire &&
      buyIndicators.length > sellIndicators.length) {
    direction = 'BUY';
    indicatorsFired = buyIndicators;
    // Força = proporção de indicadores que dispararam + bônus de volume
    strength = Math.min(buyIndicators.length / 4 + volumeBonus, 1);
  } else if (sellIndicators.length >= cfg.minIndicatorsToFire &&
             sellIndicators.length > buyIndicators.length) {
    direction = 'SELL';
    indicatorsFired = sellIndicators;
    strength = Math.min(sellIndicators.length / 4 + volumeBonus, 1);
  } else {
    direction = 'HOLD';
    indicatorsFired = [];
    strength = 0;
  }

  // ─── STOP LOSS & TAKE PROFIT ─────────────────────────────────
  let stopLoss: number | null = null;
  let takeProfit: number | null = null;
  let rrRatio: number | null = null;

  if (atr && direction !== 'HOLD') {
    const stopCalc = calcStopLoss({
      entryPrice: currentPrice,
      atr,
      direction: direction === 'BUY' ? 'LONG' : 'SHORT',
      atrMultiplier: 2,
      rrRatio: 1.5,
      capital: cfg.capitalTotal,
      maxRiskPct: cfg.maxRiskPct,
    });
    stopLoss = stopCalc.stopLoss;
    takeProfit = stopCalc.takeProfit;
    rrRatio = stopCalc.riskRewardRatio;
  }

  // ─── KELLY POSITION SIZING ───────────────────────────────────
  let suggestedPositionSizeR$ : number | null = null;
  let maxLossR$ : number | null = null;

  if (direction !== 'HOLD' && cfg.capitalTotal > 0) {
    const kelly = calcKellyPosition({
      winRate: cfg.winRate,
      avgWinPct: cfg.avgWinPct,
      avgLossPct: cfg.avgLossPct,
      capitalTotal: cfg.capitalTotal,
      maxRiskPct: cfg.maxRiskPct,
    });
    suggestedPositionSizeR$ = kelly.positionSizeR$;
    maxLossR$ = kelly.maxLossR$;
  }

  return {
    ticker,
    direction,
    strength: parseFloat(strength.toFixed(4)),
    indicatorsFired,
    currentPrice,
    indicators: {
      rsi,
      macdHistogram: macd?.histogram ?? null,
      macdBullishCross: macd?.bullishCross ?? false,
      macdBearishCross: macd?.bearishCross ?? false,
      bbPercentB: bb?.percentB ?? null,
      bbSqueeze: bb?.squeeze ?? false,
      volumeRatio: volume.ratio,
      atr,
    },
    entryPrice: currentPrice,
    stopLoss,
    takeProfit,
    riskRewardRatio: rrRatio,
    suggestedPositionSizeR$,
    maxLossR$,
    timestamp: new Date().toISOString(),
  };
}


// =============================================================
// FUNÇÃO: persistSignal
// O que faz: Salva o sinal no Supabase e dispara Realtime broadcast
// Por que existe: Frontend recebe o sinal em tempo real via WebSocket
// =============================================================
export async function persistSignal(
  signal: SignalResult,
  supabaseUrl: string,
  supabaseKey: string
): Promise<{ id: string } | null> {
  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data, error } = await supabase
    .from('signals')
    .insert({
      ticker: signal.ticker,
      direction: signal.direction,
      strength: signal.strength,
      rsi_value: signal.indicators.rsi,
      macd_histogram: signal.indicators.macdHistogram,
      bb_upper: null, // expandível
      atr_value: signal.indicators.atr,
      entry_price: signal.entryPrice,
      stop_loss: signal.stopLoss,
      take_profit: signal.takeProfit,
      suggested_size: signal.suggestedPositionSizeR$,
      indicators_fired: signal.indicatorsFired,
      status: signal.direction === 'HOLD' ? 'EXPIRED' : 'ACTIVE',
      expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1h
    })
    .select('id')
    .single();

  if (error) {
    console.error('[SignalEngine] Erro ao persistir sinal:', error.message);
    return null;
  }

  // O Supabase Realtime vai automaticamente fazer broadcast
  // para todos os clientes inscritos na tabela 'signals'
  console.log(`[SignalEngine] Sinal ${signal.direction} para ${signal.ticker} persistido: ${data.id}`);
  return { id: data.id };
}


// =============================================================
// HOOK DE REALTIME — para usar no frontend (Next.js Client Component)
// =============================================================
export const REALTIME_SIGNALS_CHANNEL = 'signals-realtime';

// Exemplo de uso no frontend:
// const supabase = createBrowserClient(url, key)
// const channel = supabase.channel(REALTIME_SIGNALS_CHANNEL)
//   .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'signals' },
//     (payload) => { console.log('Novo sinal:', payload.new) }
//   )
//   .subscribe()
