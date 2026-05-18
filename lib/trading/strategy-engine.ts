// =============================================================
// TRADEFORGE SOVEREIGN — Strategy Engine v5
// ──────────────────────────────────────────────────────────────
// FONTE ÚNICA DE VERDADE (SSOT) para toda a lógica de trading.
//
// Este arquivo é importado por:
//   • app/trading/api/backtest/route.ts       (backtest single-ativo)
//   • app/trading/api/backtest-basket/route.ts (backtest multi-ativo)
//   • (futuro) lib/trading/live-bot.ts         (bot real)
//   • (futuro) app/api/signals/generate/route.ts
//
// Regra de ouro:
//   Se a lógica mudar aqui, ela muda em TODOS os lugares ao mesmo tempo.
//   Nunca copie lógica de trading para outro arquivo — sempre importe daqui.
//
// Recursos:
//   • Indicadores: EMA, RSI, MACD Histogram, Bollinger Bands, ATR, ADX (novo)
//   • Filtro de mercado lateral via ADX (evita trades em range)
//   • Motor de posição candle a candle (stepPosition)
//   • Saída 3-tier (30/30/40), 2-tier (50/50) ou simples
//   • Trailing stop por R-units
//   • Risco progressivo (cresce → risco diminui)
//   • Circuit breaker (queda → pausa automática)
//   • Saída por tempo (X candles sem resolver → fecha a mercado)
//   • Meta de banca (atingiu N× → para o bot)
//   • Slippage / comissão realista
//   • Dados: Binance (cripto) + Yahoo Finance (ações)
// =============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

// ─────────────────────────────────────────────────────────────
// TIPOS FUNDAMENTAIS
// ─────────────────────────────────────────────────────────────

export interface CandleData {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type TradeDirection = 'LONG' | 'SHORT' | 'NEUTRAL';

/** Configuração completa da estratégia.
 *  Armazenar no Supabase (tabela bot_configs) e carregar no bot real.
 *  O backtest e o bot usam EXATAMENTE este objeto — sem divergências. */
export interface StrategyConfig {
  // ── Sinal ──────────────────────────────────────────────────
  rsiLow:         number;   // RSI < rsiLow  → voto de LONG
  rsiHigh:        number;   // RSI > rsiHigh → voto de SHORT
  smaPeriod:      number;   // período da EMA de tendência (EMA200)
  trendFilter:    boolean;  // bloqueia trades contra EMA200
  adxPeriod:      number;   // período do ADX (padrão: 14)
  adxMinStrength: number;   // ADX < N → mercado lateral → sem trades (padrão: 20)
  useAdxFilter:   boolean;  // ativar/desativar filtro ADX

  // ── Stop Loss ──────────────────────────────────────────────
  stopLossPercent: number;  // % fixo quando useATRStop = false
  atrMultiplier:   number;  // stop = ATR × N (padrão: 2.0)
  useATRStop:      boolean; // usar ATR em vez de % fixo

  // ── Alvo / R:R ─────────────────────────────────────────────
  minRiskReward:  number;   // mínimo R:R para abrir trade

  // ── Posição ────────────────────────────────────────────────
  riskPerTrade:   number;   // % do capital por trade (ex: 0.02 = 2%)
  fixedRiskAmount: boolean; // usar capital inicial para base do risco

  // ── Saídas ─────────────────────────────────────────────────
  trailingStop:   boolean;  // ativar trailing stop
  trailRUnits:    number;   // trail N R-units atrás do pico
  scaledExits:    boolean;  // saída 3 camadas (30/30/40)
  partialExit:    boolean;  // saída 2 camadas (50/50)

  // ── Freios de segurança ────────────────────────────────────
  progressiveRisk:    boolean; // reduz risco conforme banca cresce
  circuitBreaker:     number;  // % de queda desde pico → pausa N dias (0 = off)
  maxCandlesInTrade:  number;  // 0 = sem limite | N = fecha após N candles
  balanceTarget:      number;  // 0 = sem meta | N = para ao atingir N× inicial

  // ── Execução realista ──────────────────────────────────────
  slippage: number; // custo por trade em % (taxas + spread, ex: 0.001 = 0.1%)

  // ── Filtros avançados ──────────────────────────────────────
  // Volume rígido: sem volume real por trás, é manipulação
  useVolumeFilter: boolean;  // trava: bloqueia sinal se volume < volumeThreshold × média20
  volumeThreshold: number;   // ex: 0.8 = requer 80% do volume médio de 20 períodos

  // Threshold de votos (o basket route aumenta isso para altcoins quando BTC está bearish)
  minVotesLong:  number;     // mínimo de votos para validar LONG (padrão: 2)
  minVotesShort: number;     // mínimo de votos para validar SHORT (padrão: 2)
}

export const DEFAULT_CONFIG: StrategyConfig = {
  rsiLow: 30, rsiHigh: 70, smaPeriod: 200, trendFilter: true,
  adxPeriod: 14, adxMinStrength: 20, useAdxFilter: true,
  stopLossPercent: 0.015, atrMultiplier: 2.0, useATRStop: true,
  minRiskReward: 2.0,
  riskPerTrade: 0.02, fixedRiskAmount: true,
  trailingStop: true, trailRUnits: 2.0,
  scaledExits: true, partialExit: false,
  progressiveRisk: true, circuitBreaker: 15,
  maxCandlesInTrade: 0, balanceTarget: 0,
  slippage: 0.001,
  // Filtros avançados — padrão ligado
  useVolumeFilter: true, volumeThreshold: 0.8,
  minVotesLong: 2, minVotesShort: 2,
};

export interface OpenPosition {
  signal:       'LONG' | 'SHORT';
  entryPrice:   number;
  riskAmount:   number;   // $ arriscado (já descontado slippage)
  rd:           number;   // risk distance em $ (entryPrice × stopDistPct)
  stop:         number;
  peak:         number;
  t1Hit:        boolean;
  t2Hit:        boolean;
  partialProfit: number;
  tp1:          number;
  tp2:          number;
  tp3:          number;
  candlesOpen:  number;
}

export interface TradeStepResult {
  closed:     true;
  profit:     number;
  isWin:      boolean;
  exitPrice:  number;
  exitReason: string;
}

export interface PositionActive {
  closed: false;
  pos: OpenPosition;
}

export interface SignalResult {
  signal:      TradeDirection;
  adx:         number;   // força da tendência (0-100)
  volume:      number;   // volume do último candle
  avgVolume:   number;   // média de volume dos últimos 20 candles
  volumeRatio: number;   // vol / avgVol — ex: 1.3 = 30% acima da média
  votesLong:   number;   // votos de compra acumulados
  votesShort:  number;   // votos de venda acumulados
  blockedBy?:  'ADX' | 'TREND_FILTER' | 'INSUFFICIENT_VOTES' | 'VOLUME';
}

// ─────────────────────────────────────────────────────────────
// INDICADORES — versão escalar (retorna o último valor)
// ─────────────────────────────────────────────────────────────

/** EMA escalar — retorna apenas o último valor */
export function ema(data: number[], period: number): number {
  if (data.length < period) return data[data.length - 1] ?? 0;
  const k = 2 / (period + 1);
  let v = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < data.length; i++) v = data[i] * k + v * (1 - k);
  return v;
}

/** RSI — Wilder's RSI (14 períodos padrão) */
export function rsi(closes: number[], period = 14): number {
  if (closes.length < period + 2) return 50;
  let g = 0, l = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) g += d; else l -= d;
  }
  const ag = g / period, al = l / period;
  if (al === 0) return 100;
  return 100 - 100 / (1 + ag / al);
}

/** MACD Histogram — retorna apenas o histograma (macdLine - signalLine) */
export function macdHistogram(closes: number[]): number {
  if (closes.length < 35) return 0;
  const series: number[] = [];
  for (let i = 26; i <= closes.length; i++) {
    series.push(ema(closes.slice(0, i), 12) - ema(closes.slice(0, i), 26));
  }
  return series[series.length - 1] - ema(series, 9);
}

/** ATR — Average True Range (Wilder's smoothing) */
export function atr(candles: CandleData[], period = 14): number {
  if (candles.length < period + 1) return 0;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    trs.push(Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low  - candles[i - 1].close),
    ));
  }
  return trs.slice(-period).reduce((a, b) => a + b, 0) / period;
}

// ─────────────────────────────────────────────────────────────
// ADX — Average Directional Index
// ─────────────────────────────────────────────────────────────
// O que mede: a FORÇA da tendência (não a direção).
// ADX < 20  → mercado lateral ("mastigando") → sinais falsos → NÃO OPERAR
// ADX 20-25 → tendência fraca, entrando em movimento
// ADX > 25  → tendência moderada → OPERAR
// ADX > 40  → tendência forte → OPERAR com confiança
//
// O algoritmo usa suavização de Wilder (não EMA padrão):
//   novo_valor = valor_anterior × (N-1)/N + valor_atual / N
// ─────────────────────────────────────────────────────────────
export interface ADXResult {
  adx:      number;  // força da tendência (0-100)
  plusDI:   number;  // força direcional positiva (compra)
  minusDI:  number;  // força direcional negativa (venda)
}

export function calcADX(candles: CandleData[], period = 14): ADXResult {
  const empty = { adx: 0, plusDI: 0, minusDI: 0 };
  if (candles.length < period * 2 + 2) return empty;

  const trs:  number[] = [];
  const pdms: number[] = [];  // +DM (Directional Movement positivo)
  const mdms: number[] = [];  // -DM (Directional Movement negativo)

  for (let i = 1; i < candles.length; i++) {
    const c = candles[i], p = candles[i - 1];
    // True Range
    trs.push(Math.max(
      c.high - c.low,
      Math.abs(c.high - p.close),
      Math.abs(c.low  - p.close),
    ));
    // +DM: alta de hoje > queda de hoje e positivo
    const up = c.high - p.high;
    const dn = p.low  - c.low;
    pdms.push(up > dn && up > 0 ? up : 0);
    mdms.push(dn > up && dn > 0 ? dn : 0);
  }

  // Inicializa com soma dos primeiros N valores (Wilder)
  let sTR  = trs.slice(0, period).reduce((a, b) => a + b, 0);
  let sPDM = pdms.slice(0, period).reduce((a, b) => a + b, 0);
  let sMDM = mdms.slice(0, period).reduce((a, b) => a + b, 0);

  const dxSeries: number[] = [];
  let lastPDI = 0, lastMDI = 0;

  for (let i = period; i < trs.length; i++) {
    // Suavização de Wilder: retira 1/N do total e adiciona o novo valor
    sTR  = sTR  - sTR  / period + trs[i];
    sPDM = sPDM - sPDM / period + pdms[i];
    sMDM = sMDM - sMDM / period + mdms[i];

    if (sTR === 0) { dxSeries.push(0); continue; }

    lastPDI = 100 * sPDM / sTR;
    lastMDI = 100 * sMDM / sTR;
    const sumDI = lastPDI + lastMDI;
    dxSeries.push(sumDI > 0 ? 100 * Math.abs(lastPDI - lastMDI) / sumDI : 0);
  }

  if (dxSeries.length < period) return empty;

  // ADX = Wilder smoothing da série DX
  let adxVal = dxSeries.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < dxSeries.length; i++) {
    adxVal = (adxVal * (period - 1) + dxSeries[i]) / period;
  }

  return {
    adx:     Math.round(adxVal * 100) / 100,
    plusDI:  Math.round(lastPDI * 100) / 100,
    minusDI: Math.round(lastMDI * 100) / 100,
  };
}

// ─────────────────────────────────────────────────────────────
// RISCO PROGRESSIVO
// Quanto mais a banca cresce, menor o risco percentual.
// Isso evita que uma conta de R$1M arrisque R$100k num stop.
// ─────────────────────────────────────────────────────────────
export function getProgressiveRisk(
  baseRisk: number,
  currentBalance: number,
  initialBalance: number,
): number {
  const g = currentBalance / initialBalance;
  if (g >= 20) return baseRisk * 0.05;
  if (g >= 10) return baseRisk * 0.10;
  if (g >=  5) return baseRisk * 0.25;
  if (g >=  2) return baseRisk * 0.50;
  return baseRisk;
}

// ─────────────────────────────────────────────────────────────
// MOTOR DE SINAL (SSOT)
// Recebe um slice de candles e a config → retorna LONG/SHORT/NEUTRAL
// Inclui: EMA200 trend filter + ADX market-condition filter
// ─────────────────────────────────────────────────────────────
export function computeSignal(
  slice: CandleData[],
  config: Pick<StrategyConfig,
    'rsiLow' | 'rsiHigh' | 'smaPeriod' | 'trendFilter' |
    'adxPeriod' | 'adxMinStrength' | 'useAdxFilter' |
    'useVolumeFilter' | 'volumeThreshold' |
    'minVotesLong' | 'minVotesShort'>,
  debug = false,
): SignalResult {
  const closes    = slice.map(c => c.close);
  const price     = closes[closes.length - 1];
  const prevPrice = closes[closes.length - 2] ?? price;

  // ── Indicadores ─────────────────────────────────────────
  const ema200  = ema(closes, config.smaPeriod);
  const ema50   = ema(closes, 50);
  const rsiVal  = rsi(closes);
  const macdH   = macdHistogram(closes);

  // Bollinger Bands (inline para não criar dependência circular)
  const bb20   = closes.slice(-20);
  const bbMean = bb20.reduce((a, b) => a + b, 0) / 20;
  const bbStd  = Math.sqrt(bb20.reduce((s, c) => s + (c - bbMean) ** 2, 0) / 20);

  // Volume
  const vol     = slice[slice.length - 1].volume;
  const avgVol  = slice.slice(-20).reduce((s, c) => s + c.volume, 0) / 20;
  const volRatio = avgVol > 0 ? vol / avgVol : 1;

  // ADX — FILTRO DE MERCADO LATERAL
  const adxData = config.useAdxFilter
    ? calcADX(slice, config.adxPeriod)
    : { adx: 100, plusDI: 50, minusDI: 50 };

  // ── TRAVA DE VOLUME RÍGIDO ────────────────────────────────
  // Antes era um "bônus" — agora é uma barreira de entrada.
  // Se o movimento não tem dinheiro por trás, é ruído ou manipulação.
  // volumeThreshold = 0.8 significa: requer ao menos 80% do volume médio.
  if (config.useVolumeFilter && volRatio < config.volumeThreshold) {
    if (debug) {
      console.log(`[computeSignal] 🔇 VOLUME bloqueou sinal | vol=${vol.toFixed(0)} avgVol=${avgVol.toFixed(0)} ratio=${volRatio.toFixed(2)} threshold=${config.volumeThreshold}`);
    }
    return {
      signal: 'NEUTRAL', adx: adxData.adx,
      volume: vol, avgVolume: avgVol, volumeRatio: volRatio,
      votesLong: 0, votesShort: 0,
      blockedBy: 'VOLUME',
    };
  }

  // ── Votação ──────────────────────────────────────────────
  let lS = 0, sS = 0;
  // EMA200 direcional
  if (price > ema200) lS++; else sS++;
  // Cruzamento da EMA50 (momentum entry)
  if (price > ema50 && prevPrice <= ema50) lS++;
  if (price < ema50 && prevPrice >= ema50) sS++;
  // RSI
  if (rsiVal < config.rsiLow)  lS++;
  if (rsiVal > config.rsiHigh) sS++;
  // MACD histogram
  if (macdH > 0) lS++; if (macdH < 0) sS++;
  // Bollinger Bands
  if (price <= bbMean - 2 * bbStd) lS++;
  if (price >= bbMean + 2 * bbStd) sS++;
  // Volume como bônus (apenas quando o sinal já passou a trava rígida acima)
  if (volRatio > 1.2) { lS++; sS++; }

  if (debug) {
    console.log(
      `[computeSignal] price=${price.toFixed(4)} ema200=${ema200.toFixed(4)} ` +
      `rsi=${rsiVal.toFixed(1)} macd=${macdH.toFixed(6)} ` +
      `adx=${adxData.adx.toFixed(1)} vol=${volRatio.toFixed(2)}x ` +
      `votes L=${lS}/S=${sS} thresholds L≥${config.minVotesLong}/S≥${config.minVotesShort}`,
    );
  }

  // Thresholds configuráveis: o basket route aumenta minVotesLong quando BTC está bearish
  let signal: TradeDirection = 'NEUTRAL';
  if      (lS >= config.minVotesLong  && lS > sS) signal = 'LONG';
  else if (sS >= config.minVotesShort && sS > lS) signal = 'SHORT';
  else return {
    signal: 'NEUTRAL', adx: adxData.adx,
    volume: vol, avgVolume: avgVol, volumeRatio: volRatio,
    votesLong: lS, votesShort: sS,
    blockedBy: 'INSUFFICIENT_VOTES',
  };

  // ── ADX: filtra mercado lateral ───────────────────────────
  if (config.useAdxFilter && adxData.adx < config.adxMinStrength) {
    if (debug) console.log(`[computeSignal] ADX bloqueou: ${adxData.adx.toFixed(1)} < ${config.adxMinStrength}`);
    return {
      signal: 'NEUTRAL', adx: adxData.adx,
      volume: vol, avgVolume: avgVol, volumeRatio: volRatio,
      votesLong: lS, votesShort: sS,
      blockedBy: 'ADX',
    };
  }

  // ── Filtro de tendência (EMA200) ──────────────────────────
  if (config.trendFilter) {
    if (signal === 'LONG'  && price < ema200) {
      return { signal: 'NEUTRAL', adx: adxData.adx, volume: vol, avgVolume: avgVol, volumeRatio: volRatio, votesLong: lS, votesShort: sS, blockedBy: 'TREND_FILTER' };
    }
    if (signal === 'SHORT' && price > ema200) {
      return { signal: 'NEUTRAL', adx: adxData.adx, volume: vol, avgVolume: avgVol, volumeRatio: volRatio, votesLong: lS, votesShort: sS, blockedBy: 'TREND_FILTER' };
    }
  }

  return { signal, adx: adxData.adx, volume: vol, avgVolume: avgVol, volumeRatio: volRatio, votesLong: lS, votesShort: sS };
}

// ─────────────────────────────────────────────────────────────
// CRIAÇÃO DE POSIÇÃO
// ─────────────────────────────────────────────────────────────
export function createPosition(
  signal:       'LONG' | 'SHORT',
  price:        number,
  riskAmount:   number,
  stopDistPct:  number,  // % de distância do stop
  config:       Pick<StrategyConfig, 'minRiskReward' | 'slippage'>,
): OpenPosition {
  // Slippage: penaliza a entrada. LONG entra mais caro, SHORT entra mais barato.
  const dir       = signal === 'LONG' ? 1 : -1;
  const entryPrice = price * (1 + dir * config.slippage);
  const rd        = entryPrice * stopDistPct;

  return {
    signal,
    entryPrice,
    riskAmount: riskAmount * (1 - config.slippage), // já desconta comissão estimada
    rd,
    stop:          entryPrice - dir * rd,
    peak:          entryPrice,
    t1Hit:         false,
    t2Hit:         false,
    partialProfit: 0,
    tp1:           entryPrice + dir * rd,                               // 1:1
    tp2:           entryPrice + dir * rd * (config.minRiskReward / 2),  // R:R/2
    tp3:           entryPrice + dir * rd * config.minRiskReward,        // alvo final
    candlesOpen:   0,
  };
}

// ─────────────────────────────────────────────────────────────
// MOTOR DE POSIÇÃO — State Machine Candle a Candle (SSOT)
// ─────────────────────────────────────────────────────────────
// Esta função é o coração do sistema de gestão de trades.
// Ela avança UM candle por vez e decide se o trade deve continuar
// ou ser fechado. Isso permite:
//   1. Sincronizar múltiplos ativos (basket) no mesmo instante
//   2. Verificar risco global antes de abrir novas posições
//   3. Garantir que backtest e bot real usem EXATAMENTE a mesma lógica
//
// Modos de saída:
//   - 3-tier (scaledExits): 30% TP1 | 30% TP2 | 40% trailing
//   - 2-tier (partialExit): 50% TP1 | 50% TP2
//   - Simples: 100% no alvo final
// ─────────────────────────────────────────────────────────────
export function stepPosition(
  pos:    OpenPosition,
  c:      CandleData,
  config: Pick<StrategyConfig,
    'trailingStop' | 'trailRUnits' | 'scaledExits' | 'partialExit' |
    'maxCandlesInTrade' | 'minRiskReward' | 'slippage'>,
): TradeStepResult | PositionActive {

  const dir    = pos.signal === 'LONG' ? 1 : -1;
  const worse  = (a: number, b: number) => pos.signal === 'LONG' ? a < b : a > b;
  const better = (a: number, b: number) => pos.signal === 'LONG' ? a > b : a < b;

  const stopHit = pos.signal === 'LONG' ? c.low  <= pos.stop : c.high >= pos.stop;
  const tp1Hit  = pos.signal === 'LONG' ? c.high >= pos.tp1  : c.low  <= pos.tp1;
  const tp2Hit  = pos.signal === 'LONG' ? c.high >= pos.tp2  : c.low  <= pos.tp2;
  const tp3Hit  = pos.signal === 'LONG' ? c.high >= pos.tp3  : c.low  <= pos.tp3;

  // Cópia imutável do estado
  let p: OpenPosition = { ...pos, candlesOpen: pos.candlesOpen + 1 };

  // ── Saída por Tempo ───────────────────────────────────────
  if (config.maxCandlesInTrade > 0 && p.candlesOpen >= config.maxCandlesInTrade) {
    // Aplica slippage de saída: sai um pouco pior
    const exitPrice   = c.close * (1 - dir * config.slippage);
    const priceDelta  = (exitPrice - p.entryPrice) * dir;
    const rUnits      = priceDelta / p.rd;
    const remaining   = p.t2Hit ? 0.4 : p.t1Hit ? (config.scaledExits ? 0.7 : 0.5) : 1.0;
    const profit      = p.partialProfit + rUnits * p.riskAmount * remaining;
    return {
      closed: true, profit, isWin: profit > 0,
      exitPrice, exitReason: `Tempo (${config.maxCandlesInTrade}c)`,
    };
  }

  // ── Trailing Stop ─────────────────────────────────────────
  if (config.trailingStop) {
    const favorable = p.signal === 'LONG' ? c.high : c.low;
    if (better(favorable, p.peak)) {
      p.peak = favorable;
      const trail = p.peak - dir * p.rd * config.trailRUnits;
      if (worse(p.stop, trail)) p.stop = trail;
    }
  }

  // ── 3-Tier (30/30/40) ─────────────────────────────────────
  if (config.scaledExits) {
    if (!p.t1Hit && tp1Hit) {
      p.t1Hit         = true;
      p.partialProfit += p.riskAmount * 1.0 * 0.3;            // 30% em 1:1
      if (worse(p.stop, p.entryPrice)) p.stop = p.entryPrice; // stop → BE
    }
    if (p.t1Hit && !p.t2Hit && tp2Hit) {
      p.t2Hit          = true;
      p.partialProfit  += p.riskAmount * (config.minRiskReward / 2) * 0.3; // 30% em R:R/2
      if (worse(p.stop, p.tp1)) p.stop = p.tp1;              // stop → TP1
    }
    if (stopHit) {
      const lockedR    = (p.stop - p.entryPrice) * dir / p.rd;
      const remaining  = p.t2Hit ? 0.4 : p.t1Hit ? 0.7 : 1.0;
      const addP       = Math.max(0, lockedR) * p.riskAmount * remaining;
      const profit     = p.t1Hit || p.t2Hit ? p.partialProfit + addP : -p.riskAmount;
      const exitPrice  = p.stop * (1 - dir * config.slippage);
      return {
        closed: true, profit, isWin: profit > 0, exitPrice,
        exitReason: p.t2Hit ? 'TP2+Trail' : p.t1Hit ? 'TP1+BE' : 'Stop Loss',
      };
    }
    if (tp3Hit) {
      const exitPrice = p.tp3 * (1 - dir * config.slippage);
      const profit    = p.partialProfit + p.riskAmount * config.minRiskReward * 0.4;
      return { closed: true, profit, isWin: true, exitPrice, exitReason: 'TP3 ✓' };
    }
    return { closed: false, pos: p };
  }

  // ── 2-Tier (50/50) ────────────────────────────────────────
  if (config.partialExit) {
    if (!p.t1Hit && tp1Hit) {
      p.t1Hit         = true;
      p.partialProfit = p.riskAmount * 0.5;
      if (worse(p.stop, p.entryPrice)) p.stop = p.entryPrice;
    }
    if (stopHit) {
      const exitPrice = p.stop * (1 - dir * config.slippage);
      if (p.t1Hit) {
        const lockedR = (p.stop - p.entryPrice) * dir / p.rd;
        const profit  = p.partialProfit + Math.max(0, lockedR) * p.riskAmount * 0.5;
        return { closed: true, profit, isWin: profit > 0, exitPrice, exitReason: 'TP1+Trail' };
      }
      return { closed: true, profit: -p.riskAmount, isWin: false, exitPrice, exitReason: 'Stop Loss' };
    }
    if (tp3Hit) {
      const exitPrice = p.tp3 * (1 - dir * config.slippage);
      const profit    = p.partialProfit + p.riskAmount * config.minRiskReward * 0.5;
      return { closed: true, profit, isWin: true, exitPrice, exitReason: 'TP2 ✓' };
    }
    return { closed: false, pos: p };
  }

  // ── Simples ───────────────────────────────────────────────
  if (stopHit) {
    const exitPrice = p.stop * (1 - dir * config.slippage);
    return { closed: true, profit: -p.riskAmount, isWin: false, exitPrice, exitReason: 'Stop Loss' };
  }
  if (tp3Hit) {
    const exitPrice = p.tp3 * (1 - dir * config.slippage);
    return { closed: true, profit: p.riskAmount * config.minRiskReward, isWin: true, exitPrice, exitReason: 'Take Profit ✓' };
  }
  return { closed: false, pos: p };
}

// ─────────────────────────────────────────────────────────────
// PROVEDORES DE DADOS DE MERCADO
// ─────────────────────────────────────────────────────────────
// Detecta automaticamente se o símbolo é cripto (Binance) ou ação
// (Yahoo Finance) e normaliza os dados para o mesmo formato CandleData.

type MarketType = 'crypto' | 'stock';

/** Bases cripto conhecidas (sem sufixo USDT).
 *  Usado para normalizar entradas como "DOGE" → "DOGEUSDT" antes de chamar a Binance. */
const KNOWN_CRYPTO_BASES = new Set([
  'BTC', 'ETH', 'BNB', 'SOL', 'DOGE', 'ADA', 'XRP', 'DOT', 'LINK',
  'AVAX', 'MATIC', 'UNI', 'LTC', 'BCH', 'ATOM', 'ALGO', 'FIL', 'TRX',
  'SHIB', 'PEPE', 'WIF', 'BONK', 'SUI', 'APT', 'ARB', 'OP', 'INJ', 'SEI',
  'TON', 'NOT', 'JUP', 'TIA', 'BLUR', 'IMX', 'SAND', 'MANA', 'AXS',
  'FTM', 'NEAR', 'HBAR', 'VET', 'EGLD', 'THETA', 'AAVE', 'MKR', 'SNX',
]);

/**
 * Normaliza símbolos cripto para o formato da Binance.
 * "DOGE" → "DOGEUSDT" | "BTCUSDT" → "BTCUSDT" (idempotente)
 */
export function normalizeCryptoSymbol(symbol: string): string {
  const s = symbol.toUpperCase().trim();
  // Já termina em par de cotação → não mexe
  if (/USDT$|BUSD$|BTC$|ETH$|BNB$/.test(s)) return s;
  // Base cripto conhecida sem sufixo → adiciona USDT
  if (KNOWN_CRYPTO_BASES.has(s)) return `${s}USDT`;
  return s;
}

function detectMarket(symbol: string): MarketType {
  // Símbolos cripto têm USDT, BUSD, BTC, ETH etc. no final
  if (/USDT|BUSD$/i.test(symbol)) return 'crypto';
  // Bases cripto sem sufixo (ex: DOGE, SOL digitado sem USDT)
  if (KNOWN_CRYPTO_BASES.has(symbol.toUpperCase())) return 'crypto';
  return 'stock';
}

/**
 * Normaliza símbolos de ações para o formato aceito pelo Yahoo Finance.
 *
 * Regras:
 *   - Ações brasileiras (B3): 4 letras + 1-2 dígitos (PETR4, VALE3, MGLU3) → adiciona .SA
 *   - Símbolos já com sufixo (.SA, .L, .AX etc.)  → mantém como está
 *   - Ações americanas (SPY, QQQ, NVDA, JPM etc.)  → mantém como está
 *
 * Exemplos:
 *   'PETR4'   → 'PETR4.SA'
 *   'VALE3'   → 'VALE3.SA'
 *   'PETR4.SA'→ 'PETR4.SA'  (idempotente)
 *   'SPY'     → 'SPY'
 *   'QQQ'     → 'QQQ'
 */
function normalizeYahooSymbol(symbol: string): string {
  // Já tem sufixo de bolsa → não mexe
  if (symbol.includes('.')) return symbol;
  // Padrão B3: exatamente 4 letras seguidas de 1 ou 2 dígitos (PETR4, VALE3, MGLU3, BBAS3, ITUB4)
  if (/^[A-Z]{4}\d{1,2}$/.test(symbol.toUpperCase())) return `${symbol.toUpperCase()}.SA`;
  return symbol;
}

/** Mapeamento de intervalos: padrão interno → Yahoo Finance */
const YAHOO_INTERVAL_MAP: Record<string, string> = {
  '15m': '15m', '1h': '60m', '4h': '60m',  // Yahoo não tem 4h nativamente
  '1d': '1d',   '1w': '1wk',
};

/** Quanto histórico pedir ao Yahoo por intervalo.
 *  Calculado para cobrir até 2000 candles por requisição.
 *  2000 × 15m ≈ 21 dias  →  '60d' com folga
 *  2000 × 1h  ≈ 83 dias  →  '6mo' com folga     (antes estava '60m' — era um bug!)
 *  2000 × 4h  ≈ 333 dias →  '2y' com folga
 *  2000 × 1d  ≈ 8 anos   →  '10y' com folga
 */
const YAHOO_RANGE_MAP: Record<string, string> = {
  '15m': '60d', '1h': '6mo', '4h': '2y', '1d': '10y', '1w': '10y',
};

/** Busca candles da Binance (cripto) */
async function fetchBinanceCandles(
  symbol: string,
  interval: string,
  limit: number,
): Promise<CandleData[]> {
  // Binance klines: máximo oficial é 1000 candles por request
  const safeLimit = Math.min(limit, 1000);
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${safeLimit}`;
  const res  = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Binance API ${res.status} para ${symbol}: ${body.slice(0, 120)}`);
  }
  const data: unknown[][] = await res.json();
  return data.map((c) => ({
    timestamp: Number(c[0]),
    open:      Number(c[1]),
    high:      Number(c[2]),
    low:       Number(c[3]),
    close:     Number(c[4]),
    volume:    Number(c[5]),
  }));
}

/** Busca candles do Yahoo Finance (ações e ETFs: SPY, QQQ, NVDA, PETR4.SA, etc.) */
async function fetchYahooCandles(
  symbol: string,
  interval: string,
  limit: number,
): Promise<CandleData[]> {
  const yhInterval = YAHOO_INTERVAL_MAP[interval] ?? '60m';
  const yhRange    = YAHOO_RANGE_MAP[interval] ?? '3mo';

  // Normaliza símbolo: PETR4 → PETR4.SA, VALE3 → VALE3.SA etc.
  const normalizedSymbol = normalizeYahooSymbol(symbol);

  // Yahoo Finance API pública (sem autenticação)
  // Nota: o endpoint v8 é mais estável que o v7 para uso programático
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(normalizedSymbol)}`
    + `?interval=${yhInterval}&range=${yhRange}&includePrePost=false`;

  const res = await fetch(url, {
    headers: {
      // Yahoo exige um User-Agent válido para evitar bloqueio
      'User-Agent': 'Mozilla/5.0 TradeForge/1.0',
    },
  });
  if (!res.ok) throw new Error(`Yahoo Finance API erro ${res.status} para ${normalizedSymbol}${normalizedSymbol !== symbol ? ` (input: ${symbol})` : ''}`);

  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error(`Yahoo Finance: sem dados para ${normalizedSymbol}${normalizedSymbol !== symbol ? ` (input: ${symbol})` : ''}`);

  const timestamps: number[]  = result.timestamp ?? [];
  const quotes                = result.indicators?.quote?.[0] ?? {};
  const opens:   number[]     = quotes.open   ?? [];
  const highs:   number[]     = quotes.high   ?? [];
  const lows:    number[]     = quotes.low    ?? [];
  const closes:  number[]     = quotes.close  ?? [];
  const volumes: number[]     = quotes.volume ?? [];

  const candles: CandleData[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    // Yahoo pode retornar null em alguns campos (pré/pós market)
    if (closes[i] == null || highs[i] == null) continue;
    candles.push({
      timestamp: timestamps[i] * 1000,  // Yahoo usa segundos, Binance usa ms
      open:      opens[i]   ?? closes[i],
      high:      highs[i],
      low:       lows[i]    ?? closes[i],
      close:     closes[i],
      volume:    volumes[i] ?? 0,
    });
  }

  // Limita ao número solicitado (mais recentes primeiro → pegar o fim)
  return candles.slice(-Math.min(limit, 1000));
}

// ─────────────────────────────────────────────────────────────
// BYBIT — fallback quando a Binance estiver bloqueada/indisponível
// A Binance bloqueia IPs de cloud providers (Vercel, AWS etc.).
// A Bybit tem política mais permissiva para requisições server-side.
// ─────────────────────────────────────────────────────────────

/** Mapeamento de intervalos: padrão interno → Bybit */
const BYBIT_INTERVAL_MAP: Record<string, string> = {
  '1m': '1', '3m': '3', '5m': '5', '15m': '15', '30m': '30',
  '1h': '60', '2h': '120', '4h': '240', '6h': '360', '12h': '720',
  '1d': 'D', '1w': 'W', '1M': 'M',
};

/**
 * Busca candles da Bybit (linear = futuros perpétuos USDT).
 * Utilizado como fallback quando a Binance estiver inacessível.
 * Retorna no mesmo formato CandleData, ordenado do mais antigo para o mais recente.
 */
async function fetchBybitCandles(
  symbol:   string,
  interval: string,
  limit:    number,
): Promise<CandleData[]> {
  const bybitInterval = BYBIT_INTERVAL_MAP[interval] ?? '240';
  const safeLimit = Math.min(limit, 1000);

  // category=linear → futuros perpétuos USDT (preços muito próximos do spot)
  const url =
    `https://api.bybit.com/v5/market/kline` +
    `?category=linear&symbol=${encodeURIComponent(symbol)}` +
    `&interval=${bybitInterval}&limit=${safeLimit}`;

  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Bybit API ${res.status} para ${symbol}: ${body.slice(0, 120)}`);
  }

  const json = await res.json();
  const list: string[][] = json?.result?.list ?? [];
  if (list.length === 0) throw new Error(`Bybit: sem dados para ${symbol}`);

  // Bybit retorna do mais recente para o mais antigo — invertemos para manter a ordem cronológica
  return list
    .reverse()
    .map((c) => ({
      timestamp: Number(c[0]),
      open:      Number(c[1]),
      high:      Number(c[2]),
      low:       Number(c[3]),
      close:     Number(c[4]),
      volume:    Number(c[5]),
    }));
}

// ─────────────────────────────────────────────────────────────
// KUCOIN — fallback quando Binance E Bybit estiverem bloqueadas
// KuCoin tem política de IP mais permissiva para cloud providers.
// Não requer autenticação para dados públicos de mercado.
//
// ⚠️ ATENÇÃO — Formato não-padrão do KuCoin:
//   Candle index:  [0]=startTime  [1]=open  [2]=close  [3]=high  [4]=low  [5]=volume  [6]=amount
//   Diferença:     Binance/Bybit têm high=index2, low=index3, close=index4
//                  KuCoin inverte: close=index2, high=index3, low=index4
//
// Símbolo:  BTCUSDT → BTC-USDT  (com hífen, sem "USDT" direto)
// Timestamp: segundos × 1000 para ms (como Binance)
// Limite:   máximo 1500 candles por request
// ─────────────────────────────────────────────────────────────

/** Converte símbolo Binance → KuCoin: BNBUSDT → BNB-USDT */
function toKucoinSymbol(symbol: string): string {
  const s = symbol.toUpperCase();
  if (s.endsWith('USDT')) return `${s.slice(0, -4)}-USDT`;
  if (s.endsWith('BTC'))  return `${s.slice(0, -3)}-BTC`;
  if (s.endsWith('ETH'))  return `${s.slice(0, -3)}-ETH`;
  return s; // desconhecido — passa como está
}

/** Mapeamento de intervalos: padrão interno → KuCoin */
const KUCOIN_INTERVAL_MAP: Record<string, string> = {
  '1m': '1min', '3m': '3min', '5m': '5min', '15m': '15min', '30m': '30min',
  '1h': '1hour', '2h': '2hour', '4h': '4hour', '6h': '6hour', '8h': '8hour',
  '12h': '12hour', '1d': '1day', '1w': '1week',
};

/**
 * Busca candles da KuCoin.
 * Utilizado como 3º fallback: Binance → Bybit → KuCoin.
 * Retorna no mesmo formato CandleData, ordenado do mais antigo para o mais recente.
 */
async function fetchKucoinCandles(
  symbol:   string,
  interval: string,
  limit:    number,
): Promise<CandleData[]> {
  const kucoinSymbol   = toKucoinSymbol(symbol);
  const kucoinInterval = KUCOIN_INTERVAL_MAP[interval] ?? '4hour';
  const safeLimit      = Math.min(limit, 1500);

  // KuCoin exige startAt/endAt em segundos para paginar.
  // Para pegar os N candles mais recentes: endAt = agora, startAt = agora - (N × duração do candle)
  const intervalSeconds: Record<string, number> = {
    '1min': 60, '3min': 180, '5min': 300, '15min': 900, '30min': 1800,
    '1hour': 3600, '2hour': 7200, '4hour': 14400, '6hour': 21600, '8hour': 28800,
    '12hour': 43200, '1day': 86400, '1week': 604800,
  };
  const durSec  = intervalSeconds[kucoinInterval] ?? 14400;
  const endAt   = Math.floor(Date.now() / 1000);
  const startAt = endAt - safeLimit * durSec;

  const url =
    `https://api.kucoin.com/api/v1/market/candles` +
    `?type=${kucoinInterval}&symbol=${encodeURIComponent(kucoinSymbol)}` +
    `&startAt=${startAt}&endAt=${endAt}`;

  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`KuCoin API ${res.status} para ${kucoinSymbol}: ${body.slice(0, 120)}`);
  }

  const json = await res.json();
  if (json?.code !== '200000') {
    throw new Error(`KuCoin erro ${json?.code ?? 'desconhecido'} para ${kucoinSymbol}: ${json?.msg ?? ''}`);
  }

  const list: string[][] = json?.data ?? [];
  if (list.length === 0) throw new Error(`KuCoin: sem dados para ${kucoinSymbol}`);

  // KuCoin retorna do mais recente para o mais antigo — invertemos para ordem cronológica.
  // Formato KuCoin: [startTime, open, close, high, low, volume, amount]
  // ATENÇÃO: index 2 = close, index 3 = high, index 4 = low  (diferente de Binance/Bybit!)
  return list
    .reverse()
    .slice(-safeLimit)
    .map((c) => ({
      timestamp: Number(c[0]) * 1000,  // KuCoin usa segundos → converter para ms
      open:      Number(c[1]),
      high:      Number(c[3]),         // ← index 3, não 2!
      low:       Number(c[4]),         // ← index 4, não 3!
      close:     Number(c[2]),         // ← index 2, não 4!
      volume:    Number(c[5]),
    }));
}

/** Função principal de busca de candles — detecta a fonte automaticamente.
 *  Uso no bot real e nos backtests: sempre usar esta função.
 *  Estratégia de fallback (crypto): Binance → Bybit → KuCoin
 *  Exemplos:
 *    getCandles('BTCUSDT', '4h', 500)  → tenta Binance, Bybit, KuCoin
 *    getCandles('SPY', '1d', 500)      → Yahoo Finance
 *    getCandles('PETR4.SA', '1d', 250) → Yahoo Finance (B3)
 */
export async function getCandles(
  symbol:   string,
  interval: string,
  limit:    number,
): Promise<CandleData[]> {
  const market = detectMarket(symbol);
  if (market === 'crypto') {
    // Normaliza "DOGE" → "DOGEUSDT", "BTC" → "BTCUSDT" etc.
    const cryptoSymbol = normalizeCryptoSymbol(symbol);

    // 1ª tentativa: Binance
    try {
      return await fetchBinanceCandles(cryptoSymbol, interval, limit);
    } catch (binanceErr) {
      const msg = binanceErr instanceof Error ? binanceErr.message : String(binanceErr);
      console.warn(`[getCandles] Binance indisponível para ${cryptoSymbol} — tentando Bybit. Motivo: ${msg}`);
    }

    // 2ª tentativa: Bybit
    try {
      return await fetchBybitCandles(cryptoSymbol, interval, limit);
    } catch (bybitErr) {
      const msg = bybitErr instanceof Error ? bybitErr.message : String(bybitErr);
      console.warn(`[getCandles] Bybit indisponível para ${cryptoSymbol} — tentando KuCoin. Motivo: ${msg}`);
    }

    // 3ª tentativa: KuCoin (último recurso)
    return await fetchKucoinCandles(cryptoSymbol, interval, limit);
  } else {
    return fetchYahooCandles(symbol, interval, limit);
  }
}

// ─────────────────────────────────────────────────────────────
// BTC MARKET REGIME FILTER
// ─────────────────────────────────────────────────────────────
// Por que isso importa?
//   BTC lidera o mercado cripto — quando cai forte, puxa altcoins consigo.
//   Abrir LONGs em altcoins durante RISK_OFF é apostar contra a maré.
//
// Estratégia: quando regime = RISK_OFF, o basket route aumenta
//   minVotesLong para 4 (em vez de 2) → só trades com confirmação muito forte.
//   SHORT continua normal — tendência de queda é aliada.
//
// Critérios para RISK_OFF (qualquer um basta):
//   1. Preço < EMA200 × 0.98  → tendência de longo prazo é de baixa
//   2. Queda > 20% desde o pico dos últimos 100 candles → drawdown severo
//
// Dívida técnica: critérios calibrados para 4h. Ajustar para outros
//   timeframes se necessário (ex: 1d pode precisar de 30% de queda).
// ─────────────────────────────────────────────────────────────
export type BtcRegime = 'RISK_OFF' | 'NORMAL';

/**
 * Analisa candles do BTC e retorna o regime atual de mercado.
 * Use candles do mesmo intervalo do backtest (ex: 4h).
 *
 * @param btcCandles  - slice de candles do BTCUSDT (mínimo 50)
 * @returns 'RISK_OFF' se BTC está em queda relevante, 'NORMAL' caso contrário
 */
export function getBtcMarketRegime(btcCandles: CandleData[]): BtcRegime {
  if (btcCandles.length < 50) return 'NORMAL'; // dados insuficientes → conservador

  const closes = btcCandles.map(c => c.close);
  const last   = closes[closes.length - 1];

  // Critério 1: preço abaixo da EMA200 com folga de 2%
  // (evita sinais falsos em lateralizações ao redor da média)
  if (closes.length >= 200) {
    const ema200 = ema(closes, 200);
    if (last < ema200 * 0.98) {
      return 'RISK_OFF';
    }
  }

  // Critério 2: drawdown > 20% desde o pico dos últimos 100 candles
  // (detecta correções fortes mesmo quando EMA200 ainda não virou)
  const recent = closes.slice(-100);
  const peak   = Math.max(...recent);
  if (peak > 0 && (peak - last) / peak > 0.20) {
    return 'RISK_OFF';
  }

  return 'NORMAL';
}

// ─────────────────────────────────────────────────────────────
// FUNDING RATE FILTER  (apenas para sinais em tempo real)
// ─────────────────────────────────────────────────────────────
// O que é Funding Rate?
//   Taxas de liquidação em futuros perpétuos pagas entre longs e shorts.
//   Taxa muito positiva = longs pagam shorts → mercado overextended em alta
//   Taxa muito negativa = shorts pagam longs → mercado overextended em baixa
//
// Regra de uso sugerida no live bot:
//   funding > 0.001  (>0.1%/8h) → vetar novos LONGs (euforia perigosa)
//   funding < -0.001 → vetar novos SHORTs (pânico exagerado)
//
// ⚠️ AVISO IMPORTANTE — Dívida técnica:
//   Esta função acessa a API pública de Futuros da Binance.
//   Para backtests históricos, os dados de funding não estão disponíveis
//   gratuitamente — use esta função APENAS no bot ao vivo.
//   No backtest, os testes de funding são omitidos (retorna 0).
// ─────────────────────────────────────────────────────────────

/**
 * Busca a taxa de funding mais recente de um símbolo de futuros perpétuos.
 * Retorna 0.0 em caso de erro, timeout ou símbolo não disponível (failsafe).
 *
 * @param symbol  - símbolo no formato BTCUSDT (spot ou futuros, auto-corrigido)
 * @returns       taxa de funding como decimal (ex: 0.0001 = 0.01%/8h)
 */
export async function fetchFundingRate(symbol: string): Promise<number> {
  try {
    // Normaliza: remove sufixos de spot que não existem em futuros
    const futSymbol = symbol.toUpperCase().replace(/BUSD$/, 'USDT');

    const url = `https://fapi.binance.com/fapi/v1/fundingRate?symbol=${futSymbol}&limit=1`;

    // Timeout de 3 segundos — não bloqueia o ciclo se a API estiver lenta
    const res = await fetch(url, { signal: AbortSignal.timeout(3_000) });

    if (!res.ok) return 0; // símbolo sem futuros perpétuos ou API fora

    const data: { fundingRate: string; fundingTime: number }[] = await res.json();
    if (!Array.isArray(data) || data.length === 0) return 0;

    const rate = parseFloat(data[0].fundingRate);
    return isFinite(rate) ? rate : 0;

  } catch {
    // Silencia erros de rede/timeout — dado é opcional, não deve travar o bot
    return 0;
  }
}

// ─────────────────────────────────────────────────────────────
// EXPORTAÇÃO DE CONFIGURAÇÃO (para Supabase)
// ─────────────────────────────────────────────────────────────
// Salva a configuração validada no Supabase.
// O bot real lê essa tabela na inicialização, garantindo que
// os parâmetros de produção sejam idênticos aos testados.
//
// Uso:
//   import { exportConfig } from '@/lib/trading/strategy-engine'
//   await exportConfig(config, supabase, 'backtest-result-id')
// ─────────────────────────────────────────────────────────────
export interface SavedConfig {
  id?: string;
  name: string;
  config: StrategyConfig;
  assets: string[];
  backtestNetPct?: number;
  backtestWinRate?: number;
  backtestMaxDD?: number;
  createdAt?: string;
  active?: boolean;
}

export async function exportConfig(
  saved: Omit<SavedConfig, 'id' | 'createdAt'>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient: SupabaseClient<any>,
): Promise<string | null> {
  const { data, error } = await supabaseClient
    .from('bot_configs')
    .upsert({
      name:                  saved.name,
      config:                saved.config,
      assets:                saved.assets,
      backtest_net_pct:      saved.backtestNetPct,
      backtest_win_rate:     saved.backtestWinRate,
      backtest_max_drawdown: saved.backtestMaxDD,
      active:                saved.active ?? false,
      updated_at:            new Date().toISOString(),
    })
    .select('id')
    .single();

  if (error) {
    console.error('[StrategyEngine] exportConfig falhou:', error.message);
    return null;
  }
  return data?.id ?? null;
}

// ─────────────────────────────────────────────────────────────
// CONSTANTES ÚTEIS
// ─────────────────────────────────────────────────────────────

/** Candles por dia por intervalo (para calcular pausas do circuit breaker) */
export const CANDLES_PER_DAY: Record<string, number> = {
  '1m': 1440, '5m': 288, '15m': 96, '30m': 48,
  '1h': 24,   '4h': 6,   '1d': 1,
};

/** Símbolos suportados de cripto */
export const CRYPTO_SYMBOLS = [
  'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT',
  'XRPUSDT', 'ADAUSDT', 'DOGEUSDT', 'AVAXUSDT',
  'LINKUSDT', 'MATICUSDT', 'DOTUSDT',
];

/** Símbolos de ações suportados (Yahoo Finance) */
export const STOCK_SYMBOLS = [
  'SPY',   // S&P 500 ETF — mais líquido do mundo
  'QQQ',   // Nasdaq 100 ETF — tech americana
  'NVDA',  // Nvidia — IA + GPU
  'AAPL',  // Apple
  'MSFT',  // Microsoft
  'PETR4.SA', // Petrobras (B3)
  'VALE3.SA', // Vale (B3)
  'ITUB4.SA', // Itaú (B3)
];

/** Perfis pré-configurados de StrategyConfig por tipo de ativo */
export const ASSET_PROFILES: Record<string, Partial<StrategyConfig>> = {
  conservador: {
    useATRStop: true, atrMultiplier: 1.5, minRiskReward: 2,
    riskPerTrade: 0.02, adxMinStrength: 20, trailRUnits: 2,
    scaledExits: true, progressiveRisk: true, circuitBreaker: 15,
  },
  moderado: {
    useATRStop: true, atrMultiplier: 2.0, minRiskReward: 3,
    riskPerTrade: 0.03, adxMinStrength: 22, trailRUnits: 2.5,
    scaledExits: true, progressiveRisk: true, circuitBreaker: 20,
  },
  agressivo: {
    useATRStop: true, atrMultiplier: 3.0, minRiskReward: 5,
    riskPerTrade: 0.05, adxMinStrength: 25, trailRUnits: 3,
    scaledExits: true, progressiveRisk: true, circuitBreaker: 25,
  },
  acoes: {
    useATRStop: true, atrMultiplier: 1.5, minRiskReward: 2,
    riskPerTrade: 0.015, adxMinStrength: 20, trailRUnits: 2,
    scaledExits: false, partialExit: true,
    progressiveRisk: true, circuitBreaker: 10,
    slippage: 0.002, // taxas B3/NYSE ligeiramente maiores
  },
};
