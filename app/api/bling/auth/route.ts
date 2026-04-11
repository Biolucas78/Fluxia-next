import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';

export async function GET(request: Request) {
  const clientId = process.env.BLING_CLIENT_ID?.trim();
  
  // Try to get the base URL from environment or request headers
  let appUrl = process.env.APP_URL?.replace(/\/$/, '');
  
  if (!appUrl) {
    const url = new URL(request.url);
    appUrl = `${url.protocol}//${url.host}`;
  }

  if (!clientId) {
    console.error('BLING_CLIENT_ID not configured in environment variables');
    return NextResponse.json({ 
      error: 'Environment variables not configured', 
      details: 'BLING_CLIENT_ID is missing. Please check your AI Studio settings.' 
    }, { status: 500 });
  }

  const redirectUri = `${appUrl}/api/bling/callback`;

  const state = randomBytes(16).toString('hex');
  const authUrl = `https://www.bling.com.br/Api/v3/oauth/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;

  const response = NextResponse.redirect(authUrl);
  response.cookies.set('bling_oauth_state', state, { httpOnly: true, secure: true, sameSite: 'none' });

  return response;
}
