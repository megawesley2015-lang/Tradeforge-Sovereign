// =============================================================
// TRADEFORGE SOVEREIGN — API Route: /api/signals
// O que faz: Endpoint para buscar sinais ativos e processar novos candles
// Métodos:
//   GET  → retorna sinais ativos do banco
//   POST → recebe candles, roda o SignalEngine, persiste e retorna sinal
// =============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { runSignalEngine, persistSignal } from '@/lib/signals/engine';
import type { OHLCVCandle } from '@/lib/indicators';

// ─── GET: Buscar sinais ativos ───────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { searchParams } = new URL(request.url);
    const ticker = searchParams.get('ticker');
    const direction = searchParams.get('direction'); // 'BUY' | 'SELL' | 'HOLD'
    const limit = parseInt(searchParams.get('limit') ?? '20');

    let query = supabase
      .from('signals')
      .select('*')
      .eq('status', 'ACTIVE')
      .order('timestamp', { ascending: false })
      .limit(limit);

    if (ticker) query = query.eq('ticker', ticker);
    if (direction) query = query.eq('direction', direction);

    const { data, error } = await query;

    if (error) throw error;

    return NextResponse.json({ signals: data, count: data?.length ?? 0 });
  } catch (err: any) {
    console.error('[GET /api/signals]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ─── POST: Processar candles e gerar sinal ───────────────────
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      ticker,
      candles,
      config,
    }: {
      ticker: string;
      candles: OHLCVCandle[];
      config?: {
        capitalTotal?: number;
        maxRiskPct?: number;
        winRate?: number;
      };
    } = body;

    if (!ticker) {
      return NextResponse.json({ error: 'Campo "ticker" obrigatório. Ex: "BTCUSDT"' }, { status: 400 });
    }
    if (!candles || !Array.isArray(candles)) {
      return NextResponse.json({ error: 'Campo "candles" obrigatório (array de OHLCV).' }, { status: 400 });
    }
    if (candles.length < 30) {
      return NextResponse.json(
        {
          error: `Mínimo de 30 candles necessário para calcular os indicadores. Você enviou ${candles.length}.`,
          tip: 'Use o script test-api.ps1 na raiz do projeto para gerar 35 candles automaticamente.',
        },
        { status: 400 }
      );
    }

    // Roda o engine com os candles recebidos
    const signal = runSignalEngine(ticker, candles, config ?? {});

    // Só persiste se for BUY ou SELL (HOLD não vale a pena salvar)
    let signalId: string | null = null;
    if (signal.direction !== 'HOLD') {
      const result = await persistSignal(
        signal,
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
      signalId = result?.id ?? null;
    }

    return NextResponse.json({
      signal,
      signalId,
      persisted: signalId !== null,
    });
  } catch (err: any) {
    console.error('[POST /api/signals]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
