/**
 * DEPRECADO - Esta classe foi substituida pela API route em:
 * app/trading/api/backtest/route.ts
 *
 * Toda a logica de backtesting agora usa os modulos centralizados de:
 * - lib/trading/technical-analysis.ts  (4 confirmadores: EMA, RSI, MACD, BB)
 * - lib/trading/risk-manager.ts        (bug price_diff corrigido)
 *
 * Para rodar o backtester, acesse /trading/backtest no dashboard.
 */

// Re-exporta para evitar quebrar imports existentes
export { } from '@/lib/trading/technical-analysis';
