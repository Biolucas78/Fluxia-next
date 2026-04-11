import { adminDb, adminDbDefault, projectId, databaseId } from './firebase-admin';
import { db as clientDb } from './firebase';
import { doc, getDoc } from 'firebase/firestore';

export async function getValidBlingTokenServer() {
  console.log(`[Bling Server] Starting token fetch for Project: ${projectId}, DB: ${databaseId}`);

  let tokens: any = null;
  let docSnap: any = null;
  let usedDb = adminDb;

  try {
    // Try Admin SDK with named database first
    docSnap = await adminDb.collection('bling_config').doc('tokens').get();
    if (docSnap.exists) {
      tokens = docSnap.data();
      usedDb = adminDb;
      console.log('[Bling Server] Tokens fetched via Admin SDK (Named DB)');
    } else {
      // Try default database if named one is empty
      const defaultSnap = await adminDbDefault.collection('bling_config').doc('tokens').get();
      if (defaultSnap.exists) {
        tokens = defaultSnap.data();
        usedDb = adminDbDefault;
        console.log('[Bling Server] Tokens fetched via Admin SDK (Default DB)');
      }
    }
  } catch (adminError: any) {
    // Only log warning if it's not a permission error, or if we want to be quiet
    if (adminError.message.includes('PERMISSION_DENIED')) {
      console.log('[Bling Server] Admin SDK permission denied, will use Client SDK fallback.');
    } else {
      console.warn('[Bling Server] Admin SDK failed to fetch tokens:', adminError.message);
    }
  }

  // Fallback to Client SDK if Admin SDK failed or returned nothing
  if (!tokens) {
    try {
      const clientDocSnap = await getDoc(doc(clientDb, 'bling_config', 'tokens'));
      if (clientDocSnap.exists()) {
        tokens = clientDocSnap.data();
        console.log('[Bling Server] Tokens fetched via Client SDK (Public Read)');
      }
    } catch (clientError: any) {
      console.error('[Bling Server] Client SDK also failed to fetch tokens:', clientError.message);
    }
  }

  if (!tokens) {
    console.error('[Bling Server] Bling tokens not found in Firestore (bling_config/tokens). Database ID used:', databaseId);
    return null;
  }

  const now = Date.now();
  
  // Check if token is expired or about to expire (within 1 minute)
  if (tokens.expires_at && now >= tokens.expires_at - 60000) {
    console.log('Token is expired or expiring soon, attempting refresh on server...');
    
    const clientId = process.env.BLING_CLIENT_ID?.trim();
    const clientSecret = process.env.BLING_CLIENT_SECRET?.trim();

    if (!clientId || !clientSecret) {
      console.error('[Bling Server] Bling credentials (ID/Secret) not configured in environment variables');
      return tokens.access_token; // Return existing even if expired as last resort
    }

    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    try {
      const response = await fetch('https://www.bling.com.br/Api/v3/oauth/token', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: tokens.refresh_token
        })
      });

      if (response.ok) {
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
          const errorText = await response.text();
          console.error('[Bling Server] Non-JSON response from Bling token refresh:', errorText);
          return null;
        }
        const newTokens = await response.json();
        const updatedTokens = {
          access_token: newTokens.access_token,
          refresh_token: newTokens.refresh_token || tokens.refresh_token,
          expires_at: Date.now() + (newTokens.expires_in * 1000),
          updated_at: Date.now()
        };
        
        // Try to save via Admin SDK
        try {
          await usedDb.collection('bling_config').doc('tokens').set(updatedTokens);
          console.log('Token refreshed and saved to Firestore (server).');
        } catch (saveError: any) {
          console.warn('[Bling Server] Failed to save refreshed tokens via Admin SDK:', saveError.message);
          // Fallback to default DB if named failed
          if (usedDb !== adminDbDefault) {
            try {
              await adminDbDefault.collection('bling_config').doc('tokens').set(updatedTokens);
              console.log('Token refreshed and saved to Default DB (fallback).');
            } catch (fallbackError: any) {
              console.error('[Bling Server] All attempts to save refreshed tokens failed.');
            }
          }
        }
        
        return updatedTokens.access_token;
      } else {
        const errorText = await response.text();
        console.error('[Bling Server] Failed to refresh token on server:', errorText);
        
        // If it's an invalid_grant, the refresh token is dead. 
        // We should clear it from Firestore to prevent further attempts with a dead token.
        if (errorText.includes('invalid_grant')) {
          console.error('[Bling Server] Fatal: Refresh token is invalid (invalid_grant). Clearing tokens and requiring re-authentication.');
          
          // Try to delete via Admin SDK
          try {
            await usedDb.collection('bling_config').doc('tokens').delete();
            if (usedDb !== adminDbDefault) {
              await adminDbDefault.collection('bling_config').doc('tokens').delete();
            }
            console.log('[Bling Server] Invalid tokens cleared via Admin SDK.');
          } catch (deleteError) {
            console.warn('[Bling Server] Failed to clear invalid tokens via Admin SDK, trying Client SDK...');
            // Fallback to Client SDK for deletion
            try {
              const { deleteDoc, doc } = await import('firebase/firestore');
              await deleteDoc(doc(clientDb, 'bling_config', 'tokens'));
              console.log('[Bling Server] Invalid tokens cleared via Client SDK.');
            } catch (clientDeleteError) {
              console.error('[Bling Server] All attempts to clear invalid tokens failed.');
            }
          }
          return null;
        }
        
        return null; // Return null on any refresh failure to avoid 401 loops
      }
    } catch (error) {
      console.error('[Bling Server] Error refreshing token on server:', error);
      return null;
    }
  }

  return tokens.access_token;
}
