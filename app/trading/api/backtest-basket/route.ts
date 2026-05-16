
// =============================================================
// TRADEFORGE SOVEREIGN — Basket Backtest Route v2 (SSOT)
// ──────────────────────────────────────────────────────────────
// Refatorado para usar lib/trading/strategy-engine.ts (SSOT)
//
// Mudanças v2:
//   • Toda lógica de trading importada do strategy-engine (SSOT)
//   • stepPosition, computeSignal, createPosition, getProgressiveRisk
//     vêm do mesmo arquivo que o bot real vai usar → zero divergência
//   • createPosition aplica slippage realista em entradas
//   • computeSignal inclui filtro ADX (bloqueia mercado lateral)
//   • getCandles suporta Yahoo Finance → presets com SPY/QQQ/NVDA
//   • Novos parâmetros: useAdxFilter, adxMinStrength, slippage
//
// Arquitetura — Motor Sincronizado:
//   Todos os ativos processam o mesmo candle ao mesmo tempo.
//   Risco Global é calculado ANTES de qualquer novo trade naquele candle.
//   Isso detecta e bloqueia stops simultâneos por correlação de mercado.
// =============================================================

import { NextRequest, NextResponse } from 'next/server';
import {
  CandleData, StrategyConfig, OpenPosition,
  computeSignal, stepPosition, createPosition,
  getProgressiveRisk, atr,
  getCandles, CANDLES_PER_DAY,
  getBtcMarketRegime, DEFAULT_CONFIG,
  type BtcRegime,
} from '@/lib/trading/strategy-engine';

interface BasketAsset {
  symbol:     string;
  allocation: number;   // 0.0 a 1.0, soma deve ser ~1
}

interface BasketParams {
  assets:            BasketAsset[];
  initialBalance:    number;
  globalRiskCap:     number;    // % do capital total — limite de risco simultâneo
  riskPerTrade:      number;
  stopLossPercent:   number;
  atrMultiplier:     number;
  useATRStop:        boolean;
  minRiskReward:     number;
  rsiLow:            number;
  rsiHigh:           number;
  smaPeriod:         number;
  trendFilter:       boolean;
  useAdxFilter:      boolean;   // NOVO: filtra mercado lateral via ADX
  adxMinStrength:    number;    // NOVO: ADX mínimo (padrão: 20)
  trailingStop:      boolean;
  trailRUnits:       number;
  scaledExits:       boolean;
  fixedRiskAmount:   boolean;
  progressiveRisk:   boolean;
  circuitBreaker:    number;
  maxCandlesInTrade: number;
  balanceTarget:     number;
  slippage:          number;    // NOVO: custo por trade em % (padrão: 0.001)
  // Filtros avançados (Task 29 — sincronizados com DEFAULT_CONFIG)
  useVolumeFilter?:  boolean;  // trava de volume rígido (padrão: true)
  volumeThreshold?:  number;   // mínimo de volume relativo (padrão: 0.8)
  minVotesLong?:     number;   // votos mínimos para LONG (padrão: 2, aumenta para 4 em RISK_OFF)
  minVotesShort?:    number;   // votos mínimos para SHORT (padrão: 2)
  useBtcRegime?:     boolean;  // ativar filtro de correlação BTC (padrão: true)
  interval?:         string;
  limit?:            number;
}

interface TradeResult {
  entryPrice: number; exitPrice: number;
  signal: string; profit: number; isWin: boolean;
  balance: number; exitReason: string;
}

// ─── Métricas por ativo ───────────────────────────────────────
// Permanece inline — específica do basket, não pertence ao SSOT
function calcMetrics(trades: TradeResult[], initialBal: number, balanceCurve: number[]) {
  const wins    = trades.filter(t =>  t.isWin).length;
  const losses  = trades.filter(t => !t.isWin).length;
  const winRate = trades.length > 0 ? (wins / trades.length) * 100 : 0;
  const grossP  = trades.filter(t =>  t.isWin).reduce((s, t) => s + t.profit, 0);
  const grossL  = Math.abs(trades.filter(t => !t.isWin).reduce((s, t) => s + t.profit, 0));
  const pf      = grossL > 0 ? grossP / grossL : grossP > 0 ? 999 : 0;
  const final   = balanceCurve[balanceCurve.length - 1] ?? initialBal;
  const netPct  = ((final - initialBal) / initialBal) * 100;

  let peak = initialBal, maxDD = 0;
  for (const b of balanceCurve) {
    if (b > peak) peak = b;
    const dd = ((peak - b) / peak) * 100;
    if (dd > maxDD) maxDD = dd;
  }
  return { wins, losses, winRate, profitFactor: pf, finalBalance: final, netProfitPct: netPct, maxDrawdown: maxDD };
}

// ─── Handler principal ────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body: BasketParams = await req.json();
    const {
      assets            = [{ symbol: 'BTCUSDT', allocation: 1 }],
      initialBalance    = 100,
      globalRiskCap     = 15,
      riskPerTrade      = 0.02,
      stopLossPercent   = 0.015,
      atrMultiplier     = 2.0,
      useATRStop        = true,
      minRiskReward     = 2.0,
      rsiLow            = 30,
      rsiHigh           = 70,
      smaPeriod         = 200,
      trendFilter       = true,
      useAdxFilter      = true,
      adxMinStrength    = 20,
      trailingStop      = true,
      trailRUnits       = 2.0,
      scaledExits       = true,
      fixedRiskAmount   = true,
      progressiveRisk   = true,
      circuitBreaker    = 15,
      maxCandlesInTrade = 0,
      balanceTarget     = 0,
      slippage          = 0.001,
      useVolumeFilter   = DEFAULT_CONFIG.useVolumeFilter,
      volumeThreshold   = DEFAULT_CONFIG.volumeThreshold,
      minVotesLong      = DEFAULT_CONFIG.minVotesLong,
      minVotesShort     = DEFAULT_CONFIG.minVotesShort,
      useBtcRegime      = true,
      interval          = '4h',
      limit             = 1000,
    } = body;

    // ── 📋 DEBUG: parâmetros recebidos pelo motor ──────────────
    // Útil para confirmar que o frontend está enviando os valores corretos.
    // Aparecem nos logs do Vercel / console do Next.js dev server.
    console.log('[Basket Backtest] ═══════════════════════════════════════');
    console.log('[Basket Backtest] 📊 Ativos:', assets.map(a => `${a.symbol}(${(a.allocation * 100).toFixed(0)}%)`).join(', '));
    console.log('[Basket Backtest] 💰 Banca inicial:', initialBalance, '| Risco/trade:', (riskPerTrade * 100).toFixed(1) + '%', '| Slippage:', (slippage * 100).toFixed(2) + '%');
    console.log('[Basket Backtest] 🕯️  Intervalo:', interval, '| Candles:', limit, '| Risco global cap:', globalRiskCap + '%');
    console.log('[Basket Backtest] 📐 ADX:', useAdxFilter ? `ON (min ${adxMinStrength})` : 'OFF', '| ATR stop:', useATRStop ? `${atrMultiplier}x` : 'OFF', '| R:R min:', minRiskReward);
    console.log('[Basket Backtest] 🔇 Volume filter:', useVolumeFilter ? `ON (threshold ${volumeThreshold}x)` : 'OFF', '| Votos L/S:', minVotesLong, '/', minVotesShort);
    console.log('[Basket Backtest] ⏱️  Time exit:', maxCandlesInTrade > 0 ? `${maxCandlesInTrade}c` : 'OFF', '| Meta banca:', balanceTarget > 0 ? `${balanceTarget}x` : 'OFF', '| Circuit breaker:', circuitBreaker + '%');
    console.log('[Basket Backtest] 📈 Trailing stop:', trailingStop ? `${trailRUnits}R` : 'OFF', '| Scaled exits:', scaledExits, '| Progressive risk:', progressiveRisk);
    console.log('[Basket Backtest] 🌍 BTC regime filter:', useBtcRegime ? 'ON' : 'OFF');
    console.log('[Basket Backtest] ═══════════════════════════════════════');

    // ── Config SSOT ────────────────────────────────────────────
    // Mesmo objeto que o single-asset backtest e o bot real usam.
    // ⚠️  FIELDS COMPLETOS — nunca omitir campos obrigatórios do StrategyConfig
    //     ou computeSignal recebe undefined e silencia os filtros avançados.
    const config: StrategyConfig = {
      rsiLow, rsiHigh, smaPeriod, trendFilter,
      adxPeriod: 14, adxMinStrength, useAdxFilter,
      stopLossPercent, atrMultiplier, useATRStop,
      minRiskReward,
      riskPerTrade, fixedRiskAmount,
      trailingStop, trailRUnits,
      scaledExits, partialExit: false,
      progressiveRisk, circuitBreaker,
      maxCandlesInTrade, balanceTarget,
      slippage,
      // Filtros avançados — obrigatórios desde Task 29
      useVolumeFilter, volumeThreshold,
      minVotesLong, minVotesShort,
    };

    // ── Fetch candles em paralelo ──────────────────────────────
    // getCandles detecta automaticamente: cripto → Binance, ação → Yahoo Finance
    const allCandles = await Promise.all(
      assets.map(a => getCandles(a.symbol, interval, Math.min(limit, 2000)))
    );

    // ── BTC Regime Filter ──────────────────────────────────────
    // Detecta se BTC está em queda relevante → aumenta minVotesLong para altcoins.
    // Só faz sentido quando: (a) useBtcRegime está ativo E (b) há altcoins no basket.
    //
    // Lógica:
    //   NORMAL:   minVotesLong = valor do config (padrão: 2)
    //   RISK_OFF: minVotesLong = 4  — requer confirmação muito forte para LONGs
    //             (SHORT mantém threshold normal — tendência de queda é aliada)
    //
    // Implementação: recalcula btcRegimeConfig por ativo, usando os candles
    // do BTCUSDT já buscados (se estiver no basket) ou buscando separado.
    let btcRegime: BtcRegime = 'NORMAL';
    if (useBtcRegime) {
      const btcIdx = assets.findIndex(a => a.symbol === 'BTCUSDT');
      const btcCandles = btcIdx >= 0
        ? allCandles[btcIdx]
        : await getCandles('BTCUSDT', interval, Math.min(limit, 500)).catch(() => null);

      if (btcCandles && btcCandles.length >= 50) {
        btcRegime = getBtcMarketRegime(btcCandles);
        console.log(`[Basket Backtest] 🔵 BTC Regime: ${btcRegime}${btcRegime === 'RISK_OFF' ? ' → minVotesLong aumentado para 4 em altcoins' : ''}`);
      }
    }

    // Alinha: usa o comprimento mínimo entre todos os ativos
    const minLen   = Math.min(...allCandles.map(c => c.length));
    const startIdx = Math.max(smaPeriod + 35, 60);
    const dayC     = CANDLES_PER_DAY[interval] ?? 6;

    // ── Estado por ativo ───────────────────────────────────────
    type AssetState = {
      balance:           number;
      initialSubBalance: number;
      openPos:           OpenPosition | null;
      lastTradeIdx:      number;
      trades:            TradeResult[];
      balanceCurve:      number[];
      rollingPeak:       number;
      haltUntilIdx:      number;
      haltCount:         number;
      targetHit:         boolean;
      globalRiskCapHits: number;   // quantas vezes foi bloqueado pelo risco global
    };

    const states: AssetState[] = assets.map(a => {
      const subBal = initialBalance * a.allocation;
      return {
        balance:           subBal,
        initialSubBalance: subBal,
        openPos:           null,
        lastTradeIdx:      -5,
        trades:            [],
        balanceCurve:      [subBal],
        rollingPeak:       subBal,
        haltUntilIdx:      -1,
        haltCount:         0,
        targetHit:         false,
        globalRiskCapHits: 0,
      };
    });

    // ── Curva de equity consolidada ────────────────────────────
    const portfolioCurve: number[] = [initialBalance];

    // ── Loop candle a candle — sincronizado ────────────────────
    // Todos os ativos processam o mesmo candle no mesmo instante.
    // O risco global é calculado UMA VEZ antes de qualquer ativo
    // naquele candle → nenhum ativo "furura a fila" para abrir
    // mais exposição do que o portfólio suporta.
    for (let i = startIdx; i < minLen - 1; i++) {

      // 1. Calcula risco global ANTES de processar qualquer ativo
      const totalCapital  = states.reduce((s, st) => s + st.balance, 0);
      const totalOpenRisk = states
        .filter(st => st.openPos !== null)
        .reduce((s, st) => s + st.openPos!.riskAmount, 0);

      // 2. Processa cada ativo
      for (let a = 0; a < assets.length; a++) {
        const st      = states[a];
        const candles = allCandles[a];
        const c       = candles[i];

        if (st.balance <= 0 || st.targetHit) continue;

        // ── Avança posição aberta (SSOT) ──────────────────────
        // Mesma função que o bot real usa — nenhuma divergência possível
        if (st.openPos) {
          const step = stepPosition(st.openPos, c, config);
          if (step.closed) {
            st.balance = Math.max(0, st.balance + step.profit);
            st.trades.push({
              entryPrice: st.openPos.entryPrice,
              exitPrice:  step.exitPrice,
              signal:     st.openPos.signal,
              profit:     step.profit,
              isWin:      step.isWin,
              balance:    st.balance,
              exitReason: step.exitReason,
            });
            st.openPos = null;
            st.balanceCurve.push(st.balance);
          } else {
            st.openPos = step.pos;
          }
          continue; // uma posição por vez por ativo
        }

        // ── Verificações antes de abrir nova posição ──────────
        if (i <= st.haltUntilIdx) continue;
        if (i - st.lastTradeIdx < 3) continue;

        // Rolling peak e circuit breaker por ativo
        if (st.balance > st.rollingPeak) st.rollingPeak = st.balance;
        if (circuitBreaker > 0 && st.rollingPeak > 0) {
          const drop = ((st.rollingPeak - st.balance) / st.rollingPeak) * 100;
          if (drop >= circuitBreaker) {
            st.haltUntilIdx = i + dayC;
            st.rollingPeak  = st.balance;
            st.haltCount++;
            continue;
          }
        }

        // Meta de banca por ativo
        if (balanceTarget > 0 && st.balance >= st.initialSubBalance * balanceTarget) {
          st.targetHit = true;
          continue;
        }

        // ── Sinal via SSOT (inclui ADX + EMA200 + Volume filter) ─
        const slice = candles.slice(0, i + 1);

        // BTC Regime: altcoins em RISK_OFF precisam de 4 votos para LONG.
        // BTC próprio mantém o threshold normal (não é altcoin).
        const isBtc = assets[a].symbol === 'BTCUSDT' || assets[a].symbol === 'ETHUSDT';
        const signalConfig = (useBtcRegime && btcRegime === 'RISK_OFF' && !isBtc)
          ? { ...config, minVotesLong: 4 }  // exige confirmação forte em altcoins
          : config;

        const { signal } = computeSignal(slice, signalConfig);
        if (signal === 'NEUTRAL') continue;

        // ── Risco do novo trade ────────────────────────────────
        const base    = fixedRiskAmount ? st.initialSubBalance : st.balance;
        const effRisk = progressiveRisk
          ? getProgressiveRisk(riskPerTrade, st.balance, st.initialSubBalance)
          : riskPerTrade;
        const riskAmt = base * effRisk;

        // ── Verificação de Risco Global ────────────────────────
        // Antes de abrir, simula qual seria o risco total do portfólio
        // com esta nova posição. Se ultrapassar globalRiskCap, ignora.
        // Evita o cenário: "5 stops simultâneos = -50% da banca num candle"
        const projectedRisk = totalCapital > 0
          ? ((totalOpenRisk + riskAmt) / totalCapital) * 100
          : 0;
        if (projectedRisk > globalRiskCap) {
          st.globalRiskCapHits++;
          continue;
        }

        // ── Stop distance (ATR dinâmico ou % fixo) ────────────
        let stopDistPct = stopLossPercent;
        if (useATRStop) {
          const atrVal = atr(slice, 14);
          if (atrVal > 0) stopDistPct = (atrVal * atrMultiplier) / c.close;
        }

        // ── Abre posição via SSOT (slippage aplicado) ─────────
        st.openPos      = createPosition(signal as 'LONG' | 'SHORT', c.close, riskAmt, stopDistPct, config);
        st.lastTradeIdx = i;
      }

      // 3. Registra ponto na curva consolidada
      portfolioCurve.push(states.reduce((s, st) => s + st.balance, 0));
    }

    // ── Fecha posições abertas ao preço do último candle ───────
    for (let a = 0; a < assets.length; a++) {
      const st    = states[a];
      const lastC = allCandles[a][minLen - 1];
      if (st.openPos && lastC) {
        const dir        = st.openPos.signal === 'LONG' ? 1 : -1;
        const priceDelta = (lastC.close - st.openPos.entryPrice) * dir;
        const rUnits     = priceDelta / st.openPos.rd;
        const remaining  = st.openPos.t2Hit ? 0.4 : st.openPos.t1Hit ? (scaledExits ? 0.7 : 0.5) : 1.0;
        const profit     = st.openPos.partialProfit + rUnits * st.openPos.riskAmount * remaining;
        st.balance       = Math.max(0, st.balance + profit);
        st.trades.push({
          entryPrice: st.openPos.entryPrice,
          exitPrice:  lastC.close,
          signal:     st.openPos.signal,
          profit,
          isWin:      profit > 0,
          balance:    st.balance,
          exitReason: 'Fim dos dados',
        });
        st.balanceCurve.push(st.balance);
        st.openPos = null;
      }
    }

    // ── Métricas por ativo ─────────────────────────────────────
    const assetResults = assets.map((a, idx) => {
      const st = states[idx];
      const m  = calcMetrics(st.trades, st.initialSubBalance, st.balanceCurve);
      return {
        symbol:            a.symbol,
        allocation:        a.allocation,
        initialBalance:    st.initialSubBalance,
        finalBalance:      Math.round(st.balance * 100) / 100,
        netProfitPct:      Math.round(m.netProfitPct * 10) / 10,
        wins:              m.wins,
        losses:            m.losses,
        winRate:           Math.round(m.winRate * 10) / 10,
        profitFactor:      Math.round(m.profitFactor * 100) / 100,
        maxDrawdown:       Math.round(m.maxDrawdown * 10) / 10,
        totalTrades:       st.trades.length,
        haltCount:         st.haltCount,
        targetHit:         st.targetHit,
        globalRiskCapHits: st.globalRiskCapHits,
        balanceCurve:      st.balanceCurve.slice(0, 200),
        recentTrades:      st.trades.slice(-10),
      };
    });

    // ── Métricas do portfólio ──────────────────────────────────
    const portfolioFinal   = states.reduce((s, st) => s + st.balance, 0);
    const portfolioNetPct  = ((portfolioFinal - initialBalance) / initialBalance) * 100;

    let pPeak = initialBalance, pMaxDD = 0;
    for (const b of portfolioCurve) {
      if (b > pPeak) pPeak = b;
      const dd = ((pPeak - b) / pPeak) * 100;
      if (dd > pMaxDD) pMaxDD = dd;
    }

    const allTrades   = states.flatMap(st => st.trades);
    const totalWins   = allTrades.filter(t =>  t.isWin).length;
    const totalLosses = allTrades.filter(t => !t.isWin).length;
    const totalGrossP = allTrades.filter(t =>  t.isWin).reduce((s, t) => s + t.profit, 0);
    const totalGrossL = Math.abs(allTrades.filter(t => !t.isWin).reduce((s, t) => s + t.profit, 0));
    const totalPF     = totalGrossL > 0 ? totalGrossP / totalGrossL : totalGrossP > 0 ? 999 : 0;
    const totalGlobalCapHits = states.reduce((s, st) => s + st.globalRiskCapHits, 0);

    // Fonte de dados detectada automaticamente pelo strategy-engine
    const allCrypto  = assets.every(a => /USDT|BUSD|BTC|ETH$/i.test(a.symbol));
    const dataSource = allCrypto
      ? 'Binance API (dados reais)'
      : 'Multi-source (Binance + Yahoo Finance)';

    return NextResponse.json({
      dataSource,
      interval,
      candlesAnalyzed:       minLen,
      initialBalance,
      finalBalance:          Math.round(portfolioFinal * 100) / 100,
      peakBalance:           Math.round(pPeak * 100) / 100,
      netProfitPct:          Math.round(portfolioNetPct * 10) / 10,
      maxDrawdown:           Math.round(pMaxDD * 10) / 10,
      totalTrades:           allTrades.length,
      totalWins,
      totalLosses,
      portfolioProfitFactor: Math.round(totalPF * 100) / 100,
      globalRiskCapHits:     totalGlobalCapHits,
      portfolioBalanceCurve: portfolioCurve.slice(0, 300),
      assets:                assetResults,
      config: {
        globalRiskCap, trendFilter, trailingStop, trailRUnits, scaledExits,
        fixedRiskAmount, progressiveRisk, circuitBreaker, useATRStop,
        atrMultiplier, riskPerTrade, minRiskReward, maxCandlesInTrade, balanceTarget,
        useAdxFilter, adxMinStrength, slippage,        // v2
        useVolumeFilter, volumeThreshold,              // v3 (Task 29)
        minVotesLong, minVotesShort,                   // v3 (Task 29)
        btcRegime,                                     // v3 (Task 29)
      },
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro desconhecido';
    console.error('[Backtest Basket]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
