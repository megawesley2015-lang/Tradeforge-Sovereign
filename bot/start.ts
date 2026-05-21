#!/usr/bin/env tsx
// =============================================================
// TRADEFORGE SOVEREIGN — Bot Entry Point
// =============================================================
// Rode com:
//   npx tsx bot/start.ts            (local)
//   pm2 start ecosystem.config.js   (VPS / producao)
//
// Variaveis de ambiente necessarias (.env.local):
//   NEXT_PUBLIC_SUPABASE_URL     (URL do projeto Supabase)
//   SUPABASE_SERVICE_ROLE_KEY    (chave service_role - nao anon!)
//   TELEGRAM_BOT_TOKEN           (token do @BotFather)
//   TELEGRAM_CHAT_ID             (seu ID numerico no Telegram)
//   BOT_INTERVAL                 (padrao: '4h') — fallback se nao houver bot_configs
//   DRY_RUN                      ('true' ou 'false', padrao: 'true')
// =============================================================

// Carrega .env.local (Next.js nao carrega automaticamente fora do servidor)
import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient }               from '@supabase/supabase-js';
import { LiveBot, type BotConfig }    from '../lib/trading/live-bot';
import { runMarketScan }              from '../lib/trading/market-scanner';
import { DEFAULT_CONFIG }             from '../lib/trading/strategy-engine';
import { sendTelegramMessage }        from '../lib/trading/telegram-notifier';

// ── Validacao de variaveis de ambiente ──────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sao obrigatorios.');
  console.error('   Configure no arquivo .env.local e reinicie.');
  process.exit(1);
}

// Cliente Supabase com service_role (escrita sem RLS)
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Configuracao base (fallback se Supabase nao responder) ──

const BOT_INTERVAL_FALLBACK = process.env.BOT_INTERVAL ?? '4h';
const DRY_RUN               = process.env.DRY_RUN !== 'false'; // padrao: sempre Dry Run

const INTERVAL_MS: Record<string, number> = {
  '15m': 15 * 60   * 1000,
  '1h':  60 * 60   * 1000,
  '4h':  4  * 3600 * 1000,
  '1d':  24 * 3600 * 1000,
};

const SCANNER_EVERY = 4 * 3600 * 1000; // scanner roda a cada 4h no maximo

// ── Helpers para ler config dinamica do Supabase ─────────────

/**
 * Verifica se o bot esta habilitado no Supabase (tabela bot_status).
 * Retorna true se a flag nao existir ainda (comportamento seguro: roda).
 */
async function isBotEnabled(): Promise<boolean> {
  try {
    const { data, error } = await db
      .from('bot_status')
      .select('enabled')
      .limit(1)
      .single();
    if (error || !data) return true; // tabela nao existe ainda? continua
    return data.enabled;
  } catch {
    return true; // falha de rede? continua por seguranca
  }
}

/**
 * Le a config mais recente de bot_configs (salva pelo Backtester via exportConfig).
 * Faz merge com DEFAULT_CONFIG — campos ausentes usam o default.
 */
async function loadBotConfig(): Promise<{
  assets: string[];
  interval: string;
  riskPerTrade: number;
  initialBalance: number;
  strategyOverrides: Record<string, unknown>;
}> {
  const fallback = {
    assets: [
      // ── Cripto (Binance Futures — opera em LIVE e PAPER) ──────────────────
      'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT',
      'XRPUSDT', 'ADAUSDT', 'DOGEUSDT', 'AVAXUSDT',
      'DOTUSDT', 'LINKUSDT', 'LTCUSDT', 'MATICUSDT',
      'ATOMUSDT', 'NEARUSDT', 'UNIUSDT',
      // ── Ações (Yahoo Finance — apenas PAPER trading) ──────────────────────
      // Descomente abaixo se quiser incluir ações no paper trading:
      // 'SPY', 'QQQ', 'NVDA', 'PETR4.SA', 'VALE3.SA', 'ITUB4.SA',
    ],
    interval:         BOT_INTERVAL_FALLBACK,
    riskPerTrade:     parseFloat(process.env.BOT_RISK_PER_TRADE ?? '0.02'),
    initialBalance:   1000,
    strategyOverrides: {},
  };

  try {
    // 1. Le a config ativa mais recente do bot_configs
    const { data: cfgData } = await db
      .from('bot_configs')
      .select('config, assets')
      .eq('active', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();

    // 2. Le o balance real do profiles (usa como banca inicial)
    const { data: profileData } = await db
      .from('profiles')
      .select('balance')
      .limit(1)
      .single();

    const realBalance = profileData?.balance ?? fallback.initialBalance;
    const savedConfig = cfgData?.config ?? {};
    const savedAssets = (cfgData?.assets && cfgData.assets.length > 0)
      ? cfgData.assets
      : fallback.assets;

    return {
      assets:           savedAssets,
      interval:         (savedConfig as Record<string, unknown>).interval as string ?? fallback.interval,
      riskPerTrade:     (savedConfig as Record<string, unknown>).riskPerTrade as number ?? fallback.riskPerTrade,
      initialBalance:   realBalance,
      strategyOverrides: savedConfig,
    };
  } catch {
    // Supabase indisponivel — usa fallback sem crashar
    console.warn('[Bot] Nao foi possivel ler bot_configs do Supabase. Usando config padrao.');
    return fallback;
  }
}

// ── Telegram ─────────────────────────────────────────────────

const telegramCfg = (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID)
  ? { botToken: process.env.TELEGRAM_BOT_TOKEN, chatId: process.env.TELEGRAM_CHAT_ID }
  : undefined;

if (!telegramCfg) {
  console.warn('[Bot] Telegram desativado — configure TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID no .env.local');
}

// ── Loop principal ────────────────────────────────────────────

let bot: LiveBot | null = null;
let currentInterval: string = BOT_INTERVAL_FALLBACK;
let scannerAccum = 0;

async function runAll(): Promise<void> {
  // 1. Verifica se o bot esta habilitado (flag no Supabase)
  const enabled = await isBotEnabled();
  if (!enabled) {
    console.log('[Bot] Pausado (bot_status.enabled = false). Aguardando...');
    return;
  }

  // 2. Le a config dinamica — pode mudar entre ciclos
  const dynCfg = await loadBotConfig();
  const cycleMs = INTERVAL_MS[dynCfg.interval] ?? INTERVAL_MS[BOT_INTERVAL_FALLBACK];

  // Se intervalo ou assets mudaram, re-instancia o bot
  if (!bot || dynCfg.interval !== currentInterval) {
    currentInterval = dynCfg.interval;
    const botConfig: BotConfig = {
      assets:         dynCfg.assets,
      interval:       dynCfg.interval,
      initialBalance: dynCfg.initialBalance,
      dryRun:         DRY_RUN,
      strategyConfig: { ...DEFAULT_CONFIG, ...dynCfg.strategyOverrides, riskPerTrade: dynCfg.riskPerTrade },
      telegram:       telegramCfg,
      supabaseUrl:    SUPABASE_URL!,
      supabaseKey:    SUPABASE_KEY!,
      useBtcRegime:   true,
      candleLimit:    300,
    };
    bot = new LiveBot(botConfig);
    console.log(`[Bot] Config recarregada: ${dynCfg.assets.length} ativos | intervalo=${dynCfg.interval} | risco=${(dynCfg.riskPerTrade * 100).toFixed(1)}% | banca=$${dynCfg.initialBalance}`);
  }

  // 3. Executa ciclo de trading
  await bot.runCycle();

  // 4. Scanner de mercado (a cada SCANNER_EVERY ms)
  scannerAccum += cycleMs;
  if (scannerAccum >= SCANNER_EVERY) {
    scannerAccum = 0;
    await runMarketScan(SUPABASE_URL!, SUPABASE_KEY!, dynCfg.interval);
  }
}

// ── Inicializacao ────────────────────────────────────────────

async function main(): Promise<void> {
  const dynCfg = await loadBotConfig();
  const cycleMs = INTERVAL_MS[dynCfg.interval] ?? INTERVAL_MS[BOT_INTERVAL_FALLBACK];

  const banner = [
    '+==============================================+',
    '|   TradeForge Sovereign -- Live Bot v2.0      |',
    `|   Modo: ${DRY_RUN ? 'PAPER TRADING (Dry Run)        ' : 'LIVE TRADING                   '}|`,
    '+==============================================+',
    '',
    `Ativos:    ${dynCfg.assets.join(', ')}`,
    `Intervalo: ${dynCfg.interval}  |  Ciclo: ${cycleMs / 60000} min`,
    `Banca:     $${dynCfg.initialBalance}  |  Risco/trade: ${(dynCfg.riskPerTrade * 100).toFixed(1)}%`,
    `Config:    lida dinamicamente do Supabase (bot_configs)`,
    `Telegram:  ${telegramCfg ? 'configurado' : 'nao configurado'}`,
    `Supabase:  ${SUPABASE_URL}`,
    '',
  ].join('\n');

  console.log(banner);

  if (telegramCfg) {
    await sendTelegramMessage(telegramCfg,
      `TradeForge Bot v2.0 iniciado!\n\n` +
      `Modo: ${DRY_RUN ? 'Paper Trading' : 'Live Trading'}\n` +
      `Ativos: ${dynCfg.assets.length}\n` +
      `Intervalo: ${dynCfg.interval}\n` +
      `Banca: $${dynCfg.initialBalance}\n` +
      `Config: dinamica via Supabase`
    );
  }

  // Primeira execucao imediata
  await runAll();

  // Loop periodico
  setInterval(async () => {
    try {
      await runAll();
    } catch (err) {
      console.error('[Main] Erro no ciclo:', err);
      // Nao mata o processo — PM2 reinicia se necessario
    }
  }, cycleMs);
}

// ── Graceful shutdown ────────────────────────────────────────

process.on('SIGTERM', async () => {
  console.log('\n[Main] SIGTERM recebido — encerrando graciosamente...');
  if (telegramCfg) {
    await sendTelegramMessage(telegramCfg, 'TradeForge Bot encerrado (SIGTERM)');
  }
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('\n[Main] Ctrl+C — encerrando...');
  process.exit(0);
});

main().catch(err => {
  console.error('[Main] Erro fatal:', err);
  process.exit(1);
});
