
import { NotificationPayload } from './types';

/**
 * NotificationService — Envio de alertas via Telegram Bot API.
 *
 * SETUP (variáveis de ambiente necessárias):
 *   TELEGRAM_BOT_TOKEN = "123456789:AAxxxxxxxxxxxxxxxxxxxxxxxxxx"
 *   TELEGRAM_CHAT_ID   = "seu_chat_id"  (use @userinfobot para descobrir)
 *
 * Como criar o bot:
 *   1. Fale com @BotFather no Telegram
 *   2. /newbot → siga as instruções
 *   3. Copie o token para TELEGRAM_BOT_TOKEN
 *   4. Inicie uma conversa com o bot e acesse:
 *      https://api.telegram.org/bot<TOKEN>/getUpdates
 *   5. Copie o chat_id para TELEGRAM_CHAT_ID
 */
export class NotificationService {
  private readonly token  = process.env.TELEGRAM_BOT_TOKEN;
  private readonly chatId = process.env.TELEGRAM_CHAT_ID;
  private readonly enabled: boolean;

  constructor() {
    this.enabled = !!(this.token && this.chatId);
    if (!this.enabled) {
      console.warn('⚠️  Telegram desativado — configure TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID no .env.local');
    }
  }

  // --- Formata a mensagem por tipo de evento ---
  private formatMessage(payload: NotificationPayload): string {
    const ts = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const { type, symbol, message, data } = payload;

    const emojis: Record<NotificationPayload['type'], string> = {
      ENTRY:     '🚀',
      EXIT:      '💰',
      VETO:      '🚨',
      SAFE_MODE: '🔒',
      REBALANCE: '⚖️',
      ERROR:     '❌',
    };

    const header = `${emojis[type]} *TradeForge Sovereign*`;

    let body = `\`[${ts}]\` — *${symbol}*\n${message}`;

    if (data && type === 'ENTRY') {
      body += `\n\n📊 *Detalhes:*`;
      if (data.side)       body += `\nDireção: \`${data.side}\``;
      if (data.entryPrice) body += `\nEntrada: \`$${Number(data.entryPrice).toFixed(2)}\``;
      if (data.stopLoss)   body += `\nStop Loss: \`$${Number(data.stopLoss).toFixed(2)}\``;
      if (data.takeProfit) body += `\nTake Profit: \`$${Number(data.takeProfit).toFixed(2)}\``;
      if (data.score)      body += `\nScore IA: \`${data.score}/100\``;
      if (data.mood)       body += `\nSentimento: \`${data.mood}\``;
    }

    if (data && type === 'EXIT') {
      body += `\n\n📈 *Resultado:*`;
      if (data.pnl !== undefined) {
        const pnl = Number(data.pnl);
        body += `\nPnL: \`${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}\``;
      }
      if (data.exitPrice)  body += `\nSaída: \`$${Number(data.exitPrice).toFixed(2)}\``;
      if (data.balance)    body += `\nBanca: \`$${Number(data.balance).toFixed(2)}\``;
    }

    return `${header}\n\n${body}`;
  }

  async send(payload: NotificationPayload): Promise<void> {
    if (!this.enabled) return;

    const text = this.formatMessage(payload);
    const url  = `https://api.telegram.org/bot${this.token}/sendMessage`;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id:    this.chatId,
          text,
          parse_mode: 'Markdown',
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        console.error('❌ Telegram API error:', err);
      } else {
        console.log(`✅ Telegram [${payload.type}] enviado para ${payload.symbol}`);
      }
    } catch (error) {
      // Notificação nunca deve derrubar o ciclo de trading
      console.error('❌ Falha ao enviar Telegram (não crítico):', error);
    }
  }

  // --- Helpers semânticos ---
  async notifyEntry(symbol: string, data: Record<string, unknown>) {
    await this.send({ type: 'ENTRY', symbol, message: 'Nova posição aberta!', data });
  }

  async notifyExit(symbol: string, data: Record<string, unknown>) {
    await this.send({ type: 'EXIT', symbol, message: 'Posição fechada.', data });
  }

  async notifyVeto(symbol: string, reason: string) {
    await this.send({ type: 'VETO', symbol, message: `Sinal vetado: ${reason}` });
  }

  async notifySafeMode(drawdown: number) {
    await this.send({
      type:    'SAFE_MODE',
      symbol:  'BOT',
      message: `⚠️ SAFE MODE ativado! Drawdown: ${drawdown.toFixed(2)}%. Bot pausado automaticamente.`,
    });
  }

  async notifyRebalance(symbol: string, message: string) {
    await this.send({ type: 'REBALANCE', symbol, message });
  }

  async notifyError(symbol: string, error: string) {
    await this.send({ type: 'ERROR', symbol, message: `Erro: ${error}` });
  }
}
