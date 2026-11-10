import { NextRequest, NextResponse } from 'next/server';
import { getSicoobToken, makeSicoobRequest, getSicoobCert } from '@/lib/sicoob';

const NUMERO_CLIENTE = process.env.SICOOB_NUMERO_CLIENTE;
const NUMERO_CONTA = process.env.SICOOB_NUMERO_CONTA;

// Reimpressão (2ª via) de um boleto já emitido. Endpoint/parâmetros baseados no padrão já
// usado pelas outras rotas Sicoob (/cobranca-bancaria/v3/boletos) — ainda não confirmado na
// doc oficial, então se retornar 404/400 o corpo do erro vem nos detalhes pra ajustar.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const nossoNumero = (searchParams.get('nossoNumero') || '').trim();
    if (!nossoNumero) {
      return NextResponse.json({ ok: false, error: 'Informe nossoNumero.' }, { status: 400 });
    }

    const { pfxBuffer, certPassword } = getSicoobCert();
    const token = await getSicoobToken('boletos_consulta');

    const path = '/cobranca-bancaria/v3/boletos/segunda-via?numeroCliente=' + NUMERO_CLIENTE
      + '&codigoModalidade=1&numeroContaCorrente=' + NUMERO_CONTA
      + '&nossoNumero=' + encodeURIComponent(nossoNumero)
      + '&gerarPdf=true';

    const result = await makeSicoobRequest(
      {
        hostname: 'api.sicoob.com.br',
        port: 443,
        path,
        method: 'GET',
        headers: { 'Authorization': 'Bearer ' + token },
      },
      null,
      pfxBuffer,
      certPassword
    );

    const base64Pdf = result.body?.resultado?.pdfBoleto || result.body?.pdfBoleto;
    if (!base64Pdf) {
      console.error('[Sicoob 2ª via] Sem PDF na resposta:', result.status, JSON.stringify(result.body).substring(0, 500));
      return NextResponse.json({
        ok: false,
        error: 'Sicoob não retornou o PDF do boleto.',
        details: result.body,
      }, { status: result.status && result.status >= 400 ? result.status : 502 });
    }

    return NextResponse.json({ ok: true, pdfBoleto: base64Pdf });
  } catch (error: any) {
    console.error('[Sicoob 2ª via] Erro:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
