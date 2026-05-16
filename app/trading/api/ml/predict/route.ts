
import { NextRequest, NextResponse } from 'next/server';
import { getMLModel, TradeFeatures } from '@/lib/trading/ml-model';

/**
 * POST /trading/api/ml/predict
 *
 * Body (JSON):
 * {
 *   rsi: number,
 *   ema200: number,
 *   price: number,
 *   macdHistogram: number,
 *   bbUpper: number,
 *   bbLower: number,
 *   bbMiddle: number,
 *   volume: number,
 *   avgVolume: number,
 *   signal: "LONG" | "SHORT"
 * }
 *
 * Retorna: { probability, shouldEnter, confidence, features }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as Partial<TradeFeatures>;

    // Valida campos obrigatórios
    const required: (keyof TradeFeatures)[] = [
      'rsi', 'ema200', 'price', 'macdHistogram',
      'bbUpper', 'bbLower', 'bbMiddle', 'volume', 'avgVolume', 'signal',
    ];

    for (const field of required) {
      if (body[field] === undefined || body[field] === null) {
        return NextResponse.json(
          { error: `Campo obrigatório ausente: ${field}` },
          { status: 400 }
        );
      }
    }

    if (body.signal !== 'LONG' && body.signal !== 'SHORT') {
      return NextResponse.json(
        { error: 'Campo "signal" deve ser "LONG" ou "SHORT"' },
        { status: 400 }
      );
    }

    const model      = await getMLModel();
    const prediction = model.predict(body as TradeFeatures);

    return NextResponse.json({
      ...prediction,
      probability: parseFloat(prediction.probability.toFixed(4)),
      modelReady:  model.isReady,
      modelStats:  model.stats,
    });
  } catch (err: any) {
    console.error('❌ ML predict error:', err);
    return NextResponse.json(
      { error: err.message ?? 'Erro interno' },
      { status: 500 }
    );
  }
}
