# 🧠 TRADEFORGE SOVEREIGN — Manual Completo de Funcionalidades

> **Versão:** 3.0 · **Stack:** Next.js + TypeScript + Supabase + Vercel
> **Modo atual:** PAPER MODE (simulação) — nenhuma operação real é executada sem chaves da Binance

---

## Índice

1. [Paper Trading / Modo Simulação](#1-paper-trading--modo-simulação)
2. [Signal Engine — Geração de Sinais](#2-signal-engine--geração-de-sinais)
3. [Análise Técnica — Indicadores](#3-análise-técnica--indicadores)
4. [Gestão de Risco — Kelly Criterion](#4-gestão-de-risco--kelly-criterion)
5. [Stop Loss Dinâmico por ATR](#5-stop-loss-dinâmico-por-atr)
6. [Proteção de Capital — 5 Barreiras](#6-proteção-de-capital--5-barreiras)
7. [Trailing Drawdown / SAFE MODE](#7-trailing-drawdown--safe-mode)
8. [Machine Learning — Filtro de Sinais](#8-machine-learning--filtro-de-sinais)
9. [Análise de Sentimento](#9-análise-de-sentimento)
10. [Notificações via Telegram](#10-notificações-via-telegram)
11. [Scanner de Arbitragem](#11-scanner-de-arbitragem)
12. [Suporte a Múltiplas Exchanges](#12-suporte-a-múltiplas-exchanges)
13. [Backtesting Engine](#13-backtesting-engine)
14. [Dashboard de Sinais em Tempo Real](#14-dashboard-de-sinais-em-tempo-real)
15. [Rebalanceamento de Portfólio](#15-rebalanceamento-de-portfólio)
16. [Supabase Realtime — Live Feed](#16-supabase-realtime--live-feed)
17. [Ciclo Automático do Bot](#17-ciclo-automático-do-bot)

---

## 1. Paper Trading / Modo Simulação

**O que é:**
O sistema detecta automaticamente se as chaves da Binance estão configuradas. Se não estiverem (situação atual), todas as operações são simuladas sem nenhum dinheiro real sendo movimentado. O badge **PAPER MODE** aparece no cabeçalho do dashboard.

**Como funciona:**
O `ExecutionEngine` verifica `binanceClient.configured` na inicialização. Como `BINANCE_API_KEY` e `BINANCE_API_SECRET` não estão no `.env.local`, o valor é `false` e o modo é automaticamente definido como `SIMULATED`.

**Onde está no código:**
- `lib/trading/execution-engine.ts` — propriedade `mode: 'LIVE' | 'PAPER' | 'SIMULATED'`
- `app/trading/dashboard/page.tsx` — badge PAPER MODE no cabeçalho

**Como usar:**
Nenhuma configuração necessária. O sistema já está em paper trading. Para ativar trading real, adicione ao `.env.local`:
```env
BINANCE_API_KEY=sua_chave_aqui
BINANCE_API_SECRET=sua_secret_aqui
```

**⚠️ Risco:** Ative trading real somente após validar a estratégia com backtesting e pelo menos 30 dias em paper trading.

---

## 2. Signal Engine — Geração de Sinais

**O que é:**
O coração do sistema. Recebe candles OHLCV, calcula todos os indicadores em paralelo e produz um sinal de direção (BUY / SELL / HOLD) com força e níveis de entrada.

**Como funciona:**
Sistema de votação com indicadores independentes:
- Cada indicador que dispara vota em BUY ou SELL
- Mínimo de 2 indicadores precisam concordar para gerar sinal
- Força do sinal = votos concordantes / total de indicadores

**Saída do sinal:**
```typescript
{
  ticker: "BTCUSDT",
  direction: "BUY" | "SELL" | "HOLD",
  strength: 0.75,           // 75% de força
  currentPrice: 94000,
  stopLoss: 92120,          // ATR × 2 abaixo da entrada
  takeProfit: 96820,        // RR 1:1.5
  suggestedPositionSizeR: 1.00,  // R$ 1,00 (2% de R$ 50)
  indicatorsFired: ["RSI_OVERSOLD(28)", "MACD_BULLISH_CROSS"]
}
```

**Onde está no código:**
- `lib/signals/engine.ts` — função `runSignalEngine(ticker, candles, config)`
- `app/api/signals/route.ts` — endpoint POST `/api/signals`

**Como usar via API:**
```bash
# No PowerShell, use o script pronto:
.\test-api.ps1

# Ou via curl (Linux/Mac):
curl -X POST http://localhost:3000/api/signals \
  -H "Content-Type: application/json" \
  -d '{"ticker":"BTCUSDT","candles":[...35 candles...],"config":{"capitalTotal":50}}'
```

**Como usar no dashboard:**
Clique em **INICIAR BOT** — o sistema executa um ciclo a cada 30 segundos automaticamente.

---

## 3. Análise Técnica — Indicadores

**O que é:**
Biblioteca própria de indicadores quantitativos calculados em TypeScript, sem dependências externas.

**Indicadores disponíveis:**

| Indicador | Parâmetros | O que detecta |
|-----------|-----------|---------------|
| RSI | período 14 | Sobrecompra (>70) / Sobrevenda (<30) |
| MACD | 12/26/9 | Cruzamento de linha de sinal |
| Bollinger Bands | 20 períodos, 2σ | Squeeze / breakout de volatilidade |
| EMA | período configurável | Tendência de longo prazo (200) |
| ATR | período 14 | Volatilidade para stop loss dinâmico |
| Volume Strength | média 20 candles | Volume acima/abaixo da média |

**Onde está no código:**
- `lib/indicators/index.ts`
- Funções exportadas: `calcRSI`, `calcMACD`, `calcBollingerBands`, `calcEMA`, `calcATR`, `calcVolumeStrength`

**Como ver os indicadores ao vivo:**
Os valores aparecem na barra "INDICADORES AO VIVO" do dashboard logo após cada ciclo do bot.

**Mínimo de candles necessário:** 30 (para cálculo estável do RSI e MACD).

---

## 4. Gestão de Risco — Kelly Criterion

**O que é:**
Algoritmo matemático que calcula o tamanho ideal da posição baseado na sua taxa de acerto histórica e relação risco/retorno.

**Fórmula:**
```
f* = (winRate × avgWin - lossRate × avgLoss) / avgLoss
Half-Kelly: f = f* × 0.5  (mais conservador)
Posição = min(f × capital, maxRiskPct × capital)
```

**Com R$ 50 de capital:**
- Kelly completo ≈ 4% = R$ 2,00
- Half-Kelly ≈ 2% = R$ 1,00 por operação
- Perda máxima por trade ≈ R$ 0,015 (stop de 1.5%)

**Onde está no código:**
- `lib/risk/kelly.ts` — função `calcKellyPosition()`

**Como configurar:**
No dashboard, ajuste **Risco por Operação (%)** no painel "Gestão de Risco". Valor recomendado: 2% para capital abaixo de R$ 500.

---

## 5. Stop Loss Dinâmico por ATR

**O que é:**
Em vez de usar um percentual fixo de stop loss (ex: "sempre 2%"), o sistema usa o ATR (Average True Range) — a volatilidade real do ativo no período — para definir onde colocar o stop.

**Vantagem:**
Em mercados calmos, o stop fica mais apertado (menos risco). Em mercados voláteis, o stop abre mais (evita ser estopado por ruído).

**Cálculo:**
```
Stop Loss (BUY)  = entryPrice - (ATR × 2)
Take Profit (BUY) = entryPrice + (ATR × 2 × 1.5)  ← RR 1:1.5
```

**Onde está no código:**
- `lib/risk/stopLoss.ts` — função `calcStopLoss()`

**No sinal gerado:**
```
stopLoss:   94000 - (940 × 2) = 92.120
takeProfit: 94000 + (940 × 3) = 96.820
```

---

## 6. Proteção de Capital — 5 Barreiras

**O que é:**
Sistema de 5 camadas de proteção que torna matematicamente impossível ir a saldo negativo.

**As 5 barreiras:**

| Barreira | Limite | Ação |
|----------|--------|------|
| 1. Kelly Sizing | máx 2% por trade | Limita tamanho da posição |
| 2. ATR Stop Loss | stop dinâmico | Limita perda por trade |
| 3. Limite Diário | máx 6% / dia | Bloqueia novas operações |
| 4. Capital Floor | mínimo R$ 30 | Sistema para se cair abaixo |
| 5. SQL Guard | `check_risk_before_trade()` | Banco de dados rejeita trades proibidos |

**Função SQL no Supabase:**
```sql
SELECT check_risk_before_trade(
  p_user_id := 'seu-uuid',
  p_invested_amount := 1.00,
  p_stop_loss_pct := 0.015
);
-- Retorna: {allowed: true/false, reason, max_loss_this_trade, ...}
```

**Onde está no código:**
- `lib/risk/stopLoss.ts` — `checkRiskBeforeTrade()`
- `supabase/migrations/001_core_tables.sql` — função `check_risk_before_trade()`
- `components/trading/RiskGuard.tsx` — visualização das 5 barreiras

**Como visualizar:**
Acesse `/trading/signals` — o painel lateral "Proteção de Capital" mostra cada barreira com barra de progresso.

---

## 7. Trailing Drawdown / SAFE MODE

**O que é:**
Sistema de proteção automática que monitora o drawdown da banca (queda desde o pico máximo). Quando o drawdown ultrapassa o limite configurado, o sistema entra em SAFE MODE e suspende todas as operações.

**Como funciona:**
```
drawdown = (peakBalance - currentBalance) / peakBalance × 100

Se drawdown > maxDrawdown (padrão: 10%):
  → accountStatus = 'SAFE_MODE'
  → Novas operações bloqueadas
  → Notificação Telegram enviada
```

**Onde está no código:**
- `app/trading/api/cycle/route.ts` — primeira verificação no ciclo do bot
- Dashboard → StatCard "Drawdown" muda de cor: verde < 4%, amarelo 4-7%, vermelho > 7%

**Como sair do SAFE MODE:**
Execute no SQL Editor do Supabase:
```sql
UPDATE profiles
SET account_status = 'ACTIVE', peak_balance = balance
WHERE id = 'seu-uuid';
```

**Como configurar o limite:**
No campo `maxDrawdown` enviado via `/trading/api/cycle` (padrão: 10%).

---

## 8. Machine Learning — Filtro de Sinais

**O que é:**
Modelo de regressão logística treinado com o histórico de trades para filtrar sinais ruins antes da execução. O ML aprende quais combinações de indicadores realmente resultaram em trades lucrativos.

**6 features usadas:**
1. RSI normalizado (0–1)
2. MACD histogram normalizado
3. Bollinger %B (posição dentro das bandas)
4. Volume ratio (volume atual / média)
5. Distância da EMA200 (%)
6. Score de sentimento Fear & Greed (0–1)

**Saída:**
Probabilidade de sucesso (0–1). Se < 0.5, o sinal é vetado pelo ML.

**Onde está no código:**
- `lib/trading/ml-model.ts`
- Funções: `predict()`, `train()`, `trainFromSupabase()`, `saveWeights()`, `loadWeights()`
- Pesos salvos na tabela `ml_weights` do Supabase

**Como treinar o modelo:**
O modelo treina automaticamente após cada trade fechado. Para treinar manualmente com o histórico completo, o método `trainFromSupabase()` busca todos os trades fechados e recalcula os pesos.

**⚠️ Dívida técnica:** O modelo precisa de pelo menos 50 trades históricos para ser efetivo. Com poucos dados, ele aprende pouco e pode vetar sinais bons. Enquanto não há histórico suficiente, o filtro ML tem peso reduzido no voto final.

---

## 9. Análise de Sentimento

**O que é:**
Combina dois feeds de sentimento de mercado para decidir se o ambiente macro é favorável a novas operações.

**Fontes:**
1. **Fear & Greed Index** (Alternative.me) — índice 0-100 do sentimento cripto geral
   - < 25: Extreme Fear → Sistema mais conservador
   - > 75: Extreme Greed → Sistema mais conservador (evita euforia)
2. **Alpha Vantage News Sentiment** — análise de notícias em tempo real (requer API key)

**Lógica de veto:**
Se o sentimento indicar Extreme Fear (< 20) ou Extreme Greed (> 80), novas entradas são vetadas como proteção adicional.

**Onde está no código:**
- `lib/trading/sentiment-tracker.ts`
- `app/trading/api/cycle/route.ts` — etapa 5 do ciclo

**Como configurar:**
Adicione ao `.env.local` para ativar notícias:
```env
ALPHA_VANTAGE_KEY=sua_chave_aqui
```
O Fear & Greed funciona sem chave (API pública).

**Como ver:**
Na barra "INDICADORES AO VIVO" do dashboard: campo **Sentimento**.

---

## 10. Notificações via Telegram

**O que é:**
O bot envia mensagens automáticas para o seu Telegram em 6 eventos diferentes, para que você saiba o que está acontecendo sem precisar olhar o dashboard.

**6 tipos de notificação:**

| Evento | Mensagem |
|--------|----------|
| Trade aberto | Ticker, direção, entrada, stop, alvo, tamanho |
| Trade fechado | PnL realizado, resultado em % |
| Stop Loss atingido | Perda, capital restante |
| Take Profit atingido | Lucro, capital atual |
| SAFE MODE ativado | Drawdown atingido, operações suspensas |
| Erro crítico | Mensagem de erro do sistema |

**Onde está no código:**
- `lib/trading/notification-service.ts`

**Como configurar:**
1. Crie um bot no Telegram via [@BotFather](https://t.me/BotFather)
2. Inicie conversa com o bot para obter o Chat ID
3. Adicione ao `.env.local`:
```env
TELEGRAM_BOT_TOKEN=123456789:ABCdef...
TELEGRAM_CHAT_ID=987654321
```

**Teste rápido:**
```bash
curl "https://api.telegram.org/bot<TOKEN>/sendMessage?chat_id=<CHAT_ID>&text=TradeForge+ativo!"
```

---

## 11. Scanner de Arbitragem

**O que é:**
Compara preços do mesmo ativo em 3 exchanges diferentes para identificar oportunidades de arbitragem (comprar barato em uma exchange, vender caro em outra).

**Exchanges monitoradas:**
- Binance (API pública, sem autenticação)
- Kraken (API pública)
- Coinbase (API pública)

**Cálculo de spread:**
```
spread = (preço_mais_alto - preço_mais_baixo) / preço_mais_baixo × 100
spread_líquido = spread - (taxa_compra + taxa_venda)

Se spread_líquido > 0.3%: oportunidade identificada
```

**Onde está no código:**
- `lib/trading/arbitrage-scanner.ts`
- Interface: `/trading/arbitrage`

**Como usar:**
1. Acesse `/trading/arbitrage` no dashboard
2. O scanner executa automaticamente a cada ciclo
3. Oportunidades aparecem com spread, exchanges e lucro estimado

**⚠️ Importante:** Arbitragem real exige:
- Conta em múltiplas exchanges com saldo
- Execução em milissegundos (robôs profissionais competem)
- No MVP: use para observar spreads, não para executar manualmente

---

## 12. Suporte a Múltiplas Exchanges

**O que é:**
O sistema foi arquitetado para operar em 3 exchanges diferentes, com adaptadores específicos para cada uma.

**Exchanges suportadas:**

| Exchange | Tipo | Autenticação |
|----------|------|-------------|
| Binance Futures | Derivativos (alavancagem) | HMAC-SHA256 |
| Kraken | Spot | API Key + Secret |
| Coinbase | Spot | OAuth / API Key |

**Onde está no código:**
- `lib/trading/execution-engine.ts` — adaptadores de exchange
- Binance: assinatura HMAC-SHA256 com timestamp para cada ordem

**Como adicionar uma exchange:**
Adicione as chaves ao `.env.local`:
```env
# Binance Futures
BINANCE_API_KEY=...
BINANCE_API_SECRET=...

# Kraken (futuro)
KRAKEN_API_KEY=...
KRAKEN_API_SECRET=...
```

**⚠️ MVP:** Apenas Binance Futures está completamente implementado. Kraken e Coinbase estão na arquitetura para expansão futura.

---

## 13. Backtesting Engine

**O que é:**
Simula como a estratégia teria performado em dados históricos antes de arriscar dinheiro real. Essencial para validar qualquer mudança de parâmetros.

**Métricas calculadas:**

| Métrica | O que significa |
|---------|----------------|
| Return % | Retorno total do período |
| Win Rate | % de trades lucrativos |
| Sharpe Ratio | Retorno ajustado ao risco (> 1.5 é bom) |
| Max Drawdown % | Pior queda da banca no período |
| Profit Factor | Lucro bruto / Perda bruta (> 1.3 é bom) |
| Max Consecutive Losses | Pior sequência de perdas |
| `wentNegative` | Se a estratégia teria zerado a conta |

**Onde está no código:**
- `lib/backtest/engine.ts` — função `runBacktest()`
- Interface: `/trading/backtest`

**Como usar:**
1. Acesse `/trading/backtest` no dashboard
2. Selecione o ativo e período
3. Configure os parâmetros (RSI Low/High, capital inicial)
4. Clique em **Rodar Backtest**
5. Analise as métricas antes de mudar qualquer configuração ao vivo

**Recomendação:** Só ative uma estratégia ao vivo se o backtesting mostrar:
- Win Rate > 50%
- Sharpe Ratio > 1.0
- Max Drawdown < 20%
- `wentNegative: false`

---

## 14. Dashboard de Sinais em Tempo Real

**O que é:**
Página dedicada `/trading/signals` que exibe todos os sinais BUY/SELL gerados pelo Signal Engine em tempo real, com alerta sonoro e badge "NOVO" para sinais recém-chegados.

**Funcionalidades:**
- Feed ao vivo via Supabase Realtime (sem polling, sem refresh)
- Badge "NOVO" pulsante por 10 segundos para novos sinais
- Alerta sonoro: BUY = tom agudo (880Hz), SELL = tom grave (440Hz)
- Filtro por direção: TODOS / BUY / SELL
- Painel lateral com RiskGuard (5 barreiras) e posições abertas

**Informações por sinal:**
- Direção (BUY/SELL) com ícone colorido
- Ativo (ticker) e força do sinal (barra de progresso)
- Preço de entrada, Stop Loss, Take Profit
- Indicadores que dispararam (tags)
- Relação Risco/Retorno
- Tamanho sugerido da posição em R$

**Onde está no código:**
- `app/trading/signals/page.tsx`
- `components/trading/SignalCard.tsx`
- `components/trading/RiskGuard.tsx`

**Como acessar:**
Clique em **Sinais Live** no cabeçalho do dashboard, ou acesse diretamente `/trading/signals`.

---

## 15. Rebalanceamento de Portfólio

**O que é:**
O sistema mantém uma alocação-alvo entre os ativos do portfólio e detecta quando a distribuição real se desvia demais do plano, sugerindo rebalanceamento.

**Portfólio-alvo padrão:**

| Ativo | Alocação |
|-------|---------|
| Bitcoin (BTC) | 30% |
| Ethereum (ETH) | 20% |
| Solana (SOL) | 12% |
| BNB | 10% |
| Ripple (XRP) | 8% |
| Cardano (ADA) | 7% |
| Avalanche (AVAX) | 7% |
| Chainlink (LINK) | 6% |

**Onde está no código:**
- `lib/trading/portfolio-manager.ts` — `analyzePortfolio()`, `getRiskPerAsset()`
- `app/trading/dashboard/page.tsx` — componente `PortfolioPanel`

**Como o rebalanceamento funciona:**
```typescript
// Se a alocação real desviar > threshold da alocação-alvo:
if (Math.abs(currentAlloc - targetAlloc) > threshold) {
  // Gera recomendação: comprar ou vender o ativo
}
```

**Como usar:**
O `PortfolioPanel` no dashboard mostra as alocações atuais e preços ao vivo. O `PortfolioManager` é chamado automaticamente no ciclo do bot para ajustar exposição.

---

## 16. Supabase Realtime — Live Feed

**O que é:**
Infraestrutura de streaming de dados que permite que o dashboard receba novos sinais e atualizações de posições em tempo real, sem fazer polling (sem recarregar a página ou checar a cada X segundos).

**Tabelas com Realtime ativo:**
- `signals` — novos sinais gerados pelo engine
- `positions` — abertura e fechamento de posições
- `candles` — novos candles recebidos

**Como funciona:**
O PostgreSQL do Supabase usa publicações lógicas (`supabase_realtime`). Quando um novo registro é inserido, o Supabase envia um evento via WebSocket para todos os clientes inscritos.

**Código de inscrição:**
```typescript
supabase
  .channel('signals-live')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'signals'
  }, (payload) => {
    // payload.new = novo sinal
    setSignals(prev => [payload.new, ...prev]);
  })
  .subscribe();
```

**Onde está no código:**
- `app/trading/signals/page.tsx` — inscrição e handler de eventos
- `supabase/migrations/001_core_tables.sql` — `alter publication supabase_realtime add table signals`

**Status atual:** Realtime ativo e confirmado via `pg_publication_tables`.

---

## 17. Ciclo Automático do Bot

**O que é:**
O pipeline completo que o bot executa a cada 30 segundos quando ativado. São 6 etapas em sequência, cada uma podendo vetar a operação.

**As 6 etapas:**

```
CICLO DO BOT (a cada 30 segundos)
│
├─ 1. Trailing Drawdown Check
│     "A banca caiu mais que X% desde o pico?"
│     SE SIM → SAFE MODE → ciclo interrompido
│
├─ 2. Análise Técnica
│     Calcula RSI, MACD, BB, EMA200, ATR, Volume
│     Gera score 0-100 com base nos indicadores
│
├─ 3. Gestão de Posições Abertas
│     Verifica trailing stop em posições existentes
│     Fecha posição se stop loss / take profit atingido
│
├─ 4. Filtro ML
│     Regressão logística com 6 features
│     SE probabilidade < 0.5 → VETADO
│
├─ 5. Veto de Sentimento
│     Consulta Fear & Greed + notícias
│     SE extreme fear/greed → VETADO
│
└─ 6. Execução
      Verifica check_risk_before_trade() no Supabase
      SE permitido → abre posição (PAPER ou LIVE)
      Envia notificação Telegram
```

**Onde está no código:**
- `app/trading/api/cycle/route.ts` — endpoint POST `/trading/api/cycle`

**Como ativar:**
Clique em **INICIAR BOT** no dashboard. Para parar, clique em **PARAR BOT**.

**Como monitorar:**
O console do dashboard exibe o log de cada ciclo com timestamp. Os indicadores ao vivo são atualizados após cada ciclo.

---

## Configuração Completa do .env.local

```env
# ── OBRIGATÓRIO ──────────────────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...

# ── TRADING REAL (ativa modo LIVE) ───────────────────────
BINANCE_API_KEY=sua_chave
BINANCE_API_SECRET=sua_secret

# ── NOTIFICAÇÕES ─────────────────────────────────────────
TELEGRAM_BOT_TOKEN=123456:ABCdef...
TELEGRAM_CHAT_ID=987654321

# ── SENTIMENTO (opcional) ────────────────────────────────
ALPHA_VANTAGE_KEY=sua_chave
```

---

## Tabelas do Banco de Dados

| Tabela | Propósito |
|--------|-----------|
| `signals` | Sinais BUY/SELL gerados pelo engine |
| `positions` | Posições abertas e fechadas |
| `candles` | OHLCV histórico por ativo |
| `risk_config` | Configuração de risco por usuário |
| `assets` | Ativos monitorados |
| `strategies` | Estratégias configuradas |
| `backtest_results` | Resultados de backtesting salvos |
| `portfolio_snapshots` | Histórico de alocação do portfólio |
| `ml_weights` | Pesos do modelo de ML (atualizados em tempo real) |
| `trades` | Histórico de trades executados |
| `profiles` | Saldo, pico e status da conta |

---

## Resumo de Moedas Disponíveis

O dashboard suporta análise e operação nas seguintes moedas:

| Ticker | Nome | Características |
|--------|------|----------------|
| BTCUSDT | Bitcoin | Maior liquidez, spread menor |
| ETHUSDT | Ethereum | Alta liquidez, volátil |
| SOLUSDT | Solana | Alta volatilidade, bons sinais de curto prazo |
| BNBUSDT | BNB | Correlacionado com Binance |
| XRPUSDT | Ripple | Sensível a notícias regulatórias |
| ADAUSDT | Cardano | Menor volatilidade |
| DOGEUSDT | Dogecoin | Alta volatilidade, sensível a redes sociais |
| AVAXUSDT | Avalanche | Ecossistema DeFi ativo |
| LINKUSDT | Chainlink | Oracle, menos correlacionado com BTC |
| MATICUSDT | Polygon | Layer 2 Ethereum |
| DOTUSDT | Polkadot | Interoperabilidade |

---

*TradeForge Sovereign — Features Manual v3.0*
*"Com R$ 50 e as ferramentas certas, você aprende mais do que com R$ 50.000 sem metodologia."*
