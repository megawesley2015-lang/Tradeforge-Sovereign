// =============================================================
// TRADEFORGE SOVEREIGN — Market Scanner
// =============================================================
// Varre N ativos a cada 4h e salva o "estado técnico" no Supabase.
//
// O que analisa:
//   - Tendência (EMA200 acima/abaixo do preço)
//   - Força (ADX — mercado em tendência ou lateral)
//   - Momentum (RSI, MACD Histogram)
//   - Volume (vol / avg20)
//   - Sinal atual (LONG / SHORT / NEUTRAL)
//
// Comparador de estratégias:
//   - Estratégia A: config padrão (DEFAULT_CONFIG)
//   - Estratégia B: RSI mais agressivo (rsiLow=40, rsiHigh=60)
//   - Estratégia C: ADX mais rígido (adxMinStrength=30)
//   Salva qual teria gerado sinal e quantos votos
// =============================================================

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  getCandles,
  computeSignal,
  ema,
  rsi,
  atr,
  macdHistogram,
  DEFAULT_CONFIG,
  type CandleData,
} from './strategy-engine';

// ── Ativos monitorados ───────────────────────────────────────

export const SCAN_ASSETS = [
  // ── Cripto (Binance) ──────────────────────────────
  'BTCUSDT',   // Bitcoin
  'ETHUSDT',   // Ethereum
  'SOLUSDT',   // Solana
  'BNBUSDT',   // Binance Coin
  'AVAXUSDT',  // Avalanche
  'DOGEUSDT',  // Dogecoin
  'ADAUSDT',   // Cardano
  'LINKUSDT',  // Chainlink
  'DOTUSDT',   // Polkadot
  'MATICUSDT', // Polygon
  // ── Ações EUA (Yahoo Finance) ─────────────────────
  'SPY',       // S&P 500 ETF
  'QQQ',       // Nasdaq 100 ETF
  'NVDA',      // NVIDIA
  'AAPL',      // Apple
  'MSFT',      // Microsoft
  // ── Ações Brasil B3 (Yahoo Finance) ──────────────
  'PETR4.SA',  // Petrobras
  'VALE3.SA',  // Vale
  'ITUB4.SA',  // Itaú Unibanco
  'BBAS3.SA',  // Banco do Brasil
  'MGLU3.SA',  // Magalu
];

// ── Variações de estratégia para comparação ──────────────────

const STRATEGY_A = { ...DEFAULT_CONFIG };  // padrão
const STRATEGY_B = { ...DEFAULT_CONFIG, rsiLow: 40, rsiHigh: 60 }; // RSI agressivo
const STRATEGY_C = { ...DEFAULT_CONFIG, adxMinStrength: 30 };       // ADX rígido

// ── Resultado de um ativo analisado ─────────────────────────

export interface AssetSnapshot {
  symbol:          string;
  interval:        string;
  price:           number;
  ema200:          number;
  ema50:           number;
  trend:           'BULLISH' | 'BEARISH';
  pct_from_ema200: number;
  rsi:             number;
  macd_hist:       number;
  adx:             number;
  adx_strength:    'STRONG' | 'MODERATE' | 'WEAK' | 'SIDEWAYS';
  volume_ratio:    number;
  signal:          string;
  votes_long:      number;
  votes_short:     number;
  blocked_by?:     string;
  atr_pct:         number;
  market_type:     'crypto' | 'stock';
  data_source:     string;
  // Comparação de estratégias
  sig_b:           string;  // sinal da estratégia B
  sig_c:           string;  // sinal da estratégia C
}

// ── Runner ───────────────────────────────────────────────────

export async function runMarketScan(
  supabaseUrl: string,
  supabaseKey: string,
  interval    = '4h',
  assets      = SCAN_ASSETS,
): Promise<AssetSnapshot[]> {
  const supabase  = createClient(supabaseUrl, supabaseKey);
  const snapshots: AssetSnapshot[] = [];

  console.log(`\n[Scanner] 🔍 Varrendo ${assets.length} ativos (${interval})...`);
  const t0 = Date.now();

  for (const symbol of assets) {
    const snap = await analyzeAsset(symbol, interval);
    if (snap) {
      snapshots.push(snap);
      const statusIcon = snap.signal === 'LONG' ? '🟢' : snap.signal === 'SHORT' ? '🔴' : '⬛';
      console.log(
        `[Scanner] ${statusIcon} ${symbol.padEnd(12)} | ` +
        `${snap.trend.padEnd(7)} | ADX: ${snap.adx.toFixed(1).padStart(5)} | ` +
        `RSI: ${snap.rsi.toFixed(1).padStart(5)} | Signal: ${snap.signal}`
      );
    }
    // Delay entre requests (evita rate limit do Yahoo Finance)
    await sleep(300);
  }

  // Salva no Supabase em batch
  if (snapshots.length > 0) {
    const rows = snapshots.map(s => ({
      symbol:          s.symbol,
      interval:        s.interval,
      price:           s.price,
      ema200:          s.ema200,
      ema50:           s.ema50,
      trend:           s.trend,
      pct_from_ema200: s.pct_from_ema200,
      rsi:             s.rsi,
      macd_hist:       s.macd_hist,
      adx:             s.adx,
      adx_strength:    s.adx_strength,
      volume_ratio:    s.volume_ratio,
      signal:          s.signal,
      votes_long:      s.votes_long,
      votes_short:     s.votes_short,
      blocked_by:      s.blocked_by ?? null,
      atr_pct:         s.atr_pct,
      market_type:     s.market_type,
      data_source:     s.data_source,
    }));

    const { error } = await supabase.from('market_analytics').insert(rows);
    if (error) console.error('[Scanner] ❌ DB error:', error.message);
    else       console.log(`[Scanner] ✅ ${snapshots.length} análises salvas em ${Date.now() - t0}ms`);
  }

  return snapshots;
}

// ── Análise de um ativo ──────────────────────────────────────

async function analyzeAsset(
  symbol:   string,
  interval: string,
): Promise<AssetSnapshot | null> {
  try {
    const candles = await getCandles(symbol, interval, 300);
    if (candles.length < 60) return null;

    const closes    = candles.map((c: CandleData) => c.close);
    const last      = closes[closes.length - 1];
    const ema200val = ema(closes, Math.min(200, closes.length - 1));
    const ema50val  = ema(closes, Math.min(50,  closes.length - 1));
    const rsiVal    = rsi(closes);
    const macdH     = macdHistogram(closes);
    const atrVal    = atr(candles, 14);
    const atrPct    = atrVal > 0 ? (atrVal / last) * 100 : 0;
    const pctEma200 = ((last - ema200val) / ema200val) * 100;
    const isCrypto  = /USDT$|BUSD$/.test(symbol);

    // Sinal padrão (estratégia A)
    const sigA = computeSignal(candles, STRATEGY_A);
    // Estratégia B e C (apenas sinal, sem persistir separado)
    const sigB = computeSignal(candles, STRATEGY_B);
    const sigC = computeSignal(candles, STRATEGY_C);

    const adxStrength: AssetSnapshot['adx_strength'] =
      sigA.adx > 40 ? 'STRONG'   :
      sigA.adx > 25 ? 'MODERATE' :
      sigA.adx > 20 ? 'WEAK'     : 'SIDEWAYS';

    return {
      symbol,
      interval,
      price:           Math.round(last        * 1e6) / 1e6,
      ema200:          Math.round(ema200val    * 1e6) / 1e6,
      ema50:           Math.round(ema50val     * 1e6) / 1e6,
      trend:           last >= ema200val ? 'BULLISH' : 'BEARISH',
      pct_from_ema200: Math.round(pctEma200    * 100) / 100,
      rsi:             Math.round(rsiVal       * 100) / 100,
      macd_hist:       Math.round(macdH        * 1e8) / 1e8,
      adx:             Math.round(sigA.adx     * 100) / 100,
      adx_strength:    adxStrength,
      volume_ratio:    Math.round(sigA.volumeRatio * 100) / 100,
      signal:          sigA.signal,
      votes_long:      sigA.votesLong,
      votes_short:     sigA.votesShort,
      blocked_by:      sigA.blockedBy,
      atr_pct:         Math.round(atrPct       * 100) / 100,
      market_type:     isCrypto ? 'crypto' : 'stock',
      data_source:     isCrypto ? 'Binance' : 'Yahoo Finance',
      sig_b:           sigB.signal,
      sig_c:           sigC.signal,
    };
  } catch (err) {
    console.error(`[Scanner] ⚠️ ${symbol}: ${(err as Error).message}`);
    return null;
  }
}

// ── Ranking de estratégias ────────────────────────────────────

/** Compara quais estratégias dariam mais sinais válidos no scan atual */
export function rankStrategies(snapshots: AssetSnapshot[]): {
  name:    string;
  signals: number;
  longs:   number;
  shorts:  number;
}[] {
  const count = (key: 'signal' | 'sig_b' | 'sig_c') => ({
    signals: snapshots.filter(s => s[key] !== 'NEUTRAL').length,
    longs:   snapshots.filter(s => s[key] === 'LONG').length,
    shorts:  snapshots.filter(s => s[key] === 'SHORT').length,
  });
  return [
    { name: 'Padrão (A)',      ...count('signal') },
    { name: 'RSI Agressivo (B)', ...count('sig_b') },
    { name: 'ADX Rígido (C)',  ...count('sig_c') },
  ].sort((a, b) => b.signals - a.signals);
}

// ── Helper ──────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
