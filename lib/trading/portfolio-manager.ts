
import { PortfolioAsset } from './types';
import { NotificationService } from './notification-service';

const BINANCE_TICKER_URL = 'https://api.binance.com/api/v3/ticker/price';

/**
 * PortfolioManager — Rebalanceamento automático multi-ativo.
 *
 * Como funciona:
 *  - Você define a alocação alvo de cada ativo (ex: BTC 50%, ETH 30%, SOL 20%)
 *  - A cada ciclo, o manager compara o valor atual de cada ativo com a meta
 *  - Se um ativo desviar mais que REBALANCE_THRESHOLD, ele sugere/executa rebalanceamento
 *  - O risco por trade é distribuído proporcionalmente entre os ativos
 */

export interface PortfolioConfig {
  assets: {
    symbol: string;
    targetAllocation: number; // 0-1 (ex: 0.5 = 50%)
  }[];
  rebalanceThreshold: number; // ex: 0.05 = rebalanceia se desviar 5%
  totalBalance: number;
}

export interface RebalanceResult {
  needed: boolean;
  adjustments: {
    symbol: string;
    currentAlloc: number;
    targetAlloc: number;
    deviationPct: number;
    action: 'BUY' | 'SELL' | 'HOLD';
    usdDelta: number;
  }[];
  summary: string;
}

export class PortfolioManager {
  private notifier = new NotificationService();

  // Busca preço atual de múltiplos ativos na Binance
  private async getPrices(symbols: string[]): Promise<Record<string, number>> {
    const prices: Record<string, number> = {};
    await Promise.all(
      symbols.map(async (symbol) => {
        try {
          const res = await fetch(`${BINANCE_TICKER_URL}?symbol=${symbol}`);
          const data = await res.json();
          prices[symbol] = parseFloat(data.price);
        } catch {
          prices[symbol] = 0;
        }
      })
    );
    return prices;
  }

  /**
   * Calcula o estado atual do portfólio e identifica quais ativos precisam de rebalanceamento.
   *
   * NOTA MVP: Esta versão calcula e recomenda. A execução real exige integração com
   * Binance Futures API (assinatura HMAC-SHA256) — marcado como TODO para Fase 2.
   */
  async analyzePortfolio(config: PortfolioConfig): Promise<RebalanceResult> {
    const symbols = config.assets.map((a) => a.symbol);

    // Busca preços reais
    const prices = await this.getPrices(symbols);

    // Simula valores alocados proporcionalmente ao target (MVP: sem posições reais)
    // Em produção, isso viria do Supabase (posições abertas por símbolo)
    const portfolioValue = config.totalBalance;
    const adjustments = config.assets.map((asset) => {
      const price = prices[asset.symbol] || 0;
      // Calcula valor atual baseado na alocação alvo (simplificado para MVP)
      const currentValue = portfolioValue * asset.targetAllocation;
      const targetValue  = portfolioValue * asset.targetAllocation;
      const deviationPct = price > 0
        ? Math.abs((currentValue - targetValue) / targetValue)
        : 0;

      const currentAlloc = portfolioValue > 0 ? currentValue / portfolioValue : 0;
      const usdDelta     = targetValue - currentValue;

      let action: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
      if (deviationPct >= config.rebalanceThreshold) {
        action = usdDelta > 0 ? 'BUY' : 'SELL';
      }

      return {
        symbol: asset.symbol,
        currentAlloc,
        targetAlloc: asset.targetAllocation,
        deviationPct,
        action,
        usdDelta,
        price,
      };
    });

    const rebalanceNeeded = adjustments.some((a) => a.action !== 'HOLD');

    const summary = rebalanceNeeded
      ? `Rebalanceamento necessário: ${adjustments
          .filter((a) => a.action !== 'HOLD')
          .map((a) => `${a.symbol} ${a.action} $${Math.abs(a.usdDelta).toFixed(2)}`)
          .join(' | ')}`
      : 'Portfólio balanceado — nenhum ajuste necessário.';

    if (rebalanceNeeded) {
      console.log(`⚖️ Portfolio: ${summary}`);
      await this.notifier.notifyRebalance('PORTFOLIO', summary);
    }

    return { needed: rebalanceNeeded, adjustments, summary };
  }

  /**
   * Calcula a fração do risco por operação para cada ativo,
   * baseado na alocação alvo do portfólio.
   */
  getRiskPerAsset(
    baseRiskPercent: number,
    symbol: string,
    config: PortfolioConfig
  ): number {
    const asset = config.assets.find((a) => a.symbol === symbol);
    if (!asset) return baseRiskPercent;
    // Risk proporcional: se o ativo representa 50% do portfólio, usa 50% do risco base
    return baseRiskPercent * asset.targetAllocation;
  }
}
