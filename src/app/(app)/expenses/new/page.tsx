import Link from "next/link";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { formatDate, formatLocation, todayISO } from "@/lib/format";
import { ExpenseForm, type RecentCall } from "@/components/expense-form";

export const metadata = { title: "New receipt · Kapa Service Log" };

export default async function NewExpensePage() {
  const user = await requireUser();

  const [{ data: properties }, { data: calls }] = await Promise.all([
    db().from("properties").select("id, name").eq("active", true).order("name"),
    db()
      .from("service_calls")
      .select("id, call_date, property_label, space_label")
      .eq("technician_id", user.id)
      .order("call_date", { ascending: false })
      .limit(20),
  ]);

  const recentCalls: RecentCall[] = (calls ?? []).map((call) => ({
    id: call.id,
    label: `${formatDate(call.call_date, { weekday: undefined, year: undefined })} — ${formatLocation(call.property_label, call.space_label)}`,
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
