import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const xmlText = formData.get('xml') as string | null;

    if (!file && !xmlText) {
      return NextResponse.json({ error: 'Nenhum arquivo enviado.' }, { status: 400 });
    }

    const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'Chave Gemini não configurada.' }, { status: 500 });

    const ai = new GoogleGenAI({ apiKey });

    let content: any;

    if (xmlText) {
      // Parse XML DANFE diretamente via texto
      content = `Analise o XML de nota fiscal abaixo e extraia as informações.\n\nXML:\n${xmlText.slice(0, 8000)}`;
    } else if (file) {
      // PDF/imagem — enviar para Gemini Vision
      const bytes = await file.arrayBuffer();
      const base64 = Buffer.from(bytes).toString('base64');
      const mimeType = file.type || 'application/pdf';

      content = [
        { text: 'Analise este documento de nota fiscal (DANFE) e extraia as informações estruturadas.' },
        { inlineData: { mimeType, data: base64 } },
      ];
    }

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: typeof content === 'string' ? content : [{ role: 'user', parts: content }],
      config: {
        responseMimeType: 'application/json',
        systemInstruction: `Você é um assistente de gestão financeira especializado em notas fiscais brasileiras.
Extraia as seguintes informações da nota fiscal e retorne um JSON:
{
  "supplier": "Razão social ou nome do fornecedor/emitente",
  "supplierCnpj": "CNPJ do emitente (apenas números)",
  "invoiceNumber": "Número da NF",
  "issueDate": "Data de emissão (YYYY-MM-DD)",
  "value": valor total da nota (número),
  "description": "Descrição resumida dos produtos/serviços",
  "category": "Categoria mais adequada para contas a pagar (ex: Matéria-Prima, Embalagens, etc.)",
  "notes": "Observações adicionais relevantes"
}
Se um campo não for encontrado, use string vazia ou 0 para valores numéricos.`,
      },
    });

    let raw = (response.text || '').replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(raw);
    return NextResponse.json({ ok: true, data: parsed });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
