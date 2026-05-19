import { NextRequest, NextResponse } from 'next/server';
import { getCandles } from '@/lib/trading/strategy-engine';

// GET /trading/api/candles?symbol=BTCUSDT&interval=4h&limit=100
// Reutiliza a cadeia Binance → Bybit → KuCoin do strategy-engine.
// Usado pela página de detalhes do trade para renderizar o gráfico de velas.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol   = searchParams.get('symbol')   ?? 'BTCUSDT';
  const interval = searchParams.get('interval') ?? '4h';
  const limit    = Math.min(parseInt(searchParams.get('limit') ?? '100'), 500);

  try {
    const candles = await getCandles(symbol, interval, limit);
    return NextResponse.json({ symbol, interval, candles });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro ao buscar candles';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
