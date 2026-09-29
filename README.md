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

## Approvals

An in-house engineer can be tagged **Chief Engineer** in Admin → People. Other
engineers and outside vendors are then placed under one chief with the
**Reports to** picker.

Every service call is saved as **Awaiting approval** and routed to the
logger's chief. The chief sees a card on the Home screen with the count, and a
**To approve** filter on the Service Calls screen. Opening a service call gives them Approve or
Send back, with an optional note that the engineer sees on the call.

Rules the app holds to:

- Only the chief a service call was routed to, or an admin, can review it.
- A chief cannot approve their own work; their service calls go to their own chief.
- An admin can sign off anything, including service calls they logged themselves, and
  can revise a decision already made. That is deliberate: an admin is the
  backstop for service calls whose author has no chief, and for a correction.
- Routing is snapshotted when the call is saved, so moving someone to a new
  chief never pulls work out of the old chief's queue.
- Service calls logged by someone with no chief stay pending and are visible to admins,
  who can approve them.

The database enforces the structure independently: only in-house engineers can
be chiefs, a reporting line must point at an actual chief, nobody reports to
themselves, and a chief cannot be untagged while people still report to them.

### Deleting a person

An admin gets a **Delete** control on anyone with nothing logged against them —
a duplicate, a typo, a test account — behind a two-tap confirmation. Everyone
else can only be **deactivated**, which blocks sign-in and takes them off every
list while keeping their history.

Three things block a delete, and the action re-checks all of them server side:

| Blocked by | Enforced by |
| --- | --- |
| service calls they logged | `RESTRICT` on the foreign key |
| receipts they logged | `RESTRICT` on the foreign key |
| people reporting to them as chief | the app — the column is only `SET NULL`, so the database would let it through and quietly leave those people with no chief |

An admin also cannot delete themselves. Rate tiers and push subscriptions cascade
away with the person; `reviewed_by` and `routed_to_chief_id` on other people's
calls are set null.

The `technician_usage` view is what the admin screen reads to decide which
control to show, and to say why when the answer is no.

### Deleting a service call

An admin gets a **Delete service call** control at the bottom of any service call, behind a
two-tap confirmation. It removes the service call and its photo and PDF rows, and
clears those files out of storage through the Storage API — SQL cannot delete
storage objects, so this is the only path that leaves nothing behind.

A receipt logged against the service call is **kept and unlinked**, not deleted. It is
a financial record assigned to a property and should not disappear because the
service call it referenced did.

## Paying engineers

Each in-house engineer has rate tiers set in **Admin → People**: three named by
role (Chief Engineer, Building Engineer, Assistant Engineer) plus a custom one.
Usually only the row matching that person's role carries a rate; the rest are
left blank. One tier is marked active, and every service call that engineer logs
is priced from it.

**A tier is the price of one Regular service call.** The Service Call Charge on the service call
multiplies it: x 1.5 Service Call pays one and a half times the tier, x 2 Service Call pays
double. A $125 Building Engineer therefore earns $125, $187.50 or $250 depending
on the charge. Products of an odd rate are rounded to the cent. Vendors are not
multiplied — the amount a vendor types is the amount they agreed.

**Rates are admin-only.** Engineers never see a rate on the service call form, in their
history, or anywhere else — the amount is read from the database when the service call
is saved, so the rate itself cannot be seen or set from the form. The one thing
an engineer chooses is the Service Call Charge, and approval by their chief or an admin
is what checks that claim. Admins see the
amount on each service call plus a billable total for whatever filter is applied on
the Service Calls screen. Vendors see the amounts they quoted themselves, and nobody else's.

Amounts are snapshots. Re-pricing a tier, renaming it, or deleting it never
alters service calls already logged, so what someone was paid last month stays what
they were paid.

## Alerts

Admins and chiefs can switch on **push notifications** from a card on the Home
screen — one tap, per device. When a service call or a receipt is saved,
every active admin plus the chief that work belongs to gets a notification;
other chiefs are left out so nobody hears about another team's work, and the
person who did the saving is not told about their own action.

Push was chosen over text and email: it costs nothing per message, needs no
carrier registration, and lands on the phone like a text. **On an iPhone it only
works when the app is opened from the home-screen icon**, which is already how
engineers are told to install it; the card explains this if someone taps it in
Safari instead.

Sending is best effort by design. A missing key, a blocked notification or a
dead subscription is swallowed, so an alert failure can never stop an
engineer's service call from saving. Subscriptions the browser has discarded are
deleted when the push is rejected.

Setup needs a VAPID key pair in the environment — see `.env.example`. Generate
one with:

```bash
node -e "console.log(require('web-push').generateVAPIDKeys())"
```

## Logging for someone else

An admin or a chief gets a **Logged for** picker at the top of the new service
call form. An admin may log for anyone active; a chief only for their own team.
An ordinary engineer sees no picker, and the action applies the same rule again
server side — the absent picker is a convenience, not the control.

Everything about the call follows **whose work it is**, not who typed it:

- it is priced at that person's own rate tier, never the typist's
- it routes to that person's chief for approval
- the push notification names them, noting the typist in brackets
- the vendor amount field appears only when the *subject* is an outside vendor

`service_calls.entered_by` records the typist, and is null for the ordinary case
of someone logging their own work. The call detail screen shows **Service call
for** and, when they differ, **Entered by**.

Nobody can log for a deactivated person, and a chief cannot log for someone who
has no chief assigned.

One consequence worth knowing: a chief who logs a call for their own engineer
can then approve it, because the separation rule only stops a chief approving a
call whose *subject* is themselves. If entering and approving should be two
different people, that rule is one line in `reviewServiceCall`.

## Approving in bulk

The **To approve** filter on the Service Calls screen puts a checkbox on every
call the signed-in person may sign off, with a Select all control and a sticky
**Approve N service calls** button. The action re-checks every id server side
against the same rule as a single approval — a chief only what was routed to
them and never their own work, an admin anything — so a tampered form cannot
approve something it should not. Ids that fail, or that someone else already
reviewed, are dropped rather than failing the whole batch. One approval covers at
most 200 calls.

## Service call report

**Admin → Report** takes a date range and totals every service call in it by the
person who logged it, with a subtotal per property underneath them, plus a count
per Service Call Charge, how many are still awaiting approval and how many have
no amount.

Unlike a pay run this counts **everything in range, approved or not** — it is a
record of work done rather than an instruction to pay.

Underneath each engineer's summary comes **every call they logged, listed by
date** — property and space, the second property if there was one, the Service
Call Charge, emergency or scheduled, approval state, follow-up flag, amount and
the description of the work.

- **Download Excel** gives a real `.xlsx` with two sheets. **Summary** is the
  blocks and subtotals; **Detail** is one row per call, oldest first within each
  person, as a flat table with the engineer's name repeated on every row so Excel
  can sort, filter and pivot it. The file is written by `src/lib/xlsx.ts`, a small
  ZIP-and-XML writer, rather than a spreadsheet dependency: the whole surface used
  is four cell shapes and a couple of sheets. On the summary sheet the property
  rows are indented under their engineer rather than grouped or merged, so the
  hierarchy survives a sort or a copy-paste. An unpriced call leaves Amount blank
  rather than showing zero, so it cannot be read as work that was worth nothing.
- **Print / save PDF** uses the browser's own print dialog, which every phone and
  desktop can save as a PDF. `@media print` in `globals.css` drops the nav and the
  buttons, and keeps individual rows and headings from splitting. An engineer's
  block is deliberately allowed to break across pages: with the call list under it
  a block can run past a page, and telling the browser to avoid breaking it would
  push it onto a page of its own and leave the rest blank.

A call covering two properties is counted **once, under the first**, the same
choice the pay run makes — so the property subtotals always add up to the
engineer's total. The count of such calls is shown at the foot.

## Pay run — bills for QuickBooks Online

**Admin → Pay run** turns logged work into vendor bills. Pick a date range and
the screen groups everything into **one bill per person, with a line per
property** — so each line can be charged to the property's customer for
reimbursement. Nothing is typed: where the lines post is fixed, and the screen
lists it above the bills.

Download gives a CSV matching Intuit's `sample_bills_import` template exactly:
the same nineteen headers, a UTF-8 BOM, CRLF endings and MM/DD/YYYY dates.
Bill-level fields sit on a bill's first row only; later rows repeat the Bill
Number, which is how the importer groups lines onto one bill. Every line carries
`Billable` TRUE and the property in `Customer/Project`.

### Two kinds of line

Who logged the service call decides how it is billed. A person is all one or all the
other, so a bill never mixes the two.

| | Engineer | Chief engineer | Outside vendor |
| --- | --- | --- | --- |
| `*Type` | `Item Details` | `Item Details` | `Category Details` |
| Posts to | `Kapa Service Call - Tech` | `Kapa Service Call - Supervisor` | `Reimbursable Expenses` |
| Column | `Product/Service` | `Product/Service` | `Category/Account` |
| `Quantity` / `Rate` | call count × per-call rate | call count × per-call rate | empty |
| Lines per property | one per Service Call Charge | one per Service Call Charge | always one |

Every bill also carries `Limited - Kapa Capital` in `Location`, on the bill's
first row, which is where the template puts bill-level fields.

**The rate always comes from this app, not from QuickBooks.** An item row is
written with both `Rate` and `Amount` filled in, which is what stops QuickBooks
falling back to the item's own cost. So `Kapa Service Call - Tech` can sit in
QuickBooks with any cost at all — what gets billed is the tier saved against that
engineer in Admin → People, times the Service Call Charge on the call.

The four names live in `src/lib/quickbooks.ts` — change one there and it applies
to the next download. Nothing is stored against bills already exported.

An item row has to satisfy Quantity × Rate = Amount, so **an engineer's property
worked at more than one Service Call Charge produces one line per charge**: two Regular
service calls and one x 1.5 become a 2 × line and a 1 × line, each naming its charge in
`Description`. Splitting is what keeps a line's amount from contradicting its own
quantity and rate; the bill total is identical either way, and a property worked
at a single charge all period stays one line. The rate is in the grouping key as
well as the charge, so a tier an admin re-priced partway through a period cannot
put two prices on one line.

A category row carries an amount and nothing else, so **a vendor's service calls at one
property always collapse onto a single line** however differently each job was
quoted.

Native bill import needs **QuickBooks Online Advanced**.

### Before the first import

The names must match QuickBooks exactly, and the records must already exist
there — the importer will not create them:

- each person's name in Admin → People must match their **Vendor** in QuickBooks
- each property's name must match its **Customer**
- **`Kapa Service Call - Tech`** and **`Kapa Service Call - Supervisor`** must
  exist under Products and services, each set up so it can be bought from a
  vendor. Their cost in QuickBooks does not matter — see above
- **`Reimbursable Expenses`** must be an account in your chart of accounts
- **`Limited - Kapa Capital`** must exist as a Location, which also means
  location tracking has to be switched on
- **Account and Settings → Expenses → Track expenses and items by customer**
  must be on, or bills have no Customer column at all

### What the run deliberately leaves out

Each is counted and shown rather than dropped quietly:

- service calls still **awaiting approval** — sign them off first
- approved service calls with **no amount**, from an engineer with no rate set or a
  vendor who left it blank. Nobody gets paid for these, so they are worth chasing
- service calls **already billed** on an earlier run

A service call covering two properties keeps its whole amount on the first property and
is flagged, rather than being split on a guess.

### Not paying twice

**Mark this run as billed** stamps every service call in the window, so a later run
over overlapping dates cannot pay the same work again. Do it once the import has
actually succeeded.

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

**Service call** — date, Service Call Charge (Regular, x 1.5 Service Call or
x 2 Service Call), call type (emergency or scheduled), and property are required. Space, a description of the work, a
follow-up flag with notes, and up to eight photos or PDFs are optional.

A service call can cover **two properties**, for an engineer who works both in one day:
ticking "This service call covers a second property" adds a second property and space.
The two must be different, and filtering by a property finds service calls where it is
either the first or the second.

An outside vendor also gets an optional **amount they are charging** for the
job. An in-house engineer gets no money field at all: their service calls are priced
automatically from the rate an admin set for them.

Space can be tapped from the property's list, typed free-hand, or left blank
for whole-property work. A typed value that matches a managed space (ignoring
case) is linked to it, so "suite 210" and picking *Suite 210* land on the same
record; anything else is stored as a one-off label.

**Credit card receipt** — logged by **chief engineers and admins only**; the
Receipts tab is hidden from everyone else. Amount, date, and the property to
charge are required.
A receipt image or PDF, store, category, notes, and a link to a related
service call are optional.

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
| `service_calls` | One row per logged service call, covering one or two properties, with its approval state. |
| `service_call_photos` | Storage paths of the photos and PDFs attached to a service call. |
| `expenses` | Credit card charges, each assigned to a property. |
| `push_subscriptions` | One row per device signed up for alerts, keyed by the browser's endpoint. |

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

## Naming

The thing engineers and vendors log is a **Service Call**. It was briefly called
a Maintenance Shift, so some internal names still say "shift":

- `PayRunShift`, `shiftCount`, `splitShiftCount`, `shiftRate` and a number of
  code comments. These are internal identifiers with no user-visible effect, and
  renaming them on a live app is churn with no functional gain.
- The stored `hours_type` values keep their original spelling, so `after_hours`
  is the **x 1.5 Service Call** tier and `double_time` is **x 2 Service Call**.
  Renaming them would mean rewriting rows already logged.

The tables (`service_calls`, `service_call_photos`) and the URLs (`/calls`) were
never renamed, so those now match the user-facing name again.

If any of this is renamed later, do the stored `hours_type` values last and with
a migration — everything else is a pure find-and-replace.
