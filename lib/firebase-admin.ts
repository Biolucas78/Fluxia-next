import { initializeApp, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { credential } from 'firebase-admin';
import firebaseConfig from '../firebase-applet-config.json';

const projectId = firebaseConfig.projectId;
const databaseId = firebaseConfig.firestoreDatabaseId || '(default)';

const app = getApps().length === 0 
  ? (() => {
      console.log('Initializing Firebase Admin with Project ID:', projectId);
      try {
        return initializeApp({
          projectId: projectId,
        });
      } catch (error: any) {
        console.error('FAILED to initialize Firebase Admin App:', error.message);
        throw error;
      }
    })()
  : getApp();

export const adminDb = getFirestore(app, databaseId);
export const adminDbDefault = getFirestore(app);
export const adminAuth = getAuth(app);
export const auth = adminAuth;
