import { NextRequest, NextResponse } from 'next/server';
import { GET as runScanner } from '@/app/trading/api/scanner/route';

// POST /trading/api/run-scanner
// Invoca o scanner DIRETAMENTE (sem HTTP self-call).
// Elimina todos os problemas de URL/host no Vercel:
//   - sem resolucao de dominio
//   - sem problema de preview vs producao
//   - sem 401 por CRON_SECRET mal resolvido
//
// Simplesmente monta um Request com o secret e chama o handler.

export const maxDuration = 300;

let lastRunAt = 0;
const MIN_INTERVAL_MS = 2 * 60 * 1000;

export async function POST(req: NextRequest) {
  const now = Date.now();
  if (now - lastRunAt < MIN_INTERVAL_MS) {
    const waitSec = Math.ceil((MIN_INTERVAL_MS - (now - lastRunAt)) / 1000);
    return NextResponse.json(
      { error: `Aguarde ${waitSec}s antes de rodar novamente.` },
      { status: 429 },
    );
  }

  lastRunAt = now;

  try {
    // Cria um Request identico ao que o cron envia
    const secret     = process.env.CRON_SECRET ?? '';
    const internalReq = new NextRequest(
      'http://localhost/trading/api/scanner',
      {
        method:  'GET',
        headers: { Authorization: `Bearer ${secret}` },
      },
    );

    const response = await runScanner(internalReq);
    const data     = await response.json();

    return NextResponse.json(data, { status: response.status });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
