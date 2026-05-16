// =============================================================
// TRADEFORGE SOVEREIGN — Live Bot (Paper Trading Engine)
// =============================================================
// Motor de execução em tempo real com modo Dry Run (simulação).
//
// Dry Run = true  → NUNCA envia ordens reais. Apenas registra
//                   no Supabase e notifica via Telegram.
// Dry Run = false → (futuro) integração com API da corretora.
//
// Fluxo por ciclo:
//   1. Para cada ativo monitorado:
//      a. Busca candles recentes via strategy-engine (SSOT)
//      b. Se há posição aberta → avança (verifica stop/tp)
//      c. Se não há posição → busca sinal de entrada
//   2. Persiste resultado no Supabase
//   3. Envia notificações Telegram quando necessário
// =============================================================

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  getCandles,
  computeSignal,
  createPosition,
  stepPosition,
  getBtcMarketRegime,
  atr,
  DEFAULT_CONFIG,
  type CandleData,
  type StrategyConfig,
  type OpenPosition,
  type BtcRegime,
} from './strategy-engine';
import {
  type TelegramConfig,
  sendTelegramMessage,
  fmtTradeOpen,
  fmtTradeClose,
  fmtDailyReport,
  fmtRegimeAlert,
} from './telegram-notifier';

// ─── Tipos ────────────────────────────────────────────────────

export interface BotConfig {
  /** Lista de símbolos a monitorar (ex: ['BTCUSDT', 'SPY', 'PETR4.SA']) */
  assets:          string[];
  /** Intervalo dos candles: '15m' | '1h' | '4h' | '1d' */
  interval:        string;
  /** Capital inicial simulado em USD */
  initialBalance:  number;
  /** TRUE = apenas simula (nunca envia ordem real) */
  dryRun:          boolean;
  /** Parâmetros da estratégia (herda DEFAULT_CONFIG) */
  strategyConfig:  StrategyConfig;
  /** Notificações Telegram (opcional) */
  telegram?:       TelegramConfig;
  /** Supabase connection */
  supabaseUrl:     string;
  supabaseKey:     string;
  /** Ativar filtro de regime BTC */
  useBtcRegime?:   boolean;
  /** Número de candles para buscar a cada ciclo */
  candleLimit?:    number;
}

interface LivePosition extends OpenPosition {
  symbol:    string;
  openedAt:  Date;
  dbId?:     string;
}

interface DayStats {
  wins:     number;
  losses:   number;
  pnl:      number;
  date:     string;
}

// ─── LiveBot ──────────────────────────────────────────────────

export class LiveBot {
  private supabase: SupabaseClient;
  private openPositions = new Map<string, LivePosition>();
  private balance:    number;
  private cycleCount  = 0;
  private btcRegime:  BtcRegime = 'NORMAL';
  private dayStats:   DayStats = { wins: 0, losses: 0, pnl: 0, date: '' };
  private lastRegime: BtcRegime = 'NORMAL';

  constructor(private cfg: BotConfig) {
    this.supabase = createClient(cfg.supabaseUrl, cfg.supabaseKey);
    this.balance  = cfg.initialBalance;
    this.dayStats.date = new Date().toLocaleDateString('pt-BR');
  }

  // ── Ciclo principal ──────────────────────────────────────────

  async runCycle(): Promise<void> {
    this.cycleCount++;
    const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    console.log(`\n[Bot] ═══ Ciclo #${this.cycleCount} — ${now} ═══`);
    console.log(`[Bot] 💼 Saldo: $${this.balance.toFixed(2)} | Posições abertas: ${this.openPositions.size}`);

    // Atualiza regime BTC antes de processar ativos
    if (this.cfg.useBtcRegime !== false) {
      await this.updateBtcRegime();
    }

    // Reseta stats se virou o dia
    const today = new Date().toLocaleDateString('pt-BR');
    if (this.dayStats.date !== today) {
      await this.sendDailyReport();
      this.dayStats = { wins: 0, losses: 0, pnl: 0, date: today };
    }

    // Processa cada ativo sequencialmente para não sobrecarregar as APIs
    for (const symbol of this.cfg.assets) {
      await this.processAsset(symbol);
      // Pequena pausa entre requests para não ser rate-limited
      await sleep(500);
    }
  }

  // ── BTC Regime ───────────────────────────────────────────────

  private async updateBtcRegime(): Promise<void> {
    try {
      const isBtcInList = this.cfg.assets.includes('BTCUSDT');
      const candles = isBtcInList
        ? await getCandles('BTCUSDT', this.cfg.interval, 250)
        : await getCandles('BTCUSDT', '4h', 250);

      const newRegime = getBtcMarketRegime(candles);

      if (newRegime !== this.btcRegime) {
        console.log(`[Bot] 🌍 BTC Regime mudou: ${this.btcRegime} → ${newRegime}`);
        this.btcRegime = newRegime;
        this.lastRegime = newRegime;

        if (this.cfg.telegram) {
          await sendTelegramMessage(this.cfg.telegram, fmtRegimeAlert(newRegime));
        }
      }
    } catch {
      // Falha silenciosa — não interrompe o ciclo
    }
  }

  // ── Processamento por ativo ──────────────────────────────────

  private async processAsset(symbol: string): Promise<void> {
    try {
      const limit  = this.cfg.candleLimit ?? 300;
      const candles = await getCandles(symbol, this.cfg.interval, limit);

      if (candles.length < 60) {
        console.warn(`[Bot] ⚠️ ${symbol}: poucos candles (${candles.length}) — ignorando`);
        return;
      }

      if (this.openPositions.has(symbol)) {
        await this.stepOpenPosition(symbol, candles);
      } else {
        await this.lookForEntry(symbol, candles);
      }
    } catch (err) {
      console.error(`[Bot] ❌ Erro em ${symbol}:`, (err as Error).message);
    }
  }

  // ── Avança posição aberta ────────────────────────────────────

  private async stepOpenPosition(symbol: string, candles: CandleData[]): Promise<void> {
    const pos      = this.openPositions.get(symbol)!;
    const lastC    = candles[candles.length - 1];
    const result   = stepPosition(pos, lastC, this.cfg.strategyConfig);

    if (!result.closed) {
      // Posição ainda aberta — atualiza objeto em memória
      this.openPositions.set(symbol, {
        ...result.pos,
        symbol,
        openedAt: pos.openedAt,
        dbId:     pos.dbId,
      });
      return;
    }

    // ── Posição fechada ────────────────────────────────────────
    const profit = result.profit;
    this.balance = Math.max(0, this.balance + profit);
    this.openPositions.delete(symbol);

    // Stats do dia
    if (result.isWin) this.dayStats.wins++;
    else              this.dayStats.losses++;
    this.dayStats.pnl += profit;

    const sign = profit > 0 ? '+' : '';
    console.log(
      `[Bot] ${result.isWin ? '✅' : '❌'} ${symbol} fechado | ` +
      `${result.exitReason} | P&L: ${sign}$${profit.toFixed(2)} | ` +
      `Saldo: $${this.balance.toFixed(2)}`
    );

    // Atualiza no Supabase
    if (pos.dbId) {
      const profitPct = ((result.exitPrice - pos.entryPrice) / pos.entryPrice)
        * (pos.signal === 'LONG' ? 1 : -1) * 100;

      await this.supabase
        .from('live_demo_trades')
        .update({
          status:        result.isWin ? 'CLOSED_WIN' : 'CLOSED_LOSS',
          exit_price:    result.exitPrice,
          profit_usd:    Math.round(profit * 100) / 100,
          profit_pct:    Math.round(profitPct * 100) / 100,
          exit_reason:   result.exitReason,
          balance_after: Math.round(this.balance * 100) / 100,
          closed_at:     new Date().toISOString(),
        })
        .eq('id', pos.dbId);
    }

    // Telegram
    if (this.cfg.telegram) {
      const msg = fmtTradeClose({
        symbol,
        signal:     pos.signal,
        entryPrice: pos.entryPrice,
        exitPrice:  result.exitPrice,
        profit,
        exitReason: result.exitReason,
        balance:    this.balance,
      });
      await sendTelegramMessage(this.cfg.telegram, msg);
    }
  }

  // ── Busca nova entrada ───────────────────────────────────────

  private async lookForEntry(symbol: string, candles: CandleData[]): Promise<void> {
    // Aplica BTC regime: altcoins em RISK_OFF precisam de 4 votos para LONG
    const isMajor = symbol === 'BTCUSDT' || symbol === 'ETHUSDT';
    const signalCfg: StrategyConfig =
      (this.cfg.useBtcRegime !== false && this.btcRegime === 'RISK_OFF' && !isMajor)
        ? { ...this.cfg.strategyConfig, minVotesLong: 4 }
        : this.cfg.strategyConfig;

    const { signal, adx, volumeRatio, votesLong, votesShort, blockedBy } =
      computeSignal(candles, signalCfg);

    if (signal === 'NEUTRAL') {
      if (blockedBy) {
        console.log(`[Bot] ⬛ ${symbol}: NEUTRAL (bloqueado por ${blockedBy}) | ADX: ${adx.toFixed(1)}`);
      }
      return;
    }

    const lastC      = candles[candles.length - 1];
    const atrVal     = atr(candles, 14);
    const stopDistPct = this.cfg.strategyConfig.useATRStop && atrVal > 0
      ? (atrVal * this.cfg.strategyConfig.atrMultiplier) / lastC.close
      : this.cfg.strategyConfig.stopLossPercent;

    const riskAmt = this.balance * this.cfg.strategyConfig.riskPerTrade;
    const pos     = createPosition(
      signal as 'LONG' | 'SHORT',
      lastC.close,
      riskAmt,
      stopDistPct,
      this.cfg.strategyConfig,
    );

    console.log(
      `[Bot] ${signal === 'LONG' ? '🟢' : '🔴'} ${symbol} | ` +
      `${signal} @ $${lastC.close.toFixed(4)} | ` +
      `ADX: ${adx.toFixed(1)} | Vol: ${volumeRatio.toFixed(2)}x | ` +
      `Votos L${votesLong}/S${votesShort}`
    );

    // ── Salva no Supabase ──────────────────────────────────────
    const { data, error } = await this.supabase
      .from('live_demo_trades')
      .insert({
        symbol,
        signal,
        entry_price:      Math.round(pos.entryPrice     * 1e8) / 1e8,
        stop_price:       Math.round(pos.stop           * 1e8) / 1e8,
        tp1_price:        Math.round(pos.tp1            * 1e8) / 1e8,
        tp2_price:        Math.round(pos.tp2            * 1e8) / 1e8,
        tp3_price:        Math.round(pos.tp3            * 1e8) / 1e8,
        risk_amount:      Math.round(riskAmt            * 100) / 100,
        status:           'OPEN',
        interval:         this.cfg.interval,
        balance_before:   Math.round(this.balance       * 100) / 100,
        adx:              Math.round(adx                * 100) / 100,
        volume_ratio:     Math.round(volumeRatio        * 100) / 100,
        votes_long:       votesLong,
        votes_short:      votesShort,
        btc_regime:       this.btcRegime,
        dry_run:          this.cfg.dryRun,
        candle_timestamp: lastC.timestamp,
      })
      .select('id')
      .single();

    const dbId = (!error && data) ? (data as { id: string }).id : undefined;
    if (error) console.error('[Bot] DB insert error:', error.message);

    // Guarda em memória
    this.openPositions.set(symbol, {
      ...pos,
      symbol,
      openedAt: new Date(),
      dbId,
    });

    // ── Telegram ───────────────────────────────────────────────
    if (this.cfg.telegram) {
      const msg = fmtTradeOpen({
        symbol,
        signal:   signal as 'LONG' | 'SHORT',
        price:    pos.entryPrice,
        stop:     pos.stop,
        tp1:      pos.tp1,
        tp3:      pos.tp3,
        riskAmt,
        adx,
        interval: this.cfg.interval,
      });
      await sendTelegramMessage(this.cfg.telegram, msg);
    }
  }

  // ── Relatório diário ─────────────────────────────────────────

  private async sendDailyReport(): Promise<void> {
    if (!this.cfg.telegram) return;
    const total   = this.dayStats.wins + this.dayStats.losses;
    const winRate = total > 0 ? (this.dayStats.wins / total) * 100 : 0;

    const msg = fmtDailyReport({
      wins:       this.dayStats.wins,
      losses:     this.dayStats.losses,
      winRate,
      totalPnl:   this.dayStats.pnl,
      balance:    this.balance,
      openTrades: [...this.openPositions.keys()],
    });
    await sendTelegramMessage(this.cfg.telegram, msg);
  }

  // ── Getters (para o dashboard via API) ──────────────────────

  getBalance():    number           { return this.balance; }
  getCycleCount(): number           { return this.cycleCount; }
  getBtcRegime():  BtcRegime        { return this.btcRegime; }
  getOpenPositions(): string[]      { return [...this.openPositions.keys()]; }
}

// ── Helpers ──────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
