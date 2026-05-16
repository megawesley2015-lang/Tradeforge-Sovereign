-- =============================================================
-- TRADEFORGE SOVEREIGN — Migration 001: Core Tables
-- Stack: Supabase (PostgreSQL)
-- Criado em: 2026-05-11
-- =============================================================

-- =============================================================
-- EXTENSÕES
-- =============================================================
create extension if not exists "uuid-ossp";


-- =============================================================
-- TABELA: assets
-- O que faz: Cadastro de ativos negociáveis (ações, cripto, etc.)
-- Por que existe: Evita redundância de texto em todas as tabelas
-- =============================================================
create table if not exists assets (
  id          uuid primary key default gen_random_uuid(),
  ticker      text not null unique,       -- ex: 'PETR4', 'BTC-USD'
  name        text,                        -- ex: 'Petrobras PN'
  exchange    text default 'B3',           -- ex: 'B3', 'NASDAQ', 'BINANCE'
  asset_type  text default 'stock'
    check (asset_type in ('stock', 'crypto', 'fund', 'index', 'forex')),
  active      boolean default true,
  created_at  timestamptz default now()
);


-- =============================================================
-- TABELA: candles
-- O que faz: Armazena os preços OHLCV (Open/High/Low/Close/Volume)
-- Por que existe: É a matéria-prima de todos os indicadores e sinais
-- Como funciona: Cada linha = 1 candle de 1 ativo em 1 timeframe
-- =============================================================
create table if not exists candles (
  id          uuid primary key default gen_random_uuid(),
  ticker      text not null,
  timeframe   text not null default '1m'
    check (timeframe in ('1m','5m','15m','30m','1h','4h','1d')),
  open        numeric(20,8) not null,
  high        numeric(20,8) not null,
  low         numeric(20,8) not null,
  close       numeric(20,8) not null,
  volume      numeric(20,8) not null default 0,
  timestamp   timestamptz not null,
  source      text default 'manual',      -- 'alpaca', 'brapi', 'manual'
  created_at  timestamptz default now(),
  unique(ticker, timeframe, timestamp)
);

-- Index de performance para queries de análise
create index if not exists idx_candles_ticker_tf_ts
  on candles(ticker, timeframe, timestamp desc);

create index if not exists idx_candles_timestamp
  on candles(timestamp desc);


-- =============================================================
-- TABELA: signals
-- O que faz: Registra cada sinal gerado pelo SignalEngine
-- Por que existe: Histórico auditável de todos os sinais
-- Como funciona: Engine analisa candles → gera sinal → insere aqui
-- =============================================================
create table if not exists signals (
  id              uuid primary key default gen_random_uuid(),
  ticker          text not null,
  direction       text not null check (direction in ('BUY', 'SELL', 'HOLD')),
  strength        numeric(5,4) not null check (strength between 0 and 1),
  -- Força do sinal: 0 = fraco, 1 = fortíssimo

  -- Indicadores que geraram o sinal
  rsi_value       numeric(6,2),
  macd_value      numeric(20,8),
  macd_signal     numeric(20,8),
  macd_histogram  numeric(20,8),
  bb_upper        numeric(20,8),
  bb_lower        numeric(20,8),
  bb_middle       numeric(20,8),
  atr_value       numeric(20,8),

  -- Preços sugeridos de entrada e saída
  entry_price     numeric(20,8),
  stop_loss       numeric(20,8),
  take_profit     numeric(20,8),

  -- Tamanho sugerido de posição (em R$)
  suggested_size  numeric(20,8),

  -- Status do sinal
  status          text default 'ACTIVE'
    check (status in ('ACTIVE', 'TRIGGERED', 'EXPIRED', 'CANCELLED')),

  indicators_fired text[],               -- ex: ['RSI_OVERSOLD', 'MACD_BULLISH_CROSS']
  timeframe       text default '1m',
  timestamp       timestamptz default now(),
  expires_at      timestamptz,
  created_at      timestamptz default now()
);

create index if not exists idx_signals_ticker_ts
  on signals(ticker, timestamp desc);

create index if not exists idx_signals_direction
  on signals(direction, status, timestamp desc);


-- =============================================================
-- TABELA: positions
-- O que faz: Registra as posições abertas e fechadas do usuário
-- Por que existe: Controle de capital, P&L e risco em tempo real
-- Como funciona: Usuário abre posição → fica OPEN → fecha = CLOSED
-- =============================================================
create table if not exists positions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users on delete cascade,
  signal_id       uuid references signals(id),  -- sinal que originou a posição

  ticker          text not null,
  direction       text not null check (direction in ('LONG', 'SHORT')),

  -- Valores de entrada
  entry_price     numeric(20,8) not null,
  quantity        numeric(20,8) not null,     -- quantas unidades do ativo
  invested_amount numeric(20,8) not null,     -- R$ investido

  -- Limites de proteção (OBRIGATÓRIOS para não ir a negativo)
  stop_loss       numeric(20,8) not null,
  take_profit     numeric(20,8) not null,
  leverage        numeric(6,2) default 1.0,   -- alavancagem (1 = sem alavancagem)
  max_loss_amount numeric(20,8),              -- perda máxima em R$

  -- Valores de saída (preenchidos ao fechar)
  exit_price      numeric(20,8),
  pnl_amount      numeric(20,8),             -- lucro/prejuízo em R$
  pnl_percent     numeric(8,4),              -- lucro/prejuízo em %

  status          text default 'OPEN'
    check (status in ('OPEN', 'CLOSED', 'STOPPED', 'LIQUIDATED')),

  opened_at       timestamptz default now(),
  closed_at       timestamptz,
  close_reason    text,                       -- 'STOP_LOSS', 'TAKE_PROFIT', 'MANUAL', 'SIGNAL'
  notes           text,
  created_at      timestamptz default now()
);

-- RLS: cada usuário vê apenas suas próprias posições
alter table positions enable row level security;

create policy "users_select_own_positions"
  on positions for select
  using (auth.uid() = user_id);

create policy "users_insert_own_positions"
  on positions for insert
  with check (auth.uid() = user_id);

create policy "users_update_own_positions"
  on positions for update
  using (auth.uid() = user_id);

create index if not exists idx_positions_user_status
  on positions(user_id, status, opened_at desc);


-- =============================================================
-- TABELA: portfolio_snapshots
-- O que faz: Foto do estado financeiro do usuário em cada momento
-- Por que existe: Para calcular curva de capital e drawdown histórico
-- =============================================================
create table if not exists portfolio_snapshots (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users on delete cascade,
  total_capital   numeric(20,8) not null,     -- capital total na data
  available_cash  numeric(20,8) not null,     -- dinheiro livre (não investido)
  invested_amount numeric(20,8) not null,     -- R$ em posições abertas
  unrealized_pnl  numeric(20,8) default 0,   -- lucro/prejuízo não realizado
  realized_pnl    numeric(20,8) default 0,   -- lucro/prejuízo acumulado fechado
  snapshot_at     timestamptz default now()
);

alter table portfolio_snapshots enable row level security;

create policy "users_select_own_snapshots"
  on portfolio_snapshots for select
  using (auth.uid() = user_id);

create policy "users_insert_own_snapshots"
  on portfolio_snapshots for insert
  with check (auth.uid() = user_id);


-- =============================================================
-- TABELA: strategies
-- O que faz: Armazena configurações de estratégias de trading
-- Por que existe: Permite múltiplas estratégias por usuário
-- =============================================================
create table if not exists strategies (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users on delete cascade,
  name            text not null,
  description     text,

  -- Parâmetros dos indicadores
  rsi_period      int default 14,
  rsi_oversold    numeric default 30,
  rsi_overbought  numeric default 70,
  macd_fast       int default 12,
  macd_slow       int default 26,
  macd_signal     int default 9,
  bb_period       int default 20,
  bb_std_dev      numeric default 2,

  -- Parâmetros de risco
  max_risk_per_trade  numeric default 0.02,  -- 2% do capital por trade
  max_open_positions  int default 3,
  timeframe           text default '1h',
  use_kelly           boolean default true,

  -- Performance acumulada (atualizado pelo engine)
  win_rate        numeric default 0.55,
  avg_win_pct     numeric default 0.03,
  avg_loss_pct    numeric default 0.015,
  total_trades    int default 0,

  active          boolean default true,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

alter table strategies enable row level security;

create policy "users_manage_own_strategies"
  on strategies for all
  using (auth.uid() = user_id);


-- =============================================================
-- TABELA: backtest_results
-- O que faz: Armazena resultados de simulações históricas
-- Por que existe: Validar estratégia ANTES de arriscar dinheiro real
-- =============================================================
create table if not exists backtest_results (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users on delete cascade,
  strategy_id     uuid references strategies(id),

  ticker          text not null,
  timeframe       text not null,
  start_date      timestamptz not null,
  end_date        timestamptz not null,

  initial_capital   numeric(20,8) not null,
  final_capital     numeric(20,8) not null,
  total_return_pct  numeric(10,4),           -- retorno total em %
  total_trades      int default 0,
  winning_trades    int default 0,
  losing_trades     int default 0,
  win_rate          numeric(6,4),
  max_drawdown_pct  numeric(10,4),           -- maior queda consecutiva %
  sharpe_ratio      numeric(8,4),            -- risco/retorno ajustado
  profit_factor     numeric(8,4),            -- lucro bruto / prejuízo bruto

  trades_data     jsonb,                     -- array com detalhes de cada trade

  ran_at          timestamptz default now(),
  created_at      timestamptz default now()
);

alter table backtest_results enable row level security;

create policy "users_select_own_backtests"
  on backtest_results for select
  using (auth.uid() = user_id);

create policy "users_insert_own_backtests"
  on backtest_results for insert
  with check (auth.uid() = user_id);


-- =============================================================
-- TABELA: risk_config
-- O que faz: Configurações de risco por usuário
-- Por que existe: PROTEÇÃO CENTRAL contra saldo negativo
-- Como funciona: O engine verifica esses limites antes de qualquer trade
-- =============================================================
create table if not exists risk_config (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid references auth.users on delete cascade unique,

  -- Capital e limites
  initial_capital       numeric(20,8) not null,   -- capital inicial depositado
  available_capital     numeric(20,8) not null,   -- capital disponível agora

  -- Limites de proteção (BARREIRA ANTI-SALDO NEGATIVO)
  max_risk_per_trade    numeric(5,4) default 0.02, -- máx 2% por trade
  max_daily_loss_pct    numeric(5,4) default 0.06, -- máx 6% de perda/dia
  max_open_positions    int default 3,              -- máx 3 posições simultâneas
  min_capital_floor     numeric(20,8),              -- capital mínimo (para de operar abaixo disso)

  -- Estado do dia
  daily_loss_amount     numeric(20,8) default 0,   -- perda acumulada hoje
  daily_loss_reset_at   timestamptz default now(),
  trading_halted        boolean default false,      -- true = sistema pausou por risco

  -- Alertas
  alert_at_loss_pct     numeric(5,4) default 0.03, -- avisa ao chegar em 3% de perda/dia
  email_alerts          boolean default true,

  created_at            timestamptz default now(),
  updated_at            timestamptz default now()
);

alter table risk_config enable row level security;

create policy "users_manage_own_risk_config"
  on risk_config for all
  using (auth.uid() = user_id);


-- =============================================================
-- FUNÇÃO: check_risk_before_trade()
-- O que faz: Valida se um trade pode ser aberto sem romper os limites
-- Por que existe: ÚLTIMA BARREIRA antes de ir a saldo negativo
-- =============================================================
create or replace function check_risk_before_trade(
  p_user_id       uuid,
  p_invested_amount numeric,
  p_stop_loss_pct   numeric   -- ex: 0.02 = 2% de stop loss
)
returns jsonb as $$
declare
  v_config        risk_config%rowtype;
  v_open_count    int;
  v_max_loss      numeric;
  v_daily_loss    numeric;
  v_result        jsonb;
begin
  -- Busca configuração de risco do usuário
  select * into v_config from risk_config where user_id = p_user_id;

  if not found then
    return jsonb_build_object('allowed', false, 'reason', 'risk_config_not_found');
  end if;

  -- 1. Sistema pausado?
  if v_config.trading_halted then
    return jsonb_build_object('allowed', false, 'reason', 'trading_halted_by_risk_manager');
  end if;

  -- 2. Conta com capital suficiente?
  if p_invested_amount > v_config.available_capital then
    return jsonb_build_object('allowed', false, 'reason', 'insufficient_capital',
      'available', v_config.available_capital, 'requested', p_invested_amount);
  end if;

  -- 3. Perda máxima do trade não ultrapassa limite diário?
  v_max_loss := p_invested_amount * p_stop_loss_pct;
  v_daily_loss := v_config.daily_loss_amount + v_max_loss;

  if v_daily_loss > (v_config.available_capital * v_config.max_daily_loss_pct) then
    return jsonb_build_object('allowed', false, 'reason', 'daily_loss_limit_exceeded',
      'daily_loss_so_far', v_config.daily_loss_amount,
      'max_allowed_daily_loss', v_config.available_capital * v_config.max_daily_loss_pct);
  end if;

  -- 4. Número de posições abertas OK?
  select count(*) into v_open_count
  from positions
  where user_id = p_user_id and status = 'OPEN';

  if v_open_count >= v_config.max_open_positions then
    return jsonb_build_object('allowed', false, 'reason', 'max_positions_reached',
      'current', v_open_count, 'max', v_config.max_open_positions);
  end if;

  -- 5. Capital mínimo (floor) não será violado?
  if v_config.min_capital_floor is not null then
    if (v_config.available_capital - p_invested_amount) < v_config.min_capital_floor then
      return jsonb_build_object('allowed', false, 'reason', 'capital_floor_violation',
        'floor', v_config.min_capital_floor,
        'would_remain', v_config.available_capital - p_invested_amount);
    end if;
  end if;

  -- Tudo OK!
  return jsonb_build_object(
    'allowed', true,
    'max_loss_this_trade', v_max_loss,
    'remaining_daily_budget', (v_config.available_capital * v_config.max_daily_loss_pct) - v_config.daily_loss_amount,
    'positions_remaining', v_config.max_open_positions - v_open_count
  );
end;
$$ language plpgsql security definer;


-- =============================================================
-- FUNÇÃO: update_daily_loss()
-- O que faz: Atualiza perda diária e pausa sistema se necessário
-- =============================================================
create or replace function update_daily_loss(
  p_user_id   uuid,
  p_loss_amount numeric
)
returns void as $$
declare
  v_config risk_config%rowtype;
begin
  select * into v_config from risk_config where user_id = p_user_id;

  -- Reset diário se necessário
  if v_config.daily_loss_reset_at::date < current_date then
    update risk_config
    set daily_loss_amount = p_loss_amount,
        daily_loss_reset_at = now(),
        trading_halted = false
    where user_id = p_user_id;
  else
    update risk_config
    set daily_loss_amount = daily_loss_amount + p_loss_amount,
        trading_halted = (
          (daily_loss_amount + p_loss_amount) >=
          (available_capital * max_daily_loss_pct)
        )
    where user_id = p_user_id;
  end if;
end;
$$ language plpgsql security definer;


-- =============================================================
-- SUPABASE REALTIME: habilita broadcast para sinais e posições
-- =============================================================
alter publication supabase_realtime add table signals;
alter publication supabase_realtime add table positions;
alter publication supabase_realtime add table candles;
