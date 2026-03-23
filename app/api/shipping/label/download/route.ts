import { NextResponse } from 'next/server';
import { getCorreiosToken } from '@/lib/correios';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const idRecibo = searchParams.get('idRecibo');

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
      const response = await fetch(`https://api.correios.com.br/prepostagem/v1/prepostagens/rotulo/download/assincrono/${idRecibo}`, {
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
