import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getBaseUrl } from '@/lib/url-utils';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const cookieStore = await cookies();
  const storedState = cookieStore.get('bling_oauth_state')?.value;

  if (!code || !state || state !== storedState) {
    return NextResponse.json({ error: 'Invalid or missing state/code' }, { status: 400 });
  }

  const clientId = process.env.BLING_CLIENT_ID?.trim();
  const clientSecret = process.env.BLING_CLIENT_SECRET?.trim();
  const appUrl = getBaseUrl(request);
  
  if (!clientId || !clientSecret) {
    console.error('BLING_CLIENT_ID or BLING_CLIENT_SECRET not configured');
    return NextResponse.json({ 
      error: 'Environment variables not configured', 
      details: 'BLING_CLIENT_ID or BLING_CLIENT_SECRET is missing. Please check your AI Studio settings.' 
    }, { status: 500 });
  }

  const redirectUri = `${appUrl}/api/bling/callback`;
  console.log('Exchanging code for token with Bling...');
  console.log('Redirect URI used:', redirectUri);
  console.log('Client ID (masked):', clientId.substring(0, 5) + '...');

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const response = await fetch('https://www.bling.com.br/Api/v3/oauth/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: redirectUri
    })
  });

  const data = await response.json();

  if (!response.ok) {
    return NextResponse.json({ error: 'Failed to exchange code for token', details: data }, { status: response.status });
  }

  cookieStore.delete('bling_oauth_state');

  // Return HTML to post message to opener and close popup
  const html = `
    <html>
      <body>
        <script>
          if (window.opener) {
            window.opener.postMessage({ 
              type: 'BLING_AUTH_SUCCESS', 
              tokens: {
                access_token: '${data.access_token}',
                refresh_token: '${data.refresh_token}',
                expires_in: ${data.expires_in}
              }
            }, '*');
            window.close();
          } else {
            window.location.href = '/configuracoes?bling_token=${data.access_token}&bling_refresh=${data.refresh_token}&expires_in=${data.expires_in}';
          }
        </script>
        <p>Autenticação concluída. Esta janela deve fechar automaticamente.</p>
      </body>
    </html>
  `;

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html' }
  });
}
