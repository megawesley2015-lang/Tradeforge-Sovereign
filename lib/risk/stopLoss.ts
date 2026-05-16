// =============================================================
// TRADEFORGE SOVEREIGN — Stop Loss & Take Profit dinâmicos
// O que faz: Calcula pontos de saída baseados na volatilidade real
// Por que existe: Stop fixo ignora o comportamento do ativo.
//                 Stop baseado em ATR respeita a volatilidade.
// =============================================================

export interface StopLossConfig {
  entryPrice: number;
  atr: number;           // ATR calculado pelo lib/indicators
  direction: 'LONG' | 'SHORT';
  atrMultiplier?: number; // multiplicador do ATR para o stop (padrão: 2)
  rrRatio?: number;       // Risk/Reward mínimo desejado (padrão: 1.5)
  capital?: number;       // capital disponível (para calcular tamanho)
  maxRiskPct?: number;    // % máximo de risco por trade
}

export interface StopLossResult {
  entryPrice: number;
  stopLoss: number;       // preço de saída se der errado
  takeProfit: number;     // preço de saída se der certo
  stopLossDistance: number;   // distância em R$ até o stop
  takeProfitDistance: number; // distância em R$ até o TP
  riskRewardRatio: number;
  maxSharesWithRisk: number | null; // quantas ações comprar respeitando o risco
  riskPerShare: number;             // risco em R$ por ação
}

export function calcStopLoss(config: StopLossConfig): StopLossResult {
  const {
    entryPrice,
    atr,
    direction,
    atrMultiplier = 2,
    rrRatio = 1.5,
    capital,
    maxRiskPct = 0.02,
  } = config;

  // Stop Loss = entrada ± (ATR × multiplicador)
  // ATR × 2 garante que o stop está além do ruído normal do mercado
  const stopDistance = atr * atrMultiplier;

  let stopLoss: number;
  let takeProfit: number;

  if (direction === 'LONG') {
    stopLoss = entryPrice - stopDistance;   // LONG: stop abaixo da entrada
    takeProfit = entryPrice + stopDistance * rrRatio; // TP acima
  } else {
    stopLoss = entryPrice + stopDistance;   // SHORT: stop acima da entrada
    takeProfit = entryPrice - stopDistance * rrRatio; // TP abaixo
  }

  const stopLossDistance = Math.abs(entryPrice - stopLoss);
  const takeProfitDistance = Math.abs(entryPrice - takeProfit);
  const riskRewardRatio = takeProfitDistance / stopLossDistance;
  const riskPerShare = stopLossDistance;

  // Quantas ações posso comprar arriscando no máximo X% do capital?
  let maxSharesWithRisk: number | null = null;
  if (capital && maxRiskPct) {
    const maxRiskR$ = capital * maxRiskPct;
    maxSharesWithRisk = Math.floor(maxRiskR$ / riskPerShare);
  }

  return {
    entryPrice: parseFloat(entryPrice.toFixed(2)),
    stopLoss: parseFloat(stopLoss.toFixed(2)),
    takeProfit: parseFloat(takeProfit.toFixed(2)),
    stopLossDistance: parseFloat(stopLossDistance.toFixed(2)),
    takeProfitDistance: parseFloat(takeProfitDistance.toFixed(2)),
    riskRewardRatio: parseFloat(riskRewardRatio.toFixed(2)),
    maxSharesWithRisk,
    riskPerShare: parseFloat(riskPerShare.toFixed(4)),
  };
}


// =============================================================
// PROTEÇÃO ANTI-SALDO NEGATIVO
// O que faz: Verifica se um trade pode ser aberto com segurança
// Barreiras:
//   1. Saldo suficiente para cobrir o trade
//   2. Perda máxima não excede limite diário
//   3. Capital não ficará abaixo do mínimo configurado
// =============================================================
export interface RiskCheckInput {
  capital: number;              // capital disponível atual
  investedAmount: number;       // quanto vai investir nesse trade
  stopLossDistance: number;     // distância ao stop em R$
  quantity: number;             // quantidade de ações/contratos
  dailyLossAccumulated: number; // perda já acumulada hoje
  maxDailyLossPct: number;      // limite diário de perda (padrão: 6%)
  capitalFloor?: number;        // mínimo que não pode ser ultrapassado
}

export interface RiskCheckResult {
  canTrade: boolean;
  reason?: string;
  maxLossThisTrade: number;     // pior caso em R$
  remainingDailyBudget: number; // quanto ainda pode perder hoje
  capitalAfterMaxLoss: number;  // capital se o stop for atingido
  isCapitalSafe: boolean;       // capital fica positivo mesmo no pior caso?
}

export function checkRiskBeforeTrade(input: RiskCheckInput): RiskCheckResult {
  const {
    capital,
    investedAmount,
    stopLossDistance,
    quantity,
    dailyLossAccumulated,
    maxDailyLossPct,
    capitalFloor = 0,
  } = input;

  const maxLossThisTrade = stopLossDistance * quantity;
  const maxDailyLossR$ = capital * maxDailyLossPct;
  const remainingDailyBudget = maxDailyLossR$ - dailyLossAccumulated;
  const capitalAfterMaxLoss = capital - maxLossThisTrade;

  // Barreira 1: Capital suficiente?
  if (investedAmount > capital) {
    return {
      canTrade: false,
      reason: `Capital insuficiente. Disponível: R$ ${capital.toFixed(2)}, Necessário: R$ ${investedAmount.toFixed(2)}`,
      maxLossThisTrade,
      remainingDailyBudget,
      capitalAfterMaxLoss,
      isCapitalSafe: false,
    };
  }

  // Barreira 2: Perda do trade cabe no orçamento diário?
  if (maxLossThisTrade > remainingDailyBudget) {
    return {
      canTrade: false,
      reason: `Perda potencial (R$ ${maxLossThisTrade.toFixed(2)}) excede orçamento diário restante (R$ ${remainingDailyBudget.toFixed(2)})`,
      maxLossThisTrade,
      remainingDailyBudget,
      capitalAfterMaxLoss,
      isCapitalSafe: false,
    };
  }

  // Barreira 3: Capital floor (mínimo configurado)?
  if (capitalAfterMaxLoss < capitalFloor) {
    return {
      canTrade: false,
      reason: `Trade levaria capital abaixo do mínimo configurado. Mínimo: R$ ${capitalFloor.toFixed(2)}, Restaria: R$ ${capitalAfterMaxLoss.toFixed(2)}`,
      maxLossThisTrade,
      remainingDailyBudget,
      capitalAfterMaxLoss,
      isCapitalSafe: false,
    };
  }

  // Barreira 4: Capital sempre positivo?
  if (capitalAfterMaxLoss < 0) {
    return {
      canTrade: false,
      reason: '🚨 CRÍTICO: Este trade pode levar o saldo a NEGATIVO. Bloqueado.',
      maxLossThisTrade,
      remainingDailyBudget,
      capitalAfterMaxLoss,
      isCapitalSafe: false,
    };
  }

  return {
    canTrade: true,
    maxLossThisTrade: parseFloat(maxLossThisTrade.toFixed(2)),
    remainingDailyBudget: parseFloat(remainingDailyBudget.toFixed(2)),
    capitalAfterMaxLoss: parseFloat(capitalAfterMaxLoss.toFixed(2)),
    isCapitalSafe: true,
  };
}
