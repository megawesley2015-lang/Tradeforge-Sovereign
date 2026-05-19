import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// GET /trading/api/live-demo/[id]
// Retorna um único trade de live_demo_trades pelo UUID.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const { data: trade, error } = await supabase
    .from('live_demo_trades')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !trade) {
    return NextResponse.json({ error: 'Trade não encontrado' }, { status: 404 });
  }

  return NextResponse.json({ trade });
}
