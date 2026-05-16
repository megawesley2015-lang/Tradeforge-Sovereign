import { PositionPlan, RiskConfig, TradeSignal } from './types';

export class RiskManager {
  constructor(private config: RiskConfig) {}

  calculatePlan(balance: number, signal: TradeSignal, entryPrice: number): PositionPlan {
    const riskAmount = balance * this.config.riskPerTrade;
    const stopLoss = signal === 'LONG'
      ? entryPrice * (1 - this.config.stopLossPercent)
      : entryPrice * (1 + this.config.stopLossPercent);
    const priceDiff = Math.abs(entryPrice - stopLoss);
    // BUG FIX: era 'price_diff' (undefined) - agora usa 'priceDiff'
    const positionSize = priceDiff > 0 ? riskAmount / priceDiff : 0;
    const rewardAmount = riskAmount * this.config.minRiskReward;
    const takeProfit = signal === 'LONG'
      ? entryPrice + (priceDiff * this.config.minRiskReward)
      : entryPrice - (priceDiff * this.config.minRiskReward);
    const leverageRequired = balance > 0 ? (positionSize * entryPrice) / balance : 1;

    return { positionSize, stopLoss, takeProfit, riskAmount, rewardAmount, leverageRequired };
  }
}
