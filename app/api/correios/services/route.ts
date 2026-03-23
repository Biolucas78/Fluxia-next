import { NextResponse } from 'next/server';

const CORREIOS_USER = process.env.CORREIOS_USER;
const CORREIOS_TOKEN = process.env.CORREIOS_ACCESS_CODE;
const CORREIOS_CARD = process.env.CORREIOS_POSTAGE_CARD;
const CORREIOS_CONTRACT = process.env.CORREIOS_CONTRACT;

export async function GET() {
  if (!CORREIOS_USER || !CORREIOS_TOKEN || !CORREIOS_CARD) {
    return NextResponse.json({ 
      error: 'Credenciais dos Correios não configuradas.',
      debug: {
        hasUser: !!CORREIOS_USER,
        hasToken: !!CORREIOS_TOKEN,
        hasCard: !!CORREIOS_CARD
      }
    }, { status: 500 });
  }

  try {
    const authHeader = Buffer.from(`${CORREIOS_USER.replace(/\D/g, '')}:${CORREIOS_TOKEN}`).toString('base64');
    const authResponse = await fetch('https://api.correios.com.br/token/v1/autentica/cartaopostagem', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${authHeader}`,
        'Content-Type': 'application/json',
        'User-Agent': 'CoffeeCRM (biolucas@gmail.com)'
      },
      body: JSON.stringify({ numero: CORREIOS_CARD.replace(/\D/g, '') })
    });

    if (!authResponse.ok) {
      return NextResponse.json({ error: 'Falha na autenticação Correios.' }, { status: 500 });
    }

    const { token: bearerToken } = await authResponse.json();

    const response = await fetch(`https://api.correios.com.br/meucontrato/v1/empresas/${CORREIOS_USER}/contratos/9912681491/servicos`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${bearerToken}`,
        'User-Agent': 'CoffeeCRM (biolucas@gmail.com)'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('DEBUG: Falha ao buscar serviços dos Correios:', errorText);
      return NextResponse.json({ error: 'Falha ao buscar serviços dos Correios.', details: errorText }, { status: 500 });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (e) {
    console.error('Correios services error:', e);
    return NextResponse.json({ error: 'Erro ao buscar serviços.' }, { status: 500 });
  }
}
