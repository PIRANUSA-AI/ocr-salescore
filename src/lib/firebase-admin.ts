// src/lib/firebase-admin.ts
// Ini adalah kode yang benar, aman, dan modular.

import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { getAuth, Auth } from 'firebase-admin/auth';

// 1. Singleton state
let app: App | undefined;
let adminDb: Firestore | undefined;
let adminAuth: Auth | undefined;

// 2. Robust Initialization Function
function getFirebase() {
  if (app) return { adminDb: adminDb!, adminAuth: adminAuth! };

  try {
    const serviceAccountB64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;

    if (getApps().length > 0) {
      app = getApps()[0];
      adminDb = getFirestore(app);
      adminAuth = getAuth(app);
      return { adminDb, adminAuth };
    }

    if (!serviceAccountB64) {
      console.warn('WARN: FIREBASE_SERVICE_ACCOUNT_BASE64 missing. Using mock DB for build.');
      throw new Error('Missing Env Var');
    }

    // Clean whitespace that might cause JSON parse error
    const cleanB64 = serviceAccountB64.trim();
    const serviceAccountString = Buffer.from(cleanB64, 'base64').toString('utf-8');
    const serviceAccount = JSON.parse(serviceAccountString);

    app = initializeApp({
      credential: cert(serviceAccount),
      databaseURL: `https://${serviceAccount.project_id}.firebaseio.com`
    });

    adminDb = getFirestore(app);
    adminAuth = getAuth(app);

    console.log('[Firebase Admin] Initialized successfully.');
    return { adminDb, adminAuth };

  } catch (error) {
    console.error('[Firebase Admin] Init FAILED. Using Mock fallback to prevent crash.', error);

    // MOCK OBJECTS to prevent "undefined" errors during build
    // These will throw ONLY if you try to actually read/write data
    const mockDb = {
      collection: () => { throw new Error("Firebase Admin not initialized (Mock DB used). Check server logs."); },
      batch: () => { throw new Error("Firebase Admin not initialized (Mock DB used)."); },
      doc: () => { throw new Error("Firebase Admin not initialized (Mock DB used)."); },
    } as unknown as Firestore;

    const mockAuth = {} as unknown as Auth;

    // Assign to globals so repeated calls get the same mock
    adminDb = mockDb;
    adminAuth = mockAuth;

    return { adminDb: mockDb, adminAuth: mockAuth };
  }
}

// 3. Export proxy objects that lazy-load
// Accessing these exports triggers initialization ON DEMAND, not at module load time.

const dbProxy = new Proxy({} as Firestore, {
  get: (_target, prop) => {
    const { adminDb } = getFirebase();
    return (adminDb as any)[prop];
  }
});

const authProxy = new Proxy({} as Auth, {
  get: (_target, prop) => {
    const { adminAuth } = getFirebase();
    return (adminAuth as any)[prop];
  }
});

export { dbProxy as adminDb, authProxy as adminAuth };
