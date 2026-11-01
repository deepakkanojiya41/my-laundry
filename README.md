# My Laundry

A mobile-first management app for an Indian pickup & delivery laundry shop that offers
**ironing** and **dry clean** only. One codebase, two experiences:

- **Admin app** for the shop owner — customers, entries, orders, udhari (dues), monthly bills,
  analytics, rate card, WhatsApp templates, UPI collection, recycle bin, backup/restore.
- **Customer app** for customers — their own entries, pickup requests, rate card, monthly
  statement, UPI payment.

Everything lives in a single self-contained `index.html` (inline CSS + JS, no framework, no build
step) plus the PWA shell: `manifest.webmanifest`, a service worker and app icons.

## Run it

Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8080
# then visit http://localhost:8080
```

The service worker only registers over `https://` or `localhost`, so install-to-home-screen
works when served, not from a `file://` path.

## First run

The app starts completely empty — no customers, no entries, no pickup requests.

1. Open **Settings → Shop profile** and fill in the shop name, mobile number, address, business
   UPI ID and owner name. Until a mobile number and UPI ID are set, the WhatsApp and UPI actions
   stay out of the way instead of pointing somewhere wrong.
2. Add your first customer from **Home** or the **Customers** tab.
3. Start taking entries — the rate card already carries sensible default prices, editable in
   **Settings → Rate card**.

## Signing in (UI only — no real OTP or Google verification)

| You enter | You get |
|---|---|
| Any 10-digit mobile starting 6–9, then any 6 digits | Admin app |
| `deepakkanojiya41@gmail.com` | Admin app |
| A customer's saved email | That customer's app |
| Any other email | "No account found for this email" |

## Notes

- **Frontend only.** All data sits in one in-memory `DB` object behind a single
  `persist(kind, key)` hook — wire that to localStorage, IndexedDB or an API later.
  A reload starts from an empty shop again, so use **Settings → Backup and restore** to keep a copy.
- Statuses: Pickup → Processing → Ready → Out for delivery → Delivered, plus Cancelled and
  Rejected (not billed, shown struck through). An entry is overdue when its delivery date has
  passed and it is still open.
- Money: entry total = Σ qty × price; balance = billed − paid, never below zero; a customer
  payment is applied to the oldest unpaid entries first.
- Links use `wa.me` anchors (never `window.open`) so they work inside installed apps.
- Passbook and pickup links point at wherever the app is hosted; set a web address in the shop
  profile to override that.
- Vendored, MIT licensed, inlined at the top of the script: [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator)
  by Kazuhiko Arase, and [lz-string](https://github.com/pieroxy/lz-string) by Pieroxy.
  Fonts: Bricolage Grotesque + Figtree from Google Fonts, with system fallbacks.
- Design: 390 px-first, content column capped at 520 px, safe-area aware, light and dark
  themes, `prefers-reduced-motion` respected.

## Files

```
index.html            the whole app
manifest.webmanifest  PWA manifest
sw.js                 app-shell service worker
icon-192.png          app icon
icon-512.png          app icon
icon-maskable-512.png maskable icon
```
