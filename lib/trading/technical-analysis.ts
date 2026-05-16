import { CandleData, AnalysisResult, TradeSignal, TechnicalIndicators } from './types';
import { MACD, BollingerBands } from 'technicalindicators';

export class TechnicalAnalysis {
  private readonly BINANCE_API = 'https://api.binance.com/api/v3';

  async getCandles(symbol: string, interval: string = '1h', limit: number = 250): Promise<CandleData[]> {
    try {
      const url = `${this.BINANCE_API}/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Binance API error: ${response.status}`);
      const data = await response.json();
      return data.map((c: any[]) => ({
        timestamp: Number(c[0]),
        open:   Number(c[1]),
        high:   Number(c[2]),
        low:    Number(c[3]),
        close:  Number(c[4]),
        volume: Number(c[5]),
      }));
    } catch (error) {
      console.error(`Erro ao buscar candles da Binance: ${error}`);
      throw new Error('Falha na conexao com a API da Binance');
    }
  }

  calculateEMA(data: number[], period: number): number {
    if (data.length < period) return data[data.length - 1] || 0;
    const k = 2 / (period + 1);
    let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < data.length; i++) {
      ema = data[i] * k + ema * (1 - k);
    }
    return ema;
  }

  calculateRSI(closes: number[], period: number = 14): number {
    if (closes.length < period + 1) return 50;
    let gains = 0;
    let losses = 0;
    const start = closes.length - period;
    for (let i = start; i < closes.length; i++) {
      const diff = closes[i] - closes[i - 1];
      if (diff >= 0) gains += diff;
      else losses -= diff;
    }
    const avgGain = gains / period;
    const avgLoss = losses / period;
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - 100 / (1 + rs);
  }

  calculateMACD(closes: number[]): { macd: number; signal: number; histogram: number } {
    const result = MACD.calculate({
      values: closes,
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9,
      SimpleMAOscillator: false,
      SimpleMASignal: false,
    });
    const last = result[result.length - 1];
    return {
      macd:      last?.MACD      ?? 0,
      signal:    last?.signal    ?? 0,
      histogram: last?.histogram ?? 0,
    };
  }

  calculateBollingerBands(closes: number[], period: number = 20): { upper: number; middle: number; lower: number } {
    const result = BollingerBands.calculate({ period, values: closes, stdDev: 2 });
    const last = result[result.length - 1];
    return {
      upper:  last?.upper  ?? closes[closes.length - 1],
      middle: last?.middle ?? closes[closes.length - 1],
      lower:  last?.lower  ?? closes[closes.length - 1],
    };
  }

  async generateSignal(
    symbol: string,
    params?: { rsiLow?: number; rsiHigh?: number; smaPeriod?: number }
  ): Promise<AnalysisResult> {
    const candles = await this.getCandles(symbol, '1h', 250);
    const closes  = candles.map((c) => c.close);
    const currentPrice = closes[closes.length - 1];

    const rsiLow  = params?.rsiLow   ?? 35;
    const rsiHigh = params?.rsiHigh  ?? 65;
    const smaPer  = params?.smaPeriod ?? 200;

    const ema200   = this.calculateEMA(closes, smaPer);
    const rsi      = this.calculateRSI(closes);
    const macdData = this.calculateMACD(closes);
    const bb       = this.calculateBollingerBands(closes);
    const volume   = candles[candles.length - 1].volume;
    const avgVolume = candles.slice(-20).reduce((s, c) => s + c.volume, 0) / 20;

    let longScore  = 0;
    let shortScore = 0;

    if (currentPrice > ema200)  longScore++;
    if (currentPrice < ema200) shortScore++;
    if (rsi < rsiLow)  longScore++;
    if (rsi > rsiHigh) shortScore++;
    if (macdData.histogram > 0 && macdData.macd > macdData.signal)  longScore++;
    if (macdData.histogram < 0 && macdData.macd < macdData.signal) shortScore++;
    if (currentPrice <= bb.lower) longScore++;
    if (currentPrice >= bb.upper) shortScore++;

    const volumeOk = volume > avgVolume;

    let signal: TradeSignal = 'NEUTRAL';
    let confidence = 0.5;
    let score = 0;

    if (longScore >= 3 && volumeOk) {
      signal     = 'LONG';
      confidence = 0.7 + longScore * 0.075;
      score      = longScore * 25;
    } else if (shortScore >= 3 && volumeOk) {
      signal     = 'SHORT';
      confidence = 0.7 + shortScore * 0.075;
      score      = shortScore * 25;
    } else {
      score = Math.max(longScore, shortScore) * 25;
    }

    const indicators: TechnicalIndicators = {
      ema200,
      rsi,
      macd:          macdData.macd,
      macdSignal:    macdData.signal,
      macdHistogram: macdData.histogram,
      bbUpper:       bb.upper,
      bbMiddle:      bb.middle,
      bbLower:       bb.lower,
      volume,
      avgVolume,
      price:         currentPrice,
    };

    return { signal, confidence: Math.min(confidence, 1), score, indicators };
  }
}
