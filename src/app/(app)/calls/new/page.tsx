import Link from "next/link";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { todayISO } from "@/lib/format";
import { ServiceCallForm, type PropertyOption } from "@/components/service-call-form";

export const metadata = { title: "New maintenance shift · Kapa Service Log" };

export default async function NewServiceCallPage() {
  const user = await requireUser();

  const [{ data: properties }, { data: spaces }] = await Promise.all([
    db().from("properties").select("id, name").eq("active", true).order("name"),
    db().from("spaces").select("id, name, property_id").eq("active", true).order("name"),
  ]);

  const options: PropertyOption[] = (properties ?? []).map((property) => ({
    id: property.id,
    name: property.name,
    spaces: (spaces ?? [])
      .filter((space) => space.property_id === property.id)
      .map((space) => ({ id: space.id, name: space.name })),
  }));

  if (options.length === 0) {
    return (
      <div className="card p-5 text-sm text-muted">
        <p className="font-semibold text-ink">No properties yet.</p>
        <p className="mt-2">An admin needs to add at least one property before shifts can be logged.</p>
        <Link href="/admin" className="btn-secondary mt-4 w-full">
          Go to Admin
        </Link>
      </div>
    );
  }

  return (
    <>
      <h1 className="mb-5 text-xl font-bold">New maintenance shift</h1>
      <ServiceCallForm
        properties={options}
        isVendor={user.kind !== "in_house"}
        serverToday={todayISO()}
      />
    </>
  );
}
