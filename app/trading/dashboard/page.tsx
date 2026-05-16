"use client";
import { useState, useEffect, useCallback } from 'react';
import { Wallet, Activity, TrendingUp, ShieldAlert, Play, Square, Coins, History, Lock, Settings, BarChart2, DollarSign, Radio, Tv2, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { StatCard } from '@/components/trading/StatCard';
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
        .eq('enabled', isActive); // atualiza o registro singleton
      setIsActive(next);
    } catch (err) {
      console.error('[Dashboard] Erro ao alterar bot_status:', err);
    } finally {
      setBotToggling(false);
    }
  }, [isActive]);

  const refreshGlobalData = useCallback(async () => {
    try {
      // Le o estado real do bot do Supabase
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

  if (!mounted) return <div className="min-h-screen bg-[#07070D]" />;

  return (
    <div className="min-h-screen bg-[#07070D] text-white p-8 font-sans">
      <div className="max-w-7xl mx-auto">
        
        {/* Header */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-10">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 w-full lg:w-auto">
            <div className="shrink-0">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl lg:text-3xl font-bold">TradeForge <span className="text-[#FF6B35]">Sovereign</span></h1>
                <span className="flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full bg-yellow-500/15 text-yellow-400 border border-yellow-500/30 animate-pulse">
                  <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 inline-block"/>
                  PAPER
                </span>
              </div>
              <p className="text-gray-500 text-xs mt-0.5">Quant Engine v3.0 - MACD + BB + ADX - Simulacao</p>
            </div>

            {/* Nav links - scroll horizontal no mobile */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full scrollbar-none">
              {NAV_ITEMS.map(({ href, Icon, label }) => (
                <Link key={href} href={href}
                  className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-[#FF6B35] border border-[#1F1F2E] hover:border-[#FF6B35] px-2.5 py-1.5 rounded-lg transition-colors whitespace-nowrap shrink-0">
                  <Icon size={13} /> {label}
                </Link>
              ))}
            </div>
          </div>
            <div className="flex items-center gap-3 bg-[#0F0F1A] border border-[#1F1F2E] p-2 rounded-xl">
              <Coins size={18} className="text-[#FF6B35] ml-2" />
              <select value={symbol} onChange={(e) => setSymbol(e.target.value)} className="bg-transparent outline-none text-sm font-bold cursor-pointer">
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
              <span className="text-xs font-mono text-[#FF6B35] ml-2 bg-[#FF6B35]/10 px-2 py-1 rounded">${livePrice}</span>
            </div>
          </div>
          <button
            onClick={toggleBot}
            disabled={botToggling}
            className={`px-5 py-3 rounded-xl transition-all flex items-center gap-2 font-bold text-sm disabled:opacity-60 ${
              isActive ? 'bg-red-600 hover:bg-red-700' : 'bg-[#FF6B35] hover:bg-[#e55a2a]'
            }`}
          >
            {botToggling
              ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"/>
              : isActive ? <Square size={16} fill="currentColor"/> : <Play size={16} fill="currentColor"/>
            }
            {isActive ? 'PARAR BOT' : 'INICIAR BOT'}
          </button>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
          <StatCard label="Banca Atual" value={`$ ${balance.toFixed(2)}`} icon={<Wallet size={20}/>} />
          <StatCard label="Pico da Banca" value={`$ ${peakBalance.toFixed(2)}`} icon={<TrendingUp size={20}/>} colorClass="text-purple-500" />
          <StatCard label="Drawdown" value={`${drawdown.toFixed(1)}%`} icon={<ShieldAlert size={20}/>} colorClass={drawdown > 7 ? 'text-red-500' : drawdown > 4 ? 'text-yellow-500' : 'text-green-500'} />
          <StatCard label="Sinal Atual" value={currentSignal} icon={<Activity size={20}/>} colorClass={currentSignal === 'LONG' ? 'text-green-500' : currentSignal === 'SHORT' ? 'text-red-500' : 'text-[#FF6B35]'} />
          <StatCard label="Win Rate Real" value={winRate} icon={<Activity size={20}/>} colorClass="text-cyan-500" />
          <StatCard label="Status" value={accountStatus === 'SAFE_MODE' ? 'SAFE MODE' : 'ATIVO'} icon={<Lock size={20}/>} colorClass={accountStatus === 'SAFE_MODE' ? 'text-red-500' : 'text-green-500'} />
        </div>

        {/* Indicadores ao vivo */}
        {liveIndicators && (
          <div className="flex items-center gap-4 mb-8 bg-[#0F0F1A] border border-[#1F1F2E] rounded-2xl px-6 py-3 text-xs font-mono">
            <span className="text-gray-500">INDICADORES AO VIVO</span>
            {liveIndicators.rsi && <span>RSI: <span className={`font-bold ${parseFloat(liveIndicators.rsi) < 35 ? 'text-green-400' : parseFloat(liveIndicators.rsi) > 65 ? 'text-red-400' : 'text-gray-300'}`}>{liveIndicators.rsi}</span></span>}
            {liveIndicators.macd && <span>MACD hist: <span className={`font-bold ${parseFloat(liveIndicators.macd) > 0 ? 'text-green-400' : 'text-red-400'}`}>{liveIndicators.macd}</span></span>}
            {liveIndicators.score !== undefined && <span>Score IA: <span className={`font-bold ${liveIndicators.score >= 75 ? 'text-green-400' : liveIndicators.score >= 50 ? 'text-yellow-400' : 'text-gray-400'}`}>{liveIndicators.score}/100</span></span>}
            {liveIndicators.fearGreed && <span>Sentimento: <span className="font-bold text-[#FF6B35]">{liveIndicators.fearGreed}</span></span>}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            {/* Console */}
            <div className="bg-[#0F0F1A] border border-[#1F1F2E] rounded-3xl p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold flex items-center gap-2"><Activity size={20} className="text-[#FF6B35]"/> Console de Operacoes</h2>
                <span className={`text-xs px-2 py-1 rounded-full ${isActive ? 'bg-green-500/20 text-green-500 animate-pulse' : 'bg-gray-500/20 text-gray-500'}`}>{isActive ? 'LIVE' : 'OFFLINE'}</span>
              </div>
              <div className="space-y-2 h-48 overflow-y-auto font-mono text-sm">
                {logs.map((log, i) => (<div key={i} className="p-2 border-b border-[#1F1F2E] text-gray-400"><span className="text-gray-600 mr-2">[{new Date().toLocaleTimeString()}]</span> {log}</div>))}
              </div>
            </div>

            {/* Historico */}
            <div className="bg-[#0F0F1A] border border-[#1F1F2E] rounded-3xl p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold flex items-center gap-2"><History size={20} className="text-[#FF6B35]"/> Historico de Trades</h2>
                <span className="text-xs text-gray-500">Ultimas 10 operacoes</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left font-mono text-sm">
                  <thead className="text-gray-500 border-b border-[#1F1F2E]">
                    <tr>
                      <th className="pb-3 font-medium">Ativo</th>
                      <th className="pb-3 font-medium">Lado</th>
                      <th className="pb-3 font-medium">Entrada</th>
                      <th className="pb-3 font-medium">Status</th>
                      <th className="pb-3 font-medium text-right">PnL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tradeHistory.map((trade) => (
                      <tr key={trade.id} className="border-b border-[#1F1F2E]/50 hover:bg-[#161625] transition-colors">
                        <td className="py-4 font-bold">{trade.symbol}</td>
                        <td className={`py-4 font-bold ${trade.side === 'LONG' ? 'text-green-500' : 'text-red-500'}`}>{trade.side}</td>
                        <td className="py-4 text-gray-400">${trade.entry_price.toFixed(2)}</td>
                        <td className="py-4 text-gray-400">{trade.status}</td>
                        <td className={`py-4 text-right font-bold ${(trade.pnl || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                          ${trade.pnl?.toFixed(2) || '0.00'}
                        </td>
                      </tr>
                    ))}
                    {tradeHistory.length === 0 && (
                      <tr><td colSpan={5} className="py-10 text-center text-gray-600 italic">Nenhuma operacao registrada.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="space-y-8">
            {/* Gestao de Risco */}
            <div className="bg-[#0F0F1A] border border-[#1F1F2E] rounded-3xl p-6">
              <h2 className="text-xl font-bold mb-6 flex items-center gap-2"><ShieldAlert size={20} className="text-[#FF6B35]"/> Gestao de Risco</h2>
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-gray-500 block mb-2">Risco por Operacao (%)</label>
                  <input type="number" value={riskConfig.riskPerTrade} onChange={(e) => setRiskConfig({...riskConfig, riskPerTrade: parseFloat(e.target.value) || 0})} className="w-full bg-[#161625] border border-[#2A2A3C] rounded-lg p-2 text-white outline-none focus:border-[#FF6B35]"/>
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-2">Stop Loss (%)</label>
                  <input type="number" value={riskConfig.stopLossPercent} onChange={(e) => setRiskConfig({...riskConfig, stopLossPercent: parseFloat(e.target.value) || 0})} className="w-full bg-[#161625] border border-[#2A2A3C] rounded-lg p-2 text-white outline-none focus:border-[#FF6B35]"/>
                </div>
              </div>
            </div>

            {/* Parametros Quantitativos */}
            <div className="bg-[#0F0F1A] border border-[#1F1F2E] rounded-3xl p-6">
              <h2 className="text-xl font-bold mb-6 flex items-center gap-2"><Settings size={20} className="text-[#FF6B35]"/> Parametros Quant</h2>
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-gray-500 block mb-2">RSI Low (Compra)</label>
                  <input type="number" value={params.rsiLow} onChange={(e) => setParams({...params, rsiLow: parseFloat(e.target.value) || 0})} className="w-full bg-[#161625] border border-[#2A2A3C] rounded-lg p-2 text-white outline-none focus:border-[#FF6B35]"/>
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-2">RSI High (Venda)</label>
                  <input type="number" value={params.rsiHigh} onChange={(e) => setParams({...params, rsiHigh: parseFloat(e.target.value) || 0})} className="w-full bg-[#161625] border border-[#2A2A3C] rounded-lg p-2 text-white outline-none focus:border-[#FF6B35]"/>
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-2">Periodo SMA</label>
                  <input type="number" value={params.smaPeriod} onChange={(e) => setParams({...params, smaPeriod: parseFloat(e.target.value) || 0})} className="w-full bg-[#161625] border border-[#2A2A3C] rounded-lg p-2 text-white outline-none focus:border-[#FF6B35]"/>
                </div>
              </div>
            </div>

            {/* Portfolio */}
            <PortfolioPanel balance={balance} />
          </div>
        </div>
      </div>
    </div>
  );
}

const PORTFOLIO = [
  { symbol: 'BTCUSDT',  label: 'Bitcoin',    color: '#F7931A', alloc: 0.30 },
  { symbol: 'ETHUSDT',  label: 'Ethereum',   color: '#627EEA', alloc: 0.20 },
  { symbol: 'SOLUSDT',  label: 'Solana',     color: '#9945FF', alloc: 0.12 },
  { symbol: 'BNBUSDT',  label: 'BNB',        color: '#F3BA2F', alloc: 0.10 },
  { symbol: 'XRPUSDT',  label: 'Ripple',     color: '#00AAE4', alloc: 0.08 },
  { symbol: 'ADAUSDT',  label: 'Cardano',    color: '#0033AD', alloc: 0.07 },
  { symbol: 'AVAXUSDT', label: 'Avalanche',  color: '#E84142', alloc: 0.07 },
  { symbol: 'LINKUSDT', label: 'Chainlink',  color: '#2A5ADA', alloc: 0.06 },
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
    <div className="bg-[#0F0F1A] border border-[#1F1F2E] rounded-3xl p-6">
      <h2 className="text-xl font-bold mb-5 flex items-center gap-2">
        <TrendingUp size={20} className="text-[#FF6B35]"/> Portfolio
      </h2>
      <div className="space-y-4">
        {PORTFOLIO.map((asset) => {
          const allocUsd = balance * asset.alloc;
          const price    = prices[asset.symbol] || 0;
          const qty      = price > 0 ? allocUsd / price : 0;
          return (
            <div key={asset.symbol}>
              <div className="flex justify-between items-center mb-1">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: asset.color }} />
                  <span className="text-sm font-bold">{asset.label}</span>
                </div>
                <div className="text-right">
                  <span className="text-sm font-mono font-bold">${allocUsd.toFixed(2)}</span>
                  <span className="text-xs text-gray-500 ml-2">{(asset.alloc * 100).toFixed(0)}%</span>
                </div>
              </div>
              <div className="w-full bg-[#161625] rounded-full h-1.5">
                <div className="h-1.5 rounded-full transition-all" style={{ width: `${asset.alloc * 100}%`, backgroundColor: asset.color }} />
              </div>
              {price > 0 && (
                <p className="text-xs text-gray-600 mt-0.5">
                  aprox. {qty.toFixed(6)} {asset.symbol.replace('USDT', '')} @ ${price.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                </p>
              )}
            </div>
          );
        })}
        <div className="border-t border-[#1F1F2E] pt-3 mt-2">
          <div className="flex justify-between text-xs text-gray-500">
            <span>Total alocado</span>
            <span className="font-mono text-white">${balance.toFixed(2)}</span>
          </div>
          <p className="text-xs text-gray-600 mt-2 italic">
            Rebalanceamento automatico ativo - risco distribuido proporcionalmente.
          </p>
        </div>
      </div>
    </div>
  );
}
