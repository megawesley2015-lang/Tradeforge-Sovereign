#!/usr/bin/env tsx
// =============================================================
// TRADEFORGE SOVEREIGN — Script de Validação do Testnet Binance
// =============================================================
// Roda com:  npx tsx scripts/test-testnet.ts
//
// O que este script verifica:
//  1. Conectividade com Binance Testnet
//  2. Autenticação com suas chaves de API
//  3. Saldo da conta Futures (USDT)
//  4. Regras de precisão de 3 pares (BTC, SOL, DOGE)
//  5. Posições abertas existentes
//  6. Simulação de cálculo de ordem (sem enviar nada)
//
// PRÉ-REQUISITOS:
//  - BINANCE_LIVE_MODE=false  no .env.local
//  - Chaves do TESTNET em BINANCE_API_KEY / BINANCE_API_SECRET
//    (chaves do testnet são DIFERENTES das chaves reais!)
//    Obtenha em: https://testnet.binancefuture.com → API Key
// =============================================================

import { config } from 'dotenv';
config({ path: '.env.local' });

import { BinanceFuturesClient } from '../lib/trading/binance-futures-client';

const RESET  = '\x1b[0m';
const GREEN  = '\x1b[32m';
const RED    = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN   = '\x1b[36m';
const BOLD   = '\x1b[1m';

function ok(msg: string)   { console.log(`${GREEN}  [OK]${RESET} ${msg}`); }
function fail(msg: string) { console.log(`${RED}  [FAIL]${RESET} ${msg}`); }
function warn(msg: string) { console.log(`${YELLOW}  [WARN]${RESET} ${msg}`); }
function info(msg: string) { console.log(`${CYAN}  [INFO]${RESET} ${msg}`); }
function sep()             { console.log('─'.repeat(55)); }

async function main() {
  console.log();
  console.log(`${BOLD}TradeForge Sovereign — Validação Binance Testnet${RESET}`);
  sep();

  // ── 1. Variáveis de ambiente ─────────────────────────────
  console.log('\n1. Verificando variáveis de ambiente...');

  const apiKey    = process.env.BINANCE_API_KEY;
  const apiSecret = process.env.BINANCE_API_SECRET;
  const liveMode  = process.env.BINANCE_LIVE_MODE;
  const dryRun    = process.env.DRY_RUN;

  if (!apiKey || apiKey.length < 10) {
    fail('BINANCE_API_KEY ausente ou muito curta');
    console.log(`\n  ${YELLOW}Como obter chaves do Testnet:${RESET}`);
    console.log('  1. Acesse: https://testnet.binancefuture.com');
    console.log('  2. Clique em "Login" → use sua conta GitHub');
    console.log('  3. Vá em "API Key" → gere um novo par');
    console.log('  4. Cole em BINANCE_API_KEY e BINANCE_API_SECRET no .env.local');
    console.log('  5. Certifique-se que BINANCE_LIVE_MODE=false');
    process.exit(1);
  }
  ok(`BINANCE_API_KEY presente (${apiKey.substring(0, 6)}...)`);

  if (!apiSecret || apiSecret.length < 10) {
    fail('BINANCE_API_SECRET ausente');
    process.exit(1);
  }
  ok(`BINANCE_API_SECRET presente`);

  if (liveMode === 'true') {
    fail('BINANCE_LIVE_MODE=true — NÃO teste com dinheiro real agora!');
    fail('Mude para BINANCE_LIVE_MODE=false antes de continuar.');
    process.exit(1);
  }
  ok(`BINANCE_LIVE_MODE=${liveMode ?? 'false'} (Testnet ativo)`);

  if (dryRun === 'false') {
    warn('DRY_RUN=false — o bot enviará ordens reais ao Testnet');
  } else {
    ok(`DRY_RUN=${dryRun ?? 'true'} (sem ordens enviadas pelo bot)`);
  }

  // ── 2. Conectividade ─────────────────────────────────────
  console.log('\n2. Testando conectividade com o Testnet...');
  const client = new BinanceFuturesClient();

  if (!client.configured) {
    fail('Cliente não configurado — API keys ausentes');
    process.exit(1);
  }
  ok('Cliente instanciado com sucesso');
  info(`URL: ${(client as any).baseUrl ?? 'https://testnet.binancefuture.com'}`);

  // ── 3. Carrega exchangeInfo ──────────────────────────────
  console.log('\n3. Carregando regras de precisão (exchangeInfo)...');
  try {
    await client.loadSymbolInfo();
    ok('exchangeInfo carregado com sucesso');
  } catch (err: any) {
    fail(`Falha ao carregar exchangeInfo: ${err.message}`);
    console.log('\n  Possíveis causas:');
    console.log('  - Sem conexão com a internet');
    console.log('  - Testnet temporariamente fora do ar (tente novamente em 5 min)');
    process.exit(1);
  }

  // ── 4. Precisão por símbolo ──────────────────────────────
  console.log('\n4. Verificando precisão de 3 símbolos importantes...');

  const testSymbols = ['BTCUSDT', 'SOLUSDT', 'DOGEUSDT'];
  for (const sym of testSymbols) {
    const info2 = await client.getSymbolInfo(sym);
    ok(`${sym.padEnd(10)} stepSize=${info2.stepSize}  tickSize=${info2.tickSize}  minNotional=$${info2.minNotional}`);
  }

  // ── 5. Saldo da conta ────────────────────────────────────
  console.log('\n5. Consultando saldo da conta Futures...');
  let usdtBalance = 0;
  try {
    const balance = await client.getBalance();
    usdtBalance   = parseFloat(balance.availableBalance);
    ok(`Saldo disponivel: $${usdtBalance.toFixed(2)} USDT`);
    ok(`Wallet total:     $${parseFloat(balance.balance).toFixed(2)} USDT`);

    if (usdtBalance < 10) {
      warn('Saldo baixo — adicione saldo no Testnet para testar ordens');
      warn('No Testnet você pode pedir saldo grátis clicando em "Assets" → "Deposit"');
    }
  } catch (err: any) {
    fail(`Falha ao consultar saldo: ${err.message}`);
    console.log('\n  Possíveis causas:');
    console.log('  - Chaves de API inválidas ou expiradas');
    console.log('  - Usando chaves da Binance real em vez do Testnet');
    console.log('  - Chaves sem permissão de Futures');
    process.exit(1);
  }

  // ── 6. Posições abertas ──────────────────────────────────
  console.log('\n6. Verificando posições abertas no Testnet...');
  try {
    const positions = await client.getOpenPositions();
    if (positions.length === 0) {
      ok('Nenhuma posição aberta (limpo)');
    } else {
      warn(`${positions.length} posição(ões) abertas encontradas:`);
      for (const p of positions) {
        info(`  ${p.symbol}: ${p.positionAmt} @ $${p.entryPrice} | PnL: $${parseFloat(p.unrealizedProfit).toFixed(2)}`);
      }
    }
  } catch (err: any) {
    warn(`Não foi possível consultar posições: ${err.message}`);
  }

  // ── 7. Simulação de cálculo de ordem ────────────────────
  console.log('\n7. Simulando cálculo de uma ordem BTCUSDT (SEM ENVIAR)...');

  const btcInfo     = await client.getSymbolInfo('BTCUSDT');
  const mockBalance = usdtBalance > 10 ? usdtBalance : 1000; // usa saldo real ou mock
  const riskPct     = 0.02; // 2% de risco
  const riskAmt     = mockBalance * riskPct;
  const mockPrice   = 65000; // preço hipotético
  const stopDistPct = 0.015;
  const stopPrice   = mockPrice * (1 - stopDistPct);
  const priceDiff   = mockPrice - stopPrice;
  const quantity    = riskAmt / priceDiff;
  const notional    = quantity * mockPrice;

  info(`  Banca usada:    $${mockBalance.toFixed(2)}`);
  info(`  Risco (2%):     $${riskAmt.toFixed(2)}`);
  info(`  Preço BTC mock: $${mockPrice}`);
  info(`  Stop Loss:      $${stopPrice.toFixed(btcInfo.pricePrecision)}`);
  info(`  Quantidade:     ${quantity.toFixed(btcInfo.quantityPrecision)} BTC`);
  info(`  Nocional:       $${notional.toFixed(2)}`);

  const check = await client.validateNotional('BTCUSDT', quantity, mockPrice);
  if (check.ok) {
    ok('Ordem válida — nocional acima do mínimo');
  } else {
    warn(`Ordem seria bloqueada: ${check.reason}`);
    warn('Com saldo baixo, aumente a alavancagem ou espere o capital crescer');
  }

  // ── Resultado final ──────────────────────────────────────
  sep();
  console.log();
  console.log(`${BOLD}${GREEN}Testnet validado com sucesso!${RESET}`);
  console.log();
  console.log('Próximos passos:');
  console.log(`  1. Defina ${CYAN}DRY_RUN=false${RESET} no .env.local`);
  console.log(`  2. Rode o bot: ${CYAN}npx tsx bot/start.ts${RESET}`);
  console.log('  3. Monitore o Telegram — cada sinal será notificado');
  console.log('  4. Verifique as ordens no painel do Testnet:');
  console.log('     https://testnet.binancefuture.com/en/futures/BTCUSDT');
  console.log();
  console.log(`${YELLOW}IMPORTANTE: só mude BINANCE_LIVE_MODE=true após 48-72h de testnet OK!${RESET}`);
  console.log();
}

main().catch(err => {
  console.error(`\n${RED}Erro fatal:${RESET}`, err.message);
  process.exit(1);
});
