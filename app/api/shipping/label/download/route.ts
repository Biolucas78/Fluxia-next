import { NextResponse } from 'next/server';
import { getCorreiosToken } from '@/lib/correios';
import { daceCache } from '@/lib/daceCache';
import { texLabelCache } from '@/lib/texLabelCache';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const idRecibo = searchParams.get('idRecibo');
  const tipo = searchParams.get('tipo') || 'rotulo';

  // Handler TEX — etiqueta PDF gerada localmente, armazenada em texLabelCache
  if (tipo === 'tex') {
    const token = searchParams.get('token');
    if (!token) return NextResponse.json({ error: 'Token não informado.' }, { status: 400 });
    const pdfBuffer = texLabelCache.get(token);
    if (!pdfBuffer) return NextResponse.json({ error: 'Etiqueta TEX não encontrada ou expirada (30 min).' }, { status: 404 });
    return new Response(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="etiqueta-tex-${token}.pdf"`
      }
    });
  }

  // Handler especial para DACE - base64 ja em memoria
  if (tipo === 'dce') {
    const token = searchParams.get('token');
    if (!token) {
      return NextResponse.json({ error: 'Token da DACE nao informado.' }, { status: 400 });
    }
    const base64Dace = daceCache.get(token);
    if (!base64Dace) {
      return NextResponse.json({ error: 'DACE nao encontrada ou expirada.' }, { status: 404 });
    }
    const pdfBuffer = Buffer.from(base64Dace, 'base64');
    return new Response(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="dace-${token}.pdf"`
      }
    });
  }

  if (!idRecibo) {
    return NextResponse.json({ error: 'ID do recibo não informado.' }, { status: 400 });
  }

  try {
    const token = await getCorreiosToken();
    
    let attempts = 0;
    const maxAttempts = 5;
    const delayMs = 2000;
    let data;

    while (attempts < maxAttempts) {
      // Consultar o rótulo pelo id do recibo
      const endpoint = tipo === 'dce' ? `https://api.correios.com.br/prepostagem/v1/prepostagens/declaracaoconteudo/download/assincrono/${idRecibo}` : `https://api.correios.com.br/prepostagem/v1/prepostagens/rotulo/download/assincrono/${idRecibo}`;
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        }
      });

      if (response.ok) {
        data = await response.json();
        break;
      }

      // Se for 404 ou 204, a etiqueta ainda não está pronta
      if (response.status === 404 || response.status === 204 || response.status === 202) {
        console.log(`Etiqueta não pronta (tentativa ${attempts + 1}/${maxAttempts}). Aguardando...`);
        attempts++;
        if (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, delayMs));
          continue;
        }
      }

      // Se for outro erro, ou se esgotaram as tentativas
      let errorData;
      try {
        errorData = await response.json();
      } catch {
        errorData = { mensagem: 'Erro desconhecido na API dos Correios' };
      }
      
      console.error('Erro ao baixar rótulo:', errorData);
      return NextResponse.json({ 
        error: 'A etiqueta ainda não está pronta ou ocorreu um erro nos Correios.',
        details: errorData.msgs || errorData.mensagem || 'Erro desconhecido'
      }, { status: response.status });
    }

    if (!data) {
      return NextResponse.json({ error: 'Tempo esgotado aguardando a geração da etiqueta.' }, { status: 408 });
    }
    
    // A resposta pode conter um ou mais rótulos em base64
    console.log('Resposta download rótulo:', JSON.stringify(data, null, 2));

    // Se for um PDF em base64, retornamos como arquivo
    if (data.pdfArquivo || data.dados) {
      const base64Data = data.pdfArquivo || data.dados;
      const filename = data.nome || `etiqueta-${idRecibo}.pdf`;
      const pdfBuffer = Buffer.from(base64Data, 'base64');
      return new Response(pdfBuffer, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${filename}"`
        }
      });
    }

    // Caso a estrutura seja diferente (ex: lista de rótulos)
    if (Array.isArray(data.rotulos) && data.rotulos.length > 0) {
        const firstLabel = data.rotulos[0];
        const base64Data = firstLabel.pdfArquivo || firstLabel.dados;
        if (base64Data) {
            const filename = firstLabel.nome || `etiqueta-${idRecibo}.pdf`;
            const pdfBuffer = Buffer.from(base64Data, 'base64');
            return new Response(pdfBuffer, {
              headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="${filename}"`
              }
            });
        }
    }

    return NextResponse.json({ 
        error: 'Estrutura de resposta inesperada da API dos Correios.',
        data: data 
    }, { status: 500 });

  } catch (error: any) {
    console.error('Erro no proxy de download de etiqueta:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
