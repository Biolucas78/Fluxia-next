import { NextResponse } from 'next/server';

export async function GET() {
  const token = process.env.SITERASTREIO_TOKEN;
  
  if (!token) {
    return NextResponse.json({ error: 'Token não encontrado' });
  }

  const response = await fetch('https://api-labs.wonca.com.br/wonca.labs.v1.LabsService/Track', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Apikey ${token}`
    },
    body: JSON.stringify({ code: 'AN910269794BR' })
  });

  const status = response.status;
  const data = await response.text();
  
  return NextResponse.json({ status, token_ok: true, resposta: data.substring(0, 500) });
}
