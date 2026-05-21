// =============================================================
// TRADEFORGE SOVEREIGN — Telegram Notifier
// =============================================================
// Envia alertas de trades simulados via Telegram Bot API.
//
// Configuração (em .env.local):
//   TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNO...
//   TELEGRAM_CHAT_ID=987654321
//
// Como obter:
//   1. Abra @BotFather no Telegram → /newbot → salve o token
//   2. Envie qualquer mensagem pro seu bot novo
//   3. Abra @userinfobot → envie /start → copie o "Id"
// =============================================================

export interface TelegramConfig {
  botToken: string;
  chatId:   string;
}

// ── Envio genérico ──────────────────────────────────────────

export async function sendTelegramMessage(
  config: TelegramConfig,
  text:   string,
): Promise<void> {
  if (!config.botToken || !config.chatId) {
    console.warn('[Telegram] Token ou chatId ausente — notificação ignorada');
    return;
  }
  try {
    const url = `https://api.telegram.org/bot${config.botToken}/sendMessage`;
    const res = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        chat_id:    config.chatId,
        text,
        parse_mode: 'HTML',
      }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`[Telegram] Erro ${res.status}: ${body.slice(0, 200)}`);
    }
  } catch (err) {
    console.error('[Telegram] Falha ao enviar mensagem:', err);
  }
}

// ── Templates de mensagem ──────────────────────────────────

/** Alerta de entrada (novo trade aberto) */
export function fmtTradeOpen(params: {
  symbol:   string;
  signal:   'LONG' | 'SHORT';
  price:    number;
  stop:     number;
  tp1:      number;
  tp3:      number;
  riskAmt:  number;
  adx:      number;
  interval: string;
}): string {
  const { symbol, signal, price, stop, tp1, tp3, riskAmt, adx, interval } = params;
  const emoji   = signal === 'LONG' ? '🟢' : '🔴';
  const dir     = signal === 'LONG' ? 'COMPRA' : 'VENDA';
  const stopPct = Math.abs((stop - price) / price * 100).toFixed(2);
  const tp3Pct  = Math.abs((tp3  - price) / price * 100).toFixed(2);
  const now     = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

  return [
    `${emoji} <b>[PAPER] ${dir} — ${symbol}</b>`,
    ``,
    `💵 Entrada:  <code>$${price.toFixed(4)}</code>`,
    `🛑 Stop:     <code>$${stop.toFixed(4)}</code> <i>(-${stopPct}%)</i>`,
    `🎯 TP1:      <code>$${tp1.toFixed(4)}</code>`,
    `🏆 TP3:      <code>$${tp3.toFixed(4)}</code> <i>(+${tp3Pct}%)</i>`,
    ``,
    `📊 ADX: ${adx.toFixed(1)} | ⏱ ${interval}`,
    `💰 Risco: $${riskAmt.toFixed(2)}`,
    `⏰ ${now}`,
  ].join('\n');
}

/** Alerta de fechamento de posição */
export function fmtTradeClose(params: {
  symbol:     string;
  signal:     'LONG' | 'SHORT';
  entryPrice: number;
  exitPrice:  number;
  profit:     number;
  exitReason: string;
  balance:    number;
}): string {
  const { symbol, signal, entryPrice, exitPrice, profit, exitReason, balance } = params;
  const isWin  = profit > 0;
  const emoji  = isWin ? '✅' : '❌';
  const sign   = profit >= 0 ? '+' : '-';
  // FIX: Math.abs evita duplo-negativo (ex: "--0.83%") quando sign='-' e pct ja seria negativo
  const pctRaw = (exitPrice - entryPrice) / entryPrice * (signal === 'LONG' ? 1 : -1) * 100;
  const pct    = Math.abs(pctRaw).toFixed(2);
  const now    = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

  return [
    `${emoji} <b>[PAPER] FECHADO — ${symbol}</b>`,
    ``,
    `📌 Direção: ${signal}`,
    `💵 Entrada: <code>$${entryPrice.toFixed(4)}</code>`,
    `🚪 Saída:   <code>$${exitPrice.toFixed(4)}</code> <i>(${sign}${pct}%)</i>`,
    `💰 P&amp;L:    <code>${sign}$${Math.abs(profit).toFixed(2)}</code>`,
    `📋 Motivo:  ${exitReason}`,
    ``,
    `💼 Saldo atual: $${balance.toFixed(2)}`,
    `⏰ ${now}`,
  ].join('\n');
}

/** Relatório diário de performance */
export function fmtDailyReport(params: {
  wins:       number;
  losses:     number;
  winRate:    number;
  totalPnl:   number;
  balance:    number;
  openTrades: string[];
}): string {
  const { wins, losses, winRate, totalPnl, balance, openTrades } = params;
  const sign  = totalPnl >= 0 ? '+' : '';
  const emoji = totalPnl >= 0 ? '📈' : '📉';
  const now   = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });

  const lines = [
    `${emoji} <b>Relatório Diário — TradeForge Bot</b>`,
    `📅 ${now}`,
    ``,
    `✅ Wins:    ${wins}`,
    `❌ Losses:  ${losses}`,
    `📊 Win Rate: ${winRate.toFixed(1)}%`,
    `💰 P&amp;L do dia: <code>${sign}$${Math.abs(totalPnl).toFixed(2)}</code>`,
    `💼 Saldo: <code>$${balance.toFixed(2)}</code>`,
  ];

  if (openTrades.length > 0) {
    lines.push('', `⚡ Posições abertas: ${openTrades.join(', ')}`);
  }

  return lines.join('\n');
}

/** Alerta de regime BTC (mudança de mercado) */
export function fmtRegimeAlert(regime: 'RISK_OFF' | 'NORMAL'): string {
  if (regime === 'RISK_OFF') {
    return [
      '⚠️ <b>[TradeForge] ALERTA: BTC em RISK_OFF</b>',
      '',
      'BTC caiu abaixo da EMA200 ou drawdown > 20%.',
      'O bot está aumentando o threshold de confirmação',
      'para LONGs em altcoins (minVotesLong: 4).',
      '',
      '🔴 Modo conservador ativado automaticamente.',
    ].join('\n');
  }
  return [
    '✅ <b>[TradeForge] BTC voltou ao regime NORMAL</b>',
    '',
    'Condicoes de mercado normalizadas.',
    'Threshold de LONGs voltou ao padrao (minVotesLong: 2).',
  ].join('\n');
}
