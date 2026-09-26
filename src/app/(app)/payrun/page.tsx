import Link from "next/link";

import { requireAdmin } from "@/lib/auth";
import { buildPayRun, billNumber } from "@/lib/payrun";
import { markPayRunBilled } from "@/lib/actions/payrun";
import { formatDate, formatMoney, todayISO } from "@/lib/format";
import { ConfirmButton } from "@/components/confirm-button";
import { HOURS_TYPE_LABELS } from "@/lib/constants";

export const metadata = { title: "Pay run · Kapa Service Log" };

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function isDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** Seven days ending today, which matches a weekly run. */
function defaultRange(): { from: string; to: string } {
  const to = todayISO();
  const [year, month, day] = to.split("-").map(Number);
  const start = new Date(year, month - 1, day - 6);
  const from = `${start.getFullYear()}-${`${start.getMonth() + 1}`.padStart(2, "0")}-${`${start.getDate()}`.padStart(2, "0")}`;
  return { from, to };
}

export default async function PayRunPage({ searchParams }: PageProps<"/payrun">) {
  await requireAdmin();
  const params = await searchParams;

  const fallback = defaultRange();
  const from = isDate(one(params.from)) ? one(params.from) : fallback.from;
  const to = isDate(one(params.to)) ? one(params.to) : fallback.to;
  const item = one(params.item);

  const payRun = await buildPayRun(from, to);

  const csvHref = `/api/payrun?from=${from}&to=${to}${
    item ? `&item=${encodeURIComponent(item)}` : ""
  }`;

  return (
    <div className="space-y-5">
      <div>
        <Link href="/admin" className="text-sm font-semibold text-brand-700">
          ← Admin
        </Link>
        <h1 className="mt-2 text-xl font-bold">Pay run</h1>
        <p className="mt-1 text-sm text-muted">
          One bill per person, one line per property, for charging each line to that
          property&apos;s customer.
        </p>
      </div>

      <form action="/payrun" className="card space-y-4 p-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label" htmlFor="from">
              From
            </label>
            <input id="from" name="from" type="date" defaultValue={from} className="input" />
          </div>
          <div>
            <label className="field-label" htmlFor="to">
              To
            </label>
            <input id="to" name="to" type="date" defaultValue={to} className="input" />
          </div>
        </div>

        <div>
          <label className="field-label" htmlFor="item">
            Product / service
          </label>
          <input
            id="item"
            name="item"
            type="text"
            defaultValue={item}
            placeholder="e.g. Maintenance Shift"
            className="input"
          />
          <p className="field-hint">
            Goes in the Product/Service column, and must already exist in
            QuickBooks. Each shift counts as one of them, so Quantity &times; Rate
            is the line amount.
          </p>
        </div>

        <button type="submit" className="btn-primary w-full">
          Show pay run
        </button>
      </form>

      <div className="card flex items-center justify-between px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-muted">
            {formatDate(from, { weekday: undefined })} – {formatDate(to, { weekday: undefined })}
          </p>
          <p className="text-xs text-muted">
            {payRun.shiftCount} shift{payRun.shiftCount === 1 ? "" : "s"} ·{" "}
            {payRun.vendors.length} bill{payRun.vendors.length === 1 ? "" : "s"}
          </p>
        </div>
        <p className="text-xl font-bold">{formatMoney(payRun.total)}</p>
      </div>

      {(payRun.unapprovedCount > 0 ||
        payRun.unpricedCount > 0 ||
        payRun.alreadyBilledCount > 0) && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-bold">Left out of this run</p>
          <ul className="mt-2 space-y-1">
            {payRun.unapprovedCount > 0 && (
              <li>
                {payRun.unapprovedCount} shift{payRun.unapprovedCount === 1 ? "" : "s"} still
                awaiting approval.{" "}
                <Link href="/calls?scope=to_approve" className="font-semibold underline">
                  Review them
                </Link>
                .
              </li>
            )}
            {payRun.unpricedCount > 0 && (
              <li>
                {payRun.unpricedCount} approved shift
                {payRun.unpricedCount === 1 ? "" : "s"} with no amount — an engineer with no
                rate set, or a vendor who left the amount blank. Nobody gets paid for these.
              </li>
            )}
            {payRun.alreadyBilledCount > 0 && (
              <li>
                {payRun.alreadyBilledCount} shift
                {payRun.alreadyBilledCount === 1 ? "" : "s"} already billed on an earlier run.
              </li>
            )}
          </ul>
        </section>
      )}

      {payRun.vendors.length === 0 ? (
        <p className="card px-4 py-8 text-center text-sm text-muted">
          Nothing to bill for these dates.
        </p>
      ) : (
        <>
          {item ? (
            <a href={csvHref} className="btn-primary w-full">
              Download bills CSV for QuickBooks
            </a>
          ) : (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
              Name the product / service above to enable the download — an item
              line needs one.
            </p>
          )}

          <ul className="space-y-3">
            {payRun.vendors.map((vendor, index) => (
              <li key={vendor.technicianId} className="card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-bold">{vendor.vendorName}</p>
                    <p className="text-xs text-muted">
                      Bill {billNumber(to, index)} · {vendor.shiftCount} shift
                      {vendor.shiftCount === 1 ? "" : "s"}
                    </p>
                  </div>
                  <p className="shrink-0 text-lg font-bold">{formatMoney(vendor.total)}</p>
                </div>

                <ul className="mt-3 divide-y divide-hairline border-t border-hairline">
                  {vendor.lines.map((line) => (
                    <li
                      key={`${line.propertyId}-${line.hoursType}-${line.rate}`}
                      className="flex items-center justify-between gap-3 py-2"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">
                          {line.customerName}
                        </span>
                        <span className="block text-xs text-muted">
                          {line.shiftCount} &times; {formatMoney(line.rate)} &middot;{" "}
                          {HOURS_TYPE_LABELS[line.hoursType]}
                        </span>
                      </span>
                      <span className="shrink-0 text-sm font-bold">
                        {formatMoney(line.amount)}
                      </span>
                    </li>
                  ))}
                </ul>

                {vendor.splitShiftCount > 0 && (
                  <p className="mt-2 text-xs font-semibold text-amber-800">
                    {vendor.splitShiftCount} shift
                    {vendor.splitShiftCount === 1 ? "" : "s"} covered two properties. The full
                    amount sits on the first property — split it by hand if it should be shared.
                  </p>
                )}
              </li>
            ))}
          </ul>

          <section className="rounded-2xl border border-hairline bg-white p-4">
            <h2 className="text-sm font-bold">Once the bills are in QuickBooks</h2>
            <p className="mt-1 text-xs text-muted">
              Marking this run billed stops these {payRun.shiftCount} shift
              {payRun.shiftCount === 1 ? "" : "s"} appearing in a later run, so nobody is paid
              twice. Do it after the import succeeds, not before.
            </p>
            <form action={markPayRunBilled} className="mt-3">
              <input type="hidden" name="from" value={from} />
              <input type="hidden" name="to" value={to} />
              <ConfirmButton
                confirmLabel="Tap again to mark billed"
                className="btn-secondary w-full"
                confirmClassName="btn w-full bg-brand-600 text-white hover:bg-brand-700"
                pendingLabel="Marking…"
              >
                Mark this run as billed
              </ConfirmButton>
            </form>
          </section>
        </>
      )}
    </div>
  );
}
