
/**
 * CoinbaseClient — Acesso público à API REST da Coinbase Advanced Trade.
 *
 * Documentação: https://docs.cdp.coinbase.com/advanced-trade/reference/retailbrokerageapi_getbestbidask
 *
 * Apenas endpoints públicos (sem autenticação).
 * Usado pelo ArbitrageScanner para comparação de preços.
 *
 * Mapeamento de símbolos:
 *   Binance BTCUSDT → Coinbase BTC-USDT
 *   Binance ETHUSDT → Coinbase ETH-USDT
 *   Binance SOLUSDT → Coinbase SOL-USDT
 */

const BASE_URL = 'https://api.coinbase.com/api/v3/brokerage';

// Mapa de conversão Binance → Coinbase (product_id)
const SYMBOL_MAP: Record<string, string> = {
  BTCUSDT:  'BTC-USDT',
  ETHUSDT:  'ETH-USDT',
  SOLUSDT:  'SOL-USDT',
  BNBUSDT:  'BNB-USDT',
  ADAUSDT:  'ADA-USDT',
  DOTUSDT:  'DOT-USDT',
  LINKUSDT: 'LINK-USDT',
  AVAXUSDT: 'AVAX-USDT',
  MATICUSDT:'MATIC-USDT',
  XRPUSDT:  'XRP-USDT',
};

export interface CoinbaseTicker {
  symbol:     string;      // par original (ex: BTCUSDT)
  productId:  string;      // product_id Coinbase (ex: BTC-USDT)
  bid:        number;
  ask:        number;
  last:       number;
  volume24h:  number;
  timestamp:  number;
}

export class CoinbaseClient {
  private readonly baseUrl = BASE_URL;

  /**
   * Busca o melhor bid/ask público via endpoint best_bid_ask.
   * @param binanceSymbol  símbolo no formato Binance (ex: BTCUSDT)
   */
  async getTicker(binanceSymbol: string): Promise<CoinbaseTicker | null> {
    const productId = SYMBOL_MAP[binanceSymbol.toUpperCase()];
    if (!productId) {
      console.warn(`⚠️  Coinbase: símbolo "${binanceSymbol}" sem mapeamento — ignorado`);
      return null;
    }

    try {
      // Endpoint best_bid_ask (público, não requer auth)
      const res = await fetch(
        `${this.baseUrl}/best_bid_ask?product_ids=${productId}`,
        {
          headers: { 'User-Agent': 'TradeForge/1.0' },
          signal:  AbortSignal.timeout(5000),
        }
      );

      if (!res.ok) {
        console.error(`❌ Coinbase HTTP ${res.status} para ${productId}`);
        return null;
      }

      const json = await res.json() as {
        pricebooks?: Array<{
          product_id: string;
          bids:       Array<{ price: string; size: string }>;
          asks:       Array<{ price: string; size: string }>;
          time:       string;
        }>;
        error?: string;
      };

      if (json.error || !json.pricebooks?.length) {
        // Tenta endpoint alternativo: /products/{product_id}/ticker
        return await this.getTickerFallback(binanceSymbol, productId);
      }

      const book = json.pricebooks[0];
      if (!book) return null;

      const bid  = book.bids?.[0]  ? parseFloat(book.bids[0].price)  : 0;
      const ask  = book.asks?.[0]  ? parseFloat(book.asks[0].price)  : 0;
      const last = (bid + ask) / 2;

      if (!bid || !ask) return null;

      return {
        symbol:    binanceSymbol.toUpperCase(),
        productId,
        bid,
        ask,
        last,
        volume24h: 0,    // best_bid_ask não retorna volume; use getTickerFallback se necessário
        timestamp: Date.now(),
      };
    } catch (err: any) {
      console.warn(`⚠️  Coinbase fetch timeout/error para ${productId}:`, err.message);
      return null;
    }
  }

  /**
   * Fallback: usa o endpoint /products/{id}/ticker (público) que retorna
   * price, volume e best bid/ask em um único request.
   */
  private async getTickerFallback(
    binanceSymbol: string,
    productId:     string
  ): Promise<CoinbaseTicker | null> {
    try {
      const res = await fetch(
        `${this.baseUrl}/products/${productId}/ticker?limit=1`,
        {
          headers: { 'User-Agent': 'TradeForge/1.0' },
          signal:  AbortSignal.timeout(5000),
        }
      );

      if (!res.ok) return null;

      const json = await res.json() as {
        trades?: Array<{ price: string; size: string }>;
        best_bid?: string;
        best_ask?: string;
        price?:    string;
        volume?:   string;
        error?:    string;
      };

      if (json.error) return null;

      const bid  = json.best_bid ? parseFloat(json.best_bid) : 0;
      const ask  = json.best_ask ? parseFloat(json.best_ask) : 0;
      const last = json.trades?.[0]?.price
        ? parseFloat(json.trades[0].price)
        : json.price
          ? parseFloat(json.price)
          : (bid + ask) / 2;

      if (!last) return null;

      return {
        symbol:    binanceSymbol.toUpperCase(),
        productId,
        bid:       bid || last,
        ask:       ask || last,
        last,
        volume24h: json.volume ? parseFloat(json.volume) : 0,
        timestamp: Date.now(),
      };
    } catch {
      return null;
    }
  }

  /**
   * Busca múltiplos tickers em paralelo.
   */
  async getMultipleTickers(binanceSymbols: string[]): Promise<Map<string, CoinbaseTicker>> {
    const results = await Promise.allSettled(
      binanceSymbols.map((s) => this.getTicker(s))
    );

    const map = new Map<string, CoinbaseTicker>();
    for (let i = 0; i < binanceSymbols.length; i++) {
      const r = results[i];
      if (r.status === 'fulfilled' && r.value) {
        map.set(binanceSymbols[i].toUpperCase(), r.value);
      }
    }
    return map;
  }

  /**
   * Retorna o mid price para um par.
   */
  async getMidPrice(binanceSymbol: string): Promise<number | null> {
    const ticker = await this.getTicker(binanceSymbol);
    if (!ticker) return null;
    return (ticker.bid + ticker.ask) / 2;
  }
}

// Singleton
export const coinbaseClient = new CoinbaseClient();
