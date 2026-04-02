import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Missing or invalid Authorization header' }, { status: 401 });
  }
  const token = authHeader.split(' ')[1];

  try {
    const response = await fetch('https://api.bling.com.br/Api/v3/produtos', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      }
    });

    console.log('Bling API response status:', response.status);
    if (!response.ok) {
      const contentType = response.headers.get('content-type');
      let errorData;
      if (contentType && contentType.includes('application/json')) {
        errorData = await response.json();
      } else {
        errorData = await response.text();
      }
      console.error('Bling API error data:', errorData);
      // Return empty array instead of error to stabilize UI
      return NextResponse.json({ data: [] });
    }

    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const text = await response.text();
      console.error('Non-JSON response from Bling API:', text.substring(0, 200));
      return NextResponse.json({ data: [] });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching products from Bling:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
