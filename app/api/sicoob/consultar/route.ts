import { NextRequest, NextResponse } from 'next/server';
import https from 'https';
import { getSicoobToken } from '@/app/api/sicoob/token/route';

function makeHttpsRequest(options: https.RequestOptions, pfxBuffer: Buffer, certPassword: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = https.request({
      ...options,
      pfx: pfxBuffer,
      passphrase: certPassword,
    }, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const nossoNumero = searchParams.get('nossoNumero');
    const cpfCnpj = searchParams.get('cpfCnpj');

    const certBase64 = process.env.SICOOB_CERT_PFX_BASE64!;
    const certPassword = process.env.SICOOB_CERT_PASSWORD!;
    const pfxBuffer = Buffer.from(certBase64, 'base64');
    const numeroCliente = process.env.SICOOB_NUMERO_CLIENTE!;

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

    const result = await makeHttpsRequest(
      {
        hostname: 'api.sicoob.com.br',
        port: 443,
        path: apiPath,
        method: 'GET',
        headers: {
          'Authorization': 'Bearer ' + token,
        },
      },
      pfxBuffer,
      certPassword
    );

    return NextResponse.json({ ok: true, data: result.body });

  } catch (error: any) {
    console.error('Erro Sicoob consulta:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
