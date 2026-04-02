import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';

export async function GET() {
  const clientId = process.env.BLING_CLIENT_ID?.trim();
  const appUrl = process.env.APP_URL?.replace(/\/$/, '');

  if (!clientId || !appUrl) {
    console.error('BLING_CLIENT_ID or APP_URL not configured in environment variables');
    return NextResponse.json({ 
      error: 'Environment variables not configured', 
      details: 'BLING_CLIENT_ID or APP_URL is missing. Please check your AI Studio settings.' 
    }, { status: 500 });
  }

  const redirectUri = `${appUrl}/api/bling/callback`;

  const state = randomBytes(16).toString('hex');
  const authUrl = `https://www.bling.com.br/Api/v3/oauth/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;

  const response = NextResponse.redirect(authUrl);
  response.cookies.set('bling_oauth_state', state, { httpOnly: true, secure: true, sameSite: 'none' });

  return response;
}
