// =============================================================
// TRADEFORGE SOVEREIGN — Kelly Criterion + Position Sizing
// O que faz: Calcula o tamanho IDEAL e SEGURO de cada posição
// Por que existe: Evitar apostar mais do que o necessário/seguro
// Origem: Fórmula matemática de John Kelly (Bell Labs, 1956)
// =============================================================

export interface KellyInput {
  winRate: number;        // % de trades vencedores (ex: 0.55 = 55%)
  avgWinPct: number;      // retorno médio nos trades ganhos (ex: 0.03 = 3%)
  avgLossPct: number;     // perda média nos trades perdidos (ex: 0.015 = 1.5%)
  capitalTotal: number;   // capital disponível em R$
  maxRiskPct?: number;    // teto de risco por trade (padrão: 2%)
  useHalfKelly?: boolean; // usar metade do Kelly (padrão: true — mais conservador)
}

export interface KellyResult {
  kellyFraction: number;    // % ideal segundo a fórmula pura
  appliedFraction: number;  // % que o sistema vai usar (com limites de segurança)
  positionSizeR$: number;   // valor em R$ para investir
  maxLossR$: number;        // pior caso: quanto pode perder nesse trade
  riskRewardRatio: number;  // relação risco/retorno (deve ser > 1.5)
  recommendation: string;   // orientação textual
}

export function calcKellyPosition(input: KellyInput): KellyResult {
  const {
    winRate,
    avgWinPct,
    avgLossPct,
    capitalTotal,
    maxRiskPct = 0.02,
    useHalfKelly = true,
  } = input;

  // Fórmula de Kelly: f* = W/L - (1-W)/G
  // Onde: W = winRate, L = avgLossPct, G = avgWinPct
  const kellyFraction = winRate / avgLossPct - (1 - winRate) / avgWinPct;

  // Validação: se Kelly negativo, a estratégia tem EV negativo — NÃO operar
  if (kellyFraction <= 0) {
    return {
      kellyFraction: 0,
      appliedFraction: 0,
      positionSizeR$: 0,
      maxLossR$: 0,
      riskRewardRatio: avgWinPct / avgLossPct,
      recommendation:
        '⛔ Estratégia com valor esperado negativo. NÃO operar até melhorar a taxa de acerto.',
    };
  }

  // Half-Kelly = divide por 2 → reduz drawdown em ~50% com ~75% do retorno
  // Profissionais usam Half ou Quarter Kelly para proteger o capital
  const halfKelly = kellyFraction / 2;

  // Aplica teto de segurança: nunca mais que maxRiskPct por trade
  const appliedFraction = Math.min(
    useHalfKelly ? halfKelly : kellyFraction,
    maxRiskPct
  );

  const positionSizeR$ = capitalTotal * appliedFraction;
  const maxLossR$ = positionSizeR$ * avgLossPct;
  const riskRewardRatio = avgWinPct / avgLossPct;

  let recommendation = '';
  if (riskRewardRatio < 1) {
    recommendation = '⚠️ RR menor que 1:1. Risco supera o retorno potencial.';
  } else if (riskRewardRatio < 1.5) {
    recommendation = '🔶 RR aceitável mas fraco. Tente buscar RR mínimo de 1:1.5';
  } else {
    recommendation = `✅ RR de 1:${riskRewardRatio.toFixed(1)} é saudável. Siga o plano.`;
  }

  return {
    kellyFraction: parseFloat(kellyFraction.toFixed(4)),
    appliedFraction: parseFloat(appliedFraction.toFixed(4)),
    positionSizeR$: parseFloat(positionSizeR$.toFixed(2)),
    maxLossR$: parseFloat(maxLossR$.toFixed(2)),
    riskRewardRatio: parseFloat(riskRewardRatio.toFixed(2)),
    recommendation,
  };
}


// =============================================================
// EXEMPLO PRÁTICO — R$ 50,00 de capital
//
// Cenário: Você depositou R$ 50 na conta.
// Win Rate histórico: 55%
// Retorno médio nos ganhos: 3% por trade
// Perda média nos stops: 1.5% por trade
// Risco máximo por trade: 2%
//
// Resultado:
//   Kelly puro = 0.55/0.015 - 0.45/0.03 = 36.67 - 15 = 21.67% ← absurdo!
//   Half Kelly = 10.83% → ainda muito alto
//   Cap em 2% (maxRiskPct) → R$ 50 × 2% = R$ 1,00 por trade
//   Perda máxima no trade = R$ 1,00 × 1.5% = R$ 0,015
//
// O sistema NUNCA vai arriscar mais de R$ 1,00 por trade
// com R$ 50 de capital, mantendo você SEMPRE acima de zero.
// =============================================================
export function exampleWith50BRL() {
  return calcKellyPosition({
    winRate: 0.55,
    avgWinPct: 0.03,
    avgLossPct: 0.015,
    capitalTotal: 50,
    maxRiskPct: 0.02,
    useHalfKelly: true,
  });
}
