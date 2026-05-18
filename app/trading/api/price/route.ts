import { NextRequest, NextResponse } from 'next/server';

// Usa fetch nativo (compatível com Turbopack + Edge + Node runtime).
// Axios foi removido: causava problemas de módulo com Turbopack em Next.js 16.
//
// Estratégia de fallback (em ordem):
//   1. Binance (api.binance.com)    — mais preciso, bloqueado em cloud providers
//   2. Bybit   (api.bybit.com)      — bloqueado em alguns cloud providers
//   3. KuCoin  (api.kucoin.com)     — política mais permissiva, último recurso

const KUCOIN_RENAMES: Record<string, string> = {
  'MATICUSDT': 'POL-USDT',
  'MATICBTC':  'POL-BTC',
  'MATICETH':  'POL-ETH',
};

/** Converte símbolo Binance → KuCoin: BNBUSDT → BNB-USDT */
function toKucoinSymbol(symbol: string): string {
  const s = symbol.toUpperCase();
  if (KUCOIN_RENAMES[s]) return KUCOIN_RENAMES[s];
  if (s.endsWith('USDT')) return `${s.slice(0, -4)}-USDT`;
  if (s.endsWith('BTC'))  return `${s.slice(0, -3)}-BTC`;
  if (s.endsWith('ETH'))  return `${s.slice(0, -3)}-ETH`;
  return s;
}

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
    console.warn(`[price] Binance retornou ${res.status} para ${symbol} — tentando Bybit`);
  } catch (binanceErr) {
    const msg = binanceErr instanceof Error ? binanceErr.message : String(binanceErr);
    console.warn(`[price] Binance falhou para ${symbol}: ${msg} — tentando Bybit`);
  }

  // ── Tentativa 2: Bybit ────────────────────────────────────────
  try {
    const bybitRes = await fetch(
      `https://api.bybit.com/v5/market/tickers?category=linear&symbol=${encodeURIComponent(symbol)}`,
      { cache: 'no-store', signal: AbortSignal.timeout(5_000) },
    );

    if (bybitRes.ok) {
      const bybitData = await bybitRes.json();
      const ticker    = bybitData?.result?.list?.[0];
      const price     = ticker?.lastPrice;

      if (price) {
        return NextResponse.json({
          symbol,
          price,
          timestamp: new Date().toISOString(),
          source:    'bybit',
        });
      }
    }
    console.warn(`[price] Bybit retornou ${bybitRes.status} para ${symbol} — tentando KuCoin`);
  } catch (bybitErr) {
    const msg = bybitErr instanceof Error ? bybitErr.message : String(bybitErr);
    console.warn(`[price] Bybit falhou para ${symbol}: ${msg} — tentando KuCoin`);
  }

  // ── Tentativa 3: KuCoin (último recurso) ──────────────────────
  // KuCoin usa símbolo com hífen: BNB-USDT, BTC-USDT etc.
  // Endpoint level1 retorna o melhor preço de venda (ask) como referência de preço.
  try {
    const kucoinSymbol = toKucoinSymbol(symbol);
    const kucoinRes = await fetch(
      `https://api.kucoin.com/api/v1/market/orderbook/level1?symbol=${encodeURIComponent(kucoinSymbol)}`,
      { cache: 'no-store', signal: AbortSignal.timeout(8_000) },
    );

    if (!kucoinRes.ok) {
      return NextResponse.json(
        { error: `KuCoin API error ${kucoinRes.status}` },
        { status: 502 },
      );
    }

    const kucoinData = await kucoinRes.json();
    if (kucoinData?.code !== '200000') {
      return NextResponse.json(
        { error: `KuCoin erro ${kucoinData?.code}: ${kucoinData?.msg ?? 'sem dados'}` },
        { status: 502 },
      );
    }

    const price = kucoinData?.data?.price;
    if (!price) {
      return NextResponse.json(
        { error: `KuCoin: sem preço para ${kucoinSymbol}` },
        { status: 502 },
      );
    }

    return NextResponse.json({
      symbol,
      price,
      timestamp: new Date().toISOString(),
      source:    'kucoin',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Todos os provedores falharam';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
