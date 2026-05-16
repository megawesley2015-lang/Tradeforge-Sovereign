
import crypto from 'node:crypto';
import { TradeSignal } from './types';

/**
 * BinanceFuturesClient — Cliente para Binance Futures (USD-M)
 *
 * Assina todas as requisições com HMAC-SHA256 conforme a documentação oficial:
 * https://binance-docs.github.io/apidocs/futures/en/
 *
 * IMPORTANTE: As chaves ficam APENAS no servidor (variáveis de ambiente).
 * Nunca exponha BINANCE_API_KEY ou BINANCE_API_SECRET no cliente.
 *
 * Modo de operação:
 *  - LIVE:  usa a API real da Binance Futures (https://fapi.binance.com)
 *  - PAPER: usa o Testnet da Binance       (https://testnet.binancefuture.com)
 */

export type OrderSide    = 'BUY' | 'SELL';
export type PositionSide = 'LONG' | 'SHORT' | 'BOTH';
export type OrderType    = 'MARKET' | 'LIMIT' | 'STOP_MARKET' | 'TAKE_PROFIT_MARKET';

export interface FuturesOrder {
  symbol:        string;
  orderId:       number;
  clientOrderId: string;
  side:          OrderSide;
  type:          OrderType;
  origQty:       string;
  executedQty:   string;
  avgPrice:      string;
  status:        'NEW' | 'FILLED' | 'CANCELED' | 'REJECTED';
  updateTime:    number;
}

export interface FuturesPosition {
  symbol:           string;
  positionAmt:      string;   // positivo = LONG, negativo = SHORT
  entryPrice:       string;
  unrealizedProfit: string;
  liquidationPrice: string;
  leverage:         string;
  marginType:       string;
}

export interface FuturesBalance {
  asset:              string;
  walletBalance:      string;
  availableBalance:   string;
  unrealizedProfit:   string;
}

export interface PlaceOrderParams {
  symbol:        string;
  side:          OrderSide;
  positionSide?: PositionSide;
  type:          OrderType;
  quantity:      number;
  price?:        number;       // apenas para LIMIT
  stopPrice?:    number;       // para STOP_MARKET / TAKE_PROFIT_MARKET
  reduceOnly?:   boolean;
  timeInForce?:  'GTC' | 'IOC' | 'FOK';
}

export class BinanceFuturesClient {
  private readonly apiKey:    string;
  private readonly apiSecret: string;
  private readonly baseUrl:   string;
  readonly isLive:            boolean;

  constructor() {
    this.apiKey    = process.env.BINANCE_API_KEY    || '';
    this.apiSecret = process.env.BINANCE_API_SECRET || '';
    this.isLive    = process.env.BINANCE_LIVE_MODE  === 'true';

    // PAPER usa o Testnet da Binance (sem dinheiro real)
    this.baseUrl = this.isLive
      ? 'https://fapi.binance.com'
      : 'https://testnet.binancefuture.com';

    if (!this.apiKey || !this.apiSecret) {
      console.warn('⚠️  Binance: API keys não configuradas — modo simulado ativado');
    }
  }

  get configured(): boolean {
    return !!(this.apiKey && this.apiSecret);
  }

  // ── Assinatura HMAC-SHA256 ────────────────────────────────────────────────
  private sign(queryString: string): string {
    return crypto
      .createHmac('sha256', this.apiSecret)
      .update(queryString)
      .digest('hex');
  }

  private buildQueryString(params: Record<string, string | number | boolean>): string {
    return Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
      .join('&');
  }

  // ── Requisição autenticada ─────────────────────────────────────────────────
  private async request<T>(
    method: 'GET' | 'POST' | 'DELETE',
    path:   string,
    params: Record<string, string | number | boolean> = {}
  ): Promise<T> {
    if (!this.configured) throw new Error('Binance API keys não configuradas');

    const timestamp   = Date.now();
    const fullParams  = { ...params, timestamp };
    const queryString = this.buildQueryString(fullParams);
    const signature   = this.sign(queryString);
    const url         = `${this.baseUrl}${path}?${queryString}&signature=${signature}`;

    const res = await fetch(url, {
      method,
      headers: {
        'X-MBX-APIKEY': this.apiKey,
        'Content-Type': 'application/json',
      },
    });

    const data = await res.json();

    if (!res.ok || data.code) {
      throw new Error(`Binance API Error ${data.code}: ${data.msg}`);
    }

    return data as T;
  }

  // ── Saldo da conta Futures ─────────────────────────────────────────────────
  async getBalance(): Promise<FuturesBalance> {
    const balances = await this.request<FuturesBalance[]>('GET', '/fapi/v2/balance');
    const usdt = balances.find((b) => b.asset === 'USDT');
    if (!usdt) throw new Error('Saldo USDT não encontrado na conta Futures');
    return usdt;
  }

  // ── Posições abertas ──────────────────────────────────────────────────────
  async getOpenPositions(symbol?: string): Promise<FuturesPosition[]> {
    const params: Record<string, string> = {};
    if (symbol) params.symbol = symbol;

    const positions = await this.request<FuturesPosition[]>('GET', '/fapi/v2/positionRisk', params);
    // Filtra apenas posições com quantidade > 0
    return positions.filter((p) => parseFloat(p.positionAmt) !== 0);
  }

  // ── Configurar leverage ───────────────────────────────────────────────────
  async setLeverage(symbol: string, leverage: number): Promise<void> {
    await this.request('POST', '/fapi/v1/leverage', { symbol, leverage });
    console.log(`⚙️  Leverage ${symbol}: ${leverage}x`);
  }

  // ── Configurar margin mode (ISOLATED recomendado para day trade) ──────────
  async setMarginType(symbol: string, marginType: 'ISOLATED' | 'CROSSED'): Promise<void> {
    try {
      await this.request('POST', '/fapi/v1/marginType', { symbol, marginType });
    } catch (e: any) {
      // Ignora erro "No need to change" (código -4046)
      if (!e.message?.includes('-4046')) throw e;
    }
  }

  // ── Abrir posição (ordem MARKET) ─────────────────────────────────────────
  async placeMarketOrder(params: PlaceOrderParams): Promise<FuturesOrder> {
    const body: Record<string, string | number | boolean> = {
      symbol:   params.symbol,
      side:     params.side,
      type:     params.type,
      quantity: params.quantity.toFixed(3),
    };

    if (params.positionSide) body.positionSide = params.positionSide;
    if (params.reduceOnly)   body.reduceOnly   = params.reduceOnly;
    if (params.stopPrice)    body.stopPrice    = params.stopPrice.toFixed(2);

    return this.request<FuturesOrder>('POST', '/fapi/v1/order', body);
  }

  // ── Fechar posição (reduceOnly MARKET) ───────────────────────────────────
  async closePosition(symbol: string, side: TradeSignal, quantity: number): Promise<FuturesOrder> {
    const closeSide: OrderSide = side === 'LONG' ? 'SELL' : 'BUY';
    return this.placeMarketOrder({
      symbol,
      side:       closeSide,
      type:       'MARKET',
      quantity,
      reduceOnly: true,
    });
  }

  // ── Colocar Stop Loss (STOP_MARKET) ──────────────────────────────────────
  async placeStopLoss(symbol: string, side: TradeSignal, quantity: number, stopPrice: number): Promise<FuturesOrder> {
    const slSide: OrderSide = side === 'LONG' ? 'SELL' : 'BUY';
    return this.placeMarketOrder({
      symbol,
      side:       slSide,
      type:       'STOP_MARKET',
      quantity,
      stopPrice,
      reduceOnly: true,
    });
  }

  // ── Colocar Take Profit (TAKE_PROFIT_MARKET) ──────────────────────────────
  async placeTakeProfit(symbol: string, side: TradeSignal, quantity: number, stopPrice: number): Promise<FuturesOrder> {
    const tpSide: OrderSide = side === 'LONG' ? 'SELL' : 'BUY';
    return this.placeMarketOrder({
      symbol,
      side:       tpSide,
      type:       'TAKE_PROFIT_MARKET',
      quantity,
      stopPrice,
      reduceOnly: true,
    });
  }

  // ── Cancelar todas as ordens abertas de um símbolo ───────────────────────
  async cancelAllOrders(symbol: string): Promise<void> {
    try {
      await this.request('DELETE', '/fapi/v1/allOpenOrders', { symbol });
    } catch (e: any) {
      // Ignora "order not found" (esperado se não há ordens)
      if (!e.message?.includes('-2011')) throw e;
    }
  }

  /**
   * Abre posição completa com leverage, stop loss e take profit em uma só chamada.
   * Retorna o orderId da ordem de entrada.
   *
   * Fluxo:
   *  1. Configura ISOLATED margin + leverage
   *  2. Envia ordem MARKET de entrada
   *  3. Envia STOP_MARKET (stop loss)
   *  4. Envia TAKE_PROFIT_MARKET
   */
  async openFullPosition(params: {
    symbol:      string;
    signal:      TradeSignal;
    quantity:    number;
    stopLoss:    number;
    takeProfit:  number;
    leverage?:   number;
  }): Promise<{ entryOrder: FuturesOrder; slOrder: FuturesOrder; tpOrder: FuturesOrder }> {
    const { symbol, signal, quantity, stopLoss, takeProfit, leverage = 5 } = params;
    const entrySide: OrderSide = signal === 'LONG' ? 'BUY' : 'SELL';

    console.log(`\n🔴 Binance Futures [${this.isLive ? 'LIVE' : 'PAPER'}] — Abrindo ${signal} ${symbol}`);
    console.log(`   Qtd: ${quantity} | SL: ${stopLoss.toFixed(2)} | TP: ${takeProfit.toFixed(2)} | Lev: ${leverage}x`);

    // 1. Configura margin e leverage
    await this.setMarginType(symbol, 'ISOLATED');
    await this.setLeverage(symbol, leverage);

    // 2. Ordem de entrada
    const entryOrder = await this.placeMarketOrder({
      symbol,
      side:     entrySide,
      type:     'MARKET',
      quantity,
    });

    console.log(`   ✅ Entrada: orderId=${entryOrder.orderId} status=${entryOrder.status}`);

    // 3. Stop Loss
    const slOrder = await this.placeStopLoss(symbol, signal, quantity, stopLoss);
    console.log(`   🛑 Stop Loss: orderId=${slOrder.orderId} @ $${stopLoss.toFixed(2)}`);

    // 4. Take Profit
    const tpOrder = await this.placeTakeProfit(symbol, signal, quantity, takeProfit);
    console.log(`   🎯 Take Profit: orderId=${tpOrder.orderId} @ $${takeProfit.toFixed(2)}`);

    return { entryOrder, slOrder, tpOrder };
  }
}

// Singleton — uma instância por processo (economiza conexões)
export const binanceClient = new BinanceFuturesClient();
