"use client";
import { useState, useEffect, useCallback } from 'react';
import { Activity, TrendingUp, ShieldAlert, Play, Square, Coins, History, Settings, BarChart2, DollarSign, Radio, Tv2, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import '@/components/dashboard/dashboard.css';
import { getSupabaseBrowserClient } from '@/lib/supabase-browser';

const supabase = getSupabaseBrowserClient();

// Nav items defined outside component so Turbopack does not see JSX inside array literals
const NAV_ITEMS: { href: string; Icon: LucideIcon; label: string }[] = [
  { href: '/trading/signals',        Icon: Radio,       label: 'Sinais'    },
  { href: '/trading/backtest',        Icon: BarChart2,   label: 'Backtest'  },
  { href: '/trading/backtest-basket', Icon: BarChart2,   label: 'Basket'    },
  { href: '/trading/live-demo',       Icon: Tv2,         label: 'Live Demo' },
  { href: '/trading/arbitrage',       Icon: DollarSign,  label: 'Arb'       },
  { href: '/trading/settings',        Icon: Settings,    label: 'Config'    },
];

export default function Dashboard() {
  const [isActive, setIsActive] = useState(false);
  const [botToggling, setBotToggling] = useState(false);
  const [currentSignal, setCurrentSignal] = useState('NEUTRAL');
  const [logs, setLogs] = useState<string[]>(['Sistemas prontos. Aguardando ativacao...']);

  const [balance, setBalance] = useState(1000.00);
  const [peakBalance, setPeakBalance] = useState(1000.00);
  const [accountStatus, setAccountStatus] = useState('ACTIVE');

  const [symbol, setSymbol] = useState('BTCUSDT');
  const [livePrice, setLivePrice] = useState('0.00');
  const [winRate, setWinRate] = useState('0%');
  const [tradeHistory, setTradeHistory] = useState<any[]>([]);

  const [riskConfig, setRiskConfig] = useState({
    riskPerTrade: 1.0,
    stopLossPercent: 2.0
  });

  const [params, setParams] = useState({
    rsiLow: 35,
    rsiHigh: 65,
    smaPeriod: 200
  });

  const [liveIndicators, setLiveIndicators] = useState<{rsi?: string; macd?: string; score?: number; fearGreed?: string} | null>(null);
  const [drawdown, setDrawdown] = useState(0);
  const [mounted, setMounted] = useState(false);

  // -- Sincroniza estado do bot com Supabase --------------------
  const toggleBot = useCallback(async () => {
    setBotToggling(true);
    try {
      const next = !isActive;
      await supabase
        .from('bot_status')
        .update({ enabled: next, updated_at: new Date().toISOString(), updated_by: 'dashboard' })
        .eq('enabled', isActive);
      setIsActive(next);
    } catch (err) {
      console.error('[Dashboard] Erro ao alterar bot_status:', err);
    } finally {
      setBotToggling(false);
    }
  }, [isActive]);

  const refreshGlobalData = useCallback(async () => {
    try {
      const { data: botData } = await supabase
        .from('bot_status')
        .select('enabled')
        .limit(1)
        .single();
      if (botData) setIsActive(botData.enabled);

      const { data: profileData } = await supabase
        .from('profiles')
        .select('balance, peak_balance, account_status')
        .limit(1);

      if (profileData && profileData.length > 0) {
        setBalance(profileData[0].balance);
        setPeakBalance(profileData[0].peak_balance || profileData[0].balance);
        setAccountStatus(profileData[0].account_status || 'ACTIVE');
      }

      const { data: tradesData } = await supabase
        .from('trades')
        .select('*')
        .order('created_at', { ascending: false });

      if (tradesData) {
        setTradeHistory(tradesData.slice(0, 10));
        const closedTrades = tradesData.filter((t: any) => t.status === 'CLOSED');
        if (closedTrades.length > 0) {
          const wins = closedTrades.filter((t: any) => t.pnl > 0).length;
          setWinRate(`${Math.floor((wins / closedTrades.length) * 100)}%`);
        } else {
          setWinRate('0%');
        }
      }
    } catch (err) {
      console.error("Erro ao atualizar dados:", err);
    }
  }, []);

  const fetchPrice = useCallback(async () => {
    try {
      const res = await fetch(`/trading/api/price?symbol=${symbol}`);
      const data = await res.json();
      if (data.price) {
        setLivePrice(parseFloat(data.price).toLocaleString('en-US', { minimumFractionDigits: 2 }));
      }
    } catch (e) {
      console.error("Erro ao buscar preco:", e);
    }
  }, [symbol]);

  useEffect(() => {
    async function init() {
      await refreshGlobalData();
      setMounted(true);
    }
    init();
  }, [refreshGlobalData]);

  useEffect(() => {
    const interval = setInterval(fetchPrice, 3000);
    return () => clearInterval(interval);
  }, [fetchPrice]);

  useEffect(() => {
    if (peakBalance > 0) {
      setDrawdown(((peakBalance - balance) / peakBalance) * 100);
    }
  }, [balance, peakBalance]);

  const triggerBotCycle = useCallback(async () => {
    try {
      const response = await fetch('/trading/api/cycle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol,
          balance,
          riskConfig: {
            riskPerTrade:    riskConfig.riskPerTrade / 100,
            stopLossPercent: riskConfig.stopLossPercent / 100,
            minRiskReward:   2.0,
            maxDrawdown:     10,
          },
          params,
        }),
      });

      const data = await response.json();

      if (data.indicators || data.score !== undefined) {
        setLiveIndicators({
          rsi:       data.indicators?.rsi,
          macd:      data.indicators?.macd,
          score:     data.score,
          fearGreed: data.fearGreed,
        });
      }

      if (data.status === 'Executed') {
        setLogs(prev => [`[${symbol}] ${data.mood}`, ...prev.slice(0, 49)]);
        setCurrentSignal(data.signal || 'LONG');
        await refreshGlobalData();
      } else if (data.status === 'Closed') {
        setLogs(prev => [`[${symbol}] ${data.mood}`, ...prev.slice(0, 49)]);
        setCurrentSignal('NEUTRAL');
        await refreshGlobalData();
      } else if (data.status === 'Vetoed') {
        setLogs(prev => [`[${symbol}] ${data.mood}`, ...prev.slice(0, 49)]);
        setCurrentSignal('NEUTRAL');
        await refreshGlobalData();
      } else if (data.status === 'Monitoring') {
        setLogs(prev => [`[${symbol}] ${data.mood}`, ...prev.slice(0, 49)]);
      } else {
        setLogs(prev => [`[${symbol}] ${data.mood || 'Aguardando setup...'}`, ...prev.slice(0, 49)]);
        setCurrentSignal('NEUTRAL');
      }
    } catch (error) {
      setLogs(prev => [`Erro de conexao: ${error}`, ...prev.slice(0, 49)]);
    }
  }, [balance, symbol, riskConfig, params, refreshGlobalData]);

  useEffect(() => {
    let interval: NodeJS.Timeout | undefined;
    if (isActive) {
      triggerBotCycle();
      interval = setInterval(() => triggerBotCycle(), 30000);
    }
    return () => { if (interval) clearInterval(interval); };
  }, [isActive, triggerBotCycle]);

  if (!mounted) return <div style={{ minHeight: '100vh', background: '#080C12' }} />;

  const drawdownColor = drawdown > 7 ? 'red' : drawdown > 4 ? 'amber' : 'green';
  const signalColor   = currentSignal === 'LONG' ? 'green' : currentSignal === 'SHORT' ? 'red' : 'amber';
  const statusColor   = accountStatus === 'SAFE_MODE' ? 'red' : 'green';

  return (
    <div className="dash-root">

      {/* ─── HEADER ─── */}
      <header className="dash-header">
        <div className="dash-header-left">
          <div className="dash-logo">trade<span>forge</span></div>
          <span className="dash-paper-badge">PAPER</span>
          <nav className="dash-nav">
            {NAV_ITEMS.map(({ href, Icon, label }) => (
              <Link key={href} href={href} className="dash-nav-link">
                <Icon size={11} /> {label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="dash-header-right">
          <div className="dash-coin-selector">
            <Coins size={14} className="dash-coin-icon" />
            <select value={symbol} onChange={(e) => setSymbol(e.target.value)} className="dash-coin-select">
              <option value="BTCUSDT">Bitcoin (BTC)</option>
              <option value="ETHUSDT">Ethereum (ETH)</option>
              <option value="SOLUSDT">Solana (SOL)</option>
              <option value="BNBUSDT">BNB (BNB)</option>
              <option value="XRPUSDT">Ripple (XRP)</option>
              <option value="ADAUSDT">Cardano (ADA)</option>
              <option value="DOGEUSDT">Dogecoin (DOGE)</option>
              <option value="AVAXUSDT">Avalanche (AVAX)</option>
              <option value="LINKUSDT">Chainlink (LINK)</option>
              <option value="MATICUSDT">Polygon (MATIC)</option>
              <option value="DOTUSDT">Polkadot (DOT)</option>
            </select>
            <span className="dash-coin-price">${livePrice}</span>
          </div>

          <button
            onClick={toggleBot}
            disabled={botToggling}
            className={`dash-bot-btn ${isActive ? 'on' : 'off'}`}
          >
            {botToggling
              ? <span className="dash-spinner" />
              : isActive
                ? <Square size={13} fill="currentColor" />
                : <Play size={13} fill="currentColor" />
            }
            {isActive ? 'Parar Bot' : 'Iniciar Bot'}
          </button>
        </div>
      </header>

      {/* ─── METRIC STRIP ─── */}
      <div className="dash-metrics">
        <div className="dash-metric">
          <span className="dash-metric-label">Banca Atual</span>
          <span className="dash-metric-val">$ {balance.toFixed(2)}</span>
        </div>
        <div className="dash-metric">
          <span className="dash-metric-label">Pico da Banca</span>
          <span className="dash-metric-val">$ {peakBalance.toFixed(2)}</span>
        </div>
        <div className="dash-metric">
          <span className="dash-metric-label">Drawdown</span>
          <span className={`dash-metric-val ${drawdownColor}`}>{drawdown.toFixed(1)}%</span>
        </div>
        <div className="dash-metric">
          <span className="dash-metric-label">Sinal Atual</span>
          <span className={`dash-metric-val ${signalColor}`}>{currentSignal}</span>
        </div>
        <div className="dash-metric">
          <span className="dash-metric-label">Win Rate Real</span>
          <span className="dash-metric-val cyan">{winRate}</span>
        </div>
        <div className="dash-metric">
          <span className="dash-metric-label">Status</span>
          <span className={`dash-metric-val ${statusColor}`}>
            {accountStatus === 'SAFE_MODE' ? 'SAFE MODE' : 'ATIVO'}
          </span>
        </div>
      </div>

      {/* ─── INDICATORS BAR ─── */}
      {liveIndicators && (
        <div className="dash-indicators">
          <span className="dash-ind-label">Ao Vivo</span>
          {liveIndicators.rsi && (
            <span className="dash-ind-item">
              RSI{' '}
              <strong className={
                parseFloat(liveIndicators.rsi) < 35 ? 'dash-ind-green'
                : parseFloat(liveIndicators.rsi) > 65 ? 'dash-ind-red'
                : ''
              }>
                {liveIndicators.rsi}
              </strong>
            </span>
          )}
          {liveIndicators.macd && (
            <span className="dash-ind-item">
              MACD{' '}
              <strong className={parseFloat(liveIndicators.macd) > 0 ? 'dash-ind-green' : 'dash-ind-red'}>
                {liveIndicators.macd}
              </strong>
            </span>
          )}
          {liveIndicators.score !== undefined && (
            <span className="dash-ind-item">
              Score IA{' '}
              <strong className={
                liveIndicators.score >= 75 ? 'dash-ind-green'
                : liveIndicators.score >= 50 ? 'dash-ind-amber'
                : ''
              }>
                {liveIndicators.score}/100
              </strong>
            </span>
          )}
          {liveIndicators.fearGreed && (
            <span className="dash-ind-item">
              Sentimento <strong className="dash-ind-amber">{liveIndicators.fearGreed}</strong>
            </span>
          )}
        </div>
      )}

      {/* ─── MAIN GRID ─── */}
      <main className="dash-main">

        {/* LEFT COLUMN */}
        <div className="dash-left">

          {/* Console */}
          <div className="dash-panel" style={{ flex: '0 0 auto' }}>
            <div className="dash-panel-header">
              <span className="dash-panel-title">
                <Activity size={13} /> Console de Operações
              </span>
              <span className={`dash-panel-badge ${isActive ? 'live' : 'offline'}`}>
                {isActive ? 'Live' : 'Offline'}
              </span>
            </div>
            <div className="dash-console">
              {logs.map((log, i) => (
                <div key={i} className="dash-log-line">
                  <span className="dash-log-time">{new Date().toLocaleTimeString()}</span>
                  <span>{log}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Histórico de Trades */}
          <div className="dash-panel" style={{ flex: 1 }}>
            <div className="dash-panel-header">
              <span className="dash-panel-title">
                <History size={13} /> Histórico de Trades
              </span>
              <span className="dash-panel-badge offline">últimas 10</span>
            </div>
            <div className="dash-table-wrap">
              <table className="dash-table">
                <thead>
                  <tr>
                    <th>Ativo</th>
                    <th>Lado</th>
                    <th>Entrada</th>
                    <th>Status</th>
                    <th>PnL</th>
                  </tr>
                </thead>
                <tbody>
                  {tradeHistory.map((trade) => (
                    <tr key={trade.id}>
                      <td className="dash-td-symbol">{trade.symbol}</td>
                      <td>
                        <span className={`dash-side ${trade.side === 'LONG' ? 'long' : 'short'}`}>
                          {trade.side}
                        </span>
                      </td>
                      <td>${trade.entry_price.toFixed(2)}</td>
                      <td>{trade.status}</td>
                      <td className={(trade.pnl || 0) >= 0 ? 'dash-pnl-pos' : 'dash-pnl-neg'}>
                        ${trade.pnl?.toFixed(2) || '0.00'}
                      </td>
                    </tr>
                  ))}
                  {tradeHistory.length === 0 && (
                    <tr>
                      <td colSpan={5} className="dash-empty">Nenhuma operação registrada.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>

        {/* RIGHT COLUMN */}
        <div className="dash-right">

          {/* Gestão de Risco */}
          <div className="dash-side-panel">
            <div className="dash-side-title"><ShieldAlert size={13} /> Gestão de Risco</div>
            <div className="dash-field">
              <label className="dash-field-label">Risco por Operação (%)</label>
              <input
                type="number"
                value={riskConfig.riskPerTrade}
                onChange={(e) => setRiskConfig({ ...riskConfig, riskPerTrade: parseFloat(e.target.value) || 0 })}
                className="dash-input"
              />
            </div>
            <div className="dash-field">
              <label className="dash-field-label">Stop Loss (%)</label>
              <input
                type="number"
                value={riskConfig.stopLossPercent}
                onChange={(e) => setRiskConfig({ ...riskConfig, stopLossPercent: parseFloat(e.target.value) || 0 })}
                className="dash-input"
              />
            </div>
          </div>

          {/* Parâmetros Quant */}
          <div className="dash-side-panel">
            <div className="dash-side-title"><Settings size={13} /> Parâmetros Quant</div>
            <div className="dash-field">
              <label className="dash-field-label">RSI Low (Compra)</label>
              <input
                type="number"
                value={params.rsiLow}
                onChange={(e) => setParams({ ...params, rsiLow: parseFloat(e.target.value) || 0 })}
                className="dash-input"
              />
            </div>
            <div className="dash-field">
              <label className="dash-field-label">RSI High (Venda)</label>
              <input
                type="number"
                value={params.rsiHigh}
                onChange={(e) => setParams({ ...params, rsiHigh: parseFloat(e.target.value) || 0 })}
                className="dash-input"
              />
            </div>
            <div className="dash-field">
              <label className="dash-field-label">Período SMA</label>
              <input
                type="number"
                value={params.smaPeriod}
                onChange={(e) => setParams({ ...params, smaPeriod: parseFloat(e.target.value) || 0 })}
                className="dash-input"
              />
            </div>
          </div>

          {/* Portfolio */}
          <PortfolioPanel balance={balance} />

        </div>
      </main>

    </div>
  );
}

// ─── PORTFOLIO PANEL ─────────────────────────────────────────────────────────

const PORTFOLIO = [
  { symbol: 'BTCUSDT',  label: 'Bitcoin',   color: '#F7931A', alloc: 0.30 },
  { symbol: 'ETHUSDT',  label: 'Ethereum',  color: '#627EEA', alloc: 0.20 },
  { symbol: 'SOLUSDT',  label: 'Solana',    color: '#9945FF', alloc: 0.12 },
  { symbol: 'BNBUSDT',  label: 'BNB',       color: '#F3BA2F', alloc: 0.10 },
  { symbol: 'XRPUSDT',  label: 'Ripple',    color: '#00AAE4', alloc: 0.08 },
  { symbol: 'ADAUSDT',  label: 'Cardano',   color: '#0033AD', alloc: 0.07 },
  { symbol: 'AVAXUSDT', label: 'Avalanche', color: '#E84142', alloc: 0.07 },
  { symbol: 'LINKUSDT', label: 'Chainlink', color: '#2A5ADA', alloc: 0.06 },
];

function PortfolioPanel({ balance }: { balance: number }) {
  const [prices, setPrices] = useState<Record<string, number>>({});

  useEffect(() => {
    const fetchAll = async () => {
      const results: Record<string, number> = {};
      await Promise.all(
        PORTFOLIO.map(async (a) => {
          try {
            const res  = await fetch(`/trading/api/price?symbol=${a.symbol}`);
            const data = await res.json();
            results[a.symbol] = parseFloat(data.price) || 0;
          } catch { results[a.symbol] = 0; }
        })
      );
      setPrices(results);
    };
    fetchAll();
    const iv = setInterval(fetchAll, 30000);
    return () => clearInterval(iv);
  }, []);

  return (
    <div className="dash-side-panel">
      <div className="dash-side-title"><TrendingUp size={13} /> Portfolio</div>

      {PORTFOLIO.map((asset) => {
        const allocUsd = balance * asset.alloc;
        const price    = prices[asset.symbol] || 0;
        const qty      = price > 0 ? allocUsd / price : 0;
        return (
          <div key={asset.symbol} className="dash-portfolio-item">
            <div className="dash-portfolio-row">
              <div className="dash-portfolio-name">
                <span className="dash-portfolio-dot" style={{ backgroundColor: asset.color }} />
                {asset.label}
              </div>
              <div className="dash-portfolio-vals">
                <span className="dash-portfolio-usd">${allocUsd.toFixed(2)}</span>
                <span className="dash-portfolio-pct">{(asset.alloc * 100).toFixed(0)}%</span>
              </div>
            </div>
            <div className="dash-portfolio-bar-track">
              <div
                className="dash-portfolio-bar-fill"
                style={{ width: `${asset.alloc * 100}%`, backgroundColor: asset.color }}
              />
            </div>
            {price > 0 && (
              <div className="dash-portfolio-qty">
                ≈ {qty.toFixed(6)} {asset.symbol.replace('USDT', '')} @ ${price.toLocaleString('en-US', { maximumFractionDigits: 2 })}
              </div>
            )}
          </div>
        );
      })}

      <div className="dash-portfolio-total">
        <span className="dash-portfolio-total-label">Total alocado</span>
        <span className="dash-portfolio-total-val">${balance.toFixed(2)}</span>
      </div>
    </div>
  );
}
