# Guia de Setup — Binance Futures Testnet

## O que é o Testnet?

O Testnet é um ambiente da Binance idêntico ao real, mas com **dinheiro fictício**.
Você usa as mesmas APIs, as mesmas regras de ordem, a mesma estrutura de dados — sem arriscar nenhum centavo.

**Use o Testnet por pelo menos 48-72h antes de qualquer dinheiro real.**

---

## Passo 1 — Obter chaves do Testnet

1. Acesse **https://testnet.binancefuture.com**
2. Clique em **"Login"** → faça login com sua conta **GitHub**
3. No menu superior, clique em **"API Key"**
4. Clique em **"Generate Key"**
5. Copie a **API Key** e o **Secret Key** — você não verá o Secret novamente!

> As chaves do Testnet são **completamente diferentes** das chaves da Binance real.
> Não misture os dois.

---

## Passo 2 — Configurar o .env.local

Abra o arquivo `.env.local` e atualize estas linhas:

```env
# Chaves do TESTNET (não as da conta real!)
BINANCE_API_KEY=sua_api_key_do_testnet_aqui
BINANCE_API_SECRET=seu_secret_do_testnet_aqui

# OBRIGATÓRIO: deve ser false para usar o Testnet
BINANCE_LIVE_MODE=false

# Mantenha true durante os primeiros testes (bot roda mas não envia ordens)
DRY_RUN=true
```

---

## Passo 3 — Adicionar saldo fictício no Testnet

1. No painel do Testnet, clique em **"Assets"** (canto superior direito)
2. Clique em **"Deposit"** ao lado de USDT
3. Clique em **"Get"** — o sistema adiciona automaticamente 10.000 USDT fictícios

---

## Passo 4 — Validar a conexão

Rode o script de validação:

```bash
npx tsx scripts/test-testnet.ts
```

O script vai verificar:
- Conectividade com o Testnet
- Autenticação das chaves
- Saldo disponível
- Regras de precisão dos pares (LOT_SIZE, PRICE_FILTER)
- Se as ordens calculadas são válidas para o seu capital

---

## Passo 5 — Rodar o bot com DRY_RUN=true

```bash
npx tsx bot/start.ts
```

Com `DRY_RUN=true`, o bot:
- Busca candles reais da Binance
- Calcula sinais com a estratégia real
- Registra tudo no Supabase
- Notifica via Telegram
- **Mas não envia nenhuma ordem**

Deixe rodar por 24h. Observe os sinais no Telegram.

---

## Passo 6 — Ativar ordens no Testnet (DRY_RUN=false)

Quando estiver confiante nos sinais, mude no `.env.local`:

```env
DRY_RUN=false
BINANCE_LIVE_MODE=false  # continua no Testnet!
```

Agora o bot vai enviar ordens reais **no Testnet** (com dinheiro fictício).
Verifique as ordens no painel: https://testnet.binancefuture.com/en/futures/BTCUSDT

---

## Passo 7 — Cheklist antes de ir LIVE

Só mude `BINANCE_LIVE_MODE=true` quando:

- [ ] 48-72h de Testnet com DRY_RUN=false sem crashes
- [ ] Pelo menos 3-5 trades completos (abertos e fechados) sem erro
- [ ] Ordens SL/TP aparecem corretamente no painel da Binance
- [ ] Telegram notifica entrada e saída corretamente
- [ ] Nenhuma ordem rejeitada por LOT_SIZE ou PRICE_FILTER nos logs
- [ ] Saldo sincronizado corretamente no Supabase
- [ ] Você entende que R$143 (~$26 USD) é capital muito baixo para Futures

---

## Aviso de Risco

> Com R$143 (~$26 USD), a margem de manobra é extremamente pequena.
> A Binance Futures tem notional mínimo por ordem (~$5-20 dependendo do par).
> Com 2% de risco por trade, o sistema bloqueará a maioria dos trades por capital insuficiente.
>
> **Recomendação:** use o período de testnet para acumular mais capital antes de ir live.
> O mínimo prático para Futures com gestão de risco real é **~$100-200 USD**.

---

## Monitoramento durante o Testnet

| O que checar | Onde ver |
|---|---|
| Ordens abertas | https://testnet.binancefuture.com → Posições |
| Notificações de sinal | Telegram |
| Histórico de trades | Supabase → tabela `live_demo_trades` |
| Logs do bot | Terminal / PM2: `pm2 logs` |
| Saldo simulado | Dashboard → `/trading/dashboard` |
