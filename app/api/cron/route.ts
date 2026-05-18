import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// ─────────────────────────────────────────────────────────────
// Vercel Cron — roda a cada 5 minutos (requer plano Pro).
// Plano Hobby suporta apenas 1x/dia ("0 0 * * *").
//
// SEGURANÇA: protegido pelo header CRON_SECRET.
// Configure CRON_SECRET=uma-string-aleatória no .env.local
// e nas env vars da Vercel.
//
// ARQUITETURA:
//   Fase 1 — GUARDIAN: busca TODAS as posições abertas no DB
//            e as steppeia, independente de como foram abertas.
//            Corrige o bug onde posições em símbolos fora do
//            portfólio ficavam abertas para sempre.
//   Fase 2 — SCANNER: verifica os símbolos do portfólio em
//            busca de novos setups de entrada.
// ─────────────────────────────────────────────────────────────

// Símbolos que o bot escaneia em busca de NOVAS entradas.
// Para adicionar/remover, edite esta lista.
const PORTFOLIO_SYMBOLS = [
  'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT',
  'DOGEUSDT', 'ADAUSDT', 'XRPUSDT',
];

// Tempo máximo sem ser stepada antes de disparar alerta (ms)
const STALE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutos

async function callCycle(
  symbol: string,
  balance: number,
  baseUrl: string,
): Promise<{ symbol: string; status: string; mood?: string; error?: string }> {
  try {
    const res = await fetch(`${baseUrl}/trading/api/cycle`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbol,
        balance,
        riskConfig: {
          riskPerTrade:    0.01,
          stopLossPercent: 0.02,
          atrMultiplier:   2.0,
          useATRStop:      true,
          minRiskReward:   2.0,
          circuitBreaker:  10,
          trendFilter:     true,
          useAdxFilter:    true,
          adxMinStrength:  20,
          trailingStop:    true,
          scaledExits:     true,
          progressiveRisk: true,
          slippage:        0.001,
        },
        params: {
          rsiLow:    35,
          rsiHigh:   65,
          smaPeriod: 200,
        },
      }),
    });
    const data = await res.json();
    return { symbol, status: data.status, mood: data.mood };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido';
    return { symbol, status: 'Error', error: msg };
  }
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();
  const baseUrl   = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  try {
    // ── Perfil ──────────────────────────────────────────────
    const { data: profile } = await supabase
      .from('profiles')
      .select('balance, account_status')
      .limit(1)
      .single();

    if (!profile) {
      return NextResponse.json({ error: 'Nenhum perfil encontrado' }, { status: 400 });
    }

    if (profile.account_status === 'SAFE_MODE') {
      console.log('⏸️  Cron: SAFE MODE — ciclo ignorado');
      return NextResponse.json({ status: 'skipped', reason: 'SAFE_MODE' });
    }

    // ════════════════════════════════════════════════════════
    // FASE 1 — POSITION GUARDIAN
    // Busca TODAS as posições abertas no DB e as steppeia.
    // Garante que nenhuma posição fique "fantasma" — mesmo
    // símbolos fora do PORTFOLIO_SYMBOLS são monitorados.
    // ════════════════════════════════════════════════════════
    const { data: openPositions } = await supabase
      .from('active_positions')
      .select('symbol, updated_at');

    const guardianResults: ReturnType<typeof callCycle> extends Promise<infer T> ? T[] : never[] = [];
    const openSymbols = new Set<string>();

    if (openPositions && openPositions.length > 0) {
      console.log(`🛡️  Guardian: ${openPositions.length} posição(ões) abertas — stepando todas`);

      for (const pos of openPositions) {
        openSymbols.add(pos.symbol);

        // Detecta posições "stale" — não atualizadas há muito tempo
        const lastUpdate = pos.updated_at ? new Date(pos.updated_at).getTime() : 0;
        const ageMs      = Date.now() - lastUpdate;
        if (ageMs > STALE_THRESHOLD_MS) {
          console.warn(`⚠️  Posição STALE: ${pos.symbol} — sem update há ${Math.round(ageMs / 60000)} min`);
          // Notifica via Telegram se configurado
          try {
            await fetch(`${baseUrl}/trading/api/cycle`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ symbol: pos.symbol, balance: profile.balance }),
            });
          } catch { /* silenced — o loop abaixo vai tentar novamente */ }
        }

        const result = await callCycle(pos.symbol, profile.balance, baseUrl);
        guardianResults.push(result);
        console.log(`🛡️  Guardian [${pos.symbol}]: ${result.status} — ${result.mood ?? result.error ?? ''}`);
        await new Promise((r) => setTimeout(r, 800));
      }
    }

    // ════════════════════════════════════════════════════════
    // FASE 2 — SCANNER DE NOVOS SETUPS
    // Verifica símbolos do portfólio que NÃO têm posição aberta.
    // Evita chamar o ciclo duas vezes para o mesmo símbolo.
    // ════════════════════════════════════════════════════════
    const scanSymbols = PORTFOLIO_SYMBOLS.filter((s) => !openSymbols.has(s));
    const scanResults: typeof guardianResults = [];

    for (const symbol of scanSymbols) {
      const result = await callCycle(symbol, profile.balance, baseUrl);
      scanResults.push(result);
      console.log(`📡 Scanner [${symbol}]: ${result.status} — ${result.mood ?? result.error ?? ''}`);
      await new Promise((r) => setTimeout(r, 1500));
    }

    const elapsed = Date.now() - startTime;
    console.log(`✅ Cron finalizado em ${elapsed}ms`);

    return NextResponse.json({
      status:    'ok',
      timestamp: new Date().toISOString(),
      elapsed:   `${elapsed}ms`,
      guardian:  { checked: openPositions?.length ?? 0, results: guardianResults },
      scanner:   { checked: scanSymbols.length,        results: scanResults },
    });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('❌ Cron Job falhou:', msg);
    return NextResponse.json({ status: 'error', message: msg }, { status: 500 });
  }
}
