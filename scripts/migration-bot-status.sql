-- ================================================================
-- Migration: bot_status table
-- Armazena o estado global do bot (ligado/desligado).
-- O dashboard escreve aqui; o bot lê no início de cada ciclo.
-- ================================================================

CREATE TABLE IF NOT EXISTS bot_status (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enabled     boolean  NOT NULL DEFAULT false,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  text     -- 'dashboard' | 'vps-bot' | 'api'
);

-- Garante que só existe uma linha (singleton pattern)
CREATE UNIQUE INDEX IF NOT EXISTS bot_status_singleton ON bot_status ((true));

-- Insere o registro inicial se não existir
INSERT INTO bot_status (enabled, updated_by)
VALUES (false, 'migration')
ON CONFLICT DO NOTHING;

-- RLS
ALTER TABLE bot_status ENABLE ROW LEVEL SECURITY;

-- Leitura pública (o bot lê com anon key)
CREATE POLICY "bot_status_read_public"
  ON bot_status FOR SELECT
  USING (true);

-- Escrita apenas com service_role (bot) ou usuário autenticado (dashboard)
CREATE POLICY "bot_status_write_authenticated"
  ON bot_status FOR UPDATE
  USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');
