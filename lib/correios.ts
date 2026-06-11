const CORREIOS_USER = process.env.CORREIOS_USER;
const CORREIOS_TOKEN = process.env.CORREIOS_ACCESS_CODE;
const CORREIOS_CARD = process.env.CORREIOS_POSTAGE_CARD;

let cachedToken: string | null = null;
let tokenExpiresAt: Date | null = null;

export async function getCorreiosToken() {
  if (!CORREIOS_USER || !CORREIOS_TOKEN || !CORREIOS_CARD) {
    throw new Error('Credenciais Correios incompletas no ambiente');
  }

  const now = new Date();
  const margin = 5 * 60 * 1000;
  if (cachedToken && tokenExpiresAt && (tokenExpiresAt.getTime() - now.getTime()) > margin) {
    return cachedToken;
  }

  const authHeader = Buffer.from(`${CORREIOS_USER.replace(/\D/g, '')}:${CORREIOS_TOKEN}`).toString('base64');

  const response = await fetch('https://api.correios.com.br/token/v1/autentica/cartaopostagem', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${authHeader}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ numero: CORREIOS_CARD.replace(/\D/g, '') })
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Erro autenticação Correios:', error);
    throw new Error('Falha na autenticação com a API dos Correios');
  }

  const data = await response.json();
  cachedToken = data.token;
  tokenExpiresAt = data.expiraEm ? new Date(data.expiraEm) : new Date(Date.now() + 3600_000);
  return cachedToken!;
}
