import { initializeApp, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { credential } from 'firebase-admin';
import firebaseConfig from '../firebase-applet-config.json';

const projectId = firebaseConfig.projectId;
const databaseId = firebaseConfig.firestoreDatabaseId || '(default)';

const app = (() => {
  const existingApps = getApps();
  if (existingApps.length > 0) {
    const defaultApp = getApp();
    if (defaultApp.options.projectId === projectId) {
      return defaultApp;
    }
    // If the default app has a different project ID, try to find one that matches or create a new one
    const matchingApp = existingApps.find(a => a.options.projectId === projectId);
    if (matchingApp) return matchingApp;
    
    console.log(`[Firebase Admin] Default app project (${defaultApp.options.projectId}) mismatch. Creating named app for ${projectId}`);
  }

  try {
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    const appName = existingApps.length > 0 ? `app-${projectId}-${Date.now()}` : undefined;
    
    if (serviceAccount) {
      console.log(`[Firebase Admin] Initializing ${appName || 'default'} app with Service Account Key`);
      return initializeApp({
        credential: credential.cert(JSON.parse(serviceAccount)),
        projectId: projectId,
      }, appName);
    }
    
    console.log(`[Firebase Admin] Initializing ${appName || 'default'} app with Project ID: ${projectId}`);
    return initializeApp({
      projectId: projectId,
    }, appName);
  } catch (error: any) {
    console.error('[Firebase Admin] Initialization info:', error.message);
    return getApp();
  }
})();

console.log(`[Firebase Admin] Using Database ID: ${databaseId}`);

export const adminDb = databaseId === '(default)' ? getFirestore(app) : getFirestore(app, databaseId);
export const adminDbDefault = getFirestore(app);
export const adminAuth = getAuth(app);
export const auth = adminAuth;

export { projectId, databaseId };
