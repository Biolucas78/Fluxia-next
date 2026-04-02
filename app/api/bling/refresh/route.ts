import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { refresh_token } = await request.json();

    if (!refresh_token) {
      return NextResponse.json({ error: 'Missing refresh_token' }, { status: 400 });
    }

    const clientId = process.env.BLING_CLIENT_ID?.trim();
    const clientSecret = process.env.BLING_CLIENT_SECRET?.trim();

    if (!clientId || !clientSecret) {
      return NextResponse.json({ error: 'Bling credentials not configured' }, { status: 500 });
    }

    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const response = await fetch('https://www.bling.com.br/Api/v3/oauth/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refresh_token
      })
    });

    const contentType = response.headers.get('content-type');
    let data;
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
      console.error('Non-JSON response from Bling API refreshing token:', data.substring(0, 200));
      return NextResponse.json({ error: 'Non-JSON response from Bling API' }, { status: 500 });
    }

    if (!response.ok) {
      return NextResponse.json({ error: 'Failed to refresh token', details: data }, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Error refreshing Bling token:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
