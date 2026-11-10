import { NextResponse } from 'next/server';
import zlib from 'zlib';
import { getValidBlingTokenServer } from '@/lib/bling-server';
import { fetchWithRetry } from '@/lib/bling-utils';

// DANFE: GET /nfe/documento/{chaveAcesso}?formato=pdf (doc oficial Bling) — retorna o PDF
// comprimido em gzip, em base64, dentro de data[0].conteudo. Precisa descomprimir antes de
// usar. O pedido já guarda invoiceKey (chaveAcesso); se só tiver invoiceNumber, busca a
// chave primeiro via /nfe?numero=.
export async function GET(request: Request) {
  try {
    const token = await getValidBlingTokenServer();
    if (!token) {
      return NextResponse.json({ error: 'Bling token not found or expired.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    let invoiceKey = (searchParams.get('invoiceKey') || '').replace(/\D/g, '');
    const invoiceNumber = searchParams.get('invoiceNumber') || '';

    if (!invoiceKey && !invoiceNumber) {
      return NextResponse.json({ error: 'Informe invoiceKey ou invoiceNumber.' }, { status: 400 });
    }

    const headers = { 'Authorization': `Bearer ${token}` };

    if (invoiceKey.length !== 44 && invoiceNumber) {
      const res = await fetchWithRetry(`https://api.bling.com.br/Api/v3/nfe?numero=${encodeURIComponent(invoiceNumber)}`, { headers });
      if (res.ok) {
        const data = await res.json();
        invoiceKey = (data.data?.[0]?.chaveAcesso || '').replace(/\D/g, '');
      }
    }

    if (invoiceKey.length !== 44) {
      return NextResponse.json({ error: 'Chave de acesso da NF-e não encontrada (precisa ter 44 dígitos).' }, { status: 404 });
    }

    const docRes = await fetchWithRetry(`https://api.bling.com.br/Api/v3/nfe/documento/${invoiceKey}?formato=pdf`, { headers });
    const docText = await docRes.text();

    if (!docRes.ok) {
      console.error('[Bling DANFE] Erro na busca do documento:', docRes.status, docText.substring(0, 500));
      return NextResponse.json({ error: 'Bling não retornou o DANFE.', details: docText.substring(0, 500) }, { status: docRes.status });
    }

    let docData: any = null;
    try { docData = JSON.parse(docText); } catch { /* resposta não-JSON, tratado abaixo */ }

    const conteudo = docData?.data?.[0]?.conteudo;
    if (!conteudo) {
      console.error('[Bling DANFE] Resposta sem conteudo:', docText.substring(0, 500));
      return NextResponse.json({ error: 'Resposta inesperada do Bling ao buscar o DANFE.', details: docText.substring(0, 500) }, { status: 502 });
    }

    const gzipBuffer = Buffer.from(conteudo, 'base64');
    const pdfBuffer = zlib.gunzipSync(gzipBuffer);

    return NextResponse.json({ ok: true, pdfBase64: pdfBuffer.toString('base64') });
  } catch (error: any) {
    console.error('[Bling DANFE] Erro:', error);
    return NextResponse.json({ error: error.message || 'Erro ao buscar DANFE.' }, { status: 500 });
  }
}
