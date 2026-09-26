import Link from "next/link";

import { canLogReceipts, requireUser } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { formatDate, formatLocation } from "@/lib/format";
import { CallTypeBadge, FollowUpBadge, HoursBadge } from "@/components/call-badges";
import { PushToggle } from "@/components/push-toggle";

export const metadata = { title: "Home · Kapa Service Log" };

export default async function HomePage() {
  const user = await requireUser();

  const pendingQuery = db()
    .from("service_calls")
    .select("id", { count: "exact", head: true })
    .eq("approval_status", "pending");

  const [{ data: recent }, { data: followUps }, { count: pendingCount }] = await Promise.all([
    db()
      .from("service_calls")
      .select("id, call_date, hours_type, call_type, property_label, space_label, property_label_2, space_label_2, follow_up_needed")
      .eq("technician_id", user.id)
      .order("call_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(5),
    db()
      .from("service_calls")
      .select("id, call_date, property_label, space_label")
      .eq("follow_up_needed", true)
      .order("call_date", { ascending: false })
      .limit(5),
    user.is_admin ? pendingQuery : pendingQuery.eq("routed_to_chief_id", user.id),
  ]);

  return (
    <div className="space-y-7">
      <section className="space-y-3">
        <Link href="/calls/new" className="btn-primary w-full py-4 text-lg">
          Log a maintenance shift
        </Link>
        {canLogReceipts(user) && (
          <Link href="/expenses/new" className="btn-secondary w-full py-4 text-lg">
            Log a credit card receipt
          </Link>
        )}
      </section>

      {(user.is_chief || user.is_admin) && <PushToggle />}

      {(user.is_chief || user.is_admin) && (pendingCount ?? 0) > 0 && (
        <Link
          href="/calls?scope=to_approve"
          className="card flex items-center justify-between gap-3 border-amber-300 bg-amber-50 px-4 py-4 active:bg-amber-100"
        >
          <span>
            <span className="block text-base font-bold text-amber-900">
              {pendingCount} maintenance shift{pendingCount === 1 ? "" : "s"} awaiting your approval
            </span>
            <span className="block text-sm text-amber-800">Tap to review them.</span>
          </span>
          <span aria-hidden="true" className="text-xl font-bold text-amber-900">
            &rsaquo;
          </span>
        </Link>
      )}

      {followUps && followUps.length > 0 && (
        <section>
          <h2 className="section-heading mb-2">Open follow-ups</h2>
          <ul className="space-y-2">
            {followUps.map((call) => (
              <li key={call.id}>
                <Link href={`/calls/${call.id}`} className="card block px-4 py-3 active:bg-brand-50">
                  <p className="text-sm font-semibold">
                    {formatLocation(call.property_label, call.space_label)}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">{formatDate(call.call_date)}</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <div className="mb-2 flex items-baseline justify-between px-1">
          <h2 className="section-heading">Your recent shifts</h2>
          <Link href="/calls" className="text-sm font-semibold text-brand-700">
            See all
          </Link>
        </div>

        {recent && recent.length > 0 ? (
          <ul className="space-y-2">
            {recent.map((call) => (
              <li key={call.id}>
                <Link href={`/calls/${call.id}`} className="card block px-4 py-3 active:bg-brand-50">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">
                        {formatLocation(call.property_label, call.space_label)}
                      </p>
                      {call.property_label_2 && (
                        <p className="text-sm font-semibold text-muted">
                          + {formatLocation(call.property_label_2, call.space_label_2)}
                        </p>
                      )}
                    </div>
                    <p className="shrink-0 text-xs text-muted">
                      {formatDate(call.call_date, { weekday: undefined, year: undefined })}
                    </p>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <CallTypeBadge value={call.call_type} />
                    <HoursBadge value={call.hours_type} />
                    {call.follow_up_needed && <FollowUpBadge />}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="card px-4 py-6 text-center text-sm text-muted">
            Nothing logged yet. Your shifts will show up here.
          </p>
        )}
      </section>
    </div>
  );
}
