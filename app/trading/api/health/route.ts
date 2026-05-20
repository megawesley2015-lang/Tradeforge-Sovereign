import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// GET /trading/api/health
// Retorna métricas de saúde do bot para o Dashboard de Saúde.
// Sem autenticação — dados são operacionais não sensíveis.

export async function GET() {
  const since24h    = new Date(Date.now() - 24 * 3_600_000).toISOString();
  const todayStart  = new Date(); todayStart.setHours(0, 0, 0, 0);

  // 1. Último ciclo do scanner (mais recente entrada em market_analytics)
  const { data: lastScan } = await supabase
    .from('market_analytics')
    .select('analyzed_at')
    .order('analyzed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // 2. Posições abertas
  const { data: openTrades } = await supabase
    .from('live_demo_trades')
    .select('id, symbol, signal, opened_at, btc_regime, adx, entry_price')
    .eq('status', 'OPEN')
    .order('opened_at', { ascending: false });

  // 3. Fechados hoje
  const { count: closedToday } = await supabase
    .from('live_demo_trades')
    .select('*', { count: 'exact', head: true })
    .neq('status', 'OPEN')
    .gte('closed_at', todayStart.toISOString());

  // 4. Total fechados nas últimas 24h e win/loss
  const { data: closed24h } = await supabase
    .from('live_demo_trades')
    .select('status, profit_usd')
    .neq('status', 'OPEN')
    .gte('closed_at', since24h);

  const wins24h   = (closed24h ?? []).filter(t => t.status === 'CLOSED_WIN').length;
  const losses24h = (closed24h ?? []).filter(t => t.status !== 'CLOSED_WIN').length;
  const pnl24h    = (closed24h ?? []).reduce((s, t) => s + (t.profit_usd ?? 0), 0);

  // 5. Alertas recentes 24h (inclui ghost_position como indicador de problema)
  const { data: alerts24h } = await supabase
    .from('alerts')
    .select('type, symbol, message, created_at, status')
    .gte('created_at', since24h)
    .order('created_at', { ascending: false })
    .limit(20);

  const ghostAlerts  = (alerts24h ?? []).filter(a => a.type === 'ghost_position');
  const closedAlerts = (alerts24h ?? []).filter(a => a.type === 'position_closed');

  // 6. Provider ping — testa Binance e Bybit com timeout de 4s
  const providers = await checkProviders();

  // 7. Status geral do sistema
  const lastScanAt   = lastScan?.analyzed_at ?? null;
  const minutesSince = lastScanAt
    ? (Date.now() - new Date(lastScanAt).getTime()) / 60_000
    : null;

  const systemStatus: 'healthy' | 'degraded' | 'critical' =
    ghostAlerts.length > 0    ? 'critical'  :
    minutesSince === null     ? 'critical'  :
    minutesSince > 120        ? 'critical'  :
    minutesSince > 30         ? 'degraded'  :
    providers.binance === 'down' && providers.bybit === 'down' ? 'critical' :
    providers.binance === 'down' || providers.bybit === 'down' ? 'degraded' :
    'healthy';

  return NextResponse.json({
    systemStatus,
    lastScanAt,
    minutesSinceLastScan: minutesSince !== null ? Math.round(minutesSince) : null,
    openPositions:        openTrades   ?? [],
    closedToday:          closedToday  ?? 0,
    wins24h,
    losses24h,
    pnl24h:               Math.round(pnl24h * 100) / 100,
    ghostAlerts,
    closedAlerts:         closedAlerts.length,
    providers,
  });
}

// ─── Provider ping ─────────────────────────────────────────────
// Faz uma chamada mínima a cada exchange e mede latência.
// Timeout de 4s — acima disso considera 'slow'.

type ProviderStatus = 'up' | 'slow' | 'down';

async function checkProviders(): Promise<Record<string, ProviderStatus>> {
  const checks = [
    { name: 'binance', url: 'https://api.binance.com/api/v3/ping' },
    { name: 'bybit',   url: 'https://api.bybit.com/v5/market/time' },
  ];

  const results: Record<string, ProviderStatus> = {};

  await Promise.allSettled(
    checks.map(async ({ name, url }) => {
      const t0 = Date.now();
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 4_000);
        const res   = await fetch(url, { signal: controller.signal, cache: 'no-store' });
        clearTimeout(timer);
        const ms = Date.now() - t0;
        results[name] = res.ok ? (ms > 2_000 ? 'slow' : 'up') : 'down';
      } catch {
        results[name] = 'down';
      }
    })
  );

  return results;
}
