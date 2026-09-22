import Link from "next/link";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { formatDate, formatMoney } from "@/lib/format";
import { PropertyFilter } from "@/components/property-filter";

export const metadata = { title: "Receipts · Kapa Service Log" };

const PAGE_SIZE = 100;

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export default async function ExpensesPage({ searchParams }: PageProps<"/expenses">) {
  const user = await requireUser();
  const params = await searchParams;
  const scope = one(params.scope) || "all";
  const propertyId = one(params.property);
  const justSaved = one(params.saved) === "1";

  let query = db()
    .from("expenses")
    .select("id, expense_date, amount, merchant, category, property_label, receipt_path, technician_id")
    .order("expense_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);

  if (scope === "mine") query = query.eq("technician_id", user.id);
  if (propertyId) query = query.eq("property_id", propertyId);

  const [{ data: expenses }, { data: properties }, { data: technicians }] = await Promise.all([
    query,
    db().from("properties").select("id, name").order("name"),
    db().from("technicians").select("id, name"),
  ]);

  const nameById = new Map((technicians ?? []).map((row) => [row.id, row.name]));
  const total = (expenses ?? []).reduce((sum, expense) => sum + expense.amount, 0);

  const hrefFor = (nextScope: string) => {
    const search = new URLSearchParams();
    if (nextScope !== "all") search.set("scope", nextScope);
    if (propertyId) search.set("property", propertyId);
    const query = search.toString();
    return query ? `/expenses?${query}` : "/expenses";
  };

  return (
    <div className="space-y-4">
      {justSaved && (
        <p
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900"
        >
          Receipt saved.
        </p>
      )}

      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Receipts</h1>
        <Link href="/expenses/new" className="btn-primary min-h-11 px-4 text-sm">
          + New
        </Link>
      </div>

      <div className="flex gap-2">
        {[
          { value: "all", label: "Everyone" },
          { value: "mine", label: "Mine" },
        ].map((option) => (
          <Link
            key={option.value}
            href={hrefFor(option.value)}
            aria-current={scope === option.value ? "true" : undefined}
            className={`chip min-h-9 px-3.5 text-sm ${
              scope === option.value
                ? "bg-brand-700 text-white"
                : "border border-hairline bg-white text-muted"
            }`}
          >
            {option.label}
          </Link>
        ))}
      </div>

      <PropertyFilter
        properties={properties ?? []}
        value={propertyId}
        basePath="/expenses"
        extraParams={scope !== "all" ? { scope } : {}}
      />

      <div className="card flex items-center justify-between px-4 py-3">
        <span className="text-sm font-semibold text-muted">Total shown</span>
        <span className="text-lg font-bold">{formatMoney(total)}</span>
      </div>

      {expenses && expenses.length > 0 ? (
        <ul className="space-y-2">
          {expenses.map((expense) => (
            <li key={expense.id} className="card px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {expense.merchant ?? "Credit card charge"}
                  </p>
                  <p className="truncate text-xs text-muted">{expense.property_label}</p>
                </div>
                <p className="shrink-0 text-base font-bold">{formatMoney(expense.amount)}</p>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                <span>{formatDate(expense.expense_date, { weekday: undefined })}</span>
                {expense.category && (
                  <span className="chip bg-slate-100 text-slate-700">{expense.category}</span>
                )}
                {expense.receipt_path ? (
                  <a
                    className="font-semibold text-brand-700 underline"
                    href={`/api/media?bucket=receipts&path=${encodeURIComponent(expense.receipt_path)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View receipt
                  </a>
                ) : (
                  <span className="chip bg-amber-100 text-amber-900">No receipt</span>
                )}
                <span className="ml-auto">
                  {expense.technician_id === user.id
                    ? "You"
                    : (nameById.get(expense.technician_id) ?? "Unknown")}
                </span>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="card px-4 py-8 text-center text-sm text-muted">
          No receipts match this filter.
        </p>
      )}
    </div>
  );
}
