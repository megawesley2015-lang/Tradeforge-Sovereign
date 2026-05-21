
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

// ── Tipos de info de símbolo ──────────────────────────────────────────────────

export interface SymbolInfo {
  /** Número de casas decimais para QUANTIDADE (ex: 3 → 0.001 BTC) */
  quantityPrecision: number;
  /** Número de casas decimais para PREÇO (ex: 1 → 0.1 para BTCUSDT) */
  pricePrecision:    number;
  /** Quantidade mínima por ordem */
  minQty:            number;
  /** Valor nocional mínimo em USDT (ex: 5.0) */
  minNotional:       number;
  /** Step size da quantidade (ex: 0.001) */
  stepSize:          number;
  /** Tick size do preço (ex: 0.1) */
  tickSize:          number;
}

/**
 * Arredonda um número para o múltiplo mais próximo de `step`, com casas decimais corretas.
 * Ex: roundStep(0.0375, 0.01) → 0.03
 */
function roundStep(value: number, step: number): string {
  if (step <= 0) return value.toString();
  const decimals = Math.max(0, Math.round(-Math.log10(step)));
  const rounded  = Math.floor(value / step) * step;
  return rounded.toFixed(decimals);
}

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
  balance:            string;   // total wallet — campo real da API Binance /fapi/v2/balance
  availableBalance:   string;
  crossUnPnl:         string;
  maxWithdrawAmount:  string;
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
  // FIX: leitura lazy das env vars — evita warning falso quando o singleton
  // é criado antes do dotenv carregar (common em imports de módulo top-level)
  private get apiKey()    { return process.env.BINANCE_API_KEY    || ''; }
  private get apiSecret() { return process.env.BINANCE_API_SECRET || ''; }
  get isLive():   boolean { return process.env.BINANCE_LIVE_MODE  === 'true'; }
  get baseUrl():  string  {
    return this.isLive
      ? 'https://fapi.binance.com'
      : 'https://testnet.binancefuture.com';
  }

  /** Cache de info de símbolo — evita chamar exchangeInfo repetidamente */
  private symbolCache = new Map<string, SymbolInfo>();
  /** Última vez que o cache foi populado (TTL: 1h) */
  private symbolCacheTs = 0;
  private readonly CACHE_TTL = 60 * 60 * 1000; // 1 hora

  // constructor vazio — todas as props são getters lazy
  constructor() {}

  get configured(): boolean {
    const ok = !!(this.apiKey && this.apiSecret);
    if (!ok) console.warn('[Binance] API keys ausentes — operando em modo simulado');
    return ok;
  }

  // ── Exchange Info (não autenticado) ───────────────────────────────────────
  /**
   * Carrega e cacheia as regras de filtro de todos os símbolos Futures.
   * Chama /fapi/v1/exchangeInfo (público, sem assinatura).
   * TTL: 1h — suficiente pois regras mudam raramente.
   */
  async loadSymbolInfo(symbol?: string): Promise<void> {
    const now = Date.now();
    if (this.symbolCacheTs && (now - this.symbolCacheTs) < this.CACHE_TTL) {
      if (!symbol || this.symbolCache.has(symbol)) return; // cache válido
    }

    try {
      const url = `${this.baseUrl}/fapi/v1/exchangeInfo`;
      const res  = await fetch(url);
      if (!res.ok) throw new Error(`exchangeInfo HTTP ${res.status}`);
      const data = await res.json() as { symbols: any[] };

      for (const s of data.symbols) {
        if (s.status !== 'TRADING') continue;

        let stepSize    = 0.001;
        let tickSize    = 0.01;
        let minQty      = 0.001;
        let minNotional = 5;

        for (const f of s.filters ?? []) {
          if (f.filterType === 'LOT_SIZE') {
            stepSize = parseFloat(f.stepSize);
            minQty   = parseFloat(f.minQty);
          }
          if (f.filterType === 'PRICE_FILTER') {
            tickSize = parseFloat(f.tickSize);
          }
          if (f.filterType === 'MIN_NOTIONAL') {
            minNotional = parseFloat(f.notional ?? f.minNotional ?? '5');
          }
        }

        const decimals = (v: number) =>
          Math.max(0, Math.round(-Math.log10(v)));

        this.symbolCache.set(s.symbol, {
          quantityPrecision: decimals(stepSize),
          pricePrecision:    decimals(tickSize),
          minQty,
          minNotional,
          stepSize,
          tickSize,
        });
      }

      this.symbolCacheTs = now;
      console.log(`[Binance] exchangeInfo carregado: ${this.symbolCache.size} símbolos`);
    } catch (err: any) {
      console.warn(`[Binance] Falha ao carregar exchangeInfo: ${err.message} — usando defaults`);
    }
  }

  /**
   * Retorna as regras de filtro para um símbolo específico.
   * Se não encontrado no cache, retorna defaults seguros.
   */
  async getSymbolInfo(symbol: string): Promise<SymbolInfo> {
    await this.loadSymbolInfo(symbol);
    return this.symbolCache.get(symbol) ?? {
      quantityPrecision: 3,
      pricePrecision:    2,
      minQty:            0.001,
      minNotional:       5,
      stepSize:          0.001,
      tickSize:          0.01,
    };
  }

  /**
   * Verifica se o trade atinge o notional mínimo.
   * Retorna { ok, reason } — o bot usa para bloquear trades inviáveis.
   */
  async validateNotional(
    symbol:       string,
    quantity:     number,
    entryPrice:   number
  ): Promise<{ ok: boolean; reason?: string }> {
    const info = await this.getSymbolInfo(symbol);
    const notional = quantity * entryPrice;

    if (quantity < info.minQty) {
      return {
        ok:     false,
        reason: `Qtd ${quantity} < minQty ${info.minQty} para ${symbol}`,
      };
    }
    if (notional < info.minNotional) {
      return {
        ok:     false,
        reason: `Nocional $${notional.toFixed(2)} < mínimo $${info.minNotional} para ${symbol}`,
      };
    }
    return { ok: true };
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
    if (!usdt) throw new Error('Saldo USDT nao encontrado na conta Futures');
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


  // Configura margin mode (ISOLATED recomendado para day trade)
  async setMarginType(symbol: string, marginType: 'ISOLATED' | 'CROSSED'): Promise<void> {
    try {
      await this.request('POST', '/fapi/v1/marginType', { symbol, marginType });
    } catch (e: any) {
      // Ignora erro "No need to change" (codigo -4046)
      if (!e.message?.includes('-4046')) throw e;
    }
  }

  // Abrir posicao (ordem MARKET)
  // Usa precisao correta de quantidade e preco por simbolo via exchangeInfo
  async placeMarketOrder(params: PlaceOrderParams): Promise<FuturesOrder> {
    const info = await this.getSymbolInfo(params.symbol);

    const body: Record<string, string | number | boolean> = {
      symbol:   params.symbol,
      side:     params.side,
      type:     params.type,
      quantity: roundStep(params.quantity, info.stepSize),
    };

    if (params.positionSide) body.positionSide = params.positionSide;
    if (params.reduceOnly)   body.reduceOnly   = params.reduceOnly;
    if (params.stopPrice)    body.stopPrice    = roundStep(params.stopPrice, info.tickSize);

    return this.request<FuturesOrder>('POST', '/fapi/v1/order', body);
  }

  // Fechar posicao (reduceOnly MARKET)
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

  // Stop Loss (STOP_MARKET)
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

  // Take Profit (TAKE_PROFIT_MARKET)
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

  // Cancela todas as ordens abertas de um simbolo
  async cancelAllOrders(symbol: string): Promise<void> {
    try {
      await this.request('DELETE', '/fapi/v1/allOpenOrders', { symbol });
    } catch (e: any) {
      // Ignora "order not found" (esperado se nao ha ordens)
      if (!e.message?.includes('-2011')) throw e;
    }
  }

  // Abre posicao completa: leverage + entry + SL + TP em uma so chamada
  async openFullPosition(params: {
    symbol:     string;
    signal:     TradeSignal;
    quantity:   number;
    stopLoss:   number;
    takeProfit: number;
    leverage?:  number;
  }): Promise<{ entryOrder: FuturesOrder; slOrder: FuturesOrder; tpOrder: FuturesOrder }> {
    const { symbol, signal, quantity, stopLoss, takeProfit, leverage = 5 } = params;
    const entrySide: OrderSide = signal === 'LONG' ? 'BUY' : 'SELL';

    const info = await this.getSymbolInfo(symbol);
    const pp   = info.pricePrecision;

    const check = await this.validateNotional(symbol, quantity, stopLoss);
    if (!check.ok) {
      throw new Error(`[Binance] Trade bloqueado: ${check.reason}`);
    }

    console.log(`[Binance] ${this.isLive ? 'LIVE' : 'PAPER'} ${signal} ${symbol} | Qtd:${roundStep(quantity, info.stepSize)} SL:${stopLoss.toFixed(pp)} TP:${takeProfit.toFixed(pp)} Lev:${leverage}x`);

    await this.setMarginType(symbol, 'ISOLATED');
    await this.setLeverage(symbol, leverage);

    const entryOrder = await this.placeMarketOrder({ symbol, side: entrySide, type: 'MARKET', quantity });
    console.log(`   Entrada: orderId=${entryOrder.orderId} status=${entryOrder.status}`);

    const slOrder = await this.placeStopLoss(symbol, signal, quantity, stopLoss);
    console.log(`   StopLoss: orderId=${slOrder.orderId} @ ${stopLoss.toFixed(pp)}`);

    const tpOrder = await this.placeTakeProfit(symbol, signal, quantity, takeProfit);
    console.log(`   TakeProfit: orderId=${tpOrder.orderId} @ ${takeProfit.toFixed(pp)}`);

    return { entryOrder, slOrder, tpOrder };
  }
}

// Singleton
export const binanceClient = new BinanceFuturesClient();
