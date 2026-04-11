import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  console.log('--- STATUS ROUTE HIT ---');
  const appUrl = process.env.APP_URL?.replace(/\/$/, '');
  
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ 
        status: 'error', 
        message: 'Token não fornecido no cabeçalho de autorização.',
        authenticated: false,
        appUrl
      });
    }

    const currentToken = authHeader.split(' ')[1];

    // Test a simple API call to Bling (e.g., fetch profile or a small list)
    const testResponse = await fetch('https://api.bling.com.br/Api/v3/contatos?limite=1', {
      headers: {
        'Authorization': `Bearer ${currentToken}`,
        'Accept': 'application/json'
      }
    });

    const testData = await testResponse.json();

    return NextResponse.json({
      status: testResponse.ok ? 'success' : 'error',
      authenticated: true,
      tokenStatus: testResponse.ok ? 'valid' : 'invalid',
      blingApiStatus: testResponse.status,
      blingApiResponse: testData,
      message: testResponse.ok ? 'Conexão com Bling estabelecida com sucesso!' : 'Erro na resposta da API do Bling.',
      appUrl
    });

  } catch (error: any) {
    console.error('Bling Status Error:', error);
    return NextResponse.json({ 
      status: 'error', 
      message: error.message || 'Erro interno ao verificar status do Bling' 
    }, { status: 500 });
  }
}
