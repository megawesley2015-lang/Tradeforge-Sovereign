import { NextRequest, NextResponse } from 'next/server';

// Usa fetch nativo (compatível com Turbopack + Edge + Node runtime).
// Axios foi removido: causava problemas de módulo com Turbopack em Next.js 16.

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get('symbol') || 'BTCUSDT';

  try {
    const res = await fetch(
      `https://api.binance.com/api/v3/ticker/price?symbol=${encodeURIComponent(symbol)}`,
      { cache: 'no-store' }
    );

    if (!res.ok) {
      return NextResponse.json({ error: `Binance API error ${res.status}` }, { status: 502 });
    }

    const data = await res.json() as { symbol: string; price: string };

    return NextResponse.json({
      symbol,
      price: data.price,
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro ao buscar preço';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
