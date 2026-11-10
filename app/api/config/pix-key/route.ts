import { NextResponse } from 'next/server';

// CNPJ não é segredo (já é exposto publicamente em NF-e, etiquetas de envio etc) — só não
// vem pro client-side sem passar por uma rota, por isso esse endpoint simples.
export async function GET() {
  const cnpj = (process.env.ORIGIN_DOCUMENT || '').replace(/\D/g, '');
  if (cnpj.length !== 14) {
    return NextResponse.json({ error: 'ORIGIN_DOCUMENT não configurado ou inválido.' }, { status: 404 });
  }
  const formatted = cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  return NextResponse.json({ cnpj: formatted });
}
