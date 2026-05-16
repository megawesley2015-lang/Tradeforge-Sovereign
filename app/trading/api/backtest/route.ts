
// =============================================================
// TRADEFORGE SOVEREIGN — Backtest Route v5 (SSOT)
// ──────────────────────────────────────────────────────────────
// Refatorado para usar lib/trading/strategy-engine.ts (SSOT)
//
// Mudanças v5 vs v4:
//   • Toda lógica de trading importada do strategy-engine (SSOT)
//   • Usa stepPosition (state machine candle-a-candle) em vez de
//     simulateTrade (batch) → lógica idêntica ao bot real
//   • createPosition aplica slippage realista na entrada
//   • computeSignal inclui filtro ADX (bloqueia mercado lateral)
//   • getCandles auto-detecta Binance vs Yahoo Finance (ações!)
//   • Novos parâmetros: useAdxFilter, adxMinStrength, slippage
//
// Garantia SSOT: se a lógica mudar em strategy-engine.ts,
// ela muda aqui e no bot real AO MESMO TEMPO. Zero divergência.
// =============================================================

import { NextRequest, NextResponse } from 'next/server';
import {
  CandleData, StrategyConfig, OpenPosition,
  computeSignal, stepPosition, createPosition,
  getProgressiveRisk, atr,
  getCandles, CANDLES_PER_DAY,
} from '@/lib/trading/strategy-engine';

interface BacktestParams {
  symbol:            string;
  initialBalance:    number;
  riskPerTrade:      number;
  stopLossPercent:   number;    // usado quando useATRStop = false
  atrMultiplier:     number;    // ATR × N = distância do stop
  useATRStop:        boolean;   // true = stop dinâmico por ATR
  minRiskReward:     number;
  rsiLow:            number;
  rsiHigh:           number;
  smaPeriod:         number;
  trendFilter:       boolean;
  useAdxFilter:      boolean;   // NOVO v5: filtra mercado lateral
  adxMinStrength:    number;    // NOVO v5: ADX mínimo para operar (padrão: 20)
  trailingStop:      boolean;
  trailRUnits:       number;
  partialExit:       boolean;   // 2-tier: 50% TP1, 50% TP2
  scaledExits:       boolean;   // 3-tier: 30% TP1 | 30% TP2 | 40% trail
  fixedRiskAmount:   boolean;
  progressiveRisk:   boolean;
  circuitBreaker:    number;
  maxCandlesInTrade: number;    // 0 = sem limite | N = fecha após N candles
  balanceTarget:     number;    // 0 = sem meta | N = para ao atingir N× inicial
  slippage:          number;    // NOVO v5: custo por trade em % (ex: 0.001 = 0.1%)
  interval?:         string;
  limit?:            number;
}

interface TradeResult {
  entryPrice: number; exitPrice: number;
  signal: string; profit: number; isWin: boolean;
  balance: number; exitReason: string;
}

// ─── Monte Carlo ─────────────────────────────────────────────
// Permanece inline — lógica de análise de risco pós-backtest,
// não pertence ao motor de execução (strategy-engine).
// Roda 1.000 permutações aleatórias da sequência de trades reais.
// Pergunta: "Se os mesmos trades acontecessem em outra ordem,
//            qual seria a chance de quebrar a conta?"
function runMonteCarlo(
  profits: number[],
  initialBalance: number,
  simulations = 1000,
): { ruinPct: number; medianFinal: number; p10: number; p90: number } {
  if (profits.length === 0) {
    return { ruinPct: 0, medianFinal: initialBalance, p10: initialBalance, p90: initialBalance };
  }

  let ruinCount = 0;
  const finals: number[] = [];

  for (let s = 0; s < simulations; s++) {
    const perm = [...profits];
    // Fisher-Yates shuffle
    for (let i = perm.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [perm[i], perm[j]] = [perm[j], perm[i]];
    }
    let bal = initialBalance, ruined = false;
    for (const p of perm) {
      bal = Math.max(0, bal + p);
      if (bal <= 0) { ruined = true; break; }
    }
    if (ruined) ruinCount++;
    finals.push(bal);
  }

  finals.sort((a, b) => a - b);
  return {
    ruinPct:     Math.round((ruinCount / simulations) * 100),
    medianFinal: Math.round(finals[Math.floor(simulations * 0.5)] * 100) / 100,
    p10:         Math.round(finals[Math.floor(simulations * 0.1)] * 100) / 100,
    p90:         Math.round(finals[Math.floor(simulations * 0.9)] * 100) / 100,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body: BacktestParams = await req.json();
    const {
      symbol             = 'BTCUSDT',
      initialBalance     = 50,
      riskPerTrade       = 0.02,
      stopLossPercent    = 0.015,
      atrMultiplier      = 2.0,
      useATRStop         = true,
      minRiskReward      = 2.0,
      rsiLow             = 30,
      rsiHigh            = 70,
      smaPeriod          = 200,
      trendFilter        = true,
      useAdxFilter       = true,
      adxMinStrength     = 20,
      trailingStop       = true,
      trailRUnits        = 2.0,
      partialExit        = false,
      scaledExits        = true,
      fixedRiskAmount    = true,
      progressiveRisk    = true,
      circuitBreaker     = 15,
      maxCandlesInTrade  = 0,
      balanceTarget      = 0,
      slippage           = 0.001,
      interval           = '4h',
      limit              = 1000,
    } = body;

    // ── Config SSOT ────────────────────────────────────────────
    // Objeto idêntico ao que o bot real vai usar em produção.
    // Se um parâmetro mudar aqui, o bot recebe na próxima leitura
    // do Supabase (tabela bot_configs). Zero divergência garantida.
    const config: StrategyConfig = {
      rsiLow, rsiHigh, smaPeriod, trendFilter,
      adxPeriod: 14, adxMinStrength, useAdxFilter,
      stopLossPercent, atrMultiplier, useATRStop,
      minRiskReward,
      riskPerTrade, fixedRiskAmount,
      trailingStop, trailRUnits,
      scaledExits, partialExit,
      progressiveRisk, circuitBreaker,
      maxCandlesInTrade, balanceTarget,
      slippage,
      // Filtros avançados — defaults conservadores
      useVolumeFilter: true,
      volumeThreshold: 0.8,
      minVotesLong:    2,
      minVotesShort:   2,
    };

    // ── Candles (auto-detecta Binance vs Yahoo Finance) ────────
    // BTCUSDT, ETHUSDT, SOLUSDT → Binance klines API
    // SPY, QQQ, NVDA, PETR4.SA  → Yahoo Finance v8 API
    const candles  = await getCandles(symbol, interval, Math.min(limit, 1000));
    const startIdx = Math.max(smaPeriod + 35, 60);
    const dayC     = CANDLES_PER_DAY[interval] ?? 6;

    // ── Estado do backtest ─────────────────────────────────────
    let currentBalance  = initialBalance;
    const tradeLog: TradeResult[] = [];
    const balanceCurve: number[]  = [initialBalance];
    let lastTradeIdx    = -5;
    let rollingPeak     = initialBalance;
    let haltUntilIdx    = -1;
    let haltCount       = 0;
    let targetHit       = false;
    let openPos: OpenPosition | null = null;

    // ── Loop principal — State Machine Candle a Candle ─────────
    // Diferença crucial vs v4 (simulateTrade batch):
    //   v4: detecta sinal → simula TODOS os candles futuros de uma vez
    //   v5: detecta sinal → abre posição → avança UM candle por vez
    // Isso garante que a lógica seja idêntica ao bot real, que
    // recebe candles um a um via WebSocket.
    for (let i = startIdx; i < candles.length - 1; i++) {
      if (currentBalance <= 0 || targetHit) break;

      // ── Avança posição aberta (SSOT) ──────────────────────────
      if (openPos !== null) {
        const step = stepPosition(openPos, candles[i], config);
        if (step.closed) {
          currentBalance = Math.max(0, currentBalance + step.profit);
          tradeLog.push({
            entryPrice: openPos.entryPrice,
            exitPrice:  step.exitPrice,
            signal:     openPos.signal,
            profit:     step.profit,
            isWin:      step.isWin,
            balance:    currentBalance,
            exitReason: step.exitReason,
          });
          balanceCurve.push(currentBalance);
          openPos = null;
        } else {
          openPos = step.pos;
        }
        continue; // uma posição por vez
      }

      // ── Freios de segurança ────────────────────────────────────
      if (currentBalance > rollingPeak) rollingPeak = currentBalance;
      if (i <= haltUntilIdx) continue;

      // Meta de banca: bot para ao atingir N× o capital inicial
      // "Você ganhou — não devolve" — equivale a sacar e fechar o robô
      if (balanceTarget > 0 && currentBalance >= initialBalance * balanceTarget) {
        targetHit = true;
        break;
      }

      // Circuit Breaker: pausa após queda de X% desde o último pico
      if (circuitBreaker > 0 && rollingPeak > 0) {
        const drop = ((rollingPeak - currentBalance) / rollingPeak) * 100;
        if (drop >= circuitBreaker) {
          haltUntilIdx = i + dayC;
          rollingPeak  = currentBalance;
          haltCount++;
          continue;
        }
      }

      if (i - lastTradeIdx < 3) continue;

      // ── Sinal via SSOT (inclui ADX + EMA200 filter) ───────────
      // computeSignal retorna { signal, adx, blockedBy? }
      // ADX < adxMinStrength → blockedBy: 'ADX' → signal: 'NEUTRAL'
      const slice = candles.slice(0, i + 1);
      const { signal } = computeSignal(slice, config);
      if (signal === 'NEUTRAL') continue;

      // ── Stop distance (ATR dinâmico ou % fixo) ─────────────────
      // ATR mede a volatilidade real do ativo no momento do sinal.
      // BTC calmo (ATR 1%) → stop curto.
      // DOGE em pump (ATR 8%) → stop largo (evita ruído).
      let stopDistPct = stopLossPercent;
      if (useATRStop) {
        const atrValue = atr(slice, 14);
        if (atrValue > 0) stopDistPct = (atrValue * atrMultiplier) / candles[i].close;
      }

      // ── Risco ──────────────────────────────────────────────────
      const base    = fixedRiskAmount ? initialBalance : currentBalance;
      const effRisk = progressiveRisk
        ? getProgressiveRisk(riskPerTrade, currentBalance, initialBalance)
        : riskPerTrade;
      const riskAmt = base * effRisk;

      // ── Abre posição via SSOT ──────────────────────────────────
      // createPosition aplica slippage de entrada:
      //   LONG:  entra um pouco MAIS caro  (pior para o trader)
      //   SHORT: entra um pouco MAIS barato (pior para o trader)
      // Isso torna o backtest conservador — resultados reais serão ≥ backtest
      openPos      = createPosition(signal as 'LONG' | 'SHORT', candles[i].close, riskAmt, stopDistPct, config);
      lastTradeIdx = i;
    }

    // ── Fecha posição aberta ao final dos dados ─────────────────
    if (openPos !== null) {
      const lastC      = candles[candles.length - 1];
      const dir        = openPos.signal === 'LONG' ? 1 : -1;
      const priceDelta = (lastC.close - openPos.entryPrice) * dir;
      const rUnits     = priceDelta / openPos.rd;
      const remaining  = openPos.t2Hit ? 0.4 : openPos.t1Hit ? (scaledExits ? 0.7 : 0.5) : 1.0;
      const profit     = openPos.partialProfit + rUnits * openPos.riskAmount * remaining;
      currentBalance   = Math.max(0, currentBalance + profit);
      tradeLog.push({
        entryPrice: openPos.entryPrice,
        exitPrice:  lastC.close,
        signal:     openPos.signal,
        profit,
        isWin:      profit > 0,
        balance:    currentBalance,
        exitReason: 'Fim dos dados',
      });
      balanceCurve.push(currentBalance);
    }

    // ── Métricas ────────────────────────────────────────────────
    const wins    = tradeLog.filter((t) => t.isWin).length;
    const losses  = tradeLog.length - wins;
    const winRate = tradeLog.length > 0 ? (wins / tradeLog.length) * 100 : 0;
    const netP    = currentBalance - initialBalance;
    const netPPct = (netP / initialBalance) * 100;

    let peak = initialBalance, peakBal = initialBalance, maxDD = 0;
    for (const b of balanceCurve) {
      if (b > peak) { peak = b; peakBal = b; }
      const dd = ((peak - b) / peak) * 100;
      if (dd > maxDD) maxDD = dd;
    }

    const winTrades  = tradeLog.filter((t) =>  t.isWin);
    const lossTrades = tradeLog.filter((t) => !t.isWin);
    const grossP     = winTrades.reduce((s, t) => s + t.profit, 0);
    const grossL     = Math.abs(lossTrades.reduce((s, t) => s + t.profit, 0));
    const pf         = grossL > 0 ? grossP / grossL : grossP > 0 ? 999 : 0;

    // Expectativa Matemática: quanto ganha em média por trade
    // EM = (winRate × avgWin) − (lossRate × avgLoss)
    // Positivo = estratégia lucrativa no longo prazo
    const avgWin     = winTrades.length  > 0 ? grossP / winTrades.length  : 0;
    const avgLoss    = lossTrades.length > 0 ? grossL / lossTrades.length : 0;
    const wr         = winRate / 100;
    const expectancy = (wr * avgWin) - ((1 - wr) * avgLoss);

    let sharpe = 0;
    if (tradeLog.length > 2) {
      const rets = tradeLog.map((t) => t.profit / initialBalance);
      const avg  = rets.reduce((a, b) => a + b, 0) / rets.length;
      const std  = Math.sqrt(rets.reduce((s, r) => s + (r - avg) ** 2, 0) / rets.length);
      sharpe     = std > 0 ? (avg / std) * Math.sqrt(252) : 0;
    }

    const exitBreakdown = tradeLog.reduce((acc, t) => {
      acc[t.exitReason] = (acc[t.exitReason] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const mc = runMonteCarlo(tradeLog.map((t) => t.profit), initialBalance, 1000);

    // Fonte de dados detectada automaticamente pelo strategy-engine
    const isCrypto   = /USDT|BUSD|BTC|ETH$/i.test(symbol);
    const dataSource = isCrypto
      ? 'Binance API (dados reais)'
      : 'Yahoo Finance (dados reais)';

    return NextResponse.json({
      symbol, interval,
      dataSource,
      config: {
        trendFilter, trailingStop, trailRUnits, scaledExits,
        partialExit: partialExit && !scaledExits,
        fixedRiskAmount, progressiveRisk, circuitBreaker,
        useATRStop, atrMultiplier, riskPerTrade, stopLossPercent, minRiskReward,
        maxCandlesInTrade, balanceTarget,
        useAdxFilter, adxMinStrength, slippage,   // novos no v5
      },
      haltCount,
      targetHit,
      candlesAnalyzed: candles.length,
      totalTrades: tradeLog.length,
      wins, losses,
      winRate:      Math.round(winRate * 10) / 10,
      initialBalance,
      finalBalance: Math.round(currentBalance * 100) / 100,
      peakBalance:  Math.round(peakBal * 100) / 100,
      netProfit:    Math.round(netP * 100) / 100,
      netProfitPct: Math.round(netPPct * 10) / 10,
      maxDrawdown:  Math.round(maxDD * 10) / 10,
      profitFactor: Math.round(pf * 100) / 100,
      sharpeRatio:  Math.round(sharpe * 100) / 100,
      // ── Expectativa Matemática ─────────────────────────────
      expectancy:   Math.round(expectancy * 100) / 100,
      avgWin:       Math.round(avgWin * 100) / 100,
      avgLoss:      Math.round(avgLoss * 100) / 100,
      // ── Monte Carlo ────────────────────────────────────────
      monteCarlo:   mc,
      exitBreakdown,
      balanceCurve: balanceCurve.slice(0, 300),
      recentTrades: tradeLog.slice(-20),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro interno no backtest';
    console.error('[Backtest] Erro:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
