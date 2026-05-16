// =============================================================
// TRADEFORGE SOVEREIGN — Backtesting Engine
// O que faz: Simula uma estratégia em dados históricos
// Por que existe: Valida se a estratégia FUNCIONA antes de arriscar dinheiro
// Regra de ouro: Se não passa no backtest, não vai para produção
// =============================================================

import { OHLCVCandle } from '../indicators';
import { runSignalEngine, SignalEngineConfig } from '../signals/engine';

export interface BacktestTrade {
  entryDate: string;
  exitDate: string;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  pnlR$: number;
  pnlPct: number;
  result: 'WIN' | 'LOSS' | 'BREAKEVEN';
  exitReason: 'STOP_LOSS' | 'TAKE_PROFIT' | 'SIGNAL_REVERSAL' | 'END_OF_DATA';
  indicatorsFired: string[];
}

export interface BacktestResult {
  // Configuração da simulação
  ticker: string;
  startDate: string;
  endDate: string;
  initialCapital: number;
  config: SignalEngineConfig;

  // Resultado financeiro
  finalCapital: number;
  totalReturnR$: number;
  totalReturnPct: number;

  // Métricas de performance
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;         // % de trades vencedores

  // Risco
  maxDrawdownPct: number;  // maior queda consecutiva de capital
  maxDrawdownR$: number;
  maxConsecutiveLosses: number;

  // Eficiência
  avgWinPct: number;       // retorno médio nos ganhos
  avgLossPct: number;      // perda média nos stops
  profitFactor: number;    // lucro bruto / prejuízo bruto (> 1 = lucrativo)
  sharpeRatio: number;     // retorno / risco (> 1 = bom, > 2 = excelente)

  // Capital mínimo atingido (para verificar se saldo negativo)
  lowestCapital: number;
  wentNegative: boolean;

  trades: BacktestTrade[];
  capitalCurve: { date: string; capital: number }[];
}

export interface BacktestConfig {
  ticker: string;
  candles: OHLCVCandle[];
  initialCapital: number;
  signalConfig?: SignalEngineConfig;
  stopLossAtrMultiplier?: number;  // padrão: 2
  takeProfitRR?: number;           // Risk/Reward ratio, padrão: 1.5
  warmupCandles?: number;          // candles para "aquecer" indicadores (padrão: 30)
}

export function runBacktest(config: BacktestConfig): BacktestResult {
  const {
    ticker,
    candles,
    initialCapital,
    signalConfig = {},
    stopLossAtrMultiplier = 2,
    takeProfitRR = 1.5,
    warmupCandles = 30,
  } = config;

  let capital = initialCapital;
  let lowestCapital = initialCapital;
  let peakCapital = initialCapital;
  let maxDrawdownR$ = 0;
  let maxDrawdownPct = 0;

  const trades: BacktestTrade[] = [];
  const capitalCurve: { date: string; capital: number }[] = [
    { date: candles[0]?.timestamp ?? '', capital: initialCapital },
  ];

  let openTrade: {
    entryDate: string;
    direction: 'LONG' | 'SHORT';
    entryPrice: number;
    stopLoss: number;
    takeProfit: number;
    quantity: number;
    indicatorsFired: string[];
  } | null = null;

  // Percorre os candles a partir do warmup
  for (let i = warmupCandles; i < candles.length; i++) {
    const windowCandles = candles.slice(0, i + 1);
    const currentCandle = candles[i];
    const currentPrice = currentCandle.close;

    // ─── VERIFICAR STOP LOSS / TAKE PROFIT ───────────────────
    if (openTrade) {
      let exitPrice: number | null = null;
      let exitReason: BacktestTrade['exitReason'] | null = null;

      if (openTrade.direction === 'LONG') {
        if (currentCandle.low <= openTrade.stopLoss) {
          exitPrice = openTrade.stopLoss;
          exitReason = 'STOP_LOSS';
        } else if (currentCandle.high >= openTrade.takeProfit) {
          exitPrice = openTrade.takeProfit;
          exitReason = 'TAKE_PROFIT';
        }
      } else {
        if (currentCandle.high >= openTrade.stopLoss) {
          exitPrice = openTrade.stopLoss;
          exitReason = 'STOP_LOSS';
        } else if (currentCandle.low <= openTrade.takeProfit) {
          exitPrice = openTrade.takeProfit;
          exitReason = 'TAKE_PROFIT';
        }
      }

      if (exitPrice && exitReason) {
        const pnlR$ =
          openTrade.direction === 'LONG'
            ? (exitPrice - openTrade.entryPrice) * openTrade.quantity
            : (openTrade.entryPrice - exitPrice) * openTrade.quantity;

        const pnlPct = pnlR$ / (openTrade.entryPrice * openTrade.quantity);

        capital += pnlR$;
        lowestCapital = Math.min(lowestCapital, capital);

        // Drawdown tracking
        if (capital > peakCapital) peakCapital = capital;
        const currentDD = peakCapital - capital;
        if (currentDD > maxDrawdownR$) {
          maxDrawdownR$ = currentDD;
          maxDrawdownPct = (currentDD / peakCapital) * 100;
        }

        trades.push({
          entryDate: openTrade.entryDate,
          exitDate: currentCandle.timestamp,
          direction: openTrade.direction,
          entryPrice: openTrade.entryPrice,
          exitPrice,
          quantity: openTrade.quantity,
          pnlR$: parseFloat(pnlR$.toFixed(2)),
          pnlPct: parseFloat((pnlPct * 100).toFixed(2)),
          result:
            pnlR$ > 0 ? 'WIN' : pnlR$ < 0 ? 'LOSS' : 'BREAKEVEN',
          exitReason,
          indicatorsFired: openTrade.indicatorsFired,
        });

        capitalCurve.push({ date: currentCandle.timestamp, capital: parseFloat(capital.toFixed(2)) });
        openTrade = null;
      }
    }

    // ─── VERIFICAR NOVO SINAL ─────────────────────────────────
    if (!openTrade) {
      const signal = runSignalEngine(ticker, windowCandles, {
        ...signalConfig,
        capitalTotal: capital,
      });

      if (signal.direction !== 'HOLD' && signal.stopLoss && signal.takeProfit) {
        // Calcula quantidade baseada no Kelly
        const riskPerUnit = Math.abs(currentPrice - signal.stopLoss);
        const maxRiskR$ = capital * (signalConfig.maxRiskPct ?? 0.02);
        const quantity = maxRiskR$ / riskPerUnit;

        if (quantity > 0 && capital > 0) {
          openTrade = {
            entryDate: currentCandle.timestamp,
            direction: signal.direction === 'BUY' ? 'LONG' : 'SHORT',
            entryPrice: currentPrice,
            stopLoss: signal.stopLoss,
            takeProfit: signal.takeProfit,
            quantity: parseFloat(quantity.toFixed(4)),
            indicatorsFired: signal.indicatorsFired,
          };
        }
      }
    }
  }

  // Fecha trade aberto ao final dos dados
  if (openTrade) {
    const lastPrice = candles[candles.length - 1].close;
    const pnlR$ =
      openTrade.direction === 'LONG'
        ? (lastPrice - openTrade.entryPrice) * openTrade.quantity
        : (openTrade.entryPrice - lastPrice) * openTrade.quantity;

    capital += pnlR$;
    lowestCapital = Math.min(lowestCapital, capital);

    trades.push({
      entryDate: openTrade.entryDate,
      exitDate: candles[candles.length - 1].timestamp,
      direction: openTrade.direction,
      entryPrice: openTrade.entryPrice,
      exitPrice: lastPrice,
      quantity: openTrade.quantity,
      pnlR$: parseFloat(pnlR$.toFixed(2)),
      pnlPct: parseFloat(((pnlR$ / (openTrade.entryPrice * openTrade.quantity)) * 100).toFixed(2)),
      result: pnlR$ > 0 ? 'WIN' : pnlR$ < 0 ? 'LOSS' : 'BREAKEVEN',
      exitReason: 'END_OF_DATA',
      indicatorsFired: openTrade.indicatorsFired,
    });

    capitalCurve.push({
      date: candles[candles.length - 1].timestamp,
      capital: parseFloat(capital.toFixed(2)),
    });
  }

  // ─── CALCULAR MÉTRICAS FINAIS ─────────────────────────────────
  const winningTrades = trades.filter((t) => t.result === 'WIN');
  const losingTrades = trades.filter((t) => t.result === 'LOSS');

  const totalWinsR$ = winningTrades.reduce((s, t) => s + t.pnlR$, 0);
  const totalLossesR$ = Math.abs(losingTrades.reduce((s, t) => s + t.pnlR$, 0));

  const avgWinPct =
    winningTrades.length > 0
      ? winningTrades.reduce((s, t) => s + t.pnlPct, 0) / winningTrades.length
      : 0;

  const avgLossPct =
    losingTrades.length > 0
      ? Math.abs(losingTrades.reduce((s, t) => s + t.pnlPct, 0) / losingTrades.length)
      : 0;

  const profitFactor = totalLossesR$ === 0 ? Infinity : totalWinsR$ / totalLossesR$;

  // Sharpe simplificado: retorno médio / desvio padrão dos retornos
  const returns = trades.map((t) => t.pnlPct);
  const avgReturn = returns.reduce((a, b) => a + b, 0) / (returns.length || 1);
  const stdDev = Math.sqrt(
    returns.reduce((s, r) => s + Math.pow(r - avgReturn, 2), 0) /
      (returns.length || 1)
  );
  const sharpeRatio = stdDev === 0 ? 0 : avgReturn / stdDev;

  // Maior sequência de perdas consecutivas
  let maxConsecutiveLosses = 0;
  let currentLossStreak = 0;
  for (const t of trades) {
    if (t.result === 'LOSS') {
      currentLossStreak++;
      maxConsecutiveLosses = Math.max(maxConsecutiveLosses, currentLossStreak);
    } else {
      currentLossStreak = 0;
    }
  }

  return {
    ticker,
    startDate: candles[warmupCandles]?.timestamp ?? '',
    endDate: candles[candles.length - 1]?.timestamp ?? '',
    initialCapital,
    config: signalConfig,

    finalCapital: parseFloat(capital.toFixed(2)),
    totalReturnR$: parseFloat((capital - initialCapital).toFixed(2)),
    totalReturnPct: parseFloat(((capital - initialCapital) / initialCapital * 100).toFixed(2)),

    totalTrades: trades.length,
    winningTrades: winningTrades.length,
    losingTrades: losingTrades.length,
    winRate: trades.length > 0
      ? parseFloat((winningTrades.length / trades.length * 100).toFixed(2))
      : 0,

    maxDrawdownPct: parseFloat(maxDrawdownPct.toFixed(2)),
    maxDrawdownR$: parseFloat(maxDrawdownR$.toFixed(2)),
    maxConsecutiveLosses,

    avgWinPct: parseFloat(avgWinPct.toFixed(2)),
    avgLossPct: parseFloat(avgLossPct.toFixed(2)),
    profitFactor: isFinite(profitFactor) ? parseFloat(profitFactor.toFixed(2)) : 999,
    sharpeRatio: parseFloat(sharpeRatio.toFixed(2)),

    lowestCapital: parseFloat(lowestCapital.toFixed(2)),
    wentNegative: lowestCapital < 0,

    trades,
    capitalCurve,
  };
}
