// =============================================================
// TRADEFORGE SOVEREIGN — Indicadores Técnicos
// O que faz: Calcula todos os indicadores usados pelo SignalEngine
// Por que existe: Transformar dados brutos de preço em informação
// =============================================================

export interface OHLCVCandle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: string;
}

// =============================================================
// EMA — Exponential Moving Average (Média Móvel Exponencial)
// O que faz: Média de preços dando mais peso aos dados recentes
// Por que é melhor que SMA: Reage mais rápido a mudanças de preço
// =============================================================
export function calcEMA(values: number[], period: number): number[] {
  if (values.length < period) return [];

  const k = 2 / (period + 1);
  const emas: number[] = [];

  // Primeira EMA = SMA simples dos primeiros N valores
  const firstSMA =
    values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  emas.push(firstSMA);

  // EMA seguintes = preço_atual × k + EMA_anterior × (1 - k)
  for (let i = period; i < values.length; i++) {
    const ema = values[i] * k + emas[emas.length - 1] * (1 - k);
    emas.push(ema);
  }

  return emas;
}

// Retorna apenas o último valor da EMA
export function calcEMALast(values: number[], period: number): number | null {
  const emas = calcEMA(values, period);
  return emas.length > 0 ? emas[emas.length - 1] : null;
}


// =============================================================
// RSI — Relative Strength Index (Índice de Força Relativa)
// O que faz: Mede a velocidade e magnitude das oscilações de preço
// Como usar:
//   RSI < 30 → ativo oversold (sobrevendido) → possível COMPRA
//   RSI > 70 → ativo overbought (sobrecomprado) → possível VENDA
//   RSI = 50 → neutro
// =============================================================
export function calcRSI(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;

  const changes = closes.slice(1).map((c, i) => c - closes[i]);
  const gains = changes.map((c) => (c > 0 ? c : 0));
  const losses = changes.map((c) => (c < 0 ? Math.abs(c) : 0));

  // Média inicial
  let avgGain =
    gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss =
    losses.slice(0, period).reduce((a, b) => a + b, 0) / period;

  // Suavização de Wilder para candles subsequentes
  for (let i = period; i < changes.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return parseFloat((100 - 100 / (1 + rs)).toFixed(2));
}


// =============================================================
// MACD — Moving Average Convergence Divergence
// O que faz: Mostra a relação entre duas EMAs (tendência + momentum)
// Como usar:
//   histogram > 0 e crescendo → força compradora (BUY)
//   histogram < 0 e caindo   → força vendedora (SELL)
//   Cruzamento do signal → confirmação de reversão
// =============================================================
export interface MACDResult {
  macd: number;           // EMA rápida - EMA lenta
  signal: number;         // EMA do MACD
  histogram: number;      // MACD - Signal (o "motor" do sinal)
  bullishCross: boolean;  // MACD cruzou signal de baixo pra cima
  bearishCross: boolean;  // MACD cruzou signal de cima pra baixo
}

export function calcMACD(
  closes: number[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9
): MACDResult | null {
  if (closes.length < slowPeriod + signalPeriod) return null;

  const emaFast = calcEMA(closes, fastPeriod);
  const emaSlow = calcEMA(closes, slowPeriod);

  // Alinha as EMAs (a fast tem mais valores)
  const offset = emaFast.length - emaSlow.length;
  const macdLine = emaSlow.map((slow, i) => emaFast[i + offset] - slow);

  const signalLine = calcEMA(macdLine, signalPeriod);
  const sigOffset = macdLine.length - signalLine.length;

  const lastMACD = macdLine[macdLine.length - 1];
  const lastSignal = signalLine[signalLine.length - 1];
  const prevMACD = macdLine[macdLine.length - 2];
  const prevSignal = signalLine[signalLine.length - 2];

  return {
    macd: parseFloat(lastMACD.toFixed(6)),
    signal: parseFloat(lastSignal.toFixed(6)),
    histogram: parseFloat((lastMACD - lastSignal).toFixed(6)),
    // Cruzamento bullish: MACD estava abaixo, agora está acima do Signal
    bullishCross: prevMACD < prevSignal && lastMACD > lastSignal,
    // Cruzamento bearish: MACD estava acima, agora está abaixo do Signal
    bearishCross: prevMACD > prevSignal && lastMACD < lastSignal,
  };
}


// =============================================================
// Bollinger Bands
// O que faz: Envelope de volatilidade ao redor da média de preço
// Como usar:
//   Preço tocou banda inferior → possível COMPRA (reversão)
//   Preço tocou banda superior → possível VENDA (reversão)
//   Bands muito estreitas (squeeze) → grande movimento se aproximando
// =============================================================
export interface BollingerBandsResult {
  upper: number;
  middle: number; // SMA
  lower: number;
  bandwidth: number; // (upper - lower) / middle — mede volatilidade
  percentB: number;  // posição do preço dentro das bandas (0-1)
  squeeze: boolean;  // bandwidth abaixo do histórico (movimento iminente)
}

export function calcBollingerBands(
  closes: number[],
  period = 20,
  stdDevMultiplier = 2
): BollingerBandsResult | null {
  if (closes.length < period) return null;

  const window = closes.slice(-period);
  const middle = window.reduce((a, b) => a + b, 0) / period;

  const variance =
    window.reduce((sum, val) => sum + Math.pow(val - middle, 2), 0) / period;
  const stdDev = Math.sqrt(variance);

  const upper = middle + stdDevMultiplier * stdDev;
  const lower = middle - stdDevMultiplier * stdDev;
  const lastClose = closes[closes.length - 1];

  const bandwidth = (upper - lower) / middle;
  const percentB = (lastClose - lower) / (upper - lower);

  // Squeeze = bandwidth está nos 20% mais baixos dos últimos 50 candles
  let squeeze = false;
  if (closes.length >= 50) {
    const bandwidths: number[] = [];
    for (let i = closes.length - 50; i < closes.length; i++) {
      const w = closes.slice(i - period, i);
      if (w.length === period) {
        const m = w.reduce((a, b) => a + b, 0) / period;
        const v = w.reduce((s, val) => s + Math.pow(val - m, 2), 0) / period;
        bandwidths.push((m + 2 * Math.sqrt(v) - (m - 2 * Math.sqrt(v))) / m);
      }
    }
    const minBW = Math.min(...bandwidths);
    squeeze = bandwidth <= minBW * 1.2;
  }

  return {
    upper: parseFloat(upper.toFixed(6)),
    middle: parseFloat(middle.toFixed(6)),
    lower: parseFloat(lower.toFixed(6)),
    bandwidth: parseFloat(bandwidth.toFixed(6)),
    percentB: parseFloat(percentB.toFixed(4)),
    squeeze,
  };
}


// =============================================================
// ATR — Average True Range
// O que faz: Mede a volatilidade REAL do ativo (amplitude média dos candles)
// Por que é crítico: Usado para calcular Stop Loss dinâmico
// Lógica: ATR alto = ativo volátil = stop loss mais largo necessário
// =============================================================
export function calcATR(candles: OHLCVCandle[], period = 14): number | null {
  if (candles.length < period + 1) return null;

  const trueRanges: number[] = [];

  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i - 1].close;

    // True Range = maior entre:
    // 1. high - low (amplitude do candle)
    // 2. |high - close anterior| (gap de alta)
    // 3. |low - close anterior| (gap de baixa)
    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    trueRanges.push(tr);
  }

  // ATR = EMA do True Range
  const atrValues = calcEMA(trueRanges, period);
  return atrValues.length > 0
    ? parseFloat(atrValues[atrValues.length - 1].toFixed(6))
    : null;
}


// =============================================================
// Volume Profile (básico)
// O que faz: Verifica se o volume confirma o movimento de preço
// Por que importa: Volume alto + movimento = sinal confiável
//                  Volume baixo + movimento = sinal fraco/armadilha
// =============================================================
export function calcVolumeStrength(candles: OHLCVCandle[], period = 20): {
  avgVolume: number;
  currentVolume: number;
  ratio: number;          // ratio > 1.5 = volume acima da média (forte)
  isAboveAverage: boolean;
} {
  if (candles.length < period) {
    return { avgVolume: 0, currentVolume: 0, ratio: 1, isAboveAverage: false };
  }

  const window = candles.slice(-period);
  const avgVolume = window.reduce((a, c) => a + c.volume, 0) / period;
  const currentVolume = candles[candles.length - 1].volume;
  const ratio = currentVolume / avgVolume;

  return {
    avgVolume: parseFloat(avgVolume.toFixed(2)),
    currentVolume,
    ratio: parseFloat(ratio.toFixed(2)),
    isAboveAverage: ratio >= 1.5,
  };
}
