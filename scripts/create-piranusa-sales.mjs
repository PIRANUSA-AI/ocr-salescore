// scripts/create-piranusa-sales.mjs
// Create 8 Sales accounts (Piranusa) in Firebase Auth + Firestore `users/{uid}`.
// All accounts: role=Sales, same team as the leader (adi@piranusa.com),
// password="111111" (told to users as "1"), with a 2-letter salesCode.
//
// Run (in Firebase Studio / wherever FIREBASE_SERVICE_ACCOUNT_BASE64 is set):
//   node --env-file=.env.local scripts/create-piranusa-sales.mjs
//
// Idempotent: if a user already exists it updates password + profile (merge).
// NOTE: login needs Email/Password provider ON in Firebase Console.

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
if (!b64) {
  console.error('❌ FIREBASE_SERVICE_ACCOUNT_BASE64 missing in env.');
  console.error('   Run this in Firebase Studio/IDX, or set the env var first.');
  process.exit(1);
}
const serviceAccount = JSON.parse(Buffer.from(b64.trim(), 'base64').toString('utf-8'));

const app = getApps().length
  ? getApps()[0]
  : initializeApp({ credential: cert(serviceAccount) });
const auth = getAuth(app);
const db = getFirestore(app);

const PASSWORD = '111111';
const LEADER_EMAIL = 'adi@piranusa.com';
const DEFAULT_TEAM = 'AEC';

const SALES = [
  { name: 'Lukman',    email: 'lukman@piranusa.com',    code: 'LN' },
  { name: 'Lody',      email: 'lody@piranusa.com',      code: 'LS' },
  { name: 'Nurhayati', email: 'nurhayati@piranusa.com', code: 'NU' },
  { name: 'Rustini',   email: 'rustini@piranusa.com',   code: 'RU' },
  { name: 'Tika',      email: 'tika@piranusa.com',      code: 'TK' },
  { name: 'Ita',       email: 'ita@piranusa.com',       code: 'TA' },
  { name: 'Brist',     email: 'brist@piranusa.com',     code: 'BR' },
  { name: 'Rizqi',     email: 'rizqi@piranusa.com',     code: 'RQ' },
];

// Derive team from the leader so everyone stays on the same team
// (keeps Leader visibility working — see app/actions/leader.ts:116).
let team = DEFAULT_TEAM;
try {
  const leader = await auth.getUserByEmail(LEADER_EMAIL);
  const leaderDoc = await db.collection('users').doc(leader.uid).get();
  if (leaderDoc.exists && leaderDoc.data()?.team) {
    team = leaderDoc.data().team;
  }
} catch (e) {
  console.warn(`⚠️  Could not read leader (${LEADER_EMAIL}) team; defaulting to ${DEFAULT_TEAM}.`);
}
console.log(`Team for all Sales = ${team}  |  Password = "${PASSWORD}"\n`);

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
      console.log(`↻  updated auth  ${u.email} (already existed, password set)`);
    } else {
      throw e;
    }
  }
  // users/{uid} doc — shape AuthProvider reads (UserProfile) + salesCode.
  await db.collection('users').doc(uid).set(
    { uid, name: u.name, email: u.email, role: 'Sales', team, salesCode: u.code },
    { merge: true }
  );
  console.log(`   wrote users/${uid}  (Sales, ${team}, code=${u.code})`);
}

for (const u of SALES) {
  try { await upsert(u); }
  catch (e) { console.error(`❌ ${u.email}: ${e.code || e.message}`); }
}
console.log('\nDone. All passwords = "111111". Tell users their password is "1".');
process.exit(0);
