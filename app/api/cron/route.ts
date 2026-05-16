
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

/**
 * Vercel Cron Job — substitui o node-cron que não funciona em serverless.
 *
 * Configurado em vercel.json para rodar a cada 15 minutos.
 * Em produção, a Vercel chama esta rota automaticamente.
 *
 * SEGURANÇA: protegido pelo header CRON_SECRET para evitar chamadas externas.
 * Configure CRON_SECRET=uma-string-aleatória no .env.local e nas env vars da Vercel.
 */

// Ativos que o bot monitora em cada ciclo
const PORTFOLIO_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];

export async function GET(req: NextRequest) {
  // Verifica o secret para garantir que só a Vercel chama esta rota
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();
  const results: Record<string, unknown>[] = [];

  try {
    // Busca o perfil do usuário para pegar banca e configurações
    const { data: profile } = await supabase
      .from('profiles')
      .select('balance, account_status')
      .limit(1)
      .single();

    if (!profile) {
      return NextResponse.json({ error: 'Nenhum perfil encontrado' }, { status: 400 });
    }

    // Se está em safe mode, registra e para
    if (profile.account_status === 'SAFE_MODE') {
      console.log('⏸️ Cron: Bot em SAFE MODE — ciclo ignorado');
      return NextResponse.json({
        status:  'skipped',
        reason:  'SAFE_MODE',
        message: 'Bot em modo de proteção. Reative manualmente no dashboard.',
      });
    }

    // Executa ciclo para cada ativo do portfólio
    for (const symbol of PORTFOLIO_SYMBOLS) {
      try {
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        const res = await fetch(`${baseUrl}/trading/api/cycle`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            symbol,
            balance: profile.balance,
            riskConfig: {
              riskPerTrade:    0.01,   // 1% por operação
              stopLossPercent: 0.02,   // 2% stop loss
              minRiskReward:   2.0,    // R:R mínimo 1:2
              maxDrawdown:     10,     // para em 10% de drawdown
            },
            params: {
              rsiLow:    35,
              rsiHigh:   65,
              smaPeriod: 200,
            },
          }),
        });

        const data = await res.json();
        results.push({ symbol, ...data });
        console.log(`🤖 Cron [${symbol}]: ${data.status} — ${data.mood || ''}`);
      } catch (err: any) {
        results.push({ symbol, status: 'Error', message: err.message });
        console.error(`❌ Cron [${symbol}]: ${err.message}`);
      }

      // Pequena pausa entre ativos para não sobrecarregar a Binance API
      await new Promise((r) => setTimeout(r, 1500));
    }

    const elapsed = Date.now() - startTime;
    console.log(`✅ Cron finalizado em ${elapsed}ms`);

    return NextResponse.json({
      status:    'ok',
      timestamp: new Date().toISOString(),
      elapsed:   `${elapsed}ms`,
      results,
    });
  } catch (error: any) {
    console.error('❌ Cron Job falhou:', error.message);
    return NextResponse.json({ status: 'error', message: error.message }, { status: 500 });
  }
}
