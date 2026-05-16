export type TradeSignal = 'LONG' | 'SHORT' | 'NEUTRAL';
export type MarketMood = 'EXTREME_FEAR' | 'FEAR' | 'NEUTRAL' | 'GREED' | 'EXTREME_GREED';

export interface CandleData {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: number;
}

export interface TechnicalIndicators {
  ema200: number;
  rsi: number;
  macd: number;
  macdSignal: number;
  macdHistogram: number;
  bbUpper: number;
  bbMiddle: number;
  bbLower: number;
  volume: number;
  price: number;
  avgVolume: number;
}

export interface AnalysisResult {
  signal: TradeSignal;
  confidence: number;
  score: number;
  indicators: TechnicalIndicators;
}

export interface RiskConfig {
  riskPerTrade: number;
  minRiskReward: number;
  maxLeverage: number;
  stopLossPercent: number;
}

export interface PositionPlan {
  positionSize: number;
  stopLoss: number;
  takeProfit: number;
  riskAmount: number;
  rewardAmount: number;
  leverageRequired: number;
}

export interface SentimentResult {
  score: number;
  mood: MarketMood;
  topNews: string[];
  fearGreedIndex: number;
  shouldVeto: boolean;
  vetoReason?: string;
}

export interface MLScore {
  total: number;
  breakdown: {
    trend: number;
    momentum: number;
    volatility: number;
    sentiment: number;
  };
  recommendation: TradeSignal;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface PortfolioAsset {
  symbol: string;
  targetAllocation: number;
  currentValue: number;
  rebalanceNeeded: boolean;
}

export interface NotificationPayload {
  type: 'ENTRY' | 'EXIT' | 'VETO' | 'SAFE_MODE' | 'REBALANCE' | 'ERROR';
  symbol: string;
  message: string;
  data?: Record<string, unknown>;
}
