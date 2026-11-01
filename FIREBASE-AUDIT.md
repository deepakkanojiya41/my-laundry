# Firestore Audit — My Laundry

Read-only audit of the current Firebase implementation. No code changed yet.

**Project:** my-laundry-efa07 · **Client:** single-file `index.html` (no Firebase SDK for data, REST only)
**Data path:** Firestore document `app/main` → field `data`

---

## 1. Current architecture and schema

| Item | Current state |
|---|---|
| Data access | Firestore **REST** (`firestore.googleapis.com/v1`), no Firestore SDK |
| Document | `app/main`, single field `data` (a map) |
| Payload | `{ shop, customers[], entries[], requests[], rates[], templates{}, bin{customers[],entries[]}, updated }` |
| Read | `GET app/main` on boot; then **poll every 4 s** with `?mask.fieldPaths=data` |
| Write | `PATCH app/main?updateMask.fieldPaths=data` — the **whole document** on every change, debounced 700 ms |
| Auth | Anonymous sign-in (`identitytoolkit accounts:signUp`) or Google popup (Firebase Auth SDK); ID token sent as `Authorization: Bearer` |
| Local fallback | `localStorage.ml_backup` (full payload) + `ml_session` |
| Rules | `firestore.rules` — owner-only on `app/{docId}`, everything else denied |

Because the app is a single HTML file with an in-memory `DB` object, the entire shop is one document.

---

## 2. Critical findings

### F1 — Polling every 4 s is the dominant cost · Severity: High · Cost
`startStream()` runs `setInterval(4000)`. Each tick is a **billed document read**.

- 1 device, 8 h open = **7,200 reads/day**
- 2 devices = **14,400 reads/day**
- Free tier is 50,000 reads/day — one busy week of testing can exhaust it.

**Fix:** pause polling when the tab is hidden (`document.visibilityState`), back off to 10–15 s when idle, and read only the collections a screen needs.

### F2 — Whole-document overwrite · Severity: High · Data loss
Every change rewrites `data` entirely (customers **and** entries **and** settings). Two devices editing at once = last write wins, and the loser's entries silently disappear.

**Fix:** split into collections; write only the document that changed.

### F3 — Single-document schema blocks every optimisation · Severity: High · Structure
`app/main` cannot be paginated, queried, indexed, or secured per record. A customer's app must download every other customer's data.

**Fix:** `customers/{id}`, `entries/{id}`, `requests/{id}`, `settings/shop`, `settings/rates`, `settings/templates`.

### F4 — Anonymous auth enabled in code · Severity: Medium · Security
`signIn()` calls `accounts:signUp` to get an anonymous token. With owner-only rules it cannot read/write, but it still mints identities and hides real auth failures.

**Fix:** use Google sign-in only; drop the anonymous path once OAuth is confirmed working.

### F5 — No write de-duplication · Severity: Medium · Cost
`persist()` fires on every mutation; the 700 ms debounce coalesces some, but re-saving an unchanged form still writes.

**Fix:** hash the payload; skip the write when nothing changed.

### F6 — Full payload in `localStorage` · Severity: Low · Risk
`ml_backup` duplicates the whole dataset in plain text on the device. It is the only protection against a failed write today, so keep it, but cap it and clear it on sign-out.

### F7 — No indexes, no pagination · Severity: Low now · Future
Fine at 20 entries, breaks at 2,000. Plan `entries` by `customerId + created` and by `created` alone.

---

## 3. Read/write inefficiency summary

| Operation | Today | After proposed change |
|---|---|---|
| Boot | 1 read (whole shop) | 1 read (settings) + 1 per screen |
| Idle hour | 900 reads | ~0 (paused when hidden) / 240 at 15 s |
| Save an entry | 1 write of everything | 1 write of one document |
| Concurrent edit | data loss | merge-safe |

---

## 4. Proposed structure

```
settings/shop          { name, tagline, phone, address, upi, webUrl, owner, ownerEmail }
settings/rates         { items: [ {id,name,price{Ironing,Dry clean}} ] }
settings/templates     { daily, due, ready, welcome }
customers/{custId}     { name, phone, email, address, note, created, deleted, deletedAt }
entries/{entryId}      { customerId, no, service, items[], status, note, due, created, payments[], deleted }
requests/{reqId}       { name, mobile, date, slot, count, service, address, note, status, created }
```

- Document IDs stay stable (`custId`, `entryId`), so writes are targeted `PATCH`es.
- Entries query: `where customerId == X order by created desc limit 50`, cursor pagination for more.
- Admin dashboard: count/aggregate documents maintained per day (`stats/{yyyy-mm-dd}`) instead of scanning entries.

---

## 5. Proposed rules

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function owner() {
      return request.auth != null
        && request.auth.token.email == 'deepakkanojiya41@gmail.com'
        && request.auth.token.email_verified == true;
    }
    match /settings/{doc}   { allow read: if request.auth != null; allow write: if owner(); }
    match /customers/{id}   { allow read: if owner() || (request.auth != null && request.auth.token.email == resource.data.email);
                              allow write: if owner(); }
    match /entries/{id}     { allow read: if owner() || (request.auth != null && exists(/databases/$(database)/documents/customers/$(resource.data.customerId)) && get(/databases/$(database)/documents/customers/$(resource.data.customerId)).data.email == request.auth.token.email);
                              allow write: if owner(); }
    match /requests/{id}    { allow read, create: if request.auth != null; allow update, delete: if owner(); }
    match /stats/{id}       { allow read, write: if owner(); }
    match /{document=**}   { allow read, write: if false; }
  }
}
```

Note: the `entries` read rule costs one extra document read per check — acceptable, or denormalise `ownerEmail` onto each entry to keep it free.

---

## 6. Implementation plan (incremental, reversible)

**Phase A — cost guard, no schema change (safe, today)**
1. Pause the 4 s poll when the tab is hidden.
2. Back off to 15 s after 60 s of no user interaction.
3. Skip the write when the payload hash is unchanged.
*Result: ~90 % fewer reads, no risk.*

**Phase B — schema migration (needs approval)**
4. Write a one-time migration that reads `app/main` and writes the new collections; keep `app/main` untouched as a rollback.
5. Switch the data layer to per-document reads/writes behind the same `FB` API so the UI does not change.
6. Verify both copies match, then stop reading `app/main`.

**Phase C — security and correctness**
7. Per-collection rules as above; drop anonymous auth.
8. Denormalise `ownerEmail` on entries so the read rule stays free.
9. Add `stats/{yyyy-mm-dd}` counters for the dashboard.

**Phase D — scale**
10. Cursor pagination on entries; composite index `customerId + created desc`.
11. Cap `ml_backup` and clear it on sign-out.

---

## 7. What I have and have not verified

- **Verified:** current read/write paths, polling interval, debounce, auth flow, rules file, and that writes are whole-document PATCHes (from the source).
- **Not verified:** real Firestore latency, actual billed usage for your project, and rule behaviour against live data — this sandbox cannot reach `firestore.googleapis.com`. Those need a run from your device or the Emulator Suite.

---

## 8. Rollback

Every phase is additive. `app/main` stays readable until Phase B step 6 is confirmed; reverting means pointing the data layer back at `app/main` (one constant) and restoring the previous rules file from git.
