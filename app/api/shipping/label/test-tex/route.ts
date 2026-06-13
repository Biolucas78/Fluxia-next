import { generateTexLabelPdf } from '@/lib/tex-label';

// Endpoint temporário para testar o layout da etiqueta TEX sem chamar a API da transportadora.
// Retorna um PDF com dados fictícios para validação visual / envio ao executivo comercial da TEX.
// Acessar via GET: /api/shipping/label/test-tex
export async function GET() {
  try {
    const pdfBuffer = await generateTexLabelPdf({
      awb:                 'TXAQ362134074TX',
      rota:                '30-PET-RS-LOC-[000]',
      serviceCode:         'EXP',
      orderNumber:         '001406',
      destCep:             '37270000',
      senderName:          'Cafe Fazenda Itaoca',
      senderCity:          'Conceicao do Rio Verde',
      senderState:         'MG',
      recipientName:       'Eliana Xavier',
      recipientStreet:     'Praca Conego Ulisses',
      recipientNumber:     '300',
      recipientComplement: 'Apto 201',
      recipientDistrict:   'Centro',
      recipientCity:       'Campo Belo',
      recipientState:      'MG',
    });

    return new Response(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="etiqueta-tex-teste.pdf"',
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
