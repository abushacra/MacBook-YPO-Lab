import Link from "next/link";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { todayISO } from "@/lib/format";
import {
  ServiceCallForm,
  type CallSubjectOption,
  type PropertyOption,
} from "@/components/service-call-form";

export const metadata = { title: "New service call · Kapa Service Log" };

export default async function NewServiceCallPage() {
  const user = await requireUser();

  /*
   * An admin or chief can log a call on someone else's behalf, for work phoned
   * in or written on paper. An admin may log for anyone active; a chief only for
   * their own team. An ordinary engineer gets no roster and no picker — the
   * action applies the same rule again, so the absent picker is a convenience,
   * not the control.
   */
  const canLogForOthers = user.is_admin || user.is_chief;

  let roster = db()
    .from("technicians")
    .select("id, name, kind, chief_id")
    .eq("active", true)
    .order("name");
  if (!user.is_admin) roster = roster.eq("chief_id", user.id);

  const [{ data: properties }, { data: spaces }, { data: people }] = await Promise.all([
    db().from("properties").select("id, name").eq("active", true).order("name"),
    db().from("spaces").select("id, name, property_id").eq("active", true).order("name"),
    canLogForOthers ? roster : Promise.resolve({ data: [] }),
  ]);

  const others = (people ?? []).filter((person) => person.id !== user.id);
  const subjects: CallSubjectOption[] =
    canLogForOthers && others.length > 0
      ? [
          { id: user.id, name: user.name, isVendor: user.kind !== "in_house" },
          ...others.map((person) => ({
            id: person.id,
            name: person.name,
            isVendor: person.kind !== "in_house",
          })),
        ]
      : [];

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
        <p className="mt-2">An admin needs to add at least one property before service calls can be logged.</p>
        <Link href="/admin" className="btn-secondary mt-4 w-full">
          Go to Admin
        </Link>
      </div>
    );
  }

  return (
    <>
      <h1 className="mb-5 text-xl font-bold">New service call</h1>
      <ServiceCallForm
        properties={options}
        isVendor={user.kind !== "in_house"}
        subjects={subjects}
        selfId={user.id}
        serverToday={todayISO()}
      />
    </>
  );
}
