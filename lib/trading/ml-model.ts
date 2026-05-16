
import { supabase } from '../supabase';

/**
 * MLModel — Regressão Logística treinada em TypeScript puro.
 *
 * Sem bibliotecas externas. Implementa gradiente descendente estocástico
 * mini-batch para classificar se uma condição de mercado vai resultar em WIN.
 *
 * Features de entrada (normalizadas 0-1):
 *   [0] rsiNorm       — RSI / 100
 *   [1] emaDistNorm   — distância % do preço para EMA200 (clamp -10% a +10%)
 *   [2] macdNorm      — sinal MACD (positivo=bullish), clamp -1 a +1
 *   [3] bbPosNorm     — posição dentro das Bollinger Bands (0=banda inf, 1=banda sup)
 *   [4] volRatioNorm  — volume atual / média 20 períodos (clamp 0 a 3, norm /3)
 *   [5] signalLong    — 1 se sinal era LONG, 0 se SHORT
 *
 * Saída: probabilidade de WIN (0.0 a 1.0)
 * Threshold padrão: 0.55 (55% de confiança mínima para entrar)
 */

export interface TradeFeatures {
  rsi:            number;
  ema200:         number;
  price:          number;
  macdHistogram:  number;
  bbUpper:        number;
  bbLower:        number;
  bbMiddle:       number;
  volume:         number;
  avgVolume:      number;
  signal:         'LONG' | 'SHORT';
}

export interface MLPrediction {
  probability:  number;       // 0.0 - 1.0
  shouldEnter:  boolean;      // probability > threshold
  confidence:   'LOW' | 'MEDIUM' | 'HIGH';
  features:     number[];     // vetor normalizado
}

export interface ModelWeights {
  weights:       number[];    // 6 pesos + bias
  bias:          number;
  trainedOn:     number;      // nº de amostras
  accuracy:      number;      // 0-1
  lastTrainedAt: string;
}

const FEATURE_COUNT = 6;
const DEFAULT_THRESHOLD = 0.55;
const LEARNING_RATE     = 0.01;
const EPOCHS            = 200;
const BATCH_SIZE        = 16;

export class MLModel {
  private weights: number[] = new Array(FEATURE_COUNT).fill(0);
  private bias    = 0;
  private trained = false;
  private trainedOn = 0;
  private accuracy  = 0;

  // ── Sigmoid ──────────────────────────────────────────────────────────────
  private sigmoid(z: number): number {
    return 1 / (1 + Math.exp(-Math.max(-500, Math.min(500, z))));
  }

  // ── Forward pass ─────────────────────────────────────────────────────────
  private forward(features: number[]): number {
    const z = features.reduce((sum, f, i) => sum + f * this.weights[i], this.bias);
    return this.sigmoid(z);
  }

  // ── Normaliza as features brutas para vetor 0-1 ──────────────────────────
  extractFeatures(raw: TradeFeatures): number[] {
    // [0] RSI normalizado
    const rsiNorm = raw.rsi / 100;

    // [1] Distância % do preço para EMA200 (clamp ±10%)
    const emaDist    = raw.ema200 > 0 ? (raw.price - raw.ema200) / raw.ema200 : 0;
    const emaDistNorm = (Math.max(-0.1, Math.min(0.1, emaDist)) + 0.1) / 0.2;

    // [2] MACD histogram normalizado (clamp ±1% do preço)
    const macdClamp  = Math.max(-raw.price * 0.01, Math.min(raw.price * 0.01, raw.macdHistogram));
    const macdNorm   = raw.price > 0 ? (macdClamp / (raw.price * 0.01) + 1) / 2 : 0.5;

    // [3] Posição dentro das Bollinger Bands (0=lower, 1=upper)
    const bbRange  = raw.bbUpper - raw.bbLower;
    const bbPosNorm = bbRange > 0 ? Math.max(0, Math.min(1, (raw.price - raw.bbLower) / bbRange)) : 0.5;

    // [4] Volume ratio (volume atual / média), clamp 0-3, norm /3
    const volRatio     = raw.avgVolume > 0 ? raw.volume / raw.avgVolume : 1;
    const volRatioNorm = Math.min(3, volRatio) / 3;

    // [5] Direção do sinal
    const signalLong = raw.signal === 'LONG' ? 1 : 0;

    return [rsiNorm, emaDistNorm, macdNorm, bbPosNorm, volRatioNorm, signalLong];
  }

  // ── Treinamento por gradiente descendente mini-batch ──────────────────────
  train(samples: { features: number[]; label: number }[]): void {
    if (samples.length < 10) {
      console.warn(`⚠️  ML: poucos dados para treinar (${samples.length} amostras). Mínimo: 10`);
      return;
    }

    // Re-inicializa pesos com valores pequenos aleatórios
    this.weights = Array.from({ length: FEATURE_COUNT }, () => (Math.random() - 0.5) * 0.1);
    this.bias    = 0;

    const n = samples.length;

    for (let epoch = 0; epoch < EPOCHS; epoch++) {
      // Shuffle
      const shuffled = [...samples].sort(() => Math.random() - 0.5);

      for (let bStart = 0; bStart < n; bStart += BATCH_SIZE) {
        const batch = shuffled.slice(bStart, bStart + BATCH_SIZE);

        const gradW = new Array(FEATURE_COUNT).fill(0);
        let   gradB = 0;

        for (const { features, label } of batch) {
          const pred  = this.forward(features);
          const error = pred - label;

          for (let j = 0; j < FEATURE_COUNT; j++) {
            gradW[j] += error * features[j];
          }
          gradB += error;
        }

        // Atualiza pesos
        for (let j = 0; j < FEATURE_COUNT; j++) {
          this.weights[j] -= (LEARNING_RATE / batch.length) * gradW[j];
        }
        this.bias -= (LEARNING_RATE / batch.length) * gradB;
      }
    }

    // Calcula acurácia no dataset de treino
    let correct = 0;
    for (const { features, label } of samples) {
      const pred = this.forward(features) >= DEFAULT_THRESHOLD ? 1 : 0;
      if (pred === label) correct++;
    }

    this.trained   = true;
    this.trainedOn = n;
    this.accuracy  = correct / n;

    console.log(`🧠 ML treinado: ${n} amostras | Acurácia: ${(this.accuracy * 100).toFixed(1)}%`);
    console.log(`   Pesos: [${this.weights.map((w) => w.toFixed(4)).join(', ')}] bias=${this.bias.toFixed(4)}`);
  }

  // ── Predição ──────────────────────────────────────────────────────────────
  predict(raw: TradeFeatures, threshold = DEFAULT_THRESHOLD): MLPrediction {
    const features    = this.extractFeatures(raw);
    const probability = this.trained ? this.forward(features) : 0.5;
    const shouldEnter = probability >= threshold;
    const confidence: MLPrediction['confidence'] =
      probability >= 0.75 ? 'HIGH'
      : probability >= 0.60 ? 'MEDIUM'
      : 'LOW';

    return { probability, shouldEnter, confidence, features };
  }

  // ── Salva pesos no Supabase ───────────────────────────────────────────────
  async saveWeights(): Promise<void> {
    const payload: ModelWeights = {
      weights:       this.weights,
      bias:          this.bias,
      trainedOn:     this.trainedOn,
      accuracy:      this.accuracy,
      lastTrainedAt: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('ml_weights')
      .upsert({ id: 1, ...payload }, { onConflict: 'id' });

    if (error) console.error('❌ Falha ao salvar pesos ML:', error.message);
    else console.log('💾 Pesos ML salvos no Supabase');
  }

  // ── Carrega pesos do Supabase ─────────────────────────────────────────────
  async loadWeights(): Promise<boolean> {
    const { data, error } = await supabase
      .from('ml_weights')
      .select('*')
      .eq('id', 1)
      .maybeSingle();

    if (error || !data) return false;

    this.weights   = data.weights;
    this.bias      = data.bias;
    this.trainedOn = data.trained_on;
    this.accuracy  = data.accuracy;
    this.trained   = true;

    console.log(
      `🧠 ML carregado: treinado em ${data.trained_on} amostras | Acurácia: ${(data.accuracy * 100).toFixed(1)}%`
    );
    return true;
  }

  // ── Treina com trades históricos do Supabase ──────────────────────────────
  async trainFromSupabase(): Promise<{ samples: number; accuracy: number }> {
    // Busca trades fechados com indicadores salvos
    const { data: trades, error } = await supabase
      .from('trades')
      .select('*')
      .eq('status', 'CLOSED')
      .not('pnl', 'is', null)
      .order('created_at', { ascending: false })
      .limit(500);

    if (error || !trades || trades.length === 0) {
      console.warn('⚠️  ML: sem trades históricos para treinar');
      return { samples: 0, accuracy: 0 };
    }

    // Monta amostras de treino a partir dos trades históricos
    const samples: { features: number[]; label: number }[] = [];

    for (const trade of trades) {
      // Se o trade não tiver indicadores salvos, usa valores padrão razoáveis
      // (Em produção, salvaríamos os indicadores no momento da entrada)
      const rsi       = trade.rsi_at_entry        ?? 50;
      const ema200    = trade.ema200_at_entry      ?? trade.entry_price * 0.98;
      const macdHist  = trade.macd_hist_at_entry   ?? 0;
      const bbUpper   = trade.bb_upper_at_entry    ?? trade.entry_price * 1.02;
      const bbLower   = trade.bb_lower_at_entry    ?? trade.entry_price * 0.98;
      const bbMiddle  = (bbUpper + bbLower) / 2;
      const volume    = trade.volume_at_entry      ?? 1000;
      const avgVolume = trade.avg_volume_at_entry  ?? 800;

      const raw: TradeFeatures = {
        rsi,
        ema200,
        price:          trade.entry_price,
        macdHistogram:  macdHist,
        bbUpper,
        bbLower,
        bbMiddle,
        volume,
        avgVolume,
        signal:         trade.side as 'LONG' | 'SHORT',
      };

      const features = this.extractFeatures(raw);
      const label    = trade.pnl > 0 ? 1 : 0;
      samples.push({ features, label });
    }

    this.train(samples);
    await this.saveWeights();

    return { samples: samples.length, accuracy: this.accuracy };
  }

  get isReady(): boolean { return this.trained; }
  get stats(): { trainedOn: number; accuracy: number } {
    return { trainedOn: this.trainedOn, accuracy: this.accuracy };
  }
}

// Singleton com lazy loading dos pesos
let _instance: MLModel | null = null;

export async function getMLModel(): Promise<MLModel> {
  if (!_instance) {
    _instance = new MLModel();
    const loaded = await _instance.loadWeights();
    if (!loaded) {
      console.log('🧠 ML: sem modelo salvo — usando predição neutra até treinar');
    }
  }
  return _instance;
}
