/**
 * One-time customer import: old Firebase project -> My Laundry.
 *
 * Run this on your computer (never in the browser). The service-account keys
 * must stay on your machine.
 *
 *   1. Firebase console -> Project settings -> Service accounts -> Generate new private key
 *      for the OLD project  -> save as  old-service-account.json
 *      for THIS project     -> save as  new-service-account.json
 *   2. npm install firebase-admin
 *   3. node migrate-customers.js
 *
 * What it does: reads every document in the old `customers` collection, maps the
 * common field names, and writes them into this project's `customers/{id}`.
 * Existing customers are updated, new ones are added. Nothing is deleted.
 */

const fs = require('fs');
const admin = require('firebase-admin');

const OLD_KEY = process.env.OLD_KEY || './old-service-account.json';
const NEW_KEY = process.env.NEW_KEY || './new-service-account.json';
const COLLECTION = process.env.COLLECTION || 'customers';
const DRY_RUN = process.env.DRY_RUN === '1';

if (!fs.existsSync(OLD_KEY) || !fs.existsSync(NEW_KEY)) {
  console.error('Missing service account file(s):', OLD_KEY, NEW_KEY);
  process.exit(1);
}

const oldApp = admin.initializeApp({ credential: admin.credential.cert(require(OLD_KEY)) }, 'old');
const newApp = admin.initializeApp({ credential: admin.credential.cert(require(NEW_KEY)) }, 'new');

const oldDb = oldApp.firestore();
const newDb = newApp.firestore();

/* map whatever the old app called things onto this app's field names */
function normalise(id, d) {
  const phone = String(d.phone || d.mobile || d.phoneNumber || d.contact || '').replace(/\D/g, '').slice(-10);
  const flat = d.flat || d.flatNo || d.houseNo || d.room || '';
  const wing = d.wing || d.building || d.buildingName || d.tower || '';
  const area = d.area || d.locality || d.city || '';
  const address = d.address || [flat, wing, area].filter(Boolean).join(', ');
  return {
    id,
    name: (d.name || d.customerName || d.fullName || '').trim(),
    phone,
    email: (d.email || '').toLowerCase().trim(),
    flat, wing, area, address,
    note: d.note || d.notes || '',
    created: d.created || d.createdAt || new Date().toISOString().slice(0, 10),
    deleted: !!d.deleted,
    deletedAt: d.deletedAt || null
  };
}

(async () => {
  const snap = await oldDb.collection(COLLECTION).get();
  console.log(`Found ${snap.size} documents in ${COLLECTION}.`);

  let added = 0, updated = 0, skipped = 0;
  for (const doc of snap.docs) {
    const c = normalise(doc.id, doc.data());
    if (!c.name) { skipped++; console.log('skip (no name):', doc.id); continue; }

    const ref = newDb.collection('customers').doc(c.id);
    const exists = (await ref.get()).exists;
    if (DRY_RUN) {
      console.log(exists ? 'would update:' : 'would add:', c.name, c.phone);
      exists ? updated++ : added++;
      continue;
    }
    await ref.set(c, { merge: true });
    exists ? updated++ : added++;
  }

  const v = Date.now().toString();
  if (!DRY_RUN) await newDb.collection('meta').doc('version').set({ v }, { merge: true });

  console.log(`Done. added ${added}, updated ${updated}, skipped ${skipped}${DRY_RUN ? ' (dry run)' : ''}.`);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
