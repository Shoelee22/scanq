# ScanQ — free queue management + document upload

**Live:** https://scanq-one.vercel.app

A customer scans a QR code at the counter, uploads their PDF/photo from their
phone, picks print options, and gets a token number with a live status page.
The shop owner watches the queue update in real time, downloads files, and
advances tokens. No app install, no cost.

**Files**

| File | What it is |
|---|---|
| `index.html` / `customer.js` | Customer portal: upload form, print options, token + live status |
| `admin.html` / `admin.js` | Shop dashboard: live queue, download, call-next, passcode gate, counter display (`?display=1`) |
| `styles.css` | Shared minimal design system |
| `config.js` | Your Supabase keys, shop name, admin passcode |
| `sq.js` | Shared helpers (Supabase client, formatting, demo data) |
| `supabase-schema.sql` | Database tables, daily token counter, RLS policies, storage |
| `scripts/make-qr.py` | Print-ready QR code generator |

**Preview without any setup:** open `index.html?demo=1` and
`admin.html?demo=1` — sample data, no Supabase needed.

## Setup (about 15 minutes)

### 1. Supabase (free tier)

1. Create a project at [supabase.com](https://supabase.com) (free tier is plenty).
2. Open **SQL Editor → New query**, paste the whole of `supabase-schema.sql`, run it.
   This creates the `queue_items` table, a daily token counter (restarts at 1
   every morning, safe under concurrent uploads), row-level security, the
   private `documents` storage bucket, and enables Realtime.
3. Go to **Project Settings → API** and copy the **Project URL** and the
   **anon public** key into `config.js`.

### 2. Deploy (free)

The app is 100% static — no build step.

- **Vercel:** `npx vercel --prod` in this folder, or drag the folder into
  [vercel.com/new](https://vercel.com/new). Your customer URL will be
  `https://<project>.vercel.app`.
- **Netlify:** drag the folder into [app.netlify.com/drop](https://app.netlify.com/drop).
- **GitHub Pages:** push the folder to a repo → Settings → Pages.

### 3. QR code for the counter

```bash
pip install "qrcode[pil]"
python scripts/make-qr.py https://your-stationery-queue.vercel.app
```

This writes `qr/counter-qr.png` (1200×1200, high error correction so it still
scans through lamination). Print it, laminate it, stick it at the counter.
Re-run with `--size 1600` for a larger print.

### 4. Shop owner basics

- Dashboard: `https://your-url/admin.html` — default passcode is `1234`.
  **Change it:** run `echo -n "your-new-code" | sha256sum` and paste the hash
  into `ADMIN_PASSCODE_SHA256` in `config.js`.
- Counter display: open `https://your-url/admin.html?display=1` on a tablet/TV
  at the counter — big "NOW PRINTING" token board, updates live. No passcode.
- The dashboard chimes when a new upload arrives (toggle with "Sound on/off").

## How the flow works

1. Customer scans QR → `index.html` → name + file + print options → token.
2. File lands in the private `documents` bucket; a row is inserted in
   `queue_items` with today's token number (serial per day via advisory lock).
3. Dashboard sees it instantly via Supabase Realtime + chime.
4. Owner clicks **Download** (1-hour signed URL), prints, then **Start printing**
   → **Mark done**. The customer's status page updates live at each step.
5. **Call next token** advances the oldest waiting job in one tap.

## Honest notes / hardening

- The admin passcode is checked in the browser — it keeps casual visitors out,
  not attackers. For real protection, put the dashboard behind Supabase Auth
  (email login) and restrict the `queue_update_anon` RLS policy to the
  `authenticated` role.
- Uploaded files live in a private bucket; only someone with the dashboard can
  generate download links. File paths are unguessable UUIDs. Clear old files
  periodically (see the commented cleanup queries at the bottom of
  `supabase-schema.sql`) — the free tier gives 1 GB of storage.
- Anonymous inserts are rate-limited by Supabase's abuse protection, but a busy
  shop should still keep an eye on the usage dashboard.
- Phone numbers are optional and only visible on the dashboard, never public.

## Cost

Supabase free tier (500 MB database, 1 GB storage) + Vercel/Netlify/GitHub Pages
free hosting + this code = ₹0.
