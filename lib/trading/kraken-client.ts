
/**
 * KrakenClient — Acesso público à API REST da Kraken.
 *
 * Documentação: https://docs.kraken.com/rest/#tag/Market-Data/operation/getTickerInformation
 *
 * Apenas endpoints públicos (sem autenticação).
 * Usado pelo ArbitrageScanner para comparação de preços.
 *
 * Mapeamento de símbolos:
 *   Binance BTCUSDT → Kraken XBTUSDT  (Kraken usa XBT para Bitcoin)
 *   Binance ETHUSDT → Kraken ETHUSDT
 *   Binance SOLUSDT → Kraken SOLUSDT
 */

const BASE_URL = 'https://api.kraken.com/0/public';

// Mapa de conversão Binance → Kraken
const SYMBOL_MAP: Record<string, string> = {
  BTCUSDT:  'XBTUSDT',
  ETHUSDT:  'ETHUSDT',
  SOLUSDT:  'SOLUSDT',
  BNBUSDT:  'USDTZUSDT', // BNB não existe na Kraken — retorna null
  ADAUSDT:  'ADAUSDT',
  DOTUSDT:  'DOTUSD',
  LINKUSDT: 'LINKUSDT',
  AVAXUSDT: 'AVAXUSDT',
  MATICUSDT:'MATICUSDT',
  XRPUSDT:  'XRPUSDT',
};

export interface KrakenTicker {
  symbol:   string;        // par original (ex: BTCUSDT)
  krakenPair: string;      // par na Kraken (ex: XBTUSDT)
  bid:      number;
  ask:      number;
  last:     number;        // último preço negociado
  volume24h: number;
  timestamp: number;
}

export class KrakenClient {
  private readonly baseUrl = BASE_URL;

  /**
   * Busca ticker público de um par.
   * @param binanceSymbol  símbolo no formato Binance (ex: BTCUSDT)
   */
  async getTicker(binanceSymbol: string): Promise<KrakenTicker | null> {
    const krakenPair = SYMBOL_MAP[binanceSymbol.toUpperCase()];
    if (!krakenPair) {
      console.warn(`⚠️  Kraken: símbolo "${binanceSymbol}" sem mapeamento — ignorado`);
      return null;
    }

    try {
      const res = await fetch(`${this.baseUrl}/Ticker?pair=${krakenPair}`, {
        headers: { 'User-Agent': 'TradeForge/1.0' },
        signal:  AbortSignal.timeout(5000),
      });

      if (!res.ok) {
        console.error(`❌ Kraken HTTP ${res.status} para ${krakenPair}`);
        return null;
      }

      const json = await res.json() as {
        error: string[];
        result: Record<string, {
          b: string[];   // bid [price, wholeLotVol, lotVol]
          a: string[];   // ask [price, wholeLotVol, lotVol]
          c: string[];   // last trade [price, lotVol]
          v: string[];   // volume [today, last24h]
        }>;
      };

      if (json.error?.length > 0) {
        console.error(`❌ Kraken API error para ${krakenPair}:`, json.error);
        return null;
      }

      // A chave do resultado pode diferir levemente do par solicitado
      const key    = Object.keys(json.result)[0];
      const ticker = json.result[key];
      if (!ticker) return null;

      return {
        symbol:     binanceSymbol.toUpperCase(),
        krakenPair,
        bid:        parseFloat(ticker.b[0]),
        ask:        parseFloat(ticker.a[0]),
        last:       parseFloat(ticker.c[0]),
        volume24h:  parseFloat(ticker.v[1]),
        timestamp:  Date.now(),
      };
    } catch (err: any) {
      // Timeout ou rede inacessível — não derruba o sistema
      console.warn(`⚠️  Kraken fetch timeout/error para ${krakenPair}:`, err.message);
      return null;
    }
  }

  /**
   * Busca múltiplos tickers em paralelo.
   */
  async getMultipleTickers(binanceSymbols: string[]): Promise<Map<string, KrakenTicker>> {
    const results = await Promise.allSettled(
      binanceSymbols.map((s) => this.getTicker(s))
    );

    const map = new Map<string, KrakenTicker>();
    for (let i = 0; i < binanceSymbols.length; i++) {
      const r = results[i];
      if (r.status === 'fulfilled' && r.value) {
        map.set(binanceSymbols[i].toUpperCase(), r.value);
      }
    }
    return map;
  }

  /**
   * Retorna o mid price (média entre bid e ask) para um par.
   */
  async getMidPrice(binanceSymbol: string): Promise<number | null> {
    const ticker = await this.getTicker(binanceSymbol);
    if (!ticker) return null;
    return (ticker.bid + ticker.ask) / 2;
  }
}

// Singleton
export const krakenClient = new KrakenClient();
