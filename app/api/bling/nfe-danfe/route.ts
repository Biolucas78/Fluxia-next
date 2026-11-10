import { NextResponse } from 'next/server';
import { getValidBlingTokenServer } from '@/lib/bling-server';
import { fetchWithRetry } from '@/lib/bling-utils';

// Busca o DANFE (PDF) de uma NF-e já emitida no Bling. O pedido só guarda invoiceKey/
// invoiceNumber (não o ID interno da nota no Bling), então primeiro resolve o ID via busca
// por chaveAcesso, com fallback pra numero.
export async function GET(request: Request) {
  try {
    const token = await getValidBlingTokenServer();
    if (!token) {
      return NextResponse.json({ error: 'Bling token not found or expired.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const invoiceKey = (searchParams.get('invoiceKey') || '').replace(/\D/g, '');
    const invoiceNumber = searchParams.get('invoiceNumber') || '';

    if (!invoiceKey && !invoiceNumber) {
      return NextResponse.json({ error: 'Informe invoiceKey ou invoiceNumber.' }, { status: 400 });
    }

    const headers = { 'Authorization': `Bearer ${token}` };
    let nfeId: string | number | null = null;

    if (invoiceKey && invoiceKey.length === 44) {
      const res = await fetchWithRetry(`https://api.bling.com.br/Api/v3/nfe?chaveAcesso=${invoiceKey}`, { headers });
      if (res.ok) {
        const data = await res.json();
        nfeId = data.data?.[0]?.id || null;
      }
    }

    if (!nfeId && invoiceNumber) {
      const res = await fetchWithRetry(`https://api.bling.com.br/Api/v3/nfe?numero=${encodeURIComponent(invoiceNumber)}`, { headers });
      if (res.ok) {
        const data = await res.json();
        nfeId = data.data?.[0]?.id || null;
      }
    }

    if (!nfeId) {
      return NextResponse.json({ error: 'Nota fiscal não encontrada no Bling (chave/número não localizados).' }, { status: 404 });
    }

    const docRes = await fetchWithRetry(`https://api.bling.com.br/Api/v3/nfe/${nfeId}/documento`, { headers });
    const docText = await docRes.text();

    if (!docRes.ok) {
      console.error('[Bling DANFE] Erro na busca do documento:', docRes.status, docText.substring(0, 500));
      return NextResponse.json({ error: 'Bling não retornou o DANFE.', details: docText.substring(0, 500) }, { status: docRes.status });
    }

    let docData: any = null;
    try { docData = JSON.parse(docText); } catch { /* resposta não-JSON, tratado abaixo */ }

    const link = docData?.data?.link || docData?.link || null;
    if (!link) {
      console.error('[Bling DANFE] Resposta sem link de documento:', docText.substring(0, 500));
      return NextResponse.json({ error: 'Resposta inesperada do Bling ao buscar o DANFE.', details: docText.substring(0, 500) }, { status: 502 });
    }

    // Baixa o PDF no servidor (pra quem precisa do arquivo de verdade, ex: compartilhar no
    // WhatsApp) — quem só precisa abrir/imprimir usa o `link` direto.
    let pdfBase64: string | null = null;
    try {
      const pdfRes = await fetch(link);
      if (pdfRes.ok) {
        const buf = Buffer.from(await pdfRes.arrayBuffer());
        pdfBase64 = buf.toString('base64');
      } else {
        console.warn('[Bling DANFE] Falha ao baixar PDF do link:', pdfRes.status);
      }
    } catch (e) {
      console.warn('[Bling DANFE] Erro ao baixar PDF do link:', e);
    }

    return NextResponse.json({ ok: true, link, pdfBase64 });
  } catch (error: any) {
    console.error('[Bling DANFE] Erro:', error);
    return NextResponse.json({ error: error.message || 'Erro ao buscar DANFE.' }, { status: 500 });
  }
}
