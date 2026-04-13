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
      try {
        console.log(`[Firebase Admin] Initializing ${appName || 'default'} app with Service Account Key`);
        const cert = JSON.parse(serviceAccount);
        return initializeApp({
          credential: credential.cert(cert),
          projectId: projectId,
        }, appName);
      } catch (parseError) {
        console.error('[Firebase Admin] Failed to parse service account key, falling back to default credentials');
      }
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

let _adminDb: any = null;

export const getAdminDb = () => {
  if (_adminDb) return _adminDb;
  
  const dbId = databaseId === '(default)' ? undefined : databaseId;
  try {
    _adminDb = dbId ? getFirestore(app, dbId) : getFirestore(app);
    return _adminDb;
  } catch (error) {
    console.error('[Firebase Admin] Failed to initialize Firestore:', error);
    // Fallback to default database if named one fails
    _adminDb = getFirestore(app);
    return _adminDb;
  }
};

export const adminDb = getAdminDb();
export const adminDbDefault = getFirestore(app);
export const adminAuth = getAuth(app);
export const auth = adminAuth;

export { projectId, databaseId };
