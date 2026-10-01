import Link from "next/link";

import { requireAdmin } from "@/lib/auth";
import { buildReport } from "@/lib/report";
import { buildReceiptsReport } from "@/lib/receipts-report";
import { formatCalls, formatDate, formatMoney, todayISO } from "@/lib/format";
import { PrintButton } from "@/components/print-button";
import {
  BILL_LOCATION,
  EXPENSE_CATEGORY,
  EXPENSE_FALLBACK_PAYEE,
  EXPENSE_PAYMENT_ACCOUNT,
  EXPENSE_PAYMENT_METHOD,
} from "@/lib/quickbooks";
import {
  ApprovalBadge,
  CallTypeBadge,
  FollowUpBadge,
  HoursBadge,
} from "@/components/call-badges";

export const metadata = { title: "Report · Kapa Service Log" };

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function isDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** The month so far, which is the range most of these get run for. */
function defaultRange(): { from: string; to: string } {
  const to = todayISO();
  return { from: `${to.slice(0, 7)}-01`, to };
}

function MapRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 text-right font-semibold">{value}</dd>
    </div>
  );
}

export default async function ReportsPage({ searchParams }: PageProps<"/reports">) {
  await requireAdmin();
  const params = await searchParams;

  const fallback = defaultRange();
  const from = isDate(one(params.from)) ? one(params.from) : fallback.from;
  const to = isDate(one(params.to)) ? one(params.to) : fallback.to;

  /*
   * Which report to read: service calls by engineer, the same by property, or
   * the period's credit card receipts by property.
   */
  const asked = one(params.view);
  const view = asked === "property" || asked === "receipts" ? asked : "engineer";
  const report = await buildReport(from, to);
  const receipts = view === "receipts" ? await buildReceiptsReport(from, to) : null;
  const range = `${formatDate(from, { weekday: undefined })} – ${formatDate(to, { weekday: undefined })}`;

  return (
    <div className="space-y-5">
      <div className="print:hidden">
        <Link href="/admin" className="text-sm font-semibold text-brand-700">
          ← Admin
        </Link>
        <h1 className="mt-2 text-xl font-bold">Service call report</h1>
        <p className="mt-1 text-sm text-muted">
          Every service call in the range, totalled by engineer and subtotalled by
          property underneath them, then every call listed by date — or the other way
          round, a property with the engineers who attended it. A x 1.5 call counts
          as 1.5 service calls and a x 2 as 2.
        </p>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 print:hidden">
        {[
          { value: "engineer", label: "By engineer" },
          { value: "property", label: "By property" },
          { value: "receipts", label: "Receipts" },
        ].map((option) => (
          <Link
            key={option.value}
            href={`/reports?from=${from}&to=${to}${
              option.value === "engineer" ? "" : `&view=${option.value}`
            }`}
            aria-current={view === option.value ? "true" : undefined}
            className={`chip min-h-9 px-3.5 text-sm ${
              view === option.value
                ? "bg-brand-700 text-white"
                : "border border-hairline bg-white text-muted"
            }`}
          >
            {option.label}
          </Link>
        ))}
      </div>

      <form action="/reports" className="card space-y-4 p-4 print:hidden">
        <input type="hidden" name="view" value={view} />
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
        <button type="submit" className="btn-primary w-full">
          Run report
        </button>
      </form>

      {/* The printed page needs its own heading, since the one above is hidden. */}
      <div className="hidden print:block">
        <h1 className="text-xl font-bold">
          {view === "receipts"
            ? "Credit card receipts by property"
            : `Service calls by ${view === "property" ? "property" : "engineer"}`}
        </h1>
        <p className="text-sm">{range}</p>
      </div>

      {receipts ? (
        <>
          <div className="card flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-muted print:hidden">{range}</p>
              <p className="text-xs text-muted">
                {receipts.count} receipt{receipts.count === 1 ? "" : "s"} ·{" "}
                {receipts.properties.length}{" "}
                {receipts.properties.length === 1 ? "property" : "properties"}
                {receipts.returnCount > 0 && ` · ${receipts.returnCount} return`}
                {receipts.returnCount > 1 && "s"}
              </p>
            </div>
            <p className="text-xl font-bold">{formatMoney(receipts.amount)}</p>
          </div>

          {receipts.properties.length === 0 ? (
            <p className="card px-4 py-8 text-center text-sm text-muted">
              No receipts logged in this range.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 print:hidden">
                <a
                  href={`/api/expenses?from=${from}&to=${to}`}
                  className="btn-primary text-center"
                >
                  Download for QuickBooks
                </a>
                <PrintButton />
              </div>

              <section className="card p-4 text-sm print:hidden">
                <h2 className="section-heading">Where these post in QuickBooks</h2>
                <dl className="mt-2 space-y-1 text-xs">
                  <MapRow label="Payment account" value={EXPENSE_PAYMENT_ACCOUNT} />
                  <MapRow label="Payment method" value={EXPENSE_PAYMENT_METHOD} />
                  <MapRow label="Category" value={EXPENSE_CATEGORY} />
                  <MapRow label="Location, every expense" value={BILL_LOCATION} />
                  <MapRow label="Payee, when none on the receipt" value={EXPENSE_FALLBACK_PAYEE} />
                </dl>
                <p className="mt-3 text-xs text-muted">
                  The download is a ZIP: the expense import CSV, the receipt images each
                  named with the Ref No. on its row, and a manifest tying the two together.
                  QuickBooks&apos; expense import has no column for an attachment, so the
                  files cannot ride in the CSV — attach them afterwards by matching the name.
                </p>
              </section>

              <ul className="space-y-3">
                {receipts.properties.map((property) => (
                  <li key={property.propertyId} className="card p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-bold">{property.propertyName}</p>
                        <p className="text-xs text-muted">
                          {property.count} receipt{property.count === 1 ? "" : "s"}
                          {property.returnCount > 0 && ` · ${property.returnCount} return`}
                          {property.returnCount > 1 && "s"}
                          {property.missingFileCount > 0 &&
                            ` · ${property.missingFileCount} with no file`}
                        </p>
                      </div>
                      <p className="shrink-0 text-lg font-bold">
                        {formatMoney(property.amount)}
                      </p>
                    </div>

                    <ul className="mt-3 divide-y divide-hairline border-t border-hairline">
                      {property.receipts.map((receipt) => (
                        <li
                          key={receipt.id}
                          className="flex items-start justify-between gap-3 py-2"
                        >
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold">
                              {formatDate(receipt.date, { weekday: undefined })} ·{" "}
                              {receipt.merchant ?? "Credit card charge"}
                            </span>
                            <span className="block text-xs text-muted">
                              {[receipt.category, receipt.notes, `Logged by ${receipt.loggedBy}`]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                            {receipt.receiptPath === null && (
                              <span className="chip mt-1 bg-amber-100 text-amber-900">
                                No receipt file
                              </span>
                            )}
                          </span>
                          <span
                            className={`shrink-0 text-sm font-bold ${
                              receipt.amount < 0 ? "text-emerald-700" : ""
                            }`}
                          >
                            {formatMoney(receipt.amount)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>

              <div className="card flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-bold">All properties</p>
                  <p className="text-xs text-muted">
                    {receipts.count} receipt{receipts.count === 1 ? "" : "s"}
                  </p>
                </div>
                <p className="text-xl font-bold">{formatMoney(receipts.amount)}</p>
              </div>

              {receipts.missingFileCount > 0 && (
                <p className="px-1 text-xs text-muted">
                  {receipts.missingFileCount} receipt
                  {receipts.missingFileCount === 1 ? " has" : "s have"} no image or PDF
                  attached, so there is nothing to send an accountant for{" "}
                  {receipts.missingFileCount === 1 ? "it" : "them"}.
                </p>
              )}
            </>
          )}
        </>
      ) : (
      <>
        <div className="card flex items-center justify-between px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-muted print:hidden">{range}</p>
            <p className="text-xs text-muted">
              {formatCalls(report.callCount)} service call{report.callCount === 1 ? "" : "s"} ·{" "}
              {report.people.length} {report.people.length === 1 ? "person" : "people"}
            </p>
          </div>
          <p className="text-xl font-bold">{formatMoney(report.amount)}</p>
        </div>

        {report.people.length === 0 ? (
          <p className="card px-4 py-8 text-center text-sm text-muted">
            No service calls logged in this range.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 print:hidden">
              <a href={`/api/report?from=${from}&to=${to}`} className="btn-primary text-center">
                Download Excel
              </a>
              <PrintButton />
            </div>

            {view === "property" ? (
              <ul className="space-y-3">
                {report.properties.map((property) => (
                  <li key={property.propertyId} className="card p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-bold">{property.propertyName}</p>
                        <p className="text-xs text-muted">
                          {formatCalls(property.callCount)} service call
                          {property.callCount === 1 ? "" : "s"} ·{" "}
                          {property.engineers.length}{" "}
                          {property.engineers.length === 1 ? "engineer" : "engineers"}
                          {property.unpricedCount > 0 &&
                            ` · ${property.unpricedCount} with no amount`}
                        </p>
                      </div>
                      <p className="shrink-0 text-lg font-bold">{formatMoney(property.amount)}</p>
                    </div>

                    <ul className="mt-3 divide-y divide-hairline border-t border-hairline">
                      {property.engineers.map((engineer) => (
                        <li
                          key={engineer.technicianId}
                          className="flex items-center justify-between gap-3 py-2"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold">
                              {engineer.name}
                            </span>
                            <span className="block text-xs text-muted">
                              {formatCalls(engineer.callCount)} service call
                              {engineer.callCount === 1 ? "" : "s"}
                            </span>
                          </span>
                          <span className="shrink-0 text-sm font-bold">
                            {formatMoney(engineer.amount)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            ) : (
            <ul className="space-y-3">
              {report.people.map((person) => (
                <li key={person.technicianId} className="card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-bold">{person.name}</p>
                      <p className="text-xs text-muted">
                        {formatCalls(person.callCount)} service call
                        {person.callCount === 1 ? "" : "s"}
                        {person.pendingCount > 0 && ` · ${person.pendingCount} awaiting approval`}
                        {person.unpricedCount > 0 && ` · ${person.unpricedCount} with no amount`}
                      </p>
                    </div>
                    <p className="shrink-0 text-lg font-bold">{formatMoney(person.amount)}</p>
                  </div>

                  <ul className="mt-3 divide-y divide-hairline border-t border-hairline">
                    {person.properties.map((property) => (
                      <li
                        key={property.propertyId}
                        className="flex items-center justify-between gap-3 py-2"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold">
                            {property.propertyName}
                          </span>
                          <span className="block text-xs text-muted">
                            {formatCalls(property.callCount)} service call
                            {property.callCount === 1 ? "" : "s"}
                          </span>
                        </span>
                        <span className="shrink-0 text-sm font-bold">
                          {formatMoney(property.amount)}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <h3 className="section-heading mt-4 mb-1">Every call, by date</h3>
                  <ol className="divide-y divide-hairline border-t border-hairline">
                    {person.calls.map((call, index) => (
                      <li
                        key={`${call.date}-${index}`}
                        className="flex items-start justify-between gap-3 py-2"
                      >
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold">
                            {formatDate(call.date, { weekday: "short", year: undefined })} ·{" "}
                            {call.property}
                          </span>
                          {call.secondProperty && (
                            <span className="block text-sm font-semibold text-muted">
                              + {call.secondProperty}
                            </span>
                          )}
                          {call.description && (
                            <span className="mt-0.5 block text-xs text-muted">
                              {call.description}
                            </span>
                          )}
                          <span className="mt-1 flex flex-wrap items-center gap-1.5">
                            <CallTypeBadge value={call.callType} />
                            <HoursBadge value={call.hoursType} />
                            {call.followUpNeeded && <FollowUpBadge />}
                            {call.approvalStatus !== "approved" && (
                              <ApprovalBadge value={call.approvalStatus} />
                            )}
                          </span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="block text-sm font-bold">
                            {call.amount === null ? (
                              <span className="text-xs font-semibold text-amber-800">No amount</span>
                            ) : (
                              formatMoney(call.amount)
                            )}
                          </span>
                          <span className="block text-xs text-muted">
                            {formatCalls(call.weight)} call{call.weight === 1 ? "" : "s"}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ol>
                </li>
              ))}
            </ul>
            )}

            <div className="card flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-bold">
                  {view === "property" ? "All properties" : "All engineers"}
                </p>
                <p className="text-xs text-muted">
                  {formatCalls(report.callCount)} service call
                  {report.callCount === 1 ? "" : "s"}
                </p>
              </div>
              <p className="text-xl font-bold">{formatMoney(report.amount)}</p>
            </div>

            {report.secondPropertyCount > 0 && (
              <p className="px-1 text-xs text-muted">
                {report.secondPropertyCount} call
                {report.secondPropertyCount === 1 ? "" : "s"} also covered a second property,
                and {report.secondPropertyCount === 1 ? "is" : "are"} counted once here, under
                the first — so the property subtotals always add up to the engineer&apos;s total.
              </p>
            )}
          </>
        )}
      </>
      )}
    </div>
  );
}
