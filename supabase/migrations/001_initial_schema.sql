-- ============================================================
-- TRADEFORGE SOVEREIGN — Schema Inicial
-- Execute este script no SQL Editor do seu projeto Supabase
-- ============================================================

-- -----------------------------------------------------------
-- TABELA: profiles (banca e estado do usuário)
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS profiles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  balance         NUMERIC(12, 2) NOT NULL DEFAULT 1000.00,
  peak_balance    NUMERIC(12, 2) NOT NULL DEFAULT 1000.00,
  account_status  TEXT NOT NULL DEFAULT 'ACTIVE'
                  CHECK (account_status IN ('ACTIVE', 'SAFE_MODE', 'PAUSED')),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: só o dono vê seu próprio perfil
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Perfil visível apenas ao dono"
  ON profiles FOR ALL
  USING (auth.uid() = user_id);

-- -----------------------------------------------------------
-- TABELA: trades (histórico completo de operações)
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS trades (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol          TEXT NOT NULL,
  side            TEXT NOT NULL CHECK (side IN ('LONG', 'SHORT')),
  entry_price     NUMERIC(16, 6) NOT NULL,
  exit_price      NUMERIC(16, 6),
  stop_loss       NUMERIC(16, 6),          -- novo: stop inicial calculado
  take_profit     NUMERIC(16, 6),          -- novo: alvo calculado
  position_size   NUMERIC(16, 8) NOT NULL,
  pnl             NUMERIC(12, 4),
  status          TEXT NOT NULL DEFAULT 'OPEN'
                  CHECK (status IN ('OPEN', 'CLOSED', 'CANCELLED')),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: público para leitura (listagem), gravação aberta no MVP
ALTER TABLE trades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Trades visíveis publicamente"
  ON trades FOR SELECT USING (true);
CREATE POLICY "Qualquer um pode inserir trade"
  ON trades FOR INSERT WITH CHECK (true);
CREATE POLICY "Qualquer um pode atualizar trade"
  ON trades FOR UPDATE USING (true);

-- Index para queries frequentes
CREATE INDEX IF NOT EXISTS idx_trades_symbol_status ON trades(symbol, status);
CREATE INDEX IF NOT EXISTS idx_trades_created_at    ON trades(created_at DESC);

-- -----------------------------------------------------------
-- TABELA: active_positions (posições abertas para trailing stop)
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS active_positions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol              TEXT NOT NULL UNIQUE,   -- uma posição por ativo
  side                TEXT NOT NULL CHECK (side IN ('LONG', 'SHORT')),
  entry_price         NUMERIC(16, 6) NOT NULL,
  current_stop_loss   NUMERIC(16, 6) NOT NULL,
  take_profit         NUMERIC(16, 6),
  position_size       NUMERIC(16, 8) NOT NULL,
  opened_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE active_positions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Posições ativas visíveis publicamente"
  ON active_positions FOR ALL USING (true);

-- -----------------------------------------------------------
-- FUNÇÃO: atualiza updated_at automaticamente
-- -----------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at_profiles
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at_trades
  BEFORE UPDATE ON trades
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at_active_positions
  BEFORE UPDATE ON active_positions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- -----------------------------------------------------------
-- SEED: cria um perfil padrão para MVP (sem auth)
-- Em produção, remova este seed e use auth.users
-- -----------------------------------------------------------
INSERT INTO profiles (balance, peak_balance, account_status)
VALUES (1000.00, 1000.00, 'ACTIVE')
ON CONFLICT DO NOTHING;
