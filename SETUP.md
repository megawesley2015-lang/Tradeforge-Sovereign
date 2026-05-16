# ⚙️ TRADEFORGE SOVEREIGN — Guia de Setup Completo

> Siga este guia na ordem exata. Cada passo tem um check ✅

---

## PARTE 1 — Aplicar a Migration no Supabase

### Passo 1 — Abrir o SQL Editor do Supabase

1. Acesse https://supabase.com e faça login
2. Clique no seu projeto
3. No menu lateral: **SQL Editor** → **New query**

### Passo 2 — Colar e executar a migration

1. Abra o arquivo `supabase/migrations/001_core_tables.sql`
2. Copie todo o conteúdo (Ctrl+A → Ctrl+C)
3. Cole no SQL Editor do Supabase
4. Clique em **Run** (ou Ctrl+Enter)

> ⚠️ Se der erro em `alter publication supabase_realtime add table signals;`
> é porque o Realtime já está ativo. Pode ignorar esse erro específico.

### Passo 3 — Verificar se as tabelas foram criadas

Execute no SQL Editor:

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
```

Você deve ver: `assets`, `backtest_results`, `candles`, `portfolio_snapshots`,
`positions`, `risk_config`, `signals`, `strategies`

### Passo 4 — Ativar Realtime nas tabelas

No Supabase Dashboard:
1. Vá em **Database** → **Replication**
2. Certifique que `signals`, `positions` e `candles` estão com toggle ATIVADO
3. Se não estiver, ative e salve

---

## PARTE 2 — Configurar Variáveis de Ambiente

### Passo 5 — Criar o arquivo .env.local

Na raiz do projeto `tradeforge-sovereign/`, crie o arquivo `.env.local`:

```env
# Supabase (pegue no Dashboard → Settings → API)
NEXT_PUBLIC_SUPABASE_URL=https://SEU_PROJETO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...sua_anon_key
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...sua_service_role_key
```

> 📍 Onde encontrar:
> Supabase Dashboard → seu projeto → **Settings** → **API**
> - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
> - `anon public` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
> - `service_role secret` → `SUPABASE_SERVICE_ROLE_KEY`

---

## PARTE 3 — Inserir sua Configuração de Risco

### Passo 6 — Criar um usuário de teste

No Supabase Dashboard:
1. **Authentication** → **Users** → **Add user**
2. Email: seu email
3. Senha: qualquer senha segura
4. Copie o UUID do usuário criado

### Passo 7 — Inserir risk_config com R$ 50

Execute no SQL Editor (substitua o UUID):

```sql
INSERT INTO risk_config (
  user_id,
  initial_capital,
  available_capital,
  max_risk_per_trade,
  max_daily_loss_pct,
  max_open_positions,
  min_capital_floor,
  daily_loss_amount,
  trading_halted
) VALUES (
  'SEU-UUID-AQUI',  -- cole o UUID do usuário
  50.00,             -- capital inicial: R$ 50
  50.00,             -- capital disponível: R$ 50
  0.02,              -- máx 2% por trade = R$ 1,00
  0.06,              -- máx 6% de perda/dia = R$ 3,00
  3,                 -- máx 3 posições abertas
  30.00,             -- nunca opera abaixo de R$ 30
  0.00,              -- perda de hoje: R$ 0,00
  false              -- sistema ativo
);
```

### Passo 8 — Verificar a configuração de risco

```sql
-- Testa a função de proteção antes de um trade hipotético
SELECT check_risk_before_trade(
  p_user_id        := 'SEU-UUID-AQUI',
  p_invested_amount := 1.00,   -- R$ 1,00 de posição (2% de R$ 50)
  p_stop_loss_pct   := 0.015   -- 1.5% de stop loss
);
```

**Resposta esperada:**
```json
{
  "allowed": true,
  "max_loss_this_trade": 0.015,
  "remaining_daily_budget": 3.00,
  "positions_remaining": 3
}
```

---

## PARTE 4 — Testar o SignalEngine via API

### Passo 9 — Rodar o projeto localmente

```bash
cd tradeforge-sovereign
npm install
npm run dev
```

Acesse http://localhost:3000

### Passo 10 — Inserir um sinal de teste manualmente

Execute no SQL Editor do Supabase:

```sql
INSERT INTO signals (
  ticker,
  direction,
  strength,
  rsi_value,
  macd_histogram,
  entry_price,
  stop_loss,
  take_profit,
  suggested_size,
  indicators_fired,
  status
) VALUES (
  'BTCUSDT',
  'BUY',
  0.80,
  28.5,
  0.00045,
  95000.00,
  93100.00,  -- stop loss: ATR × 2 abaixo
  97850.00,  -- take profit: RR 1:1.5
  1.00,      -- R$ 1,00 (2% de R$ 50)
  ARRAY['RSI_OVERSOLD(28.5)', 'MACD_BULLISH_CROSS'],
  'ACTIVE'
);
```

### Passo 11 — Verificar no dashboard de sinais

1. Acesse http://localhost:3000/trading/signals
2. O sinal BUY de BTCUSDT deve aparecer **instantaneamente** (Realtime)
3. Deve exibir: entrada, stop, alvo, força 80%, indicadores disparados

### Passo 12 — Testar via API REST

Abra um terminal e execute:

```bash
curl -X POST http://localhost:3000/api/signals \
  -H "Content-Type: application/json" \
  -d '{
    "ticker": "PETR4",
    "candles": [
      {"open":38.1,"high":38.5,"low":37.9,"close":38.2,"volume":100000,"timestamp":"2026-05-01T09:00:00Z"},
      {"open":38.2,"high":38.8,"low":38.0,"close":38.6,"volume":120000,"timestamp":"2026-05-01T09:01:00Z"},
      {"open":38.6,"high":38.9,"low":38.3,"close":38.4,"volume":90000,"timestamp":"2026-05-01T09:02:00Z"}
    ],
    "config": {
      "capitalTotal": 50,
      "maxRiskPct": 0.02
    }
  }'
```

> ⚠️ Você precisa de pelo menos 30 candles para gerar um sinal válido.
> Com 3 candles o retorno será `direction: HOLD` (comportamento correto).

---

## PARTE 5 — Verificar o Realtime em tempo real

### Passo 13 — Teste de Realtime no browser

1. Abra http://localhost:3000/trading/signals em uma aba
2. Abra o SQL Editor do Supabase em outra aba
3. Execute o INSERT do Passo 10 novamente
4. Volte para a aba do dashboard
5. O sinal deve aparecer **sem recarregar a página** com o badge "NOVO"

---

## PARTE 6 — Checklist Final

```
[ ] Migration aplicada (8 tabelas criadas)
[ ] Realtime ativado nas 3 tabelas (signals, positions, candles)
[ ] .env.local configurado com as 3 variáveis
[ ] risk_config inserido com capital R$ 50
[ ] check_risk_before_trade retornou allowed: true
[ ] npm run dev rodando sem erros
[ ] Sinal de teste apareceu em /trading/signals
[ ] Badge "NOVO" apareceu sem reload (Realtime funcionando)
[ ] Link "Sinais Live" aparece no dashboard principal
```

---

## Problemas Comuns

| Erro | Causa | Solução |
|---|---|---|
| `supabase_realtime` erro na migration | Tabela já publicada | Ignorar esse erro específico |
| Sinal não aparece em tempo real | Realtime desativado | Ativar em Database → Replication |
| `column "X" of relation "Y" does not exist` | Migration incompleta | Reexecutar a migration inteira |
| `Invalid API key` | .env.local incorreto | Copiar novamente do Supabase Settings → API |
| `Cannot find module '@/lib/indicators'` | npm install não rodou | Rodar `npm install` |
| Dashboard de sinais vazio | Nenhum sinal no banco | Executar INSERT do Passo 10 |

---

*TradeForge Sovereign — Setup Guide v1.0*
