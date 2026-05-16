
import { NextRequest, NextResponse } from 'next/server';
import { arbitrageScanner, ARBITRAGE_SYMBOLS } from '@/lib/trading/arbitrage-scanner';

/**
 * GET /trading/api/arbitrage
 *
 * Query params:
 *   symbols  — CSV de símbolos (ex: ?symbols=BTCUSDT,ETHUSDT)
 *              Padrão: BTCUSDT,ETHUSDT,SOLUSDT
 *
 * Retorna ScanResult com oportunidades ordenadas por spread líquido.
 *
 * Cache: 10s no edge (dados de mercado mudam rapidamente)
 */
export const runtime = 'edge';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbolsParam = searchParams.get('symbols');

  const symbols = symbolsParam
    ? symbolsParam.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)
    : ARBITRAGE_SYMBOLS;

  // Limita a 5 símbolos por chamada para evitar timeout
  const limited = symbols.slice(0, 5);

  try {
    const result = await arbitrageScanner.scan(limited);

    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=5',
      },
    });
  } catch (err: any) {
    console.error('❌ Arbitrage scan error:', err);
    return NextResponse.json(
      { error: 'Falha ao buscar preços das exchanges', detail: err.message },
      { status: 500 }
    );
  }
}
