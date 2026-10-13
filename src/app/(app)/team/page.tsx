import Link from "next/link";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { TECHNICIAN_KIND_LABELS, type TechnicianKind } from "@/lib/constants";
import { formatMoney } from "@/lib/format";
import { AddTechnicianForm, TechnicianRatesForm } from "@/components/admin-forms";

export const metadata = { title: "Team · Kapa Service Log" };

/**
 * A chief engineer's own screen: the people who report to them, and the form to
 * add another. An admin has all of this and more on /admin, so they are sent
 * there rather than given a second, weaker copy of it.
 *
 * What a chief cannot do here is grant admin, mint another chief, or move
 * someone onto a different team. `addTechnician` forces all three regardless of
 * what the form posts.
 */
export default async function TeamPage() {
  const user = await requireUser();
  if (user.is_admin) redirect("/admin?tab=people");
  if (!user.is_chief) redirect("/");

  const [{ data: team }, { data: rates }, { data: usage }] = await Promise.all([
    db()
      .from("technicians")
      .select("id, name, company, kind, active, pin_hash")
      .eq("chief_id", user.id)
      .order("name"),
    db()
      .from("technician_rates")
      .select("technician_id, label, amount, sort_order, is_primary")
      .order("sort_order"),
    db().from("technician_usage").select("technician_id, service_call_count"),
  ]);

  const callsById = new Map(
    (usage ?? []).map((row) => [row.technician_id, row.service_call_count ?? 0]),
  );

  const people = (team ?? []).map((person) => ({
    ...person,
    calls: callsById.get(person.id) ?? 0,
    rates: (rates ?? [])
      .filter((rate) => rate.technician_id === person.id)
      .map((rate) => ({
        label: rate.label,
        amount: rate.amount,
        isPrimary: rate.is_primary,
      })),
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold">My team</h1>
        <Link href="/reports" className="btn-secondary min-h-11 shrink-0 px-3 text-sm">
          Reports
        </Link>
      </div>

      <section>
        <h2 className="section-heading mb-2">Add an engineer or vendor</h2>
        {/* No chiefs list: a chief's new hire always reports to the chief adding them. */}
        <AddTechnicianForm chiefs={[]} canPromote={false} />
      </section>

      <section>
        <h2 className="section-heading mb-2">
          {people.length} {people.length === 1 ? "person" : "people"} reporting to you
        </h2>

        {people.length === 0 ? (
          <p className="card px-4 py-6 text-center text-sm text-muted">
            Nobody reports to you yet. Add an engineer or a vendor above.
          </p>
        ) : (
          <ul className="space-y-3">
            {people.map((person) => (
              <li key={person.id} className="card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{person.name}</p>
                    <p className="text-xs text-muted">
                      {TECHNICIAN_KIND_LABELS[person.kind as TechnicianKind]}
                      {person.company && ` · ${person.company}`}
                      {` · ${person.calls} service call${person.calls === 1 ? "" : "s"}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {!person.active && (
                      <span className="chip bg-zinc-200 text-zinc-700">Inactive</span>
                    )}
                    {person.pin_hash === null && (
                      <span className="chip bg-amber-100 text-amber-900">No PIN yet</span>
                    )}
                  </div>
                </div>

                {person.kind === "in_house" ? (
                  <>
                    {person.rates.length === 0 && (
                      <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
                        No rate set, so their service calls will be logged with no amount.
                      </p>
                    )}
                    <TechnicianRatesForm technicianId={person.id} rates={person.rates} />
                  </>
                ) : (
                  <p className="mt-3 text-xs text-muted">
                    Vendors enter the amount they agreed on each service call, so there is no
                    rate to set.
                  </p>
                )}

                {person.rates.length > 0 && (
                  <p className="mt-2 text-xs text-muted">
                    {person.rates
                      .map((rate) => `${rate.label} ${formatMoney(rate.amount)}`)
                      .join(" · ")}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="px-1 text-xs text-muted">
        Deactivating someone, resetting a PIN and deleting a person stay with the admin.
        Ask them if you need one of those.
      </p>
    </div>
  );
}
