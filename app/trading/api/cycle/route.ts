// =============================================================
// TRADEFORGE SOVEREIGN — Cycle Route v2 (SSOT)
// ──────────────────────────────────────────────────────────────
// Refatorado para usar lib/trading/strategy-engine.ts
//
// Antes (v1):
//   • TechnicalAnalysis.generateSignal() → lógica duplicada
//   • RiskManager.calculatePlan()       → % fixo, sem ATR
//   • Stop/TP manual no route           → divergia do backtest
//
// Agora (v2):
//   • computeSignal()      → SSOT: ADX + EMA200 + RSI + MACD + BB
//   • createPosition()     → SSOT: ATR stop, slippage, tp1/tp2/tp3
//   • stepPosition()       → SSOT: trailing stop, saídas em camadas
//   • getProgressiveRisk() → SSOT: reduz risco conforme banca cresce
//
// Resultado:
//   Backtest e bot real rodam EXATAMENTE a mesma lógica.
//   Se mudar o strategy-engine, os dois mudam juntos.
// =============================================================

import { NextResponse }        from 'next/server';
import { supabase }            from '@/lib/supabase';
import { ExecutionEngine }     from '@/lib/trading/execution-engine';
import { NotificationService } from '@/lib/trading/notification-service';
import { SentimentTracker }    from '@/lib/trading/sentiment-tracker';
import {
  getCandles,
  computeSignal,
  createPosition,
  stepPosition,
  getProgressiveRisk,
  atr,
  DEFAULT_CONFIG,
  StrategyConfig,
  OpenPosition,
} from '@/lib/trading/strategy-engine';
import { PositionPlan } from '@/lib/trading/types';

const notifier  = new NotificationService();
const execution = new ExecutionEngine();
const sentiment = new SentimentTracker();

// ─────────────────────────────────────────────────────────────
// Monta a StrategyConfig a partir dos parâmetros do request.
// Os campos não informados caem no DEFAULT_CONFIG.
// ─────────────────────────────────────────────────────────────
function buildConfig(
  params:     Record<string, unknown> | undefined,
  riskConfig: Record<string, unknown> | undefined,
): StrategyConfig {
  return {
    ...DEFAULT_CONFIG,
    // Sinal
    rsiLow:         (params?.rsiLow          as number)  ?? DEFAULT_CONFIG.rsiLow,
    rsiHigh:        (params?.rsiHigh         as number)  ?? DEFAULT_CONFIG.rsiHigh,
    smaPeriod:      (params?.smaPeriod       as number)  ?? DEFAULT_CONFIG.smaPeriod,
    trendFilter:    (riskConfig?.trendFilter    as boolean) ?? DEFAULT_CONFIG.trendFilter,
    useAdxFilter:   (riskConfig?.useAdxFilter   as boolean) ?? DEFAULT_CONFIG.useAdxFilter,
    adxMinStrength: (riskConfig?.adxMinStrength as number)  ?? DEFAULT_CONFIG.adxMinStrength,
    adxPeriod:      14,
    // Stop Loss
    stopLossPercent:(riskConfig?.stopLossPercent as number)  ?? DEFAULT_CONFIG.stopLossPercent,
    atrMultiplier:  (riskConfig?.atrMultiplier   as number)  ?? DEFAULT_CONFIG.atrMultiplier,
    useATRStop:     (riskConfig?.useATRStop      as boolean) ?? DEFAULT_CONFIG.useATRStop,
    // Alvo
    minRiskReward:  (riskConfig?.minRiskReward  as number)  ?? DEFAULT_CONFIG.minRiskReward,
    // Posição
    riskPerTrade:   (riskConfig?.riskPerTrade   as number)  ?? DEFAULT_CONFIG.riskPerTrade,
    fixedRiskAmount:(riskConfig?.fixedRiskAmount as boolean) ?? DEFAULT_CONFIG.fixedRiskAmount,
    // Saídas
    trailingStop:   (riskConfig?.trailingStop   as boolean) ?? DEFAULT_CONFIG.trailingStop,
    trailRUnits:    (riskConfig?.trailRUnits    as number)  ?? DEFAULT_CONFIG.trailRUnits,
    scaledExits:    (riskConfig?.scaledExits    as boolean) ?? DEFAULT_CONFIG.scaledExits,
    partialExit:    (riskConfig?.partialExit    as boolean) ?? DEFAULT_CONFIG.partialExit,
    // Freios
    progressiveRisk:   (riskConfig?.progressiveRisk    as boolean) ?? DEFAULT_CONFIG.progressiveRisk,
    circuitBreaker:    (riskConfig?.circuitBreaker     as number)  ?? DEFAULT_CONFIG.circuitBreaker,
    maxCandlesInTrade: (riskConfig?.maxCandlesInTrade  as number)  ?? DEFAULT_CONFIG.maxCandlesInTrade,
    balanceTarget:     (riskConfig?.balanceTarget      as number)  ?? DEFAULT_CONFIG.balanceTarget,
    // Execução
    slippage: (riskConfig?.slippage as number) ?? DEFAULT_CONFIG.slippage,
  };
}

export async function POST(req: Request) {
  try {
    const {
      symbol,
      balance,
      riskConfig,
      params,
      interval = '4h',
    } = await req.json();

    const config = buildConfig(params, riskConfig);

    // ══════════════════════════════════════════════════════════
    // ETAPA 1 — PERFIL + TRAILING DRAWDOWN (proteção de banca)
    // ══════════════════════════════════════════════════════════
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .limit(1)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ status: 'Error', message: 'Perfil não encontrado no Supabase' });
    }

    let peakBalance = profile.peak_balance || profile.balance;
    if (profile.balance > peakBalance) {
      peakBalance = profile.balance;
      await supabase.from('profiles').update({ peak_balance: peakBalance }).eq('id', profile.id);
    }

    const drawdown          = peakBalance > 0 ? ((peakBalance - profile.balance) / peakBalance) * 100 : 0;
    const maxAllowedDrawdown = config.circuitBreaker > 0 ? config.circuitBreaker : 10;

    if (drawdown > maxAllowedDrawdown) {
      if (profile.account_status !== 'SAFE_MODE') {
        await supabase.from('profiles').update({ account_status: 'SAFE_MODE' }).eq('id', profile.id);
        await notifier.notifySafeMode(drawdown);
      }
      return NextResponse.json({
        status:   'Vetoed',
        signal:   'NEUTRAL',
        mood:     `SAFE MODE: Drawdown de ${drawdown.toFixed(2)}% atingido. Bot pausado.`,
        drawdown: drawdown.toFixed(2),
      });
    }

    if (profile.account_status === 'SAFE_MODE' && drawdown <= maxAllowedDrawdown * 0.5) {
      await supabase.from('profiles').update({ account_status: 'ACTIVE' }).eq('id', profile.id);
    }

    // ══════════════════════════════════════════════════════════
    // ETAPA 2 — BUSCAR CANDLES (via strategy-engine SSOT)
    // Detecta automaticamente: Binance (cripto) ou Yahoo Finance (ações)
    // ══════════════════════════════════════════════════════════
    const candles = await getCandles(symbol, interval, 500);
    if (candles.length < 100) {
      return NextResponse.json({
        status:  'Error',
        message: `Dados insuficientes para ${symbol}: ${candles.length} candles retornados`,
      });
    }

    const currentCandle = candles[candles.length - 1];
    const currentPrice  = currentCandle.close;

    // ══════════════════════════════════════════════════════════
    // ETAPA 3 — GESTÃO DE POSIÇÃO ABERTA (stepPosition SSOT)
    // Trailing stop, saídas em camadas e saída por tempo são
    // todos gerenciados pela mesma função usada no backtest.
    // ══════════════════════════════════════════════════════════
    const { data: dbPos } = await supabase
      .from('active_positions')
      .select('*')
      .eq('symbol', symbol)
      .maybeSingle();

    if (dbPos) {
      // Reconstitui OpenPosition a partir do banco.
      // Compatibilidade retroativa: posições abertas antes da migration
      // 002_active_positions_ssot.sql terão alguns campos null.
      // Nesses casos, estimamos valores seguros.
      const dir    = (dbPos.side as string) === 'LONG' ? 1 : -1;
      const estRD  = dbPos.risk_distance
        ?? (dbPos.entry_price * config.stopLossPercent);

      const pos: OpenPosition = {
        signal:        dbPos.side as 'LONG' | 'SHORT',
        entryPrice:    dbPos.entry_price,
        riskAmount:    dbPos.risk_amount    ?? (profile.balance * config.riskPerTrade),
        rd:            estRD,
        stop:          dbPos.current_stop_loss,
        peak:          dbPos.peak_price     ?? dbPos.entry_price,
        t1Hit:         dbPos.t1_hit         ?? false,
        t2Hit:         dbPos.t2_hit         ?? false,
        partialProfit: dbPos.partial_profit ?? 0,
        tp1:           dbPos.tp1            ?? (dbPos.entry_price + dir * estRD),
        tp2:           dbPos.tp2            ?? (dbPos.entry_price + dir * estRD * (config.minRiskReward / 2)),
        tp3:           dbPos.take_profit,
        candlesOpen:   dbPos.candles_open   ?? 0,
      };

      const stepResult = stepPosition(pos, currentCandle, config);

      if (stepResult.closed) {
        // ── Posição fechada pelo motor ─────────────────────────
        const newBalance = profile.balance + stepResult.profit;

        await supabase.from('active_positions').delete().eq('id', dbPos.id);

        const { data: openTrade } = await supabase
          .from('trades')
          .select('id')
          .eq('symbol', symbol)
          .eq('status', 'OPEN')
          .maybeSingle();

        if (openTrade) {
          await supabase.from('trades')
            .update({ exit_price: stepResult.exitPrice, pnl: stepResult.profit, status: 'CLOSED' })
            .eq('id', openTrade.id);
        }

        await supabase.from('profiles').update({ balance: newBalance }).eq('id', profile.id);

        await notifier.notifyExit(symbol, {
          side:      pos.signal,
          pnl:       stepResult.profit,
          exitPrice: stepResult.exitPrice,
          balance:   newBalance,
          reason:    stepResult.exitReason,
        });

        return NextResponse.json({
          status:  'Closed',
          signal:  'NEUTRAL',
          mood:    `${stepResult.exitReason} | PnL: ${stepResult.profit >= 0 ? '+' : ''}$${stepResult.profit.toFixed(2)}`,
          pnl:     stepResult.profit.toFixed(2),
          balance: newBalance.toFixed(2),
        });
      }

      // ── Posição continua aberta — persiste estado atualizado ─
      const updatedPos = stepResult.pos;
      await supabase.from('active_positions').update({
        current_stop_loss: updatedPos.stop,
        peak_price:        updatedPos.peak,
        t1_hit:            updatedPos.t1Hit,
        t2_hit:            updatedPos.t2Hit,
        partial_profit:    updatedPos.partialProfit,
        candles_open:      updatedPos.candlesOpen,
      }).eq('id', dbPos.id);

      return NextResponse.json({
        status: 'Monitoring',
        signal: 'NEUTRAL',
        mood:   `Monitorando ${pos.signal} | Entrada: $${pos.entryPrice.toFixed(2)} | Atual: $${currentPrice.toFixed(2)} | Stop: $${updatedPos.stop.toFixed(2)} | Candles: ${updatedPos.candlesOpen}`,
        trailing: {
          t1Hit:         updatedPos.t1Hit,
          t2Hit:         updatedPos.t2Hit,
          partialProfit: updatedPos.partialProfit.toFixed(2),
        },
      });
    }

    // ══════════════════════════════════════════════════════════
    // ETAPA 4 — COMPUTAR SINAL (computeSignal SSOT)
    // 6 indicadores + filtro ADX + filtro EMA200
    // ══════════════════════════════════════════════════════════
    const { signal, adx, blockedBy } = computeSignal(candles, config);

    // ══════════════════════════════════════════════════════════
    // ETAPA 5 — ANÁLISE DE SENTIMENTO (camada de veto opcional)
    // Não-fatal: se a API falhar, o ciclo continua sem o veto.
    // ══════════════════════════════════════════════════════════
    let sentimentMood = 'NEUTRAL';
    if (signal !== 'NEUTRAL') {
      try {
        const sentimentResult = await sentiment.analyze(symbol, signal);
        sentimentMood = sentimentResult.mood;
        if (sentimentResult.shouldVeto) {
          await notifier.notifyVeto(symbol, sentimentResult.vetoReason || 'Sentimento contra o sinal');
          return NextResponse.json({
            status:    'Vetoed',
            signal:    'NEUTRAL',
            mood:      `Vetado por sentimento: ${sentimentResult.vetoReason}`,
            fearGreed: sentimentResult.fearGreedIndex,
            adx:       adx.toFixed(1),
          });
        }
      } catch (sentErr: any) {
        console.warn('[Sentiment] Erro não-fatal:', sentErr.message);
      }
    }

    // ══════════════════════════════════════════════════════════
    // ETAPA 6 — SINAL NEUTRO
    // ══════════════════════════════════════════════════════════
    if (signal === 'NEUTRAL') {
      return NextResponse.json({
        status:    'Neutral',
        signal:    'NEUTRAL',
        mood:      `Aguardando setup | ADX: ${adx.toFixed(1)} | Bloqueado por: ${blockedBy ?? 'votos insuficientes'}`,
        adx:       adx.toFixed(1),
        blockedBy: blockedBy ?? null,
        price:     currentPrice.toFixed(2),
      });
    }

    // ══════════════════════════════════════════════════════════
    // ETAPA 7 — NOVA POSIÇÃO
    // ══════════════════════════════════════════════════════════
    const { data: existingPos } = await supabase
      .from('active_positions')
      .select('id')
      .eq('symbol', symbol)
      .maybeSingle();

    if (existingPos) {
      return NextResponse.json({ status: 'Neutral', signal: 'NEUTRAL', mood: 'Posição já aberta para este ativo' });
    }

    // ── Risco progressivo (SSOT) ───────────────────────────────
    const baseRisk      = config.riskPerTrade;
    const effectiveRisk = config.progressiveRisk
      ? getProgressiveRisk(baseRisk, profile.balance, peakBalance)
      : baseRisk;

    // ── Stop distance: ATR dinâmico ou % fixo (SSOT) ──────────
    const currentATR  = atr(candles, 14);
    const stopDistPct = config.useATRStop && currentATR > 0
      ? (currentATR * config.atrMultiplier) / currentPrice
      : config.stopLossPercent;

    // ── Capital base para dimensionamento ─────────────────────
    const baseCapital = config.fixedRiskAmount ? (balance ?? profile.balance) : profile.balance;
    const riskDollar  = baseCapital * effectiveRisk;

    // ── createPosition (SSOT) — slippage, tp1/tp2/tp3, rd ─────
    const newPos = createPosition(
      signal as 'LONG' | 'SHORT',
      currentPrice,
      riskDollar,
      stopDistPct,
      config,
    );

    // ── Monta PositionPlan para ExecutionEngine ────────────────
    const positionSize = newPos.rd > 0 ? newPos.riskAmount / newPos.rd : 0;
    const plan: PositionPlan = {
      positionSize,
      stopLoss:         newPos.stop,
      takeProfit:       newPos.tp3,
      riskAmount:       newPos.riskAmount,
      rewardAmount:     newPos.riskAmount * config.minRiskReward,
      leverageRequired: 1,
    };

    // ── Executar na Binance (ou simular em PAPER/SIMULATED) ───
    await execution.syncBinanceBalance(profile.id);
    const execResult = await execution.openPosition(symbol, plan, signal, currentPrice);

    // ── Persistir posição com campos completos do OpenPosition ─
    await supabase.from('active_positions').upsert({
      symbol,
      side:              signal,
      entry_price:       newPos.entryPrice,
      current_stop_loss: newPos.stop,
      take_profit:       newPos.tp3,
      position_size:     positionSize,
      // Campos SSOT (adicionados pela migration 002_active_positions_ssot.sql)
      risk_amount:    newPos.riskAmount,
      risk_distance:  newPos.rd,
      peak_price:     newPos.entryPrice,
      t1_hit:         false,
      t2_hit:         false,
      partial_profit: 0,
      tp1:            newPos.tp1,
      tp2:            newPos.tp2,
      candles_open:   0,
    });

    // ── Descontar taxa de abertura ─────────────────────────────
    const fee        = baseCapital * config.slippage;
    const newBalance = profile.balance - fee;
    await supabase.from('profiles').update({ balance: newBalance }).eq('id', profile.id);

    // ── Atualizar métricas no trade ────────────────────────────
    const { data: openTrade } = await supabase
      .from('trades')
      .select('id')
      .eq('symbol', symbol)
      .eq('status', 'OPEN')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (openTrade) {
      await supabase.from('trades').update({
        adx_at_entry:           adx,
        stop_dist_pct_at_entry: stopDistPct,
        atr_at_entry:           currentATR,
        effective_risk:         effectiveRisk,
      }).eq('id', openTrade.id);
    }

    // ── Notificar entrada ──────────────────────────────────────
    await notifier.notifyEntry(symbol, {
      side:       signal,
      entryPrice: newPos.entryPrice,
      stopLoss:   newPos.stop,
      takeProfit: newPos.tp3,
      score:      adx,
      mood:       sentimentMood,
      orderId:    execResult.orderId,
      mode:       execResult.mode,
    });

    return NextResponse.json({
      status:       'Executed',
      signal,
      orderId:      execResult.orderId,
      mood:         `${signal} executado! ADX: ${adx.toFixed(1)} | Sentimento: ${sentimentMood}`,
      entryPrice:   newPos.entryPrice.toFixed(2),
      stopLoss:     newPos.stop.toFixed(2),
      tp1:          newPos.tp1.toFixed(2),
      tp2:          newPos.tp2.toFixed(2),
      takeProfit:   newPos.tp3.toFixed(2),
      adx:          adx.toFixed(1),
      stopDistPct:  (stopDistPct * 100).toFixed(2) + '%',
      effectiveRisk:(effectiveRisk * 100).toFixed(2) + '%',
      mode:         execResult.mode,
    });

  } catch (error: any) {
    console.error('Erro no ciclo:', error);
    try { await notifier.notifyError('BOT', error.message); } catch { /* silenced */ }
    return NextResponse.json({ status: 'Error', message: error.message }, { status: 500 });
  }
}
