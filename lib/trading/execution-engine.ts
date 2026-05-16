import { PositionPlan, TradeSignal } from './types';
import { supabase } from '../supabase';
import { binanceClient } from './binance-futures-client';

export type ExecutionMode = 'LIVE' | 'PAPER' | 'SIMULATED';

export interface ExecutionResult {
  orderId:        string;
  status:         'FILLED' | 'SIMULATED';
  mode:           ExecutionMode;
  entryPrice:     number;
  stopLoss:       number;
  takeProfit:     number;
  positionSize:   number;
  timestamp:      string;
  binanceOrderId?: number;
}

export class ExecutionEngine {
  private get mode(): ExecutionMode {
    if (!binanceClient.configured) return 'SIMULATED';
    if (binanceClient.isLive)      return 'LIVE';
    return 'PAPER';
  }

  async openPosition(
    symbol:     string,
    plan:       PositionPlan,
    signal:     TradeSignal,
    entryPrice: number
  ): Promise<ExecutionResult> {
    let orderId        = `SIM-${Date.now().toString(36).toUpperCase()}`;
    let binanceOrderId: number | undefined;
    let filledPrice    = entryPrice;

    if (this.mode !== 'SIMULATED') {
      try {
        const result = await binanceClient.openFullPosition({
          symbol,
          signal,
          quantity:   plan.positionSize,
          stopLoss:   plan.stopLoss,
          takeProfit: plan.takeProfit,
          leverage:   Math.min(Math.ceil(plan.leverageRequired), 20),
        });

        orderId        = result.entryOrder.clientOrderId || String(result.entryOrder.orderId);
        binanceOrderId = result.entryOrder.orderId;
        filledPrice    = parseFloat(result.entryOrder.avgPrice) || entryPrice;
      } catch (err: any) {
        console.error(`Binance Futures falhou: ${err.message}`);
        orderId = `ERR-${Date.now().toString(36).toUpperCase()}`;
      }
    }

    const { error } = await supabase.from('trades').insert({
      symbol,
      side:          signal,
      entry_price:   filledPrice,
      stop_loss:     plan.stopLoss,
      take_profit:   plan.takeProfit,
      position_size: plan.positionSize,
      status:        'OPEN',
      created_at:    new Date().toISOString(),
    });

    if (error) throw new Error(`Supabase insert falhou: ${error.message}`);

    return {
      orderId,
      status:       'FILLED',
      mode:          this.mode,
      entryPrice:    filledPrice,
      stopLoss:      plan.stopLoss,
      takeProfit:    plan.takeProfit,
      positionSize:  plan.positionSize,
      timestamp:     new Date().toISOString(),
      binanceOrderId,
    };
  }

  async closePosition(
    symbol:       string,
    signal:       TradeSignal,
    positionSize: number,
    exitPrice:    number
  ): Promise<{ orderId: string; filledPrice: number }> {
    let orderId     = `SIM-CLOSE-${Date.now().toString(36).toUpperCase()}`;
    let filledPrice = exitPrice;

    if (this.mode !== 'SIMULATED') {
      try {
        await binanceClient.cancelAllOrders(symbol);
        const order = await binanceClient.closePosition(symbol, signal, positionSize);
        orderId     = String(order.orderId);
        filledPrice = parseFloat(order.avgPrice) || exitPrice;
      } catch (err: any) {
        console.error(`Erro ao fechar posicao na Binance: ${err.message}`);
      }
    }

    return { orderId, filledPrice };
  }

  async syncBinanceBalance(profileId: string): Promise<number | null> {
    if (this.mode === 'SIMULATED') return null;

    try {
      const balance   = await binanceClient.getBalance();
      const available = parseFloat(balance.availableBalance);

      await supabase
        .from('profiles')
        .update({ balance: available })
        .eq('id', profileId);

      return available;
    } catch (err: any) {
      console.error(`Falha ao sincronizar saldo: ${err.message}`);
      return null;
    }
  }
}
