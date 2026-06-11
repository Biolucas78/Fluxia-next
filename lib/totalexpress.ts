const TOTAL_EXPRESS_USER = process.env.TOTAL_EXPRESS_USER;
const TOTAL_EXPRESS_PASSWORD = process.env.TOTAL_EXPRESS_PASSWORD;

export function getTotalExpressAuthHeader(): string {
  if (!TOTAL_EXPRESS_USER || !TOTAL_EXPRESS_PASSWORD) {
    throw new Error('Credenciais Total Express não configuradas (TOTAL_EXPRESS_USER / TOTAL_EXPRESS_PASSWORD)');
  }
  return `Basic ${Buffer.from(`${TOTAL_EXPRESS_USER}:${TOTAL_EXPRESS_PASSWORD}`).toString('base64')}`;
}

export const TOTAL_EXPRESS_URL = (process.env.TOTAL_EXPRESS_URL || 'https://apis.totalexpress.com.br').replace(/\/$/, '');
// remetenteId: código da conta na Total Express
export const TOTAL_EXPRESS_SENDER_ID = process.env.TOTAL_EXPRESS_SENDER_ID || '';
// servicoTipo: 1=Standard, 7=Expresso (default Standard)
export const TOTAL_EXPRESS_SERVICE_TYPE = parseInt(process.env.TOTAL_EXPRESS_SERVICE_TYPE || '1', 10);
