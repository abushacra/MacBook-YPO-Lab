# Kapa Service Log

A mobile-first app for Kapa Property Company. In-house maintenance engineers and
outside vendors use it to log maintenance shifts as they finish them, and to submit
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

## Approvals

An in-house engineer can be tagged **Chief Engineer** in Admin → People. Other
engineers and outside vendors are then placed under one chief with the
**Reports to** picker.

Every maintenance shift is saved as **Awaiting approval** and routed to the
logger's chief. The chief sees a card on the Home screen with the count, and a
**To approve** filter on the Shifts screen. Opening a shift gives them Approve or
Send back, with an optional note that the engineer sees on the call.

Rules the app holds to:

- Only the chief a shift was routed to, or an admin, can review it.
- A chief cannot approve their own work; their shifts go to their own chief.
- An admin can sign off anything, including shifts they logged themselves, and
  can revise a decision already made. That is deliberate: an admin is the
  backstop for shifts whose author has no chief, and for a correction.
- Routing is snapshotted when the call is saved, so moving someone to a new
  chief never pulls work out of the old chief's queue.
- Shifts logged by someone with no chief stay pending and are visible to admins,
  who can approve them.

The database enforces the structure independently: only in-house engineers can
be chiefs, a reporting line must point at an actual chief, nobody reports to
themselves, and a chief cannot be untagged while people still report to them.

### Deleting a shift

An admin gets a **Delete shift** control at the bottom of any shift, behind a
two-tap confirmation. It removes the shift and its photo and PDF rows, and
clears those files out of storage through the Storage API — SQL cannot delete
storage objects, so this is the only path that leaves nothing behind.

A receipt logged against the shift is **kept and unlinked**, not deleted. It is
a financial record assigned to a property and should not disappear because the
shift it referenced did.

## Paying engineers

Each in-house engineer has rate tiers set in **Admin → People**: three named by
role (Chief Engineer, Building Engineer, Assistant Engineer) plus a custom one.
Usually only the row matching that person's role carries a rate; the rest are
left blank. One tier is marked active, and every shift that engineer logs
is priced from it.

**Rates are admin-only.** Engineers never see a rate on the call form, in their
history, or anywhere else — the amount is read from the database when the shift
is saved, so it cannot be seen or influenced from the form. Admins see the
amount on each shift plus a billable total for whatever filter is applied on
the Shifts screen. Vendors see the amounts they quoted themselves, and nobody else's.

Amounts are snapshots. Re-pricing a tier, renaming it, or deleting it never
alters shifts already logged, so what someone was paid last month stays what
they were paid.

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

**Maintenance shift** — date, Shift Charge (Regular, x 1.5 Shift or
x 2 Shift), shift type (emergency or scheduled), and property are required. Space, a description of the work, a
follow-up flag with notes, and up to eight photos or PDFs are optional.

A shift can cover **two properties**, for an engineer who works both in one day:
ticking "This shift covers a second property" adds a second property and space.
The two must be different, and filtering by a property finds shifts where it is
either the first or the second.

An outside vendor also gets an optional **amount they are charging** for the
job. An in-house engineer gets no money field at all: their shifts are priced
automatically from the rate an admin set for them.

Space can be tapped from the property's list, typed free-hand, or left blank
for whole-property work. A typed value that matches a managed space (ignoring
case) is linked to it, so "suite 210" and picking *Suite 210* land on the same
record; anything else is stored as a one-off label.

**Credit card receipt** — amount, date, and the property to charge are required.
A receipt image or PDF, store, category, notes, and a link to a related
maintenance shift are optional.

Attachments offer two buttons: **Take photo** opens the camera straight away,
and **Choose file** opens the phone's photo library and file browser, so a shot
taken earlier or a PDF that arrived by email can be attached just as easily.

They upload the moment they are picked, while the engineer is still filling in
the rest of the form. Images are downscaled to 1600px in the browser first so
they move on a weak cellular connection; PDFs are sent as-is and are capped at
4MB, which is the largest body the hosting platform accepts.

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
| `spaces` | Units, suites, and common areas within a property. Suggestions, not a closed list. |
| `technicians` | In-house engineers and outside vendors, with PIN hash, admin and chief flags, and who they report to. |
| `technician_rates` | Per-engineer billing tiers. Exactly one is the active rate. |
| `service_calls` | One row per logged maintenance shift, covering one or two properties, with its approval state. |
| `service_call_photos` | Storage paths of the photos and PDFs attached to a shift. |
| `expenses` | Credit card charges, each assigned to a property. |

Shifts and expenses store a `property_label` / `space_label` snapshot
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

## Naming

The feature engineers use is called a **Maintenance Shift**. The database
tables are still named `service_calls` and `service_call_photos`, and the URLs
are still `/calls` — renaming either would break links people have already
saved to their phone home screen and would rewrite rows for no functional gain.
The stored `hours_type` values likewise keep their original spelling, so
`after_hours` is the **x 1.5 Shift** tier.
