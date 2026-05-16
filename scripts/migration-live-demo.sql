-- =============================================================
-- TRADEFORGE SOVEREIGN — Live Demo Migration
-- Rodar no Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- =============================================================

-- ── Tabela: live_demo_trades ───────────────────────────────────
-- Registra cada trade simulado pelo bot (Dry Run / Paper Trading)

CREATE TABLE IF NOT EXISTS live_demo_trades (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol           TEXT        NOT NULL,
  signal           TEXT        NOT NULL,           -- 'LONG' | 'SHORT'
  entry_price      NUMERIC(18,8) NOT NULL,
  stop_price       NUMERIC(18,8),
  tp1_price        NUMERIC(18,8),
  tp2_price        NUMERIC(18,8),
  tp3_price        NUMERIC(18,8),
  risk_amount      NUMERIC(18,8),
  status           TEXT        DEFAULT 'OPEN',     -- 'OPEN' | 'CLOSED_WIN' | 'CLOSED_LOSS' | 'CLOSED_TIME' | 'CLOSED_EOD'
  exit_price       NUMERIC(18,8),
  profit_usd       NUMERIC(18,8),
  profit_pct       NUMERIC(10,4),
  exit_reason      TEXT,
  interval         TEXT        NOT NULL,            -- '15m' | '1h' | '4h' | '1d'
  balance_before   NUMERIC(18,8),
  balance_after    NUMERIC(18,8),
  adx              NUMERIC(10,4),
  volume_ratio     NUMERIC(10,4),
  votes_long       INTEGER,
  votes_short      INTEGER,
  btc_regime       TEXT        DEFAULT 'NORMAL',   -- 'NORMAL' | 'RISK_OFF'
  dry_run          BOOLEAN     DEFAULT TRUE,        -- sempre TRUE no paper trading
  candle_timestamp BIGINT,                          -- timestamp do candle de entrada (ms)
  opened_at        TIMESTAMPTZ DEFAULT NOW(),
  closed_at        TIMESTAMPTZ,
  notes            TEXT                             -- observações livres
);

-- Índices para queries rápidas no dashboard
CREATE INDEX IF NOT EXISTS idx_live_demo_symbol   ON live_demo_trades (symbol);
CREATE INDEX IF NOT EXISTS idx_live_demo_status   ON live_demo_trades (status);
CREATE INDEX IF NOT EXISTS idx_live_demo_opened   ON live_demo_trades (opened_at DESC);

-- RLS: leitura pública, escrita apenas via service role (bot na VPS)
ALTER TABLE live_demo_trades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "live_demo_public_read"
  ON live_demo_trades FOR SELECT
  USING (true);

CREATE POLICY "live_demo_service_write"
  ON live_demo_trades FOR ALL
  USING (auth.role() = 'service_role');


-- ── Tabela: market_analytics ────────────────────────────────────
-- Snapshot técnico de N ativos a cada 4h (scanner paralelo)

CREATE TABLE IF NOT EXISTS market_analytics (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol         TEXT        NOT NULL,
  interval       TEXT        NOT NULL,
  analyzed_at    TIMESTAMPTZ DEFAULT NOW(),

  -- Preço e tendência
  price          NUMERIC(18,8),
  ema200         NUMERIC(18,8),
  ema50          NUMERIC(18,8),
  trend          TEXT,                -- 'BULLISH' | 'BEARISH' | 'NEUTRAL'
  pct_from_ema200 NUMERIC(10,4),      -- % acima/abaixo da EMA200

  -- Momentum
  rsi            NUMERIC(10,4),
  macd_hist      NUMERIC(18,10),

  -- Força da tendência
  adx            NUMERIC(10,4),
  adx_strength   TEXT,                -- 'STRONG' | 'MODERATE' | 'WEAK' | 'SIDEWAYS'

  -- Volume
  volume_ratio   NUMERIC(10,4),       -- vol / avg20

  -- Sinal gerado
  signal         TEXT,                -- 'LONG' | 'SHORT' | 'NEUTRAL'
  votes_long     INTEGER,
  votes_short    INTEGER,
  blocked_by     TEXT,                -- 'ADX' | 'TREND_FILTER' | 'VOLUME' | null

  -- Volatilidade
  atr_pct        NUMERIC(10,4),       -- ATR como % do preço

  -- Metadados
  market_type    TEXT,                -- 'crypto' | 'stock'
  data_source    TEXT                 -- 'Binance' | 'Yahoo Finance'
);

-- Índices para queries no dashboard
CREATE INDEX IF NOT EXISTS idx_analytics_symbol  ON market_analytics (symbol);
CREATE INDEX IF NOT EXISTS idx_analytics_time    ON market_analytics (analyzed_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_signal  ON market_analytics (signal);

-- RLS: leitura pública
ALTER TABLE market_analytics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "analytics_public_read"
  ON market_analytics FOR SELECT
  USING (true);

CREATE POLICY "analytics_service_write"
  ON market_analytics FOR ALL
  USING (auth.role() = 'service_role');


-- ── View: live_demo_summary ─────────────────────────────────────
-- Resumo de performance do paper trading (usado no dashboard)

CREATE OR REPLACE VIEW live_demo_summary AS
SELECT
  COUNT(*)                                              AS total_trades,
  COUNT(*) FILTER (WHERE status = 'OPEN')              AS open_trades,
  COUNT(*) FILTER (WHERE status LIKE 'CLOSED%')        AS closed_trades,
  COUNT(*) FILTER (WHERE status = 'CLOSED_WIN')        AS wins,
  COUNT(*) FILTER (WHERE status = 'CLOSED_LOSS')       AS losses,
  ROUND(
    COUNT(*) FILTER (WHERE status = 'CLOSED_WIN')::NUMERIC
    / NULLIF(COUNT(*) FILTER (WHERE status LIKE 'CLOSED%'), 0) * 100
  , 1)                                                  AS win_rate_pct,
  ROUND(SUM(profit_usd) FILTER (WHERE profit_usd IS NOT NULL), 2) AS total_profit_usd
FROM live_demo_trades
WHERE dry_run = TRUE;
