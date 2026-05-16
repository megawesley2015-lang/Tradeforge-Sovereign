-- ============================================================
-- Migration 003: Tabela ml_weights
-- Armazena os pesos do modelo de Regressão Logística treinado.
-- Um único registro (id=1) é mantido com upsert.
-- ============================================================

CREATE TABLE IF NOT EXISTS ml_weights (
  id              INTEGER PRIMARY KEY DEFAULT 1,
  weights         JSONB     NOT NULL DEFAULT '[]',
  bias            FLOAT     NOT NULL DEFAULT 0,
  trained_on      INTEGER   NOT NULL DEFAULT 0,
  accuracy        FLOAT     NOT NULL DEFAULT 0,
  last_trained_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Garante que só existe 1 linha
  CONSTRAINT ml_weights_single CHECK (id = 1)
);

-- Trigger de updated_at
CREATE OR REPLACE FUNCTION update_ml_weights_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ml_weights_updated_at ON ml_weights;
CREATE TRIGGER ml_weights_updated_at
  BEFORE UPDATE ON ml_weights
  FOR EACH ROW EXECUTE FUNCTION update_ml_weights_updated_at();

-- RLS: somente leitura anônima; escrita apenas via service_role
ALTER TABLE ml_weights ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ml_weights_select" ON ml_weights;
CREATE POLICY "ml_weights_select"
  ON ml_weights FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "ml_weights_upsert" ON ml_weights;
CREATE POLICY "ml_weights_upsert"
  ON ml_weights FOR ALL
  USING     (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ============================================================
-- Colunas de indicadores na tabela trades
-- Para que o modelo ML possa aprender com dados históricos reais.
-- ============================================================

DO $$
BEGIN
  -- RSI no momento da entrada
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='trades' AND column_name='rsi_at_entry'
  ) THEN
    ALTER TABLE trades ADD COLUMN rsi_at_entry FLOAT;
  END IF;

  -- EMA200 no momento da entrada
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='trades' AND column_name='ema200_at_entry'
  ) THEN
    ALTER TABLE trades ADD COLUMN ema200_at_entry FLOAT;
  END IF;

  -- MACD Histogram no momento da entrada
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='trades' AND column_name='macd_hist_at_entry'
  ) THEN
    ALTER TABLE trades ADD COLUMN macd_hist_at_entry FLOAT;
  END IF;

  -- Bollinger Band Superior no momento da entrada
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='trades' AND column_name='bb_upper_at_entry'
  ) THEN
    ALTER TABLE trades ADD COLUMN bb_upper_at_entry FLOAT;
  END IF;

  -- Bollinger Band Inferior no momento da entrada
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='trades' AND column_name='bb_lower_at_entry'
  ) THEN
    ALTER TABLE trades ADD COLUMN bb_lower_at_entry FLOAT;
  END IF;

  -- Volume no momento da entrada
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='trades' AND column_name='volume_at_entry'
  ) THEN
    ALTER TABLE trades ADD COLUMN volume_at_entry FLOAT;
  END IF;

  -- Volume médio 20p no momento da entrada
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='trades' AND column_name='avg_volume_at_entry'
  ) THEN
    ALTER TABLE trades ADD COLUMN avg_volume_at_entry FLOAT;
  END IF;

  -- Score do modelo ML no momento da entrada (0-100)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='trades' AND column_name='ml_probability'
  ) THEN
    ALTER TABLE trades ADD COLUMN ml_probability FLOAT;
  END IF;

  -- Confiança ML: LOW | MEDIUM | HIGH
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='trades' AND column_name='ml_confidence'
  ) THEN
    ALTER TABLE trades ADD COLUMN ml_confidence TEXT;
  END IF;
END $$;
