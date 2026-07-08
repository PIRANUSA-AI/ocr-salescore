// scripts/create-beni-superadmin.mjs
// Create the Beni (Atasan/Direktur) account as Superadmin.
// Superadmin sees ALL data + can process like Adi (Leader) + manage users.
//
// Run (in Firebase Studio / wherever FIREBASE_SERVICE_ACCOUNT_BASE64 is set):
//   node --env-file=.env.local scripts/create-beni-superadmin.mjs

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
if (!b64) {
  console.error('❌ FIREBASE_SERVICE_ACCOUNT_BASE64 missing in env.');
  process.exit(1);
}
const serviceAccount = JSON.parse(Buffer.from(b64.trim(), 'base64').toString('utf-8'));

const app = getApps().length
  ? getApps()[0]
  : initializeApp({ credential: cert(serviceAccount) });
const auth = getAuth(app);
const db = getFirestore(app);

const EMAIL = 'beni@piranusa.com';
const PASSWORD = '111111';
const NAME = 'Beni';
const TEAM = 'AEC'; // irrelevant for Superadmin (sees all), required by schema

async function upsert() {
  let uid;
  try {
    const rec = await auth.createUser({ email: EMAIL, password: PASSWORD, displayName: NAME });
    uid = rec.uid;
    console.log(`✅ created auth  ${EMAIL}`);
  } catch (e) {
    if (e.code === 'auth/email-already-exists') {
      const rec = await auth.getUserByEmail(EMAIL);
      uid = rec.uid;
      await auth.updateUser(uid, { password: PASSWORD, displayName: NAME });
      console.log(`↻  updated auth  ${EMAIL} (already existed, password set)`);
    } else {
      throw e;
    }
  }
  await db.collection('users').doc(uid).set(
    { uid, name: NAME, email: EMAIL, role: 'Superadmin', team: TEAM },
    { merge: true }
  );
  console.log(`   wrote users/${uid}  (Superadmin, ${TEAM})`);
}

try { await upsert(); }
catch (e) { console.error(`❌ ${EMAIL}: ${e.code || e.message}`); }

console.log('\nDone. Beni = Superadmin. Password = "111111".');
process.exit(0);
