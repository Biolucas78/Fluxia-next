import { NextResponse } from 'next/server';
import { getSicoobToken } from '@/lib/sicoob';

export async function GET() {
  try {
    const token = await getSicoobToken('boletos_inclusao boletos_consulta');
    return NextResponse.json({ ok: true, token: token.substring(0, 20) + '...' });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
