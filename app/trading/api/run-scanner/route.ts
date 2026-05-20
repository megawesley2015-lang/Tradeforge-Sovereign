import { NextRequest, NextResponse } from 'next/server';

// POST /trading/api/run-scanner
// Proxy seguro: le CRON_SECRET no servidor e dispara o scanner.
//
// IMPORTANTE — resolucao de host no Vercel:
//   req.headers.get('host') retorna o deployment URL interno
//   (ex: tradeforge-xxx-hash.vercel.app) — nao o dominio de producao.
//   req.headers.get('x-forwarded-host') contem o dominio real
//   que o usuario esta acessando (ex: tradeforge-sovereign.vercel.app).
//   Usamos x-forwarded-host com fallback para host.

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

  // x-forwarded-host = dominio real (producao/preview escolhido pelo user)
  // host             = deployment interno do Vercel (fallback)
  const fwdHost = req.headers.get('x-forwarded-host');
  const rawHost = req.headers.get('host') ?? 'localhost:3000';
  const host    = fwdHost ?? rawHost;
  const proto   = host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https';
  const base    = `${proto}://${host}`;

  const secret = process.env.CRON_SECRET;

  lastRunAt = now;

  try {
    const res = await fetch(`${base}/trading/api/scanner`, {
      method: 'GET',
      headers: {
        ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
      },
      cache: 'no-store',
    });

    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) {
      const text = await res.text();
      return NextResponse.json(
        { error: `Scanner retornou HTTP ${res.status}. Host resolvido: ${host}. Preview: ${text.slice(0, 120)}` },
        { status: 502 },
      );
    }

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
