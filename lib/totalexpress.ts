// Credenciais SmartLabel (emissão de etiquetas)
const TOTAL_EXPRESS_USER = process.env.TOTAL_EXPRESS_USER;
const TOTAL_EXPRESS_PASSWORD = process.env.TOTAL_EXPRESS_PASSWORD;

// Credenciais APIs (tracking e cálculo de frete)
const TOTAL_EXPRESS_API_USER = process.env.TOTAL_EXPRESS_API_USER;
const TOTAL_EXPRESS_API_PASSWORD = process.env.TOTAL_EXPRESS_API_PASSWORD;

export function getTotalExpressAuthHeader(): string {
  if (!TOTAL_EXPRESS_USER || !TOTAL_EXPRESS_PASSWORD) {
    throw new Error('Credenciais SmartLabel Total Express não configuradas (TOTAL_EXPRESS_USER / TOTAL_EXPRESS_PASSWORD)');
  }
  return `Basic ${Buffer.from(`${TOTAL_EXPRESS_USER}:${TOTAL_EXPRESS_PASSWORD}`).toString('base64')}`;
}

export function getTotalExpressApiAuthHeader(): string {
  if (!TOTAL_EXPRESS_API_USER || !TOTAL_EXPRESS_API_PASSWORD) {
    throw new Error('Credenciais API Total Express não configuradas (TOTAL_EXPRESS_API_USER / TOTAL_EXPRESS_API_PASSWORD)');
  }
  // TEX exige formato não-padrão "Basic Auth <base64>" — confirmado via debug (endpoint SOAP de frete)
  return `Basic Auth ${Buffer.from(`${TOTAL_EXPRESS_API_USER}:${TOTAL_EXPRESS_API_PASSWORD}`).toString('base64')}`;
}

export function getTotalExpressLegacyTrackingAuthHeader(): string {
  if (!TOTAL_EXPRESS_API_USER || !TOTAL_EXPRESS_API_PASSWORD) {
    throw new Error('Credenciais API Total Express não configuradas (TOTAL_EXPRESS_API_USER / TOTAL_EXPRESS_API_PASSWORD)');
  }
  // Endpoint legado de tracking (edi.totalexpress.com.br) usa Basic padrão
  return `Basic ${Buffer.from(`${TOTAL_EXPRESS_API_USER}:${TOTAL_EXPRESS_API_PASSWORD}`).toString('base64')}`;
}

export const TOTAL_EXPRESS_URL = (process.env.TOTAL_EXPRESS_URL || 'https://apis.totalexpress.com.br').replace(/\/$/, '');
// remetenteId: 65818 (Café Fazenda Itaoca — login cafeitao65818)
export const TOTAL_EXPRESS_SENDER_ID = process.env.TOTAL_EXPRESS_SENDER_ID || '65818';
// servicoTipo: 1 = Expresso (confirmado pela Total Express)
export const TOTAL_EXPRESS_SERVICE_TYPE = parseInt(process.env.TOTAL_EXPRESS_SERVICE_TYPE || '1', 10);
