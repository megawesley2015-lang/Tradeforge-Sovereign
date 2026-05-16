#!/usr/bin/env tsx
// =============================================================
// TRADEFORGE SOVEREIGN — Bot Entry Point
// =============================================================
// Rode com:
//   npx tsx bot/start.ts            (local)
//   pm2 start ecosystem.config.js   (VPS / produção)
//
// Variáveis de ambiente necessárias (.env.local):
//   NEXT_PUBLIC_SUPABASE_URL     (URL do projeto Supabase)
//   SUPABASE_SERVICE_ROLE_KEY    (chave service_role — não anon!)
//   TELEGRAM_BOT_TOKEN           (token do @BotFather)
//   TELEGRAM_CHAT_ID             (seu ID numérico no Telegram)
//   BOT_INTERVAL                 (padrão: '4h')
//   BOT_INITIAL_BALANCE          (padrão: '1000')
//   BOT_RISK_PER_TRADE           (padrão: '0.02' = 2%)
//   DRY_RUN                      ('true' ou 'false', padrão: 'true')
// =============================================================

// Carrega .env.local (Next.js não carrega automaticamente fora do servidor)
import { config } from 'dotenv';
config({ path: '.env.local' });

import { LiveBot, type BotConfig } from '../lib/trading/live-bot';
import { runMarketScan }            from '../lib/trading/market-scanner';
import { DEFAULT_CONFIG }            from '../lib/trading/strategy-engine';
import { sendTelegramMessage }       from '../lib/trading/telegram-notifier';

// ── Validação de variáveis de ambiente ──────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios.');
  console.error('   Configure no arquivo .env.local e reinicie.');
  process.exit(1);
}

// ── Configuração do Bot ──────────────────────────────────────

const BOT_INTERVAL     = process.env.BOT_INTERVAL        ?? '4h';
const INITIAL_BALANCE  = parseFloat(process.env.BOT_INITIAL_BALANCE  ?? '1000');
const RISK_PER_TRADE   = parseFloat(process.env.BOT_RISK_PER_TRADE   ?? '0.02');
const DRY_RUN          = process.env.DRY_RUN !== 'false';   // default: sempre Dry Run

// Mapa de intervalos → tempo em ms
const INTERVAL_MS: Record<string, number> = {
  '15m': 15 * 60  * 1000,
  '1h':  60 * 60  * 1000,
  '4h':  4  * 3600 * 1000,
  '1d':  24 * 3600 * 1000,
};
const CYCLE_MS       = INTERVAL_MS[BOT_INTERVAL] ?? INTERVAL_MS['4h'];
const SCANNER_EVERY  = 4 * 3600 * 1000;  // scanner roda no máximo a cada 4h

// Ativos monitorados pelo bot (pode customizar)
const BOT_ASSETS = [
  // Cripto 24/7
  'BTCUSDT', 'ETHUSDT', 'SOLUSDT',
  'DOGEUSDT', 'AVAXUSDT', 'BNBUSDT',
  // Ações EUA
  'SPY', 'QQQ', 'NVDA',
  // Ações Brasil
  'PETR4.SA', 'VALE3.SA', 'ITUB4.SA',
];

const telegramCfg = (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID)
  ? { botToken: process.env.TELEGRAM_BOT_TOKEN, chatId: process.env.TELEGRAM_CHAT_ID }
  : undefined;

const botConfig: BotConfig = {
  assets:         BOT_ASSETS,
  interval:       BOT_INTERVAL,
  initialBalance: INITIAL_BALANCE,
  dryRun:         DRY_RUN,
  strategyConfig: { ...DEFAULT_CONFIG, riskPerTrade: RISK_PER_TRADE },
  telegram:       telegramCfg,
  supabaseUrl:    SUPABASE_URL,
  supabaseKey:    SUPABASE_KEY,
  useBtcRegime:   true,
  candleLimit:    300,
};

// ── Inicialização ────────────────────────────────────────────

const bot = new LiveBot(botConfig);
let scannerAccum = 0;

async function runAll(): Promise<void> {
  await bot.runCycle();

  scannerAccum += CYCLE_MS;
  if (scannerAccum >= SCANNER_EVERY) {
    scannerAccum = 0;
    await runMarketScan(SUPABASE_URL!, SUPABASE_KEY!, BOT_INTERVAL);
  }
}

// ── Banner de inicialização ──────────────────────────────────

async function main(): Promise<void> {
  const banner = [
    '╔══════════════════════════════════════════════╗',
    '║   TradeForge Sovereign — Live Bot v1.0       ║',
    `║   Modo: ${DRY_RUN ? 'PAPER TRADING (Dry Run)  ' : '⚠️  LIVE TRADING  ⚠️         '}   ║`,
    '╚══════════════════════════════════════════════╝',
    '',
    `Ativos:    ${BOT_ASSETS.join(', ')}`,
    `Intervalo: ${BOT_INTERVAL}  |  Ciclo: ${CYCLE_MS / 60000} min`,
    `Banca:     $${INITIAL_BALANCE}  |  Risco/trade: ${(RISK_PER_TRADE * 100).toFixed(1)}%`,
    `Telegram:  ${telegramCfg ? '✅ configurado' : '⚪ não configurado'}`,
    `Supabase:  ${SUPABASE_URL}`,
    '',
  ].join('\n');

  console.log(banner);

  // Notificação de início
  if (telegramCfg) {
    await sendTelegramMessage(telegramCfg,
      `🚀 <b>TradeForge Bot iniciado!</b>\n\n` +
      `Modo: ${DRY_RUN ? 'Paper Trading' : '⚠️ Live Trading'}\n` +
      `Ativos: ${BOT_ASSETS.length}\n` +
      `Intervalo: ${BOT_INTERVAL}\n` +
      `Banca simulada: $${INITIAL_BALANCE}`
    );
  }

  // Primeira execução imediata
  await runAll();

  // Loop periódico
  setInterval(async () => {
    try {
      await runAll();
    } catch (err) {
      console.error('[Main] ❌ Erro no ciclo:', err);
      // Não mata o processo — PM2 reinicia se necessário
    }
  }, CYCLE_MS);
}

// ── Graceful shutdown ────────────────────────────────────────

process.on('SIGTERM', async () => {
  console.log('\n[Main] 🛑 SIGTERM recebido — encerrando graciosamente...');
  if (telegramCfg) {
    await sendTelegramMessage(telegramCfg, '🛑 <b>TradeForge Bot encerrado</b> (SIGTERM)');
  }
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('\n[Main] 🛑 Ctrl+C — encerrando...');
  process.exit(0);
});

main().catch(err => {
  console.error('[Main] ❌ Erro fatal:', err);
  process.exit(1);
});
