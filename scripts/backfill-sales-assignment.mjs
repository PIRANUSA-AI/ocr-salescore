// scripts/backfill-sales-assignment.mjs
// Backfill assignedSalesId/assignedSalesName on `customers` docs whose
// sales code is only present as text in notes.manual (from the old OCR flow),
// by matching that code against users/{uid}.salesCode.
//
// Non-destructive: only writes assignedSalesId + assignedSalesName, only on
// docs where assignedSalesId is currently null/missing. Never deletes.
//
// Usage:
//   node --env-file=.env.local scripts/backfill-sales-assignment.mjs           # dry-run (default)
//   node --env-file=.env.local scripts/backfill-sales-assignment.mjs --apply   # writes changes

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
if (!b64) {
  console.error('❌ FIREBASE_SERVICE_ACCOUNT_BASE64 missing in env.');
  process.exit(1);
}
const serviceAccount = JSON.parse(Buffer.from(b64.trim(), 'base64').toString('utf-8'));

const app = getApps().length
  ? getApps()[0]
  : initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore(app);

const APPLY = process.argv.includes('--apply');
console.log(`Mode: ${APPLY ? 'APPLY (writing changes)' : 'DRY RUN (no writes)'}\n`);

const salesSnapshot = await db.collection('users').where('role', '==', 'Sales').get();
const salesByCode = new Map();
salesSnapshot.forEach(doc => {
  const data = doc.data();
  if (data.salesCode) salesByCode.set(data.salesCode, { uid: data.uid || doc.id, name: data.name });
});
console.log(`Loaded ${salesByCode.size} sales users with a salesCode.\n`);

const customersSnapshot = await db.collection('customers').get();
console.log(`Scanning ${customersSnapshot.size} customers...\n`);

let matched = 0;
let skippedAlreadyAssigned = 0;
let skippedNoMatch = 0;

for (const doc of customersSnapshot.docs) {
  const data = doc.data();
  if (data.assignedSalesId) {
    skippedAlreadyAssigned++;
    continue;
  }
  const notesText = data.notes?.manual || '';
  // Two OCR note formats seen in the data: "Sales: TK" (code only) and
  // "Sales: Tika (TK)" (full name + code in parens). Prefer the parenthesized
  // code when present, since matching the first 2-3 letters of the name
  // (e.g. "Tika" -> "TIK") does not match any real salesCode.
  const match = notesText.match(/Sales:\s*(?:[^\n(]*\(([A-Za-z]{2,3})\)|([A-Za-z]{2,3}))/);
  if (!match) {
    skippedNoMatch++;
    continue;
  }
  const code = (match[1] || match[2]).toUpperCase();
  const salesUser = salesByCode.get(code);
  if (!salesUser) {
    skippedNoMatch++;
    console.log(`⚠️  ${doc.id}: code "${code}" found in notes but no matching sales user.`);
    continue;
  }

  matched++;
  console.log(`${APPLY ? '✅ updating' : '🔎 would update'} ${doc.id} (${data.name || 'unnamed'}) -> assignedSalesId=${salesUser.uid}, assignedSalesName=${salesUser.name} (code=${code})`);

  if (APPLY) {
    await db.collection('customers').doc(doc.id).update({
      assignedSalesId: salesUser.uid,
      assignedSalesName: salesUser.name,
    });
  }
}

console.log(`\nDone. Matched: ${matched}, already assigned (skipped): ${skippedAlreadyAssigned}, no code match (skipped): ${skippedNoMatch}.`);
if (!APPLY) {
  console.log('This was a dry run — no data was changed. Re-run with --apply to write these updates.');
}
process.exit(0);
