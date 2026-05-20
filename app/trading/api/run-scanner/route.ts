import { NextRequest, NextResponse } from 'next/server';

// POST /trading/api/run-scanner
// Proxy seguro: le CRON_SECRET no servidor e dispara o scanner.
// O browser nunca ve o secret -- apenas chama este endpoint.
//
// URL base: derivada do header `host` do proprio request --
// o metodo mais confiavel em Next.js App Router para self-calls.
// Evita o problema de VERCEL_URL apontar para deployment efemero.
//
// Rate-limit: rejeita se ultima execucao foi ha < 2 minutos.

export const maxDuration = 300; // so efetivo no Vercel Pro

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

  // Constroi a URL base a partir do host do request atual --
  // funciona em localhost (http) e em producao Vercel (https).
  const host  = req.headers.get('host') ?? 'localhost:3000';
  const proto = host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https';
  const base  = `${proto}://${host}`;

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

    // Se vier HTML (erro 404/500 do Next), captura antes do .json()
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) {
      const text = await res.text();
      return NextResponse.json(
        { error: `Scanner retornou HTTP ${res.status}. URL: ${base}/trading/api/scanner. Preview: ${text.slice(0, 100)}` },
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
