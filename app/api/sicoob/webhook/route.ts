import { NextResponse } from 'next/server';
import { getSicoobToken, makeSicoobRequest, getSicoobCert } from '@/lib/sicoob';

export async function POST() {
  try {
    const { pfxBuffer, certPassword } = getSicoobCert();
    const token = await getSicoobToken('webhooks_inclusao webhooks_consulta');

    const body = JSON.stringify({
      url: 'https://fluxia-next.vercel.app/api/webhooks/sicoob',
      codigoTipoMovimento: 7,
      codigoPeriodoMovimento: 1,
      email: 'biolucas@gmail.com',
    });

    const result = await makeSicoobRequest(
      {
        hostname: 'api.sicoob.com.br',
        port: 443,
        path: '/cobranca-bancaria/v3/webhooks',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token,
          'Content-Length': Buffer.byteLength(body),
        },
      },
      body,
      pfxBuffer,
      certPassword
    );

    return NextResponse.json({ ok: true, data: result.body, status: result.status });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const { pfxBuffer, certPassword } = getSicoobCert();
    const token = await getSicoobToken('webhooks_consulta');

    const result = await makeSicoobRequest(
      {
        hostname: 'api.sicoob.com.br',
        port: 443,
        path: '/cobranca-bancaria/v3/webhooks',
        method: 'GET',
        headers: { 'Authorization': 'Bearer ' + token },
      },
      null,
      pfxBuffer,
      certPassword
    );

    return NextResponse.json({ ok: true, data: result.body });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
