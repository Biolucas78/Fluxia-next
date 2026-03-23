import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { doc, setDoc } from 'firebase/firestore';
import { getFirebaseInstances } from '@/lib/firebase';

export async function GET(request: Request) {
  const { db } = getFirebaseInstances();
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const cookieStore = await cookies();
  const storedState = cookieStore.get('bling_oauth_state')?.value;

  if (!code || !state || state !== storedState) {
    return NextResponse.json({ error: 'Invalid or missing state/code' }, { status: 400 });
  }

  const clientId = process.env.BLING_CLIENT_ID;
  const clientSecret = process.env.BLING_CLIENT_SECRET;
  const redirectUri = `${process.env.APP_URL}/api/bling/callback`;

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const response = await fetch('https://bling.com.br/Api/v3/oauth/token', {
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

  // Store tokens in Firestore
  try {
    await setDoc(doc(db, 'bling_config', 'tokens'), {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + (data.expires_in * 1000),
      updated_at: Date.now()
    });
  } catch (error) {
    console.error('Error saving tokens to Firestore:', error);
    return NextResponse.json({ error: 'Failed to save tokens' }, { status: 500 });
  }

  const finalResponse = NextResponse.json({ message: 'Authentication successful and tokens saved' });
  cookieStore.delete('bling_oauth_state');
  return finalResponse;
}
