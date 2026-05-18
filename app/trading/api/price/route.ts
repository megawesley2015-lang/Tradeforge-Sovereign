import { NextRequest, NextResponse } from 'next/server';

// Usa fetch nativo (compatível com Turbopack + Edge + Node runtime).
// Axios foi removido: causava problemas de módulo com Turbopack em Next.js 16.
//
// Estratégia de fallback:
//   1. Tenta Binance (api.binance.com) — mais preciso, mas pode ser bloqueado em cloud providers
//   2. Fallback: Bybit (api.bybit.com) — API permissiva para requisições server-side

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get('symbol') || 'BTCUSDT';

  // ── Tentativa 1: Binance ──────────────────────────────────────
  try {
    const res = await fetch(
      `https://api.binance.com/api/v3/ticker/price?symbol=${encodeURIComponent(symbol)}`,
      { cache: 'no-store', signal: AbortSignal.timeout(5_000) },
    );

    if (res.ok) {
      const data = await res.json() as { symbol: string; price: string };
      return NextResponse.json({
        symbol,
        price:     data.price,
        timestamp: new Date().toISOString(),
        source:    'binance',
      });
    }
    // Binance retornou erro — cai para o fallback
    console.warn(`[price] Binance retornou ${res.status} para ${symbol} — tentando Bybit`);
  } catch (binanceErr) {
    const msg = binanceErr instanceof Error ? binanceErr.message : String(binanceErr);
    console.warn(`[price] Binance falhou para ${symbol}: ${msg} — tentando Bybit`);
  }

  // ── Fallback 2: Bybit ─────────────────────────────────────────
  try {
    const bybitRes = await fetch(
      `https://api.bybit.com/v5/market/tickers?category=linear&symbol=${encodeURIComponent(symbol)}`,
      { cache: 'no-store', signal: AbortSignal.timeout(5_000) },
    );

    if (!bybitRes.ok) {
      return NextResponse.json(
        { error: `Bybit API error ${bybitRes.status}` },
        { status: 502 },
      );
    }

    const bybitData = await bybitRes.json();
    const ticker    = bybitData?.result?.list?.[0];
    const price     = ticker?.lastPrice;

    if (!price) {
      return NextResponse.json(
        { error: `Sem dados de preco para ${symbol}` },
        { status: 502 },
      );
    }

    return NextResponse.json({
      symbol,
      price,
      timestamp: new Date().toISOString(),
      source:    'bybit',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro ao buscar preco';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
