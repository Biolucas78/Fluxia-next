import { NextRequest, NextResponse } from 'next/server';
import { getSicoobToken, makeSicoobRequest, getSicoobCert } from '@/lib/sicoob';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const nossoNumero = searchParams.get('nossoNumero');
    const cpfCnpj = searchParams.get('cpfCnpj');
    const numeroCliente = process.env.SICOOB_NUMERO_CLIENTE!;

    const { pfxBuffer, certPassword } = getSicoobCert();
    const token = await getSicoobToken('boletos_consulta');

    let apiPath = '';
    if (nossoNumero) {
      apiPath = '/cobranca-bancaria/v3/boletos?numeroCliente=' + numeroCliente + '&nossoNumero=' + nossoNumero;
    } else if (cpfCnpj) {
      const cpfLimpo = cpfCnpj.replace(/\D/g, '');
      apiPath = '/cobranca-bancaria/v3/pagadores/' + cpfLimpo + '/boletos?numeroCliente=' + numeroCliente;
    } else {
      return NextResponse.json({ ok: false, error: 'Informe nossoNumero ou cpfCnpj' }, { status: 400 });
    }

    const result = await makeSicoobRequest(
      {
        hostname: 'api.sicoob.com.br',
        port: 443,
        path: apiPath,
        method: 'GET',
        headers: { 'Authorization': 'Bearer ' + token },
      },
      null,
      pfxBuffer,
      certPassword
    );

    return NextResponse.json({ ok: true, data: result.body });

  } catch (error: any) {
    console.error('Erro Sicoob consulta:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
