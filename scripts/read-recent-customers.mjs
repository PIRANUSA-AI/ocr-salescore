import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as dotenv from 'dotenv';
import * as fs from 'fs';

dotenv.config({ path: '.env.local' });

const serviceAccountB64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
if (!serviceAccountB64) {
    console.error('FIREBASE_SERVICE_ACCOUNT_BASE64 missing.');
    process.exit(1);
}

const serviceAccount = JSON.parse(Buffer.from(serviceAccountB64, 'base64').toString('utf-8'));

initializeApp({
    credential: cert(serviceAccount)
});

const db = getFirestore();

async function run() {
    const snapshot = await db.collection('customers').orderBy('createdAt', 'desc').limit(5).get();
    if (snapshot.empty) {
        console.log('No customers found.');
        return;
    }

    snapshot.docs.forEach(doc => {
        const data = doc.data();
        console.log('----------------------------------------------------');
        console.log(`ID: ${doc.id}`);
        console.log(`Name: ${data.name}`);
        console.log(`Email: ${data.email}`);
        console.log(`Company: ${data.company}`);
        console.log(`Acquisition Context:`, data.acquisitionContext);
        console.log(`Notes:`, data.notes);
        console.log(`Team: ${data.team}`);
        console.log(`Assigned Sales: ${data.assignedSalesName} (${data.assignedSalesId})`);
    });
}

run().catch(console.error);
