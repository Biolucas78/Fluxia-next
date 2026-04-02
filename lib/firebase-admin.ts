import { initializeApp, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import firebaseConfig from '../firebase-applet-config.json';

// Use a singleton pattern to ensure the app is only initialized once
const projectId = firebaseConfig.projectId;
console.log('Initializing Firebase Admin with Project ID:', projectId);

if (!projectId) {
  console.error('CRITICAL: No Project ID found for Firebase Admin initialization.');
}

const app = getApps().length === 0 
  ? (() => {
      console.log('Creating new Firebase Admin App...');
      try {
        const newApp = initializeApp({
          projectId: projectId,
        });
        console.log('Firebase Admin App created successfully.');
        return newApp;
      } catch (initError: any) {
        console.error('FAILED to initialize Firebase Admin App:', initError.message);
        throw initError;
      }
    })()
  : getApp();

// Access Firestore for the specific database ID using the modular SDK
const databaseId = firebaseConfig.firestoreDatabaseId || '(default)';
console.log('Accessing Firestore Database ID:', databaseId);

export const adminDb = getFirestore(app, databaseId);
export const adminDbDefault = getFirestore(app); // Always (default)
export const adminAuth = getAuth(app);
