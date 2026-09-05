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

export function makeSicoobRequest(options: https.RequestOptions, body: string | null, pfxBuffer: Buffer, certPassword: string): Promise<{ status: number | undefined; body: any }> {
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
    if (body) req.write(body);
    req.end();
  });
}

export function getSicoobCert(): { pfxBuffer: Buffer; certPassword: string } {
  const certBase64 = process.env.SICOOB_CERT_PFX_BASE64!;
  const certPassword = process.env.SICOOB_CERT_PASSWORD!;
  return { pfxBuffer: Buffer.from(certBase64, 'base64'), certPassword };
}

// Extrai a data real de pagamento do listaHistorico do Sicoob.
// O Sicoob não retorna dataPagamento direto — a data fica no evento
// de liquidação dentro de listaHistorico[].
export function extrairDataPagamento(boleto: any): string | null {
  const historico: any[] = boleto.listaHistorico || [];

  // Percorre do mais recente para o mais antigo
  const entrada = [...historico].reverse().find((h: any) => {
    const desc = (h.descricaoHistorico || '').toLowerCase();
    const tipo = String(h.tipoHistorico ?? '');
    // tipo "6" = Liquidado banco, "9" = Baixa solicitada, "17" = Baixa manual
    return tipo === '6' || tipo === '9' || tipo === '17' || desc.includes('liquida') || desc.includes('pagamento');
  });

  if (entrada?.dataHistorico) {
    return String(entrada.dataHistorico).substring(0, 10);
  }
  return null;
}
