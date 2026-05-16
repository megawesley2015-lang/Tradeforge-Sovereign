import { SentimentResult, MarketMood, TradeSignal } from './types';

const SYMBOL_MAP: Record<string, string> = {
  BTCUSDT: 'CRYPTO:BTC',
  ETHUSDT: 'CRYPTO:ETH',
  SOLUSDT: 'CRYPTO:SOL',
};

interface AlphaVantageFeed {
  title: string;
  overall_sentiment_score: number;
  overall_sentiment_label: string;
}

export class SentimentTracker {
  private readonly AV_API_KEY = process.env.ALPHA_VANTAGE_API_KEY || 'demo';
  private readonly FNG_URL = 'https://api.alternative.me/fng/?limit=1';

  private async getFearGreedIndex(): Promise<{ value: number; label: string }> {
    try {
      const res = await fetch(this.FNG_URL);
      const data = await res.json();
      const entry = data?.data?.[0];
      return {
        value: parseInt(entry?.value || '50', 10),
        label: entry?.value_classification || 'Neutral',
      };
    } catch {
      return { value: 50, label: 'Neutral' };
    }
  }

  private async getAlphaVantageNews(symbol: string): Promise<{ score: number; topNews: string[] }> {
    const ticker = SYMBOL_MAP[symbol] || 'CRYPTO:BTC';
    const url = `https://www.alphavantage.co/query?function=NEWS_SENTIMENT&tickers=${ticker}&limit=10&apikey=${this.AV_API_KEY}`;

    try {
      const res = await fetch(url);
      const data = await res.json();

      if (!data?.feed || data.Information) {
        return { score: 50, topNews: ['Limite de API atingido - sentimento neutro'] };
      }

      const feed: AlphaVantageFeed[] = data.feed.slice(0, 5);
      const avgScore =
        feed.reduce((sum, item) => sum + (item.overall_sentiment_score || 0), 0) / (feed.length || 1);

      const normalizedScore = Math.round(((avgScore + 1) / 2) * 100);
      const topNews = feed.map((item) => item.title).slice(0, 3);

      return { score: normalizedScore, topNews };
    } catch {
      return { score: 50, topNews: ['Erro ao buscar noticias - sentimento neutro'] };
    }
  }

  private scoreToMood(score: number): MarketMood {
    if (score <= 20) return 'EXTREME_FEAR';
    if (score <= 40) return 'FEAR';
    if (score <= 60) return 'NEUTRAL';
    if (score <= 80) return 'GREED';
    return 'EXTREME_GREED';
  }

  private evaluateVeto(
    mood: MarketMood,
    signal: TradeSignal,
    fngValue: number
  ): { veto: boolean; reason?: string } {
    if (signal === 'LONG' && mood === 'EXTREME_FEAR' && fngValue < 15) {
      return { veto: true, reason: `Fear & Greed = ${fngValue} (Medo Extremo) - LONG vetado` };
    }
    if (signal === 'SHORT' && mood === 'EXTREME_GREED' && fngValue > 85) {
      return { veto: true, reason: `Fear & Greed = ${fngValue} (Ganancia Extrema) - SHORT vetado` };
    }
    return { veto: false };
  }

  async analyze(symbol: string, technicalSignal: TradeSignal): Promise<SentimentResult> {
    const [fng, news] = await Promise.all([
      this.getFearGreedIndex(),
      this.getAlphaVantageNews(symbol),
    ]);

    const compositeScore = Math.round(fng.value * 0.6 + news.score * 0.4);
    const mood = this.scoreToMood(compositeScore);
    const { veto, reason } = this.evaluateVeto(mood, technicalSignal, fng.value);

    return {
      score: compositeScore,
      mood,
      fearGreedIndex: fng.value,
      topNews: news.topNews,
      shouldVeto: veto,
      vetoReason: reason,
    };
  }
}
