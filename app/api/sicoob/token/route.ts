import { NextResponse } from 'next/server';
import https from 'https';
import { URLSearchParams } from 'url';

const SICOOB_AUTH_URL = 'https://auth.sicoob.com.br/auth/realms/cooperado/protocol/openid-connect/token';

export async function getSicoobToken(scope: string): Promise<string> {
  const certBase64 = process.env.SICOOB_CERT_PFX_BASE64;
  const certPassword = process.env.SICOOB_CERT_PASSWORD;
  const clientId = process.env.SICOOB_CLIENT_ID;

  if (!certBase64 || !certPassword || !clientId) {
    throw new Error('Variaveis de ambiente do Sicoob nao configuradas.');
  }

  const pfxBuffer = Buffer.from(certBase64, 'base64');

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    scope,
  });

  return new Promise((resolve, reject) => {
    const urlObj = new URL(SICOOB_AUTH_URL);
    const options: https.RequestOptions = {
      hostname: urlObj.hostname,
      port: 443,
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      pfx: pfxBuffer,
      passphrase: certPassword,
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.access_token) {
            resolve(json.access_token);
          } else {
            reject(new Error('Token nao retornado: ' + data));
          }
        } catch (e) {
          reject(new Error('Erro ao parsear resposta de token: ' + data));
        }
      });
    });

    req.on('error', (e: Error) => reject(e));
    req.write(body.toString());
    req.end();
  });
}

export async function GET() {
  try {
    const token = await getSicoobToken('boletos_inclusao boletos_consulta');
    return NextResponse.json({ ok: true, token: token.substring(0, 20) + '...' });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
