
/**
 * ArbitrageScanner — Detecta oportunidades de arbitragem entre exchanges.
 *
 * Compara preços em Binance, Kraken e Coinbase.
 * Calcula spread líquido (descontando taxas maker/taker estimadas).
 *
 * ⚠️ MVP: apenas detecção de spread (arbitragem spot de preço).
 * A execução real de arbitragem requer contas simultâneas nas 3 exchanges,
 * latência ultra-baixa e capital separado — fora do escopo do MVP.
 *
 * Taxas estimadas (taker, conservador):
 *   Binance Futures: 0.04%
 *   Kraken Spot:     0.26%
 *   Coinbase Pro:    0.60%
 */

import { krakenClient,  KrakenTicker }   from './kraken-client';
import { coinbaseClient, CoinbaseTicker } from './coinbase-client';

// ── Tipos ─────────────────────────────────────────────────────────────────────

export type ExchangeName = 'Binance' | 'Kraken' | 'Coinbase';

export interface ExchangePrice {
  exchange:  ExchangeName;
  bid:       number;
  ask:       number;
  mid:       number;
  timestamp: number;
}

export interface ArbitrageOpportunity {
  symbol:        string;           // ex: BTCUSDT
  buyOn:         ExchangeName;     // exchange com menor ask (comprar aqui)
  sellOn:        ExchangeName;     // exchange com maior bid (vender aqui)
  buyAsk:        number;           // preço de compra
  sellBid:       number;           // preço de venda
  grossSpreadPct: number;          // spread bruto %
  netSpreadPct:   number;          // spread líquido após taxas %
  grossSpreadUsd: number;          // em USD para 1 unidade
  netSpreadUsd:   number;
  profitable:    boolean;          // netSpreadPct > MIN_NET_SPREAD
  prices:        ExchangePrice[];  // preços de todos os pares disponíveis
  scannedAt:     number;
}

export interface ScanResult {
  opportunities: ArbitrageOpportunity[];
  allPrices:     Record<string, ExchangePrice[]>;  // symbol → preços por exchange
  scannedAt:     number;
  durationMs:    number;
}

// ── Constantes ────────────────────────────────────────────────────────────────

// Taxa taker estimada por exchange (soma dos dois lados)
const FEES: Record<ExchangeName, number> = {
  Binance:  0.0004,   // 0.04%
  Kraken:   0.0026,   // 0.26%
  Coinbase: 0.0060,   // 0.60%
};

// Spread mínimo líquido para considerar a oportunidade viável
const MIN_NET_SPREAD_PCT = 0.1;  // 0.1% mínimo após taxas

// Símbolos monitorados pelo scanner
export const ARBITRAGE_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];

// ── ArbitrageScanner ──────────────────────────────────────────────────────────

export class ArbitrageScanner {

  /**
   * Executa um scan completo buscando preços nas 3 exchanges em paralelo.
   * Binance usa o preço via API pública /api/v3/ticker/bookTicker.
   */
  async scan(symbols: string[] = ARBITRAGE_SYMBOLS): Promise<ScanResult> {
    const start = Date.now();

    // Busca preços nas 3 exchanges em paralelo
    const [binancePrices, krakenPrices, coinbasePrices] = await Promise.allSettled([
      this.getBinancePrices(symbols),
      krakenClient.getMultipleTickers(symbols),
      coinbaseClient.getMultipleTickers(symbols),
    ]);

    const binanceMap  = binancePrices.status  === 'fulfilled' ? binancePrices.value  : new Map();
    const krakenMap   = krakenPrices.status   === 'fulfilled' ? krakenPrices.value   : new Map();
    const coinbaseMap = coinbasePrices.status === 'fulfilled' ? coinbasePrices.value : new Map();

    // Monta mapa consolidado: symbol → ExchangePrice[]
    const allPrices: Record<string, ExchangePrice[]> = {};
    const opportunities: ArbitrageOpportunity[]      = [];

    for (const symbol of symbols) {
      const priceList: ExchangePrice[] = [];

      const binance  = binanceMap.get(symbol);
      const kraken   = krakenMap.get(symbol);
      const coinbase = coinbaseMap.get(symbol);

      if (binance) {
        priceList.push({
          exchange:  'Binance',
          bid:       binance.bid,
          ask:       binance.ask,
          mid:       (binance.bid + binance.ask) / 2,
          timestamp: binance.timestamp,
        });
      }

      if (kraken) {
        priceList.push({
          exchange:  'Kraken',
          bid:       kraken.bid,
          ask:       kraken.ask,
          mid:       (kraken.bid + kraken.ask) / 2,
          timestamp: kraken.timestamp,
        });
      }

      if (coinbase) {
        priceList.push({
          exchange:  'Coinbase',
          bid:       coinbase.bid,
          ask:       coinbase.ask,
          mid:       (coinbase.bid + coinbase.ask) / 2,
          timestamp: coinbase.timestamp,
        });
      }

      allPrices[symbol] = priceList;

      // Precisa de pelo menos 2 exchanges para calcular arbitragem
      if (priceList.length < 2) continue;

      const opp = this.findBestOpportunity(symbol, priceList);
      if (opp) opportunities.push(opp);
    }

    // Ordena por maior spread líquido
    opportunities.sort((a, b) => b.netSpreadPct - a.netSpreadPct);

    return {
      opportunities,
      allPrices,
      scannedAt:  Date.now(),
      durationMs: Date.now() - start,
    };
  }

  /**
   * Para cada par de exchanges, encontra a melhor oportunidade de comprar em
   * uma e vender na outra com o maior spread líquido.
   */
  private findBestOpportunity(
    symbol:     string,
    prices:     ExchangePrice[]
  ): ArbitrageOpportunity | null {
    let best: ArbitrageOpportunity | null = null;

    for (let i = 0; i < prices.length; i++) {
      for (let j = 0; j < prices.length; j++) {
        if (i === j) continue;

        const buyer  = prices[i];  // compra no ask
        const seller = prices[j];  // vende no bid

        const grossSpreadUsd = seller.bid - buyer.ask;
        const grossSpreadPct = grossSpreadUsd / buyer.ask;

        // Taxa total: taker do buyer + taker do seller
        const totalFee    = FEES[buyer.exchange] + FEES[seller.exchange];
        const netSpreadPct = grossSpreadPct - totalFee;
        const netSpreadUsd = buyer.ask * netSpreadPct;

        const opp: ArbitrageOpportunity = {
          symbol,
          buyOn:          buyer.exchange,
          sellOn:         seller.exchange,
          buyAsk:         buyer.ask,
          sellBid:        seller.bid,
          grossSpreadPct: parseFloat((grossSpreadPct * 100).toFixed(4)),
          netSpreadPct:   parseFloat((netSpreadPct   * 100).toFixed(4)),
          grossSpreadUsd: parseFloat(grossSpreadUsd.toFixed(2)),
          netSpreadUsd:   parseFloat(netSpreadUsd.toFixed(2)),
          profitable:     netSpreadPct * 100 >= MIN_NET_SPREAD_PCT,
          prices,
          scannedAt:      Date.now(),
        };

        if (!best || opp.netSpreadPct > best.netSpreadPct) {
          best = opp;
        }
      }
    }

    return best;
  }

  /**
   * Busca preços públicos da Binance via /api/v3/ticker/bookTicker.
   * Endpoint spot (mais estável para arbitragem pública).
   */
  private async getBinancePrices(
    symbols: string[]
  ): Promise<Map<string, { bid: number; ask: number; timestamp: number }>> {
    const map = new Map<string, { bid: number; ask: number; timestamp: number }>();

    try {
      // Busca múltiplos símbolos de uma vez
      const symbolsParam = JSON.stringify(symbols);
      const url = `https://api.binance.com/api/v3/ticker/bookTicker?symbols=${encodeURIComponent(symbolsParam)}`;

      const res = await fetch(url, {
        headers: { 'User-Agent': 'TradeForge/1.0' },
        signal:  AbortSignal.timeout(5000),
      });

      if (!res.ok) {
        console.error(`❌ Binance bookTicker HTTP ${res.status}`);
        return map;
      }

      const data = await res.json() as Array<{
        symbol:  string;
        bidPrice: string;
        askPrice: string;
      }>;

      const now = Date.now();
      for (const item of data) {
        map.set(item.symbol, {
          bid:       parseFloat(item.bidPrice),
          ask:       parseFloat(item.askPrice),
          timestamp: now,
        });
      }
    } catch (err: any) {
      console.warn('⚠️  Binance bookTicker error:', err.message);
    }

    return map;
  }
}

// Singleton
export const arbitrageScanner = new ArbitrageScanner();
