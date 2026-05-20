// =============================================================
// TRADEFORGE SOVEREIGN — Scanner Route (stateless)
// ──────────────────────────────────────────────────────────────
// Versão serverless do LiveBot: lê estado do DB em vez de memória.
//
// PROBLEMA QUE CORRIGE:
//   live-bot.ts usa this.openPositions (Map em memória).
//   No Vercel serverless cada invocação começa do zero —
//   a memória é apagada. Posições abertas no DB nunca eram
//   encontradas, e o bot sempre avaliava novos sinais.
//
// SOLUÇÃO:
//   Este route lê posições abertas de live_demo_trades (DB),
//   reconstitui o OpenPosition SSOT a partir do campo `notes`
//   (onde salvamos o estado serializado), steppeia com
//   stepPosition() e grava o resultado de volta.
//
// FLUXO:
//   Fase 1 — GUARDIAN: steppeia todas as posições OPEN do DB
//   Fase 2 — SCANNER: computa sinais + grava market_analytics
//                     abre novas posições se sinal válido
//
// CHAMADO POR: /api/cron (Vercel cron ou GitHub Actions)
// =============================================================

import { NextRequest, NextResponse } from 'next/server';
// supabaseAdmin usa service_role key — bypassa RLS.
// live_demo_trades tem policy "live_demo_service_write" que bloqueia
// INSERT/UPDATE com anon key. Sem supabaseAdmin, o scanner lê
// posições corretamente mas o UPDATE de fechamento falha silenciosamente.
import { supabaseAdmin as supabase } from '@/lib/supabase';
import {
  getCandles,
  computeSignal,
  createPosition,
  stepPosition,
  getBtcMarketRegime,
  atr,
  ema,
  rsi,
  macdHistogram,
  DEFAULT_CONFIG,
  type OpenPosition,
  type StrategyConfig,
} from '@/lib/trading/strategy-engine';

// ─── Configuração do bot demo ─────────────────────────────────
// Mesmos parâmetros usados no ciclo ao vivo.
// Alterar aqui atualiza AMBOS: scanner e dashboard.

const PORTFOLIO = [
  'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT',
  'DOGEUSDT', 'ADAUSDT', 'XRPUSDT',
  'SPY', 'QQQ', 'NVDA', 'AAPL', 'MSFT',
  'BBAS3.SA', 'MGLU3.SA', 'ITUB4.SA',
  'LINKUSDT', 'DOTUSDT', 'MATICUSDT', 'AVAXUSDT',
];

const BOT_INTERVAL  = '4h';
const DEMO_BALANCE  = 1000;   // saldo inicial simulado (USD)
const RISK_PER_TRADE = 0.02;  // 2% por trade

const DEMO_CONFIG: StrategyConfig = {
  ...DEFAULT_CONFIG,
  riskPerTrade:    RISK_PER_TRADE,
  fixedRiskAmount: false,
  minRiskReward:   2.0,
  scaledExits:     true,
  partialExit:     false,
  trailingStop:    true,
  trailRUnits:     2.0,
  useATRStop:      true,
  atrMultiplier:   2.0,
  adxMinStrength:  20,
  useAdxFilter:    true,
  trendFilter:     true,
  progressiveRisk: false,
  slippage:        0.001,
  useVolumeFilter: true,
  volumeThreshold: 0.8,
  minVotesLong:    2,
  minVotesShort:   2,
};

// ─── Grupos de correlação ─────────────────────────────────────
// Limita abertura simultânea de posições no mesmo grupo.
// Rationale: BTC, ETH, LINK caem juntos — abrir 3 SHORTs simultâneos
// triplica a exposição sem diversificação real de risco.
//
// Dívida técnica: correlações são estáticas. No futuro, calcular
// dinamicamente via coeficiente de Pearson em janela rolante 30d.

const MAX_CORR_POSITIONS = 2;

const CORR_GROUP: Record<string, string> = {
  // Crypto large-cap (BTC puxa o grupo inteiro)
  BTCUSDT:    'crypto-major',
  ETHUSDT:    'crypto-major',
  BNBUSDT:    'crypto-major',
  SOLUSDT:    'crypto-major',
  // Crypto alt / DeFi (correlação alta com ETH)
  LINKUSDT:   'crypto-alt',
  DOTUSDT:    'crypto-alt',
  AVAXUSDT:   'crypto-alt',
  MATICUSDT:  'crypto-alt',
  // Crypto meme / especulativo
  DOGEUSDT:   'crypto-meme',
  ADAUSDT:    'crypto-meme',
  XRPUSDT:    'crypto-meme',
  // US equities (mesmo mercado, horário e sentiment)
  SPY:        'us-equity',
  QQQ:        'us-equity',
  NVDA:       'us-equity',
  AAPL:       'us-equity',
  MSFT:       'us-equity',
  // BR equities (B3, correlacionado com câmbio BRL/USD)
  'BBAS3.SA': 'br-equity',
  'MGLU3.SA': 'br-equity',
  'ITUB4.SA': 'br-equity',
};


// ─── Types ────────────────────────────────────────────────────

/** Entrada no log de vida da posição (persistida em notes.log[]). */
interface PosLogEntry {
  ts:      string;
  event:   'opened' | 'stepped' | 'stop_moved' | 'tp1_hit' | 'tp2_hit' | 'closed';
  detail?: string;
}

// ─── Helpers ──────────────────────────────────────────────────

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

/** Lê o array de log do campo notes (tolerante a notas corrompidas). */
function readLog(notes: unknown): PosLogEntry[] {
  try {
    const parsed = JSON.parse(notes as string);
    return Array.isArray(parsed?.log) ? (parsed.log as PosLogEntry[]) : [];
  } catch { return []; }
}

/** Reconstitui OpenPosition a partir do campo notes (estado SSOT serializado). */
function posFromDb(trade: Record<string, unknown>): OpenPosition {
  // Tenta usar estado SSOT salvo (mais preciso)
  try {
    const notes = trade.notes ? JSON.parse(trade.notes as string) : null;
    if (notes?.ssotState) return notes.ssotState as OpenPosition;
  } catch { /* notas corrompidas — usa fallback */ }

  // Fallback: estima a partir dos campos básicos da linha
  const entry = Number(trade.entry_price);
  const stop  = Number(trade.stop_price);
  const rd    = Math.abs(entry - stop);

  return {
    signal:        (trade.signal as 'LONG' | 'SHORT'),
    entryPrice:    entry,
    riskAmount:    Number(trade.risk_amount),
    rd,
    stop,
    peak:          entry,
    t1Hit:         false,
    t2Hit:         false,
    partialProfit: 0,
    tp1:           Number(trade.tp1_price),
    tp2:           Number(trade.tp2_price),
    tp3:           Number(trade.tp3_price),
    candlesOpen:   0,
  };
}

// ─── Route ────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  // Protege com CRON_SECRET (mesma lógica do /api/cron)
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();

  type StepResult   = { symbol: string; status: string; reason?: string; pnl?: number; stop?: number };
  type ScanResult   = { symbol: string; signal: string; adx: string; blockedBy?: string; action?: string };
  type ErrorResult  = { symbol: string; error: string };

  const stepped: StepResult[]  = [];
  const scanned: ScanResult[]  = [];
  const errors:  ErrorResult[] = [];

  try {
    // ══════════════════════════════════════════════════════════
    // FASE 1 — GUARDIAN
    // Lê TODAS as posições OPEN do DB e as steppeia.
    // O estado SSOT (peak, t1Hit, t2Hit etc.) fica em `notes`.
    // ══════════════════════════════════════════════════════════
    const { data: openTrades, error: openErr } = await supabase
      .from('live_demo_trades')
      .select('*')
      .eq('status', 'OPEN');

    if (openErr) {
      console.error('[scanner] Erro ao buscar posições:', openErr.message);
    }

    const openSymbols = new Set<string>();

    for (const trade of openTrades ?? []) {
      openSymbols.add(trade.symbol as string);
      try {
        const tradeInterval = (trade.interval as string) ?? BOT_INTERVAL;
        const candles = await getCandles(trade.symbol as string, tradeInterval, 500);
        const lastCandle = candles[candles.length - 1];

        const pos = posFromDb(trade as Record<string, unknown>);
        const result = stepPosition(pos, lastCandle, DEMO_CONFIG);

        const existingLog = readLog(trade.notes);
        const now = new Date().toISOString();

        if (result.closed) {
          const profit = result.profit;
          const profitPct = ((result.exitPrice - pos.entryPrice) / pos.entryPrice)
            * (pos.signal === 'LONG' ? 1 : -1) * 100;
          const balanceAfter = Number(trade.balance_before ?? DEMO_BALANCE) + profit;

          // Log: evento de fechamento
          const closeLog: PosLogEntry[] = [
            ...existingLog,
            {
              ts:     now,
              event:  'closed' as const,
              detail: `${result.exitReason} | P&L: ${profit >= 0 ? '+' : ''}$${profit.toFixed(2)}`,
            },
          ].slice(-20);

          await supabase.from('live_demo_trades').update({
            status:        profit >= 0 ? 'CLOSED_WIN' : 'CLOSED_LOSS',
            exit_price:    result.exitPrice,
            profit_usd:    Math.round(profit * 100) / 100,
            profit_pct:    Math.round(profitPct * 100) / 100,
            exit_reason:   result.exitReason,
            balance_after: Math.round(balanceAfter * 100) / 100,
            closed_at:     new Date().toISOString(),
            notes:         JSON.stringify({ ssotState: null, closedBy: 'scanner', log: closeLog }),
          }).eq('id', trade.id);

          // Insere alerta de fechamento
          const pnlSign = profit >= 0 ? '+' : '';
          await supabase.from('alerts').insert({
            type:     'position_closed',
            symbol:   trade.symbol as string,
            signal:   pos.signal,
            message:  `${trade.symbol as string} ${pos.signal} fechou ${pnlSign}$${profit.toFixed(2)} via ${result.exitReason}`,
            pnl_usd:  Math.round(profit * 100) / 100,
            trade_id: trade.id as string,
            status:   'unread',
          });

          stepped.push({ symbol: trade.symbol as string, status: 'closed', reason: result.exitReason, pnl: profit });
          console.log(`🔒 Guardian [${trade.symbol}] fechou: ${result.exitReason} | P&L: ${profit >= 0 ? '+' : ''}$${profit.toFixed(2)}`);
        } else {
          // Detecta eventos significativos para o log
          const newEntries: PosLogEntry[] = [];

          // 1. Stop movido (trailing stop avançou)
          if (result.pos.stop !== pos.stop) {
            const atBE = pos.signal === 'LONG'
              ? result.pos.stop >= pos.entryPrice
              : result.pos.stop <= pos.entryPrice;
            newEntries.push({
              ts:     now,
              event:  'stop_moved' as const,
              detail: `${pos.stop.toFixed(4)} → ${result.pos.stop.toFixed(4)}${atBE ? ' ✓ BE' : ''}`,
            });
          }

          // 2. TP1 atingido pela primeira vez
          if (!pos.t1Hit && result.pos.t1Hit) {
            newEntries.push({ ts: now, event: 'tp1_hit' as const, detail: 'Saída parcial executada' });
          }

          // 3. TP2 atingido pela primeira vez
          if (!pos.t2Hit && result.pos.t2Hit) {
            newEntries.push({ ts: now, event: 'tp2_hit' as const, detail: 'TP2 atingido' });
          }

          // 4. Heartbeat de step (sempre — permite calcular "stepada há X horas")
          newEntries.push({
            ts:     now,
            event:  'stepped' as const,
            detail: `Stop: $${result.pos.stop.toFixed(4)} | Candle: ${result.pos.candlesOpen}`,
          });

          const updatedLog: PosLogEntry[] = [...existingLog, ...newEntries].slice(-25);

          // Persiste estado atualizado + log
          await supabase.from('live_demo_trades').update({
            notes: JSON.stringify({ ssotState: result.pos, log: updatedLog }),
          }).eq('id', trade.id);

          stepped.push({ symbol: trade.symbol as string, status: 'monitoring', stop: result.pos.stop });
          console.log(`🛡️  Guardian [${trade.symbol}] monitorando | Stop: ${result.pos.stop.toFixed(4)} | Candles: ${result.pos.candlesOpen}`);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push({ symbol: trade.symbol as string, error: msg });
        console.error(`❌ Guardian [${trade.symbol}] erro: ${msg}`);
      }
      await sleep(500);
    }

    // ══════════════════════════════════════════════════════════
    // FASE 2 — SCANNER
    // Verifica ativos do portfólio, grava market_analytics
    // e abre novas posições se sinal válido.
    // ══════════════════════════════════════════════════════════

    // Regime BTC (altcoins em RISK_OFF precisam de mais votos)
    let btcRegime: 'NORMAL' | 'RISK_OFF' = 'NORMAL';
    try {
      const btcC = await getCandles('BTCUSDT', BOT_INTERVAL, 250);
      btcRegime = getBtcMarketRegime(btcC);
    } catch { /* falha silenciosa */ }

    // Saldo atual: usa o último balance_after registrado
    const { data: lastClosed } = await supabase
      .from('live_demo_trades')
      .select('balance_after')
      .not('balance_after', 'is', null)
      .order('closed_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const currentBalance = Number(lastClosed?.balance_after ?? DEMO_BALANCE);

    for (const symbol of PORTFOLIO) {
      try {
        const candles = await getCandles(symbol, BOT_INTERVAL, 500);
        if (candles.length < 60) { await sleep(300); continue; }

        const lastC       = candles[candles.length - 1];
        const currentPrice = lastC.close;
        const closes       = candles.map(c => c.close);

        // Indicadores
        const ema200v  = ema(closes, 200);
        const ema50v   = ema(closes, 50);
        const rsiV     = rsi(closes);
        const macdH    = macdHistogram(closes);
        const atrV     = atr(candles, 14);
        const atrPct   = currentPrice > 0 ? (atrV / currentPrice) * 100 : 0;
        const vol      = lastC.volume;
        const avgVol   = candles.slice(-20).reduce((s, c) => s + c.volume, 0) / 20;
        const volRatio = avgVol > 0 ? vol / avgVol : 1;

        // Sinal
        const isMajor   = symbol === 'BTCUSDT' || symbol === 'ETHUSDT';
        const signalCfg = btcRegime === 'RISK_OFF' && !isMajor
          ? { ...DEMO_CONFIG, minVotesLong: 4 }
          : DEMO_CONFIG;

        const { signal, adx, votesLong, votesShort, blockedBy } =
          computeSignal(candles, signalCfg);

        // ── Grava market_analytics (dados do scanner tab) ──────
        await supabase.from('market_analytics').insert({
          symbol,
          interval:       BOT_INTERVAL,
          analyzed_at:    new Date().toISOString(),
          price:          currentPrice,
          ema200:         Math.round(ema200v  * 100) / 100,
          ema50:          Math.round(ema50v   * 100) / 100,
          trend:          currentPrice >= ema200v ? 'Alta' : 'Baixa',
          pct_from_ema200:Math.round(((currentPrice - ema200v) / ema200v) * 10000) / 100,
          rsi:            Math.round(rsiV  * 10) / 10,
          macd_hist:      Math.round(macdH * 1e6) / 1e6,
          adx:            Math.round(adx   * 10) / 10,
          adx_strength:   adx >= 40 ? 'Forte' : adx >= 25 ? 'Moderado' : adx >= 20 ? 'Fraco' : 'Lateral',
          volume_ratio:   Math.round(volRatio * 100) / 100,
          signal:         signal,
          votes_long:     votesLong,
          votes_short:    votesShort,
          blocked_by:     blockedBy ?? null,
          atr_pct:        Math.round(atrPct * 100) / 100,
          market_type:    /USDT|BUSD$/.test(symbol) ? 'crypto' : 'stock',
          data_source:    'scanner-v2',
        });

        const scanEntry: ScanResult = { symbol, signal, adx: adx.toFixed(1), blockedBy };

        // ── Abre nova posição se sinal válido e sem posição aberta ─
        if (signal !== 'NEUTRAL' && !openSymbols.has(symbol)) {
          // ── Verificação de correlação ──────────────────────────
          const corrGroup = CORR_GROUP[symbol];
          const corrOpen  = corrGroup
            ? (openTrades ?? []).filter(t => CORR_GROUP[t.symbol as string] === corrGroup).length
            : 0;

          if (corrGroup && corrOpen >= MAX_CORR_POSITIONS) {
            // Bloqueia: grupo já atingiu o limite de posições simultâneas
            scanEntry.blockedBy = `corr:${corrGroup} (${corrOpen}/${MAX_CORR_POSITIONS})`;
            console.log(`🚫 Correlação [${symbol}] bloqueado — ${corrGroup} já tem ${corrOpen} posição(ões) abertas`);
          } else {
          const stopDistPct = DEMO_CONFIG.useATRStop && atrV > 0
            ? (atrV * DEMO_CONFIG.atrMultiplier) / currentPrice
            : DEMO_CONFIG.stopLossPercent;

          const riskDollar = currentBalance * RISK_PER_TRADE;
          const newPos = createPosition(
            signal as 'LONG' | 'SHORT',
            currentPrice,
            riskDollar,
            stopDistPct,
            DEMO_CONFIG,
          );

          const openLog: PosLogEntry[] = [{
            ts:     new Date().toISOString(),
            event:  'opened' as const,
            detail: `${signal} | Entry $${newPos.entryPrice.toFixed(4)} | Stop $${newPos.stop.toFixed(4)} | ADX ${adx.toFixed(1)}`,
          }];

          await supabase.from('live_demo_trades').insert({
            symbol,
            signal,
            entry_price:      newPos.entryPrice,
            stop_price:       newPos.stop,
            tp1_price:        newPos.tp1,
            tp2_price:        newPos.tp2,
            tp3_price:        newPos.tp3,
            risk_amount:      newPos.riskAmount,
            status:           'OPEN',
            interval:         BOT_INTERVAL,
            balance_before:   currentBalance,
            adx,
            volume_ratio:     volRatio,
            votes_long:       votesLong,
            votes_short:      votesShort,
            btc_regime:       btcRegime,
            dry_run:          true,
            candle_timestamp: lastC.timestamp,
            opened_at:        new Date().toISOString(),
            notes:            JSON.stringify({ ssotState: newPos, log: openLog }),
          });

          openSymbols.add(symbol);
          scanEntry.action = 'opened';
          console.log(`🎯 Scanner [${symbol}] novo ${signal} | ADX: ${adx.toFixed(1)} | Entry: $${newPos.entryPrice.toFixed(4)}`);
          } // end: else correlation guard
        }

        scanned.push(scanEntry);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push({ symbol, error: msg });
        console.error(`❌ Scanner [${symbol}] erro: ${msg}`);
      }
      await sleep(800);
    }

    const elapsed = Date.now() - startTime;
    console.log(`✅ Scanner finalizado em ${elapsed}ms | Stepped: ${stepped.length} | Scanned: ${scanned.length} | Errors: ${errors.length}`);

    return NextResponse.json({
      status:    'ok',
      timestamp: new Date().toISOString(),
      elapsed:   `${elapsed}ms`,
      btcRegime,
      guardian:  { checked: openTrades?.length ?? 0, results: stepped },
      scanner:   { checked: scanned.length, results: scanned },
      errors,
    });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido';
    console.error('❌ Scanner falhou:', msg);
    return NextResponse.json({ status: 'error', message: msg }, { status: 500 });
  }
}
