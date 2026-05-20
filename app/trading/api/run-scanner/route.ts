import { NextResponse } from 'next/server';

// POST /trading/api/run-scanner
// Proxy seguro: lê CRON_SECRET no servidor e dispara o scanner.
// O browser nunca vê o secret — apenas chama este endpoint.
//
// Rate-limit simples: rejeita se última execução foi há < 2 minutos.
// Isso evita abuso acidental (duplo-clique, refreshes rápidos).
//
// Risco técnico: em produção Vercel Hobby o timeout de Function é 10s.
// O scanner demora ~30-60s (19 símbolos × 800ms sleep).
// Solução: responde imediatamente com 202 Accepted e deixa o scanner
// rodar em background via waitUntil (não disponível no Hobby).
// ALTERNATIVA ADOTADA: aumenta o timeout via maxDuration = 300 (Pro)
// ou usa o GitHub Actions workflow_dispatch como "Rodar Agora" seguro.
//
// Para o MVP/Hobby: a chamada pode sofrer timeout no Vercel mas o
// scanner continua rodando — o resultado aparece no próximo refresh.

export const maxDuration = 300; // segundos — só efetivo no Vercel Pro

// Armazena timestamp da última execução em memória do processo.
// Suficiente para Vercel (cada instância tem vida curta).
let lastRunAt = 0;
const MIN_INTERVAL_MS = 2 * 60 * 1000; // 2 minutos

export async function POST() {
  const now = Date.now();
  if (now - lastRunAt < MIN_INTERVAL_MS) {
    const waitSec = Math.ceil((MIN_INTERVAL_MS - (now - lastRunAt)) / 1000);
    return NextResponse.json(
      { error: `Aguarde ${waitSec}s antes de rodar novamente.` },
      { status: 429 },
    );
  }

  const secret = process.env.CRON_SECRET;
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

  lastRunAt = now;

  try {
    const res = await fetch(`${appUrl}/trading/api/scanner`, {
      method:  'GET',
      headers: {
        ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
        'Content-Type': 'application/json',
      },
      // sem cache — queremos execução real
      cache: 'no-store',
    });

    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json(
        { error: data.error ?? `Scanner retornou HTTP ${res.status}` },
        { status: res.status },
      );
    }

    return NextResponse.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
