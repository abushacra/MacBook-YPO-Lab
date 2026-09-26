import Link from "next/link";

import { redirect } from "next/navigation";

import { canLogReceipts, requireUser } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { formatDate, formatLocation, todayISO } from "@/lib/format";
import { ExpenseForm, type RecentCall } from "@/components/expense-form";

export const metadata = { title: "New receipt · Kapa Service Log" };

export default async function NewExpensePage() {
  const user = await requireUser();
  if (!canLogReceipts(user)) redirect("/");

  /*
   * A chief logs receipts for work their team did, so the picker offers their
   * own shifts plus everything routed to them. An admin sees the most recent
   * shifts regardless of who logged them.
   */
  let recentShifts = db()
    .from("service_calls")
    .select("id, call_date, property_label, space_label, technician_id")
    .order("call_date", { ascending: false })
    .limit(20);

  if (!user.is_admin) {
    recentShifts = recentShifts.or(
      `technician_id.eq.${user.id},routed_to_chief_id.eq.${user.id}`,
    );
  }

  const [{ data: properties }, { data: calls }, { data: technicians }] = await Promise.all([
    db().from("properties").select("id, name").eq("active", true).order("name"),
    recentShifts,
    db().from("technicians").select("id, name"),
  ]);

  const nameById = new Map((technicians ?? []).map((row) => [row.id, row.name]));

  const recentCalls: RecentCall[] = (calls ?? []).map((call) => ({
    id: call.id,
    label: `${formatDate(call.call_date, { weekday: undefined, year: undefined })} — ${formatLocation(
      call.property_label,
      call.space_label,
    )}${call.technician_id === user.id ? "" : ` (${nameById.get(call.technician_id) ?? "—"})`}`,
  }));

  if (!properties || properties.length === 0) {
    return (
      <div className="card p-5 text-sm text-muted">
        <p className="font-semibold text-ink">No properties yet.</p>
        <p className="mt-2">An admin needs to add properties before expenses can be assigned.</p>
        <Link href="/admin" className="btn-secondary mt-4 w-full">
          Go to Admin
        </Link>
      </div>
    );
  }

  return (
    <>
      <h1 className="mb-5 text-xl font-bold">Log a credit card receipt</h1>
      <ExpenseForm properties={properties} recentCalls={recentCalls} serverToday={todayISO()} />
    </>
  );
}
