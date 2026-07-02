// scripts/seed-firebase-users.mjs
// Seed Firebase Auth users + Firestore `users/{uid}` docs for SalesCore.
// App is fully Firebase now; these mirror the old MySQL seed accounts.
//
// Run:
//   node --env-file=.env.local scripts/seed-firebase-users.mjs
//
// Requires FIREBASE_SERVICE_ACCOUNT_BASE64 in .env.local (already set).
// NOTE: creating users via Admin SDK works even before the Email/Password
// provider is enabled — but LOGIN needs that provider ON in the console.

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

// Same roster as the old MySQL seed. Password = "password123" for all.
const PASSWORD = 'password123';
const USERS = [
  { name: 'Windy Pratama', email: 'windy@piranusa.com', role: 'Leader', team: 'AEC' },
  { name: 'Andi Saputra',  email: 'andi@piranusa.com',  role: 'Sales',  team: 'AEC' },
  { name: 'Bella Kusuma',  email: 'bella@piranusa.com', role: 'Sales',  team: 'AEC' },
  { name: 'Citra Dewi',    email: 'citra@piranusa.com', role: 'Sales',  team: 'MFG' },
];

async function upsert(u) {
  let uid;
  try {
    const rec = await auth.createUser({ email: u.email, password: PASSWORD, displayName: u.name });
    uid = rec.uid;
    console.log(`✅ created auth  ${u.email}`);
  } catch (e) {
    if (e.code === 'auth/email-already-exists') {
      const rec = await auth.getUserByEmail(u.email);
      uid = rec.uid;
      await auth.updateUser(uid, { password: PASSWORD, displayName: u.name });
      console.log(`↻  updated auth  ${u.email} (already existed, password reset)`);
    } else {
      throw e;
    }
  }
  // users/{uid} doc — exact shape AuthProvider reads (UserProfile).
  await db.collection('users').doc(uid).set(
    { uid, name: u.name, email: u.email, role: u.role, team: u.team },
    { merge: true }
  );
  console.log(`   wrote users/${uid}  (${u.role}, ${u.team})`);
}

for (const u of USERS) {
  try { await upsert(u); }
  catch (e) { console.error(`❌ ${u.email}: ${e.code || e.message}`); }
}
console.log('\nDone. All passwords = "password123".');
process.exit(0);
