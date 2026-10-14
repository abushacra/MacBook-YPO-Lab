import Link from "next/link";

import { canSeeReportAmounts, requireReportAccess } from "@/lib/auth";
import { buildReport, PAID_FILTERS } from "@/lib/report";
import { reportFiltersFor, reportPeople } from "@/lib/report-scope";
import { buildReceiptsReport } from "@/lib/receipts-report";
import { db } from "@/lib/supabase";
import { formatCalls, formatDate, formatMoney, todayISO } from "@/lib/format";
import { PrintButton } from "@/components/print-button";
import { ReportCallList } from "@/components/report-call-list";
import {
  BILL_LOCATION,
  EXPENSE_CATEGORY,
  EXPENSE_PAYEE,
  EXPENSE_PAYMENT_ACCOUNT,
  EXPENSE_PAYMENT_METHOD,
} from "@/lib/quickbooks";

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

const PAID_LABELS: Record<string, string> = {
  unpaid: "Unpaid",
  paid: "Paid",
  all: "Paid & unpaid",
};

function MapRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 text-right font-semibold">{value}</dd>
    </div>
  );
}

export default async function ReportsPage({ searchParams }: PageProps<"/reports">) {
  const user = await requireReportAccess();
  const params = await searchParams;

  const showAmounts = canSeeReportAmounts(user);

  const fallback = defaultRange();
  const from = isDate(one(params.from)) ? one(params.from) : fallback.from;
  const to = isDate(one(params.to)) ? one(params.to) : fallback.to;

  /*
   * Which report to read: service calls by engineer, the same by property, or
   * the period's credit card receipts by property. Receipts are money only, so
   * there is nothing in them for a reader who may not see amounts.
   */
  const asked = one(params.view);
  const view =
    asked === "property" || (asked === "receipts" && showAmounts) ? asked : "engineer";

  /** Continuous on screen; one printed page each is what makes it a per-property PDF. */
  const pages = one(params.pages) === "each" ? "each" : "continuous";

  const filters = await reportFiltersFor(user, {
    paid: one(params.paid) || "all",
    technicianId: one(params.technician),
    propertyId: one(params.property),
  });

  const [report, receipts, { data: properties }, people] = await Promise.all([
    buildReport(from, to, filters),
    view === "receipts" ? buildReceiptsReport(from, to) : null,
    db().from("properties").select("id, name").order("name"),
    reportPeople(user),
  ]);

  const range = `${formatDate(from, { weekday: undefined })} – ${formatDate(to, { weekday: undefined })}`;
  const screenedPerson = people.find((person) => person.id === filters.technicianId);
  const screenedProperty = (properties ?? []).find(
    (property) => property.id === filters.propertyId,
  );

  /** Every link keeps the whole screen, so changing one thing never resets the rest. */
  const hrefFor = (next: { view?: string; paid?: string; pages?: string }) => {
    const search = new URLSearchParams({ from, to });
    const nextView = next.view ?? view;
    const nextPaid = next.paid ?? filters.paid;
    const nextPages = next.pages ?? pages;
    if (nextView !== "engineer") search.set("view", nextView);
    if (nextPaid !== "all") search.set("paid", nextPaid);
    if (nextPages !== "continuous") search.set("pages", nextPages);
    if (filters.technicianId) search.set("technician", filters.technicianId);
    if (filters.propertyId) search.set("property", filters.propertyId);
    return `/reports?${search.toString()}`;
  };

  const downloadHref = (() => {
    const search = new URLSearchParams({ from, to, paid: filters.paid });
    if (filters.technicianId) search.set("technician", filters.technicianId);
    if (filters.propertyId) search.set("property", filters.propertyId);
    return `/api/report?${search.toString()}`;
  })();

  /** The one-line statement of what this report covers, on screen and on paper. */
  const scope = [
    PAID_LABELS[filters.paid] ?? "Paid & unpaid",
    screenedPerson?.name,
    screenedProperty?.name,
  ]
    .filter(Boolean)
    .join(" · ");

  const pageClass = pages === "each" ? "card report-page p-4" : "card p-4";

  return (
    <div className="space-y-5">
      <div className="print:hidden">
        <Link href={user.is_admin ? "/admin" : "/team"} className="text-sm font-semibold text-brand-700">
          ← {user.is_admin ? "Admin" : "Team"}
        </Link>
        <h1 className="mt-2 text-xl font-bold">Service call report</h1>
        <p className="mt-1 text-sm text-muted">
          Every service call in the range, totalled by engineer and subtotalled by
          property underneath them, then every call listed by date — or the other way
          round, a property with the engineers who attended it. A x 1.5 call counts
          as 1.5 service calls and a x 2 as 2.
        </p>
        {!showAmounts && (
          <p className="mt-2 rounded-xl bg-brand-50 px-3 py-2 text-xs text-brand-900">
            Service call counts only. What a call was billed at is a pay rate, so
            amounts stay with the admin.
          </p>
        )}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 print:hidden">
        {[
          { value: "engineer", label: "By engineer" },
          { value: "property", label: "By property" },
          ...(showAmounts ? [{ value: "receipts", label: "Receipts" }] : []),
        ].map((option) => (
          <Link
            key={option.value}
            href={hrefFor({ view: option.value })}
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

      {view !== "receipts" && (
        <>
          <div className="flex gap-2 overflow-x-auto pb-1 print:hidden">
            {PAID_FILTERS.map((option) => (
              <Link
                key={option}
                href={hrefFor({ paid: option })}
                aria-current={filters.paid === option ? "true" : undefined}
                className={`chip min-h-9 px-3.5 text-sm ${
                  filters.paid === option
                    ? "bg-sky-700 text-white"
                    : "border border-hairline bg-white text-muted"
                }`}
              >
                {PAID_LABELS[option]}
              </Link>
            ))}
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1 print:hidden">
            {[
              { value: "continuous", label: "One long report" },
              { value: "each", label: `One page per ${view === "property" ? "property" : "engineer"}` },
            ].map((option) => (
              <Link
                key={option.value}
                href={hrefFor({ pages: option.value })}
                aria-current={pages === option.value ? "true" : undefined}
                className={`chip min-h-9 px-3.5 text-sm ${
                  pages === option.value
                    ? "bg-brand-700 text-white"
                    : "border border-hairline bg-white text-muted"
                }`}
              >
                {option.label}
              </Link>
            ))}
          </div>
        </>
      )}

      <form action="/reports" className="card space-y-4 p-4 print:hidden">
        {view !== "engineer" && <input type="hidden" name="view" value={view} />}
        {filters.paid !== "all" && <input type="hidden" name="paid" value={filters.paid} />}
        {pages !== "continuous" && <input type="hidden" name="pages" value={pages} />}

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

        {view !== "receipts" && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="field-label" htmlFor="technician">
                Engineer or vendor
              </label>
              <select
                id="technician"
                name="technician"
                defaultValue={filters.technicianId ?? ""}
                className="input"
              >
                <option value="">Everyone</option>
                {people.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                    {person.kind === "vendor" ? " (vendor)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label" htmlFor="property">
                Property
              </label>
              <select
                id="property"
                name="property"
                defaultValue={filters.propertyId ?? ""}
                className="input"
              >
                <option value="">Every property</option>
                {(properties ?? []).map((property) => (
                  <option key={property.id} value={property.id}>
                    {property.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

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
        {view !== "receipts" && <p className="text-sm">{scope}</p>}
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
                  <MapRow label="Payee, every expense" value={EXPENSE_PAYEE} />
                  <MapRow label="Payment account" value={EXPENSE_PAYMENT_ACCOUNT} />
                  <MapRow label="Payment method" value={EXPENSE_PAYMENT_METHOD} />
                  <MapRow label="Category" value={EXPENSE_CATEGORY} />
                  <MapRow label="Location, every expense" value={BILL_LOCATION} />
                </dl>
                <p className="mt-3 text-xs text-muted">
                  The download is a ZIP: the expense import CSV, one combined PDF per
                  property holding that property&apos;s receipts a page each, and a manifest
                  giving the PDF and page number for every Ref No. QuickBooks&apos; expense
                  import has no column for an attachment, so nothing can ride in the CSV —
                  attach the property PDF, or pull the page out of it, afterwards.
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
                {formatCalls(report.callCount)} service call
                {report.callCount === 1 ? "" : "s"} · {report.people.length}{" "}
                {report.people.length === 1 ? "person" : "people"}
              </p>
              <p className="text-xs font-semibold text-muted print:hidden">{scope}</p>
            </div>
            {showAmounts && <p className="text-xl font-bold">{formatMoney(report.amount)}</p>}
          </div>

          {report.people.length === 0 ? (
            <p className="card px-4 py-8 text-center text-sm text-muted">
              No service calls match this report.
              {filters.paid === "unpaid" &&
                " Everything in the range may already have been paid — try Paid & unpaid."}
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 print:hidden">
                <a href={downloadHref} className="btn-primary text-center">
                  Download Excel
                </a>
                <PrintButton />
              </div>

              {pages === "each" && (
                <p className="px-1 text-xs text-muted print:hidden">
                  Each {view === "property" ? "property" : "engineer"} starts a fresh page
                  when printed, so a single{" "}
                  {view === "property" ? "building's" : "person's"} work can be handed over
                  on its own. The Excel download has a tab each as well.
                </p>
              )}

              {view === "property" ? (
                <ul className="space-y-3">
                  {report.properties.map((property) => (
                    <li key={property.propertyId} className={pageClass}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-bold">{property.propertyName}</p>
                          <p className="text-xs text-muted">
                            {formatCalls(property.callCount)} service call
                            {property.callCount === 1 ? "" : "s"} ·{" "}
                            {property.engineers.length}{" "}
                            {property.engineers.length === 1 ? "engineer" : "engineers"}
                            {showAmounts &&
                              property.unpricedCount > 0 &&
                              ` · ${property.unpricedCount} with no amount`}
                          </p>
                        </div>
                        {showAmounts && (
                          <p className="shrink-0 text-lg font-bold">
                            {formatMoney(property.amount)}
                          </p>
                        )}
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
                            {showAmounts && (
                              <span className="shrink-0 text-sm font-bold">
                                {formatMoney(engineer.amount)}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>

                      <ReportCallList
                        calls={property.calls}
                        heading="Every call, by date"
                        nameOf={(_call, index) => property.calls[index]!.engineerName}
                        showAmounts={showAmounts}
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                /*
                 * Every engineer's property totals first, then everybody's
                 * call detail. The summaries are the part read at a glance and
                 * compared across people, and burying each one behind the
                 * previous engineer's call list meant scrolling pages to reach
                 * the next.
                 */
                <>
                  <section className="space-y-3">
                    <h2 className="section-heading">Totals by engineer and property</h2>
                    {report.people.map((person) => (
                      <div key={person.technicianId} className="card p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate font-bold">{person.name}</p>
                            <p className="text-xs text-muted">
                              {formatCalls(person.callCount)} service call
                              {person.callCount === 1 ? "" : "s"}
                              {person.pendingCount > 0 &&
                                ` · ${person.pendingCount} awaiting approval`}
                              {showAmounts &&
                                person.unpricedCount > 0 &&
                                ` · ${person.unpricedCount} with no amount`}
                            </p>
                          </div>
                          {showAmounts && (
                            <p className="shrink-0 text-lg font-bold">
                              {formatMoney(person.amount)}
                            </p>
                          )}
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
                              {showAmounts && (
                                <span className="shrink-0 text-sm font-bold">
                                  {formatMoney(property.amount)}
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </section>

                  <section
                    className={`space-y-3 ${pages === "each" ? "report-break-before" : ""}`}
                  >
                    <h2 className="section-heading">Every call, by date</h2>
                    {report.people.map((person) => (
                      <div key={person.technicianId} className={pageClass}>
                        <div className="flex items-start justify-between gap-3">
                          <p className="min-w-0 truncate font-bold">{person.name}</p>
                          <p className="shrink-0 text-xs text-muted">
                            {formatCalls(person.callCount)} service call
                            {person.callCount === 1 ? "" : "s"}
                          </p>
                        </div>
                        <ReportCallList
                          calls={person.calls}
                          heading="By date"
                          showAmounts={showAmounts}
                        />
                      </div>
                    ))}
                  </section>
                </>
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
                {showAmounts && (
                  <p className="text-xl font-bold">{formatMoney(report.amount)}</p>
                )}
              </div>

              {/*
                * The by-property page gets handed to the property it names, so
                * it says nothing about calls that also covered somewhere else.
                * The by-engineer page is internal, and there the note explains
                * why a person's property subtotals are halves.
                */}
              {view !== "property" && report.secondPropertyCount > 0 && (
                <p className="px-1 text-xs text-muted">
                  {report.secondPropertyCount} call
                  {report.secondPropertyCount === 1 ? "" : "s"} covered two properties and{" "}
                  {report.secondPropertyCount === 1 ? "is" : "are"} split half to each — so the
                  property subtotals still add up to the engineer&apos;s total, and each
                  property is billed for its own half.
                </p>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
