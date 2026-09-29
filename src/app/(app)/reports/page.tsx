import Link from "next/link";

import { requireAdmin } from "@/lib/auth";
import { buildReport } from "@/lib/report";
import { formatDate, formatMoney, todayISO } from "@/lib/format";
import { HOURS_TYPE_LABELS } from "@/lib/constants";
import { PrintButton } from "@/components/print-button";

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

export default async function ReportsPage({ searchParams }: PageProps<"/reports">) {
  await requireAdmin();
  const params = await searchParams;

  const fallback = defaultRange();
  const from = isDate(one(params.from)) ? one(params.from) : fallback.from;
  const to = isDate(one(params.to)) ? one(params.to) : fallback.to;

  const report = await buildReport(from, to);
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
          property underneath them.
        </p>
      </div>

      <form action="/reports" className="card space-y-4 p-4 print:hidden">
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
        <h1 className="text-xl font-bold">Service calls by engineer</h1>
        <p className="text-sm">{range}</p>
      </div>

      <div className="card flex items-center justify-between px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-muted print:hidden">{range}</p>
          <p className="text-xs text-muted">
            {report.callCount} service call{report.callCount === 1 ? "" : "s"} ·{" "}
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

          <ul className="space-y-3">
            {report.people.map((person) => (
              <li key={person.technicianId} className="card p-4 break-inside-avoid">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-bold">{person.name}</p>
                    <p className="text-xs text-muted">
                      {person.callCount} service call{person.callCount === 1 ? "" : "s"}
                      {person.pendingCount > 0 && ` · ${person.pendingCount} awaiting approval`}
                      {person.unpricedCount > 0 && ` · ${person.unpricedCount} with no amount`}
                    </p>
                  </div>
                  <p className="shrink-0 text-lg font-bold">{formatMoney(person.amount)}</p>
                </div>

                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(["regular", "after_hours", "double_time"] as const)
                    .filter((charge) => person.byCharge[charge] > 0)
                    .map((charge) => (
                      <span key={charge} className="chip bg-slate-100 text-slate-600">
                        {person.byCharge[charge]} × {HOURS_TYPE_LABELS[charge]}
                      </span>
                    ))}
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
                          {property.callCount} service call
                          {property.callCount === 1 ? "" : "s"}
                        </span>
                      </span>
                      <span className="shrink-0 text-sm font-bold">
                        {formatMoney(property.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>

          <div className="card flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-sm font-bold">All engineers</p>
              <p className="text-xs text-muted">
                {report.callCount} service call{report.callCount === 1 ? "" : "s"}
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
    </div>
  );
}
