import { generateTexLabelPdf, todayShipDate } from '@/lib/tex-label';

// Endpoint temporário para validar o layout da etiqueta TEX sem chamar a API da transportadora.
// GET /api/shipping/label/test-tex
export async function GET() {
  try {
    const pdfBuffer = await generateTexLabelPdf({
      awb:                  'TXAQ362134074TX',
      rota:                 '30-PET-RS-LOC-[000]',
      serviceCode:          'EXP',
      orderNumber:          '001406',
      destCep:              '37270000',
      // Sender (dados reais do remetente)
      senderName:           'Cafe Fazenda Itaoca',
      senderStreet:         'Rod BR 267, S/N Km 333',
      senderDistrict:       'Fazenda Itaoca - Zona Rural',
      senderCity:           'Conceicao do Rio Verde',
      senderState:          'MG',
      senderCep:            '37430000',
      senderCnpj:           '16795729000131',
      // Recipient (dados fictícios)
      recipientName:        'Eliana Xavier',
      recipientStreet:      'Praca Conego Ulisses',
      recipientNumber:      '300',
      recipientComplement:  'Apto 201',
      recipientDistrict:    'Centro',
      recipientCity:        'Campo Belo',
      recipientState:       'MG',
      // Info table
      volumes:              1,
      weightKg:             1.500,
      shipDate:             todayShipDate(),
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
