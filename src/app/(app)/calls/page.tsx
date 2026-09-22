import Link from "next/link";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { formatDate, formatLocation, formatMoney } from "@/lib/format";
import { CallTypeBadge, FollowUpBadge, HoursBadge } from "@/components/call-badges";
import { PropertyFilter } from "@/components/property-filter";

export const metadata = { title: "Service calls · Kapa Service Log" };

const PAGE_SIZE = 50;

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export default async function CallsPage({ searchParams }: PageProps<"/calls">) {
  const user = await requireUser();
  const params = await searchParams;
  const scope = one(params.scope) || "all";
  const propertyId = one(params.property);

  let query = db()
    .from("service_calls")
    .select(
      "id, call_date, hours_type, call_type, property_label, space_label, description, follow_up_needed, technician_id, billed_amount",
    )
    .order("call_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);

  if (scope === "mine") query = query.eq("technician_id", user.id);
  if (scope === "follow_up") query = query.eq("follow_up_needed", true);
  if (propertyId) query = query.eq("property_id", propertyId);

  // The roster is small, so a lookup table beats an embedded join here.
  const [{ data: calls }, { data: properties }, { data: technicians }] = await Promise.all([
    query,
    db().from("properties").select("id, name").order("name"),
    db().from("technicians").select("id, name"),
  ]);

  const nameById = new Map((technicians ?? []).map((row) => [row.id, row.name]));

  /**
   * In-house engineers are never shown what a call was billed at — that is
   * their pay rate, and it is admin-only. A vendor sees the amounts they
   * quoted themselves.
   */
  const canSeeAmount = (technicianId: string) =>
    user.is_admin || (user.kind !== "in_house" && technicianId === user.id);

  const billableTotal = (calls ?? []).reduce(
    (sum, call) => sum + (canSeeAmount(call.technician_id) ? (call.billed_amount ?? 0) : 0),
    0,
  );

  const scopes = [
    { value: "all", label: "All" },
    { value: "mine", label: "Mine" },
    { value: "follow_up", label: "Follow-ups" },
  ];

  const hrefFor = (nextScope: string) => {
    const search = new URLSearchParams();
    if (nextScope !== "all") search.set("scope", nextScope);
    if (propertyId) search.set("property", propertyId);
    const query = search.toString();
    return query ? `/calls?${query}` : "/calls";
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Service calls</h1>
        <Link href="/calls/new" className="btn-primary min-h-11 px-4 text-sm">
          + New
        </Link>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {scopes.map((option) => (
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
        basePath="/calls"
        extraParams={scope !== "all" ? { scope } : {}}
      />

      {user.is_admin && billableTotal > 0 && (
        <div className="card flex items-center justify-between px-4 py-3">
          <span className="text-sm font-semibold text-muted">Billable total shown</span>
          <span className="text-lg font-bold">{formatMoney(billableTotal)}</span>
        </div>
      )}

      {calls && calls.length > 0 ? (
        <ul className="space-y-2">
          {calls.map((call) => (
            <li key={call.id}>
              <Link href={`/calls/${call.id}`} className="card block px-4 py-3 active:bg-brand-50">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-semibold">
                    {formatLocation(call.property_label, call.space_label)}
                  </p>
                  <div className="shrink-0 text-right">
                    <p className="text-xs text-muted">
                      {formatDate(call.call_date, { weekday: undefined, year: undefined })}
                    </p>
                    {canSeeAmount(call.technician_id) && call.billed_amount != null && (
                      <p className="text-sm font-bold">{formatMoney(call.billed_amount)}</p>
                    )}
                  </div>
                </div>

                {call.description && (
                  <p className="mt-1 line-clamp-2 text-sm text-muted">{call.description}</p>
                )}

                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <CallTypeBadge value={call.call_type} />
                  <HoursBadge value={call.hours_type} />
                  {call.follow_up_needed && <FollowUpBadge />}
                  <span className="ml-auto text-xs text-muted">
                    {call.technician_id === user.id
                      ? "You"
                      : (nameById.get(call.technician_id) ?? "Unknown")}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="card px-4 py-8 text-center text-sm text-muted">
          No service calls match this filter.
        </p>
      )}

      {calls && calls.length === PAGE_SIZE && (
        <p className="px-1 text-center text-xs text-muted">
          Showing the {PAGE_SIZE} most recent. Narrow the filters to see older calls.
        </p>
      )}
    </div>
  );
}
