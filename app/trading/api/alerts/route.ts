import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase';

// GET /trading/api/alerts?limit=20&status=unread
// Retorna alertas recentes. Usado pelo dashboard para o badge do sino.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit  = Math.min(parseInt(searchParams.get('limit') ?? '20'), 100);
  const status = searchParams.get('status'); // 'unread' | null (todos)

  let query = supabase
    .from('alerts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const unreadCount = status === 'unread'
    ? (data ?? []).length
    : (data ?? []).filter(a => a.status === 'unread').length;

  return NextResponse.json({ alerts: data ?? [], unreadCount });
}

// PATCH /trading/api/alerts — marca todos como lidos
export async function PATCH(_req: NextRequest) {
  const { error } = await supabaseAdmin
    .from('alerts')
    .update({ status: 'read' })
    .eq('status', 'unread');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
