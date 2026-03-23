import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';

export async function GET() {
  const clientId = process.env.BLING_CLIENT_ID;
  const redirectUri = `${process.env.APP_URL}/api/bling/callback`;

  if (!clientId) {
    return NextResponse.json({ error: 'BLING_CLIENT_ID not configured' }, { status: 500 });
  }

  const state = randomBytes(16).toString('hex');
  const authUrl = `https://bling.com.br/Api/v3/oauth/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;

  const response = NextResponse.redirect(authUrl);
  response.cookies.set('bling_oauth_state', state, { httpOnly: true, secure: true, sameSite: 'lax' });

  return response;
}
