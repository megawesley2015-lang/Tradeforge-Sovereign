const fs = require('fs');
const path = require('path');

// 1. DETECTAR SE O PROJETO USA A PASTA 'src'
const hasSrc = fs.existsSync(path.join(__dirname, 'src'));
const root = hasSrc ? 'src' : '';

console.log(`🚀 Detectado: ${hasSrc ? 'Projeto com pasta SRC' : 'Projeto SEM pasta SRC'}`);

const folders = [
  `${root}/app/trading`,
  `${root}/app/trading/dashboard`,
  `${root}/components/trading`,
  `${root}/lib/trading`,
];

const files = {
  `${root}/lib/trading/types.ts`: `
export type TradeSignal = 'LONG' | 'SHORT' | 'NEUTRAL';
export type MarketMood = 'FEAR' | 'NEUTRAL' | 'GREED';
export interface CandleData { open: number; high: number; low: number; close: number; volume: number; timestamp: number; }
export interface AnalysisResult { signal: TradeSignal; confidence: number; indicators: { ema200: number; rsi: number; volume: number; price: number; }; }
export interface RiskConfig { riskPerTrade: number; minRiskReward: number; maxLeverage: number; stopLossPercent: number; }
export interface PositionPlan { positionSize: number; stopLoss: number; takeProfit: number; riskAmount: number; rewardAmount: number; leverageRequired: number; }
export interface SentimentResult { score: number; mood: MarketMood; topNews: string[]; shouldVeto: boolean; }`,

  `${root}/lib/trading/technical-analysis.ts`: `
import axios from 'axios';
import { CandleData, AnalysisResult, TradeSignal } from './types';
export class TechnicalAnalysis {
  private readonly BINANCE_API = 'https://api.binance.com/api/v3';
  async getCandles(symbol: string, interval: string = '15m', limit: number = 250): Promise<CandleData[]> {
    const response = await axios.get(\`\${this.BINANCE_API}/klines\`, { params: { symbol, interval, limit } });
    return response.data.map((c: any) => ({ timestamp: Number(c[0]), open: Number(c[1]), high: Number(c[2]), low: Number(c[3]), close: Number(c[4]), volume: Number(c[5]), }));
  }
  calculateEMA(data: number[], period: number): number {
    const k = 2 / (period + 1); let ema = data[0];
    for (let i = 1; i < data.length; i++) { ema = (data[i] * k) + (ema * (1 - k)); }
    return ema;
  }
  calculateRSI(closes: number[], period: number = 14): number {
    let gains = 0, losses = 0;
    for (let i = closes.length - period; i < closes.length; i++) {
      const diff = closes[i] - closes[i - 1];
      if (diff >= 0) gains += diff; else losses -= diff;
    }
    return 100 - (100 / (1 + (gains / (losses || 1))));
  }
  async generateSignal(symbol: string): Promise<AnalysisResult> {
    const candles = await this.getCandles(symbol);
    const closes = candles.map(c => c.close);
    const price = closes[closes.length - 1];
    const ema200 = this.calculateEMA(closes, 200);
    const rsi = this.calculateRSI(closes);
    let signal: TradeSignal = 'NEUTRAL';
    if (price > ema200 && rsi < 35) signal = 'LONG';
    else if (price < ema200 && rsi > 65) signal = 'SHORT';
    return { signal, confidence: 0.8, indicators: { ema200, rsi, volume: 0, price } };
  }
}`,

  `${root}/lib/trading/risk-manager.ts`: `
import { PositionPlan, RiskConfig, TradeSignal } from './types';
export class RiskManager {
  constructor(private config: RiskConfig) {}
  calculatePlan(balance: number, signal: TradeSignal, entryPrice: number): PositionPlan {
    const riskAmount = balance * this.config.riskPerTrade;
    let stopLoss = signal === 'LONG' ? entryPrice * (1 - this.config.stopLossPercent) : entryPrice * (1 + this.config.stopLossPercent);
    const priceDiff = Math.abs(entryPrice - stopLoss);
    const positionSize = riskAmount / (priceDiff || 1);
    const rewardAmount = riskAmount * this.config.minRiskReward;
    const takeProfit = signal === 'LONG' ? entryPrice + (priceDiff * this.config.minRiskReward) : entryPrice - (priceDiff * this.config.minRiskReward);
    return { positionSize, stopLoss, takeProfit, riskAmount, rewardAmount, leverageRequired: (positionSize * entryPrice) / balance };
  }
}`,

  `${root}/lib/trading/execution-engine.ts`: `
import crypto from 'crypto';
import { PositionPlan, TradeSignal } from './types';
export class ExecutionEngine {
  private readonly apiKey = process.env.BINANCE_API_KEY || '';
  private readonly apiSecret = process.env.BINANCE_API_SECRET || '';
  async openPosition(symbol: string, plan: PositionPlan, signal: TradeSignal) {
    console.log(\`🚀 EXECUÇÃO: Abrindo \${signal} em \${symbol} | Tamanho: \${plan.positionSize}\`);
    return { orderId: 'MOCK-123', status: 'FILLED' };
  }
}`,

  `${root}/lib/trading/sentiment-tracker.ts`: `
import { SentimentResult } from './types';
export class SentimentTracker {
  async analyze(symbol: string, technicalSignal: string): Promise<SentimentResult> {
    return { score: 0.5, mood: 'GREED', topNews: ['ETF Approval'], shouldVeto: false };
  }
}`,

  `${root}/app/trading/bot.ts`: `
import { TechnicalAnalysis } from '@/lib/trading/technical-analysis';
import { RiskManager } from '@/lib/trading/risk-manager';
import { ExecutionEngine } from '@/lib/trading/execution-engine';
import { SentimentTracker } from '@/lib/trading/sentiment-tracker';

export async function runTradingCycle(symbol: string, balance: number) {
  const analysis = new TechnicalAnalysis();
  const sentiment = new SentimentTracker();
  const risk = new RiskManager({ riskPerTrade: 0.01, minRiskReward: 2, maxLeverage: 10, stopLossPercent: 0.02 });
  const execution = new ExecutionEngine();
  const signalData = await analysis.generateSignal(symbol);
  if (signalData.signal === 'NEUTRAL') return { status: 'Neutral' };
  const sentimentData = await sentiment.analyze(symbol, signalData.signal);
  if (sentimentData.shouldVeto) return { status: 'Vetoed' };
  const plan = risk.calculatePlan(balance, signalData.signal, signalData.indicators.price);
  const order = await execution.openPosition(symbol, plan, signalData.signal);
  return { status: 'Executed', orderId: order.orderId };
}`,

  `${root}/app/trading/dashboard/page.tsx`: `
"use client";
import { useState } from 'react';
import { Wallet, Activity, TrendingUp, ShieldAlert, Play, Square } from 'lucide-react';

export default function Dashboard() {
  const [isActive, setIsActive] = useState(false);
  return (
    <div className="min-h-screen bg-[#07070D] text-white p-8 font-sans">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-10">
          <div>
            <h1 className="text-3xl font-bold">TradeForge <span className="text-[#FF6B35]">Sovereign</span></h1>
            <p className="text-gray-500">Command Center v1.0</p>
          </div>
          <button onClick={() => setIsActive(!isActive)} className={\`p-4 rounded-full transition-all \${isActive ? 'bg-red-600' : 'bg-[#FF6B35]'}\`}>
            {isActive ? <Square size={20} fill="currentColor"/> : <Play size={20} fill="currentColor"/>}
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
          <div className="bg-[#0F0F1A] border border-[#1F1F2E] p-6 rounded-2xl">
            <p className="text-gray-500 text-sm">Banca Atual</p>
            <h3 className="text-2xl font-bold">$ 1,142.50</h3>
          </div>
          <div className="bg-[#0F0F1A] border border-[#1F1F2E] p-6 rounded-2xl">
            <p className="text-gray-500 text-sm">Sinal</p>
            <h3 className="text-2xl font-bold text-[#FF6B35]">BULLISH</h3>
          </div>
          <div className="bg-[#0F0F1A] border border-[#1F1F2E] p-6 rounded-2xl">
            <p className="text-gray-500 text-sm">Win Rate</p>
            <h3 className="text-2xl font-bold text-cyan-500">42%</h3>
          </div>
          <div className="bg-[#0F0F1A] border border-[#1F1F2E] p-6 rounded-2xl">
            <p className="text-gray-500 text-sm">Risco/Trade</p>
            <h3 className="text-2xl font-bold text-red-500">1%</h3>
          </div>
        </div>
        <div className="bg-[#0F0F1A] border border-[#1F1F2E] rounded-3xl p-10 text-center">
          <p className="text-gray-400">O bot está {isActive ? 'ANALISANDO O MERCADO...' : 'DESLIGADO'}</p>
          <div className="mt-4 flex justify-center">
             <div className={\`w-3 h-3 rounded-full \${isActive ? 'bg-green-500 animate-ping' : 'bg-gray-600'}\`}></div>
          </div>
        </div>
      </div>
    </div>
  );
}`
};

console.log("🛠️ Iniciando Forja Automática V2...");

folders.forEach(folder => {
  fs.mkdirSync(path.join(__dirname, folder), { recursive: true });
});

Object.entries(files).forEach(([filePath, content]) => {
  fs.writeFileSync(path.join(__dirname, filePath), content);
  console.log(\`✅ Forjado: \${filePath}\`);
});

console.log("\n🏆 SUCESSO! Agora rode 'npm run dev' e acesse /trading/dashboard");
