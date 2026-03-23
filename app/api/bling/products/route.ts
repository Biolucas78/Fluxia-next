import { NextResponse } from 'next/server';

export async function GET() {
  const apiKey = process.env.BLING_API_KEY;
  console.log('Bling API Key present:', !!apiKey);

  if (!apiKey) {
    return NextResponse.json({ error: 'BLING_API_KEY not configured' }, { status: 500 });
  }

  try {
    const response = await fetch('https://api.bling.com.br/Api/v3/produtos', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json'
      }
    });

    console.log('Bling API response status:', response.status);
    if (!response.ok) {
      const errorData = await response.json();
      console.error('Bling API error data:', errorData);
      // Return empty array instead of error to stabilize UI
      return NextResponse.json({ retornos: { produtos: [] } });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching products from Bling:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
