import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '@/lib/financeiro-types';

export async function POST(request: Request) {
  try {
    const { text } = await request.json();
    if (!text?.trim()) return NextResponse.json({ error: 'Texto vazio.' }, { status: 400 });

    const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'Chave Gemini não configurada.' }, { status: 500 });

    const ai = new GoogleGenAI({ apiKey });

    const expCats = EXPENSE_CATEGORIES.join(', ');
    const incCats = INCOME_CATEGORIES.join(', ');
    const today = new Date().toISOString().split('T')[0];

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Você é um assistente financeiro. Interprete a entrada abaixo e extraia as informações estruturadas.

ENTRADA: "${text.trim()}"

REGRAS:
- "type": "expense" para saídas/despesas; "income" para entradas/receitas
- "value": valor numérico (ex: "250,00" → 250.00; "1.155,90" → 1155.90)
- "description": descrição curta e clara da movimentação
- "category": escolha a categoria mais adequada.
  Despesas: ${expCats}
  Receitas: ${incCats}
- "date": data da movimentação. Se não informada, use hoje: ${today}. Formato YYYY-MM-DD.
- "paymentMethod": se mencionado (pix, boleto, cartao, transferencia, dinheiro, debito, outros). Se não mencionado, deixe vazio.
- "account": "sicoob" ou "caixa_fisico". Se não mencionado, deixe vazio.
- "notes": qualquer informação adicional relevante, ou vazio.

Exemplos:
- "250 gasolina" → { type: "expense", value: 250, description: "Gasolina", category: "Combustível e Transporte", date: "${today}", paymentMethod: "", account: "", notes: "" }
- "1155 contador março" → { type: "expense", value: 1155, description: "Honorários contábeis março", category: "Contador", date: "${today}", paymentMethod: "", account: "", notes: "" }
- "500 curso q grader pix" → { type: "expense", value: 500, description: "Curso Q Grader", category: "Certificações", date: "${today}", paymentMethod: "pix", account: "", notes: "" }

Retorne SOMENTE um JSON válido sem explicações:`,
      config: { responseMimeType: 'application/json' },
    });

    let raw = (response.text || '').replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(raw);
    return NextResponse.json({ ok: true, data: parsed });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
