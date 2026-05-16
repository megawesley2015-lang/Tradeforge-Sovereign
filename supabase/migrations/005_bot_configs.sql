-- ============================================================
-- MIGRATION 005 — Tabela bot_configs
-- ──────────────────────────────────────────────────────────────
-- Armazena configurações de estratégia validadas pelo backtest.
-- O bot real lê a config com active = true na inicialização,
-- garantindo que os parâmetros de produção sejam idênticos
-- aos que foram testados.
--
-- Campos:
--   name                 → nome da config (ex: "BTC+ETH 4h v3")
--   config               → StrategyConfig completa como JSONB
--   assets               → símbolos do portfólio testado
--   backtest_net_pct     → lucro líquido % no backtest
--   backtest_win_rate    → win rate % no backtest
--   backtest_max_drawdown → drawdown máximo no backtest
--   active               → true = o bot usa esta config
--   updated_at           → última atualização
-- ============================================================

CREATE TABLE IF NOT EXISTS bot_configs (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT        NOT NULL,
  config                JSONB       NOT NULL,
  assets                TEXT[]      NOT NULL DEFAULT '{}',
  backtest_net_pct      NUMERIC(10, 4),
  backtest_win_rate     NUMERIC(8,  4),
  backtest_max_drawdown NUMERIC(8,  4),
  active                BOOLEAN     NOT NULL DEFAULT false,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Só uma config pode estar ativa por vez
-- (constraint parcial: apenas uma linha com active = true)
CREATE UNIQUE INDEX IF NOT EXISTS bot_configs_single_active
  ON bot_configs (active)
  WHERE active = true;

-- RLS: dono pode ler/escrever; anon pode ler configs ativas
ALTER TABLE bot_configs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'bot_configs' AND policyname = 'read_active_configs'
  ) THEN
    CREATE POLICY read_active_configs ON bot_configs
      FOR SELECT USING (true);  -- qualquer cliente pode ler (anon key)
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'bot_configs' AND policyname = 'write_configs'
  ) THEN
    CREATE POLICY write_configs ON bot_configs
      FOR ALL USING (true);  -- MVP: permite escrita com anon key
      -- Em produção, trocar para: auth.role() = 'authenticated'
  END IF;
END $$;

-- Comentários
COMMENT ON TABLE  bot_configs               IS 'Configurações de estratégia validadas pelo backtest';
COMMENT ON COLUMN bot_configs.config        IS 'StrategyConfig completa — mesmo objeto usado no backtest';
COMMENT ON COLUMN bot_configs.assets        IS 'Símbolos testados (ex: {BTCUSDT, ETHUSDT})';
COMMENT ON COLUMN bot_configs.active        IS 'Se true, o bot real usa esta config na próxima inicialização';
