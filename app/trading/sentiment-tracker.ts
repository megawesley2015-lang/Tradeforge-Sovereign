/**
 * DEPRECADO - Use @/lib/trading/sentiment-tracker
 *
 * A versao real agora esta em lib/trading/sentiment-tracker.ts e integra:
 *  - Fear & Greed Index (Alternative.me - gratuito, sem chave)
 *  - Alpha Vantage News Sentiment (gratuito ate 25 req/dia)
 *  - Score composto 0-100 com veto inteligente por extremos
 */
export { SentimentTracker } from '@/lib/trading/sentiment-tracker';
