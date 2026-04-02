import { getDoc, setDoc, doc } from 'firebase/firestore';
import { getFirebaseInstances } from '@/lib/firebase';

export async function getValidBlingToken() {
  const { db } = getFirebaseInstances();
  const docSnap = await getDoc(doc(db, 'bling_config', 'tokens'));
  
  if (!docSnap.exists()) {
    return null;
  }

  let tokens = docSnap.data();
  const now = Date.now();
  
  // Check if token is expired or about to expire (within 1 minute)
  if (tokens.expires_at && now >= tokens.expires_at - 60000) {
    console.log('Token is expired or expiring soon, attempting refresh...');
    const refreshResponse = await fetch('/api/bling/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: tokens.refresh_token })
    });
    
    if (refreshResponse.ok) {
      const newTokens = await refreshResponse.json();
      tokens = {
        access_token: newTokens.access_token,
        refresh_token: newTokens.refresh_token,
        expires_at: Date.now() + (newTokens.expires_in * 1000),
        updated_at: Date.now()
      };
      await setDoc(doc(db, 'bling_config', 'tokens'), tokens);
      console.log('Token refreshed and saved to Firestore.');
    } else {
      console.error('Failed to refresh token:', await refreshResponse.text());
      return null;
    }
  }

  return tokens.access_token;
}
