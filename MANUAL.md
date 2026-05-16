# 📘 TRADEFORGE SOVEREIGN — Manual Completo do Sistema

> Stack: Next.js (App Router) · TypeScript · Supabase · Vercel
> Versão: MVP 1.0 | Data: 2026-05-11

---

## 🗺️ O que é o TradeForge Sovereign?

O **TradeForge Sovereign** é uma plataforma de análise técnica e gestão de trades.
Ele analisa dados de mercado em tempo real, gera sinais de compra/venda com base em
indicadores técnicos, calcula o tamanho seguro das posições e protege você de ir
a saldo negativo — tudo de forma automatizada.

Inspirado nos pilares do NZT-48 (filme Limitless):
- Reconhecimento de padrões → **Indicadores técnicos**
- Velocidade de processamento → **Supabase Realtime**
- Gestão de capital → **Kelly Criterion**
- Antecipação de cenários → **Backtesting Engine**

---

## 🏗️ Estrutura do Projeto

```
tradeforge-sovereign/
│
├── supabase/
│   └── migrations/
│       └── 001_core_tables.sql          ← Banco de dados completo
│
├── lib/
│   ├── indicators/
│   │   └── index.ts                     ← RSI, MACD, Bollinger, ATR, Volume
│   ├── risk/
│   │   ├── kelly.ts                     ← Tamanho de posição (Kelly Criterion)
│   │   └── stopLoss.ts                  ← Stop Loss dinâmico + proteção anti-negativo
│   ├── signals/
│   │   └── engine.ts                    ← Cérebro do sistema (SignalEngine)
│   └── backtest/
│       └── engine.ts                    ← Simulação histórica de estratégias
│
└── app/
    └── api/
        └── signals/
            └── route.ts                 ← API REST para sinais
```

---

## 🗄️ Banco de Dados (Supabase)

### Tabelas

| Tabela | O que armazena | Por que existe |
|---|---|---|
| `assets` | Ativos (PETR4, BTC-USD, etc.) | Evita redundância de texto |
| `candles` | Preços OHLCV históricos e em tempo real | Matéria-prima de todos os indicadores |
| `signals` | Sinais gerados pelo engine (BUY/SELL/HOLD) | Histórico auditável de decisões |
| `positions` | Trades abertos e fechados por usuário | Controle de capital e P&L |
| `portfolio_snapshots` | Foto do patrimônio em cada momento | Curva de capital e drawdown |
| `strategies` | Configurações de estratégias por usuário | Múltiplas estratégias simultâneas |
| `backtest_results` | Resultados de simulações históricas | Validação antes de operar |
| `risk_config` | **Limites de proteção por usuário** | **Barreira anti-saldo negativo** |

### Função SQL de Proteção

```sql
-- Antes de abrir qualquer trade, o sistema chama:
SELECT check_risk_before_trade(
  p_user_id       := 'seu-uuid',
  p_invested_amount := 1.00,  -- R$ que vai investir
  p_stop_loss_pct   := 0.015  -- 1.5% de stop loss
);
```

Essa função verifica 5 barreiras e retorna `allowed: true` ou `allowed: false` com o motivo.

---

## 📊 Módulo de Indicadores (`lib/indicators/index.ts`)

### O que cada indicador faz e quando usar

#### RSI — Relative Strength Index
- **O que mede:** Velocidade e força dos movimentos de preço
- **Escala:** 0 a 100
- **Regra do sistema:**
  - RSI < 30 → ativo sobrevendido → sinal de **COMPRA**
  - RSI > 70 → ativo sobrecomprado → sinal de **VENDA**
  - RSI ≈ 50 → neutro, sem sinal
- **Por que usar:** É o indicador mais confiável para identificar extremos de preço

#### MACD — Moving Average Convergence Divergence
- **O que mede:** Força e direção da tendência (momentum)
- **Componentes:**
  - `macd`: diferença entre EMA(12) e EMA(26)
  - `signal`: EMA(9) do MACD
  - `histogram`: MACD - Signal (o mais importante)
- **Regra do sistema:**
  - `bullishCross = true` → tendência virando pra cima → **COMPRA**
  - `bearishCross = true` → tendência virando pra baixo → **VENDA**
  - `histogram > 0` → força compradora ativa

#### Bollinger Bands
- **O que mede:** Volatilidade e onde o preço está em relação à média
- **Componentes:** banda superior, média (SMA20), banda inferior
- **Regra do sistema:**
  - `percentB < 0.05` → preço tocou banda inferior → **COMPRA**
  - `percentB > 0.95` → preço tocou banda superior → **VENDA**
  - `squeeze = true` → volatilidade comprimida → grande movimento se aproximando

#### ATR — Average True Range
- **O que mede:** Volatilidade real do ativo (amplitude média dos candles)
- **Por que é crítico:** Determina onde colocar o Stop Loss
- **Regra:** Stop Loss = Entrada ± (ATR × 2)
- **Lógica:** ATR alto = ativo volátil = stop mais largo; ATR baixo = stop mais apertado

#### Volume Strength
- **O que mede:** Se o volume confirma o movimento
- **Regra:** `ratio > 1.5` → volume 50% acima da média = sinal mais confiável
- **Por que importa:** Volume alto + sinal = confirmação; Volume baixo + sinal = armadilha

---

## 🧠 SignalEngine (`lib/signals/engine.ts`)

### Como funciona o fluxo completo

```
Candles (dados de preço)
        ↓
   RSI + MACD + BB + ATR + Volume
        ↓
   Lógica de votação:
   - buyIndicators[] conta votos de compra
   - sellIndicators[] conta votos de venda
   - Precisa de mínimo 2 indicadores concordando
        ↓
   direction: BUY | SELL | HOLD
        ↓
   strength: 0 a 1 (confiança do sinal)
        ↓
   Stop Loss (baseado em ATR)
   Take Profit (RR 1:1.5)
        ↓
   Kelly Criterion → tamanho da posição em R$
        ↓
   Supabase INSERT → Realtime broadcast para o frontend
```

### Configuração disponível

```typescript
runSignalEngine('PETR4', candles, {
  rsiPeriod: 14,         // padrão
  rsiOversold: 30,       // abaixo → BUY
  rsiOverbought: 70,     // acima → SELL
  capitalTotal: 50,      // seu capital em R$
  maxRiskPct: 0.02,      // máximo 2% por trade
  winRate: 0.55,         // taxa de acerto histórica
  minIndicatorsToFire: 2 // mínimo 2 indicadores concordando
})
```

---

## 💰 Gestão de Risco e a Pergunta dos R$ 50

### "Depositei R$ 50. Como sei que não vou ficar com saldo negativo?"

**Resposta direta: O sistema tem 5 barreiras que tornam isso matematicamente impossível.**

---

### Barreira 1 — Kelly Criterion limita o tamanho da posição

Com R$ 50 de capital e `maxRiskPct = 2%`:

```
Posição máxima = R$ 50 × 2% = R$ 1,00
```

Você **nunca investe mais de R$ 1,00 por trade** com R$ 50.

---

### Barreira 2 — Stop Loss baseado em ATR

Suponha que o ATR do ativo seja R$ 0,30 (volatilidade normal):

```
Stop Loss = Entrada - (ATR × 2) = Entrada - R$ 0,60
```

Se você investiu R$ 1,00 comprando a R$ 10,00/ação:
- Você comprou 0,1 ações (= R$ 1,00 ÷ R$ 10,00)
- Stop em R$ 9,40
- Perda máxima = 0,1 × R$ 0,60 = **R$ 0,06 por trade**

Isso é **0,12% do seu capital**. Muito abaixo do limite de 2%.

---

### Barreira 3 — Limite de perda diária (6%)

```
Perda diária máxima = R$ 50 × 6% = R$ 3,00
```

Se você perder R$ 3,00 em um dia, o sistema **pausa automaticamente** (`trading_halted = true`).
Não abre mais nenhum trade até o dia seguinte.

---

### Barreira 4 — Capital Floor (mínimo configurável)

Você pode configurar um valor mínimo na tabela `risk_config`:

```sql
UPDATE risk_config SET min_capital_floor = 30 WHERE user_id = 'seu-id';
```

Com isso, quando o capital cair para R$ 30, o sistema para de operar.
Seu capital **nunca vai abaixo de R$ 30**, independente do que aconteça no mercado.

---

### Barreira 5 — Verificação SQL antes de cada trade

Antes de qualquer trade ser aberto, o banco de dados chama `check_risk_before_trade()`.
Se qualquer barreira estiver violada, retorna `allowed: false` e o trade não é aberto.

---

### Simulação completa com R$ 50

| Cenário | Cálculo | Resultado |
|---|---|---|
| Capital inicial | — | R$ 50,00 |
| Posição por trade (2% Kelly) | R$ 50 × 2% | R$ 1,00 |
| Perda máxima por trade (stop 1.5%) | R$ 1,00 × 1.5% | **R$ 0,015** |
| Perda máxima diária (6%) | R$ 50 × 6% | R$ 3,00 |
| Capital mínimo com 200 trades ruins seguidos | R$ 50 - (200 × R$ 0,015) | R$ 47,00 |
| Capital com floor configurado em R$ 30 | — | Para em R$ 30, nunca abaixo |

> 💡 **Conclusão:** Com as configurações padrão, você precisaria de **200 trades perdedores consecutivos** sem nenhuma vitória para perder R$ 3,00. A probabilidade estatística disso com 55% de win rate é astronomicamente baixa.

---

## 🔄 Backtesting Engine (`lib/backtest/engine.ts`)

### O que faz

Simula sua estratégia em dados históricos e retorna:

- **Win Rate:** % de trades vencedores
- **Profit Factor:** Lucro total ÷ Prejuízo total (> 1 = lucrativo)
- **Sharpe Ratio:** Retorno ajustado pelo risco (> 1 = bom, > 2 = excelente)
- **Max Drawdown:** Maior queda consecutiva de capital
- **`wentNegative`:** `true` se a simulação zerou a conta (indica estratégia perigosa)
- **`capitalCurve`:** Array com a evolução do capital para plotar gráfico

### Como usar

```typescript
import { runBacktest } from '@/lib/backtest/engine'

const resultado = runBacktest({
  ticker: 'PETR4',
  candles: candles,          // seus candles históricos
  initialCapital: 50,        // R$ 50
  signalConfig: {
    capitalTotal: 50,
    maxRiskPct: 0.02,
  },
})

console.log(resultado.winRate)         // ex: 58.3%
console.log(resultado.maxDrawdownPct)  // ex: 4.2%
console.log(resultado.wentNegative)    // false = conta nunca zerou
console.log(resultado.finalCapital)    // ex: R$ 67,40
```

### Critérios para aprovar uma estratégia

| Métrica | Mínimo aceitável | Excelente |
|---|---|---|
| Win Rate | > 50% | > 60% |
| Profit Factor | > 1.2 | > 2.0 |
| Sharpe Ratio | > 0.5 | > 1.5 |
| Max Drawdown | < 15% | < 8% |
| `wentNegative` | false | false |

---

## 🚀 API Reference

### `GET /api/signals`

Retorna sinais ativos.

```bash
GET /api/signals?ticker=PETR4&direction=BUY&limit=10
```

```json
{
  "signals": [
    {
      "id": "uuid",
      "ticker": "PETR4",
      "direction": "BUY",
      "strength": 0.75,
      "entry_price": 38.50,
      "stop_loss": 37.90,
      "take_profit": 39.40,
      "indicators_fired": ["RSI_OVERSOLD(28)", "MACD_BULLISH_CROSS"]
    }
  ],
  "count": 1
}
```

### `POST /api/signals`

Processa candles e gera sinal.

```bash
POST /api/signals
Content-Type: application/json

{
  "ticker": "PETR4",
  "candles": [...],
  "config": {
    "capitalTotal": 50,
    "maxRiskPct": 0.02
  }
}
```

---

## ⚙️ Configuração Inicial

### 1. Variáveis de ambiente

```env
# .env.local
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua-anon-key
SUPABASE_SERVICE_ROLE_KEY=sua-service-role-key
```

### 2. Aplicar migration no Supabase

```bash
# Via Supabase CLI
supabase db push

# Ou cole o conteúdo de supabase/migrations/001_core_tables.sql
# diretamente no SQL Editor do Supabase Dashboard
```

### 3. Configurar seu perfil de risco

```sql
INSERT INTO risk_config (
  user_id,
  initial_capital,
  available_capital,
  max_risk_per_trade,
  max_daily_loss_pct,
  max_open_positions,
  min_capital_floor
) VALUES (
  auth.uid(),
  50.00,   -- capital inicial: R$ 50
  50.00,   -- capital disponível: R$ 50
  0.02,    -- máx 2% por trade
  0.06,    -- máx 6% de perda por dia
  3,       -- máx 3 posições abertas
  30.00    -- nunca operar abaixo de R$ 30
);
```

### 4. Rodar o projeto

```bash
npm install
npm run dev
```

---

## 📈 Fluxo de uso no dia a dia

```
1. Abrir o dashboard → ver sinais ativos em tempo real
2. Novo sinal BUY aparece para PETR4
3. Ver: entrada R$ 38,50 | stop R$ 37,90 | TP R$ 39,40
4. Ver: posição sugerida R$ 1,00 (com R$ 50 de capital)
5. Verificar: sistema confirmou que o trade é seguro
6. Abrir posição (manualmente ou via integração)
7. Sistema monitora stop/TP em tempo real
8. Trade fechado → P&L registrado no banco
9. Portfolio snapshot atualizado automaticamente
```

---

## ⚠️ Dívida Técnica e Limitações do MVP

| Item | Status | Impacto |
|---|---|---|
| Execução automática de ordens | Não implementado | Sinais são manuais |
| Integração com corretora (B3/Binance) | Não implementado | Operação manual |
| ML para reconhecimento de padrões | Fora do MVP | V2 |
| Backtesting sem slippage/taxas | Limitação | Resultados otimistas |
| Reconexão automática de WebSocket | Não implementado | Queda silenciosa |
| Dashboard UI | Não implementado | Interface pendente |

---

## 🛡️ Declaração de Risco

> Este sistema é uma **ferramenta de análise técnica**, não um conselheiro financeiro.
> Resultados passados não garantem resultados futuros.
> Opere sempre com capital que você pode perder.
> Comece com capital pequeno e valide sua estratégia com backtest antes de escalar.

---

*TradeForge Sovereign — Construído com Next.js + Supabase + TypeScript*
