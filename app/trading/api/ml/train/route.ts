
import { NextResponse } from 'next/server';
import { getMLModel } from '@/lib/trading/ml-model';

/**
 * POST /trading/api/ml/train
 *
 * Treina o modelo ML com os trades históricos do Supabase.
 * Deve ser chamado manualmente ou via cron após acumular dados suficientes.
 *
 * Recomendação: chamar após fechar pelo menos 50 trades.
 */
export async function POST() {
  try {
    const model = await getMLModel();
    const result = await model.trainFromSupabase();

    if (result.samples === 0) {
      return NextResponse.json(
        {
          success: false,
          message: 'Sem trades históricos suficientes para treinar. Mínimo: 10 trades fechados com PnL.',
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success:  true,
      samples:  result.samples,
      accuracy: parseFloat((result.accuracy * 100).toFixed(2)),
      message:  `Modelo treinado com ${result.samples} amostras. Acurácia: ${(result.accuracy * 100).toFixed(1)}%`,
    });
  } catch (err: any) {
    console.error('❌ ML train error:', err);
    return NextResponse.json(
      { success: false, error: err.message ?? 'Erro interno' },
      { status: 500 }
    );
  }
}

// GET: retorna status atual do modelo
export async function GET() {
  try {
    const model = await getMLModel();
    const stats = model.stats;

    return NextResponse.json({
      ready:     model.isReady,
      trainedOn: stats.trainedOn,
      accuracy:  parseFloat((stats.accuracy * 100).toFixed(2)),
      message:   model.isReady
        ? `Modelo ativo — treinado em ${stats.trainedOn} amostras (${(stats.accuracy * 100).toFixed(1)}% acurácia)`
        : 'Modelo não treinado — usando predição neutra (50%)',
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
