// =============================================================
// TRADEFORGE SOVEREIGN — Save Config Route
// ──────────────────────────────────────────────────────────────
// Salva uma StrategyConfig no Supabase (tabela bot_configs).
// O bot real lê essa tabela na inicialização e herda a config
// que foi validada pelo backtest — zero divergência.
// =============================================================

import { NextResponse }  from 'next/server';
import { supabase }      from '@/lib/supabase';
import { exportConfig }  from '@/lib/trading/strategy-engine';

export async function POST(req: Request) {
  try {
    const {
      name,
      config,
      assets,
      backtestNetPct,
      backtestWinRate,
      backtestMaxDD,
    } = await req.json();

    if (!name || !config || !assets) {
      return NextResponse.json(
        { error: 'name, config e assets são obrigatórios' },
        { status: 400 },
      );
    }

    const id = await exportConfig(
      { name, config, assets, backtestNetPct, backtestWinRate, backtestMaxDD },
      supabase,
    );

    if (!id) {
      return NextResponse.json(
        { error: 'Falha ao salvar no Supabase — verifique se a tabela bot_configs existe (migration 005_bot_configs.sql)' },
        { status: 500 },
      );
    }

    return NextResponse.json({ id, saved: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
