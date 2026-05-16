import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// GET /trading/api/live-demo
// Retorna: trades recentes + posições abertas + analytics + resumo
export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(),
                   setAll: () => {} } },
    );

    const { searchParams } = new URL(req.url);
    const limit  = Math.min(parseInt(searchParams.get('limit')  ?? '50'), 200);
    const symbol = searchParams.get('symbol') ?? undefined;

    // ── Trades recentes ──────────────────────────────────────
    let tradesQ = supabase
      .from('live_demo_trades')
      .select('*')
      .order('opened_at', { ascending: false })
      .limit(limit);
    if (symbol) tradesQ = tradesQ.eq('symbol', symbol);
    const { data: trades, error: tradesErr } = await tradesQ;
    if (tradesErr) throw tradesErr;

    // ── Analytics recentes (última varredura) ────────────────
    // Pega o timestamp mais recente e filtra por ele
    const { data: latestTime } = await supabase
      .from('market_analytics')
      .select('analyzed_at')
      .order('analyzed_at', { ascending: false })
      .limit(1)
      .single();

    let analytics = null;
    if (latestTime) {
      const cutoff = new Date(latestTime.analyzed_at);
      cutoff.setMinutes(cutoff.getMinutes() - 30); // tolerância de 30min
      const { data } = await supabase
        .from('market_analytics')
        .select('*')
        .gte('analyzed_at', cutoff.toISOString())
        .order('adx', { ascending: false });
      analytics = data;
    }

    // ── Resumo de performance ────────────────────────────────
    const closed = (trades ?? []).filter(t => t.status !== 'OPEN');
    const wins   = closed.filter(t => t.status === 'CLOSED_WIN');
    const totalPnl = closed.reduce((s: number, t: { profit_usd: number }) => s + (t.profit_usd ?? 0), 0);
    const winRate  = closed.length > 0 ? (wins.length / closed.length) * 100 : 0;

    const summary = {
      totalTrades:  (trades ?? []).length,
      openTrades:   (trades ?? []).filter(t => t.status === 'OPEN').length,
      closedTrades: closed.length,
      wins:         wins.length,
      losses:       closed.length - wins.length,
      winRatePct:   Math.round(winRate * 10) / 10,
      totalPnlUsd:  Math.round(totalPnl * 100) / 100,
      lastScanAt:   latestTime?.analyzed_at ?? null,
    };

    return NextResponse.json({ trades, analytics, summary });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido';
    console.error('[live-demo API]', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
