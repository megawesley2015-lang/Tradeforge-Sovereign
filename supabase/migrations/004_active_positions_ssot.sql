-- ============================================================
-- MIGRATION 004 — active_positions: campos SSOT (v2 do ciclo)
-- ──────────────────────────────────────────────────────────────
-- Adiciona os campos necessários para o stepPosition() do
-- strategy-engine funcionar corretamente com o bot ao vivo.
--
-- Sem esses campos, o ciclo estimará os valores a partir dos
-- dados existentes (compatibilidade retroativa), mas para
-- novos trades a persistência será completa.
--
-- Novos campos:
--   risk_amount    → $ arriscado no trade (já com slippage)
--   risk_distance  → rd em $ (distância do stop em dólares)
--   peak_price     → maior preço atingido (trailing stop)
--   t1_hit         → TP1 foi tocado? (saída em camadas)
--   t2_hit         → TP2 foi tocado? (saída em camadas)
--   partial_profit → lucro parcial já realizado ($)
--   tp1            → nível de Take Profit 1 (1:1)
--   tp2            → nível de Take Profit 2 (R:R/2)
--   candles_open   → quantos candles a posição está aberta
--
-- Também adiciona índice de diagnóstico em trades:
--   adx_at_entry, atr_at_entry, effective_risk
-- ============================================================

-- ── active_positions ─────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'active_positions' AND column_name = 'risk_amount'
  ) THEN
    ALTER TABLE active_positions ADD COLUMN risk_amount NUMERIC(16, 6);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'active_positions' AND column_name = 'risk_distance'
  ) THEN
    ALTER TABLE active_positions ADD COLUMN risk_distance NUMERIC(16, 6);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'active_positions' AND column_name = 'peak_price'
  ) THEN
    ALTER TABLE active_positions ADD COLUMN peak_price NUMERIC(16, 6);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'active_positions' AND column_name = 't1_hit'
  ) THEN
    ALTER TABLE active_positions ADD COLUMN t1_hit BOOLEAN DEFAULT false;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'active_positions' AND column_name = 't2_hit'
  ) THEN
    ALTER TABLE active_positions ADD COLUMN t2_hit BOOLEAN DEFAULT false;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'active_positions' AND column_name = 'partial_profit'
  ) THEN
    ALTER TABLE active_positions ADD COLUMN partial_profit NUMERIC(16, 6) DEFAULT 0;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'active_positions' AND column_name = 'tp1'
  ) THEN
    ALTER TABLE active_positions ADD COLUMN tp1 NUMERIC(16, 6);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'active_positions' AND column_name = 'tp2'
  ) THEN
    ALTER TABLE active_positions ADD COLUMN tp2 NUMERIC(16, 6);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'active_positions' AND column_name = 'candles_open'
  ) THEN
    ALTER TABLE active_positions ADD COLUMN candles_open INTEGER DEFAULT 0;
  END IF;
END $$;

-- ── trades: campos de diagnóstico ────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trades' AND column_name = 'adx_at_entry'
  ) THEN
    ALTER TABLE trades ADD COLUMN adx_at_entry NUMERIC(8, 2);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trades' AND column_name = 'atr_at_entry'
  ) THEN
    ALTER TABLE trades ADD COLUMN atr_at_entry NUMERIC(16, 6);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trades' AND column_name = 'stop_dist_pct_at_entry'
  ) THEN
    ALTER TABLE trades ADD COLUMN stop_dist_pct_at_entry NUMERIC(8, 6);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trades' AND column_name = 'effective_risk'
  ) THEN
    ALTER TABLE trades ADD COLUMN effective_risk NUMERIC(8, 6);
  END IF;
END $$;

-- ── Comentários de documentação ───────────────────────────────
COMMENT ON COLUMN active_positions.risk_amount    IS 'Dollar amount at risk, net of slippage';
COMMENT ON COLUMN active_positions.risk_distance  IS 'Stop distance in dollars (rd = entryPrice * stopDistPct)';
COMMENT ON COLUMN active_positions.peak_price     IS 'Highest favorable price reached (used by trailing stop)';
COMMENT ON COLUMN active_positions.t1_hit         IS 'True when TP1 was hit (partial exit layer 1 executed)';
COMMENT ON COLUMN active_positions.t2_hit         IS 'True when TP2 was hit (partial exit layer 2 executed)';
COMMENT ON COLUMN active_positions.partial_profit IS 'Profit already locked from partial exits ($)';
COMMENT ON COLUMN active_positions.tp1            IS 'Take Profit level 1 — 1:1 R:R';
COMMENT ON COLUMN active_positions.tp2            IS 'Take Profit level 2 — minRiskReward/2 R:R';
COMMENT ON COLUMN active_positions.candles_open   IS 'Number of candles elapsed since position open (for time exit)';
COMMENT ON COLUMN trades.adx_at_entry             IS 'ADX value when trade was opened (trend strength diagnostic)';
COMMENT ON COLUMN trades.atr_at_entry             IS 'ATR value when trade was opened (volatility diagnostic)';
COMMENT ON COLUMN trades.stop_dist_pct_at_entry   IS 'Stop distance as % of price at entry';
COMMENT ON COLUMN trades.effective_risk           IS 'Effective risk % applied after progressive risk adjustment';
