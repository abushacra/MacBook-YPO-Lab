# Kapa Service Log

A mobile-first app for Kapa Property Company. In-house maintenance engineers and
outside vendors use it to log service calls as they finish them, and to submit
credit card receipts against the property that should carry the expense.

Built as a Next.js app on a Supabase Postgres database, with private storage
buckets for job photos and receipts.

---

## One-time setup

The app needs three environment values. Copy the template and fill it in:

```bash
cp .env.example .env.local
```

| Variable | Where it comes from |
| --- | --- |
| `SUPABASE_URL` | Already filled in — the Kapa project's API URL. |
| `SUPABASE_SECRET_KEY` | **You need to paste this.** Supabase Dashboard → Project Settings → API Keys → the `service_role` / secret key. |
| `APP_SESSION_SECRET` | Any long random string. Generate one with `openssl rand -base64 32`. |
| `NEXT_PUBLIC_APP_TIME_ZONE` | Optional. Sets what "today" means on the date fields. Defaults to `America/New_York`. |

`SUPABASE_SECRET_KEY` is server-only. It must never be prefixed with
`NEXT_PUBLIC_` or referenced from a Client Component — it bypasses every
database rule.

Then:

```bash
npm install
npm run dev      # http://localhost:3000
```

## First sign-in

The database ships with one bootstrap account, **Kapa Admin**, which has no PIN
yet. The first person to open the app taps that name, chooses a 4-digit PIN, and
is signed in as an administrator.

Do this before sharing the URL with anyone — until a PIN is set, that account is
claimable by whoever reaches it first.

From there, open **Admin → People** to add the real engineers and vendors, and
**Admin → Properties** to replace the three sample properties with Kapa's
portfolio. Once a real administrator exists, deactivate `Kapa Admin`.

## How people sign in

There are no passwords or email invitations. Someone is added in Admin, and the
first time they open the app they tap their name and pick their own 4-digit PIN.
The PIN is stored as a salted scrypt hash, never in plain text.

Five wrong PINs lock that name for 15 minutes. An administrator can clear a
forgotten PIN with **Reset PIN**, which sends the person back through
"choose a PIN" on their next sign-in.

The session cookie is HMAC-signed, `httpOnly`, and lasts 30 days, so engineers
stay signed in on their own phone. Every request re-checks the account against
the database, so deactivating someone takes effect immediately.

## What gets logged

**Service call** — date, regular or after hours, emergency or scheduled,
property, and space are required. A description of the work, a follow-up flag
with notes, and up to eight photos are optional.

**Credit card receipt** — amount, date, and the property to charge are required.
A receipt image or PDF, store, category, notes, and a link to a related service
call are optional.

Photos and receipts upload the moment they are picked, while the engineer is
still filling in the rest of the form, and images are downscaled to 1600px in
the browser first so they move on a weak cellular connection.

## On a phone

Open the site in Safari or Chrome and use **Add to Home Screen**. It then runs
full-screen with its own icon. Everything is sized for one-handed use: large
tap targets, native date and number keypads, and a save button that stays
within reach as the form scrolls.

## Deploying

The app runs on any Node host. On Vercel, import the repository and set
`SUPABASE_URL`, `SUPABASE_SECRET_KEY`, and `APP_SESSION_SECRET` as environment
variables for every environment you deploy.

Changing `APP_SESSION_SECRET` signs everyone out — that is the way to force a
global sign-out if a phone is lost.

## Data model

| Table | Holds |
| --- | --- |
| `properties` | The portfolio. Retired instead of deleted, so old logs still resolve. |
| `spaces` | Units, suites, and common areas within a property. |
| `technicians` | In-house engineers and outside vendors, with PIN hash and admin flag. |
| `service_calls` | One row per logged call. |
| `service_call_photos` | Storage paths of the photos on a call. |
| `expenses` | Credit card charges, each assigned to a property. |

Service calls and expenses store a `property_label` / `space_label` snapshot
alongside the foreign key, so renaming or retiring a property never rewrites
history.

### Security model

Every table has row level security **enabled with no policies**, and both
storage buckets are private. Nothing is reachable with the public/anon key: all
reads and writes go through the Next.js server using the secret key, behind the
PIN session check.

The Supabase linter reports this as `rls_enabled_no_policy` at INFO level. That
is the intended posture — **do not "fix" it by adding permissive policies**,
which would expose the whole database to anyone holding the publishable key.

Files in storage are served through `/api/media`, which checks the session and
then issues a 5-minute signed URL, so no durable public link to a receipt or
job photo exists.

### Changing the schema

Apply migrations to the Supabase project, then regenerate the types:

```bash
npx supabase gen types typescript --project-id wvayvybbinywglriunxm > src/lib/database.types.ts
```

## Checks

```bash
npm run build    # type-checks and compiles
npx eslint .     # lint
```
