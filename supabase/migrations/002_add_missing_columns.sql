-- ============================================================
-- MIGRATION 002 — Adiciona colunas que faltavam na tabela trades
-- Execute se você já criou a tabela trades manualmente antes
-- ============================================================

-- Adiciona stop_loss se não existir
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trades' AND column_name = 'stop_loss'
  ) THEN
    ALTER TABLE trades ADD COLUMN stop_loss NUMERIC(16, 6);
  END IF;
END $$;

-- Adiciona take_profit se não existir
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trades' AND column_name = 'take_profit'
  ) THEN
    ALTER TABLE trades ADD COLUMN take_profit NUMERIC(16, 6);
  END IF;
END $$;

-- Adiciona take_profit em active_positions se não existir
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'active_positions' AND column_name = 'take_profit'
  ) THEN
    ALTER TABLE active_positions ADD COLUMN take_profit NUMERIC(16, 6);
  END IF;
END $$;

-- Adiciona updated_at em active_positions se não existir
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'active_positions' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE active_positions ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;

-- Garante a constraint UNIQUE em active_positions.symbol
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'active_positions_symbol_key'
  ) THEN
    ALTER TABLE active_positions ADD CONSTRAINT active_positions_symbol_key UNIQUE (symbol);
  END IF;
END $$;
