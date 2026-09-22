import Link from "next/link";

import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/supabase";
import {
  resetTechnicianPin,
  setPropertyActive,
  setSpaceActive,
  setTechnicianActive,
  setTechnicianAdmin,
} from "@/lib/actions/admin";
import { TECHNICIAN_KIND_LABELS, type TechnicianKind } from "@/lib/constants";
import { AddPropertyForm, AddSpaceForm, AddTechnicianForm } from "@/components/admin-forms";

export const metadata = { title: "Admin · Kapa Service Log" };

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export default async function AdminPage({ searchParams }: PageProps<"/admin">) {
  const admin = await requireAdmin();
  const tab = one((await searchParams).tab) === "people" ? "people" : "properties";

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">Admin</h1>

      <div className="flex gap-2">
        {[
          { value: "properties", label: "Properties" },
          { value: "people", label: "People" },
        ].map((option) => (
          <Link
            key={option.value}
            href={`/admin?tab=${option.value}`}
            aria-current={tab === option.value ? "page" : undefined}
            className={`chip min-h-10 flex-1 justify-center px-3.5 text-sm ${
              tab === option.value
                ? "bg-brand-700 text-white"
                : "border border-hairline bg-white text-muted"
            }`}
          >
            {option.label}
          </Link>
        ))}
      </div>

      {tab === "properties" ? <PropertiesTab /> : <PeopleTab adminId={admin.id} />}
    </div>
  );
}

async function PropertiesTab() {
  const [{ data: properties }, { data: spaces }] = await Promise.all([
    db().from("properties").select("id, name, address, active").order("name"),
    db().from("spaces").select("id, name, property_id, active").order("name"),
  ]);

  const activeProperties = (properties ?? []).filter((property) => property.active);

  return (
    <div className="space-y-6">
      <section>
        <h2 className="section-heading mb-2">Add a property</h2>
        <AddPropertyForm />
      </section>

      {activeProperties.length > 0 && (
        <section>
          <h2 className="section-heading mb-2">Add a space</h2>
          <AddSpaceForm properties={activeProperties} />
        </section>
      )}

      <section>
        <h2 className="section-heading mb-2">Portfolio</h2>
        {properties && properties.length > 0 ? (
          <ul className="space-y-3">
            {properties.map((property) => {
              const propertySpaces = (spaces ?? []).filter(
                (space) => space.property_id === property.id,
              );
              return (
                <li key={property.id} className="card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{property.name}</p>
                      {property.address && (
                        <p className="truncate text-sm text-muted">{property.address}</p>
                      )}
                    </div>
                    <form action={setPropertyActive}>
                      <input type="hidden" name="id" value={property.id} />
                      <input type="hidden" name="active" value={property.active ? "false" : "true"} />
                      <button
                        type="submit"
                        className={property.active ? "btn-danger min-h-10 px-3 text-sm" : "btn-secondary min-h-10 px-3 text-sm"}
                      >
                        {property.active ? "Retire" : "Restore"}
                      </button>
                    </form>
                  </div>

                  {!property.active && (
                    <p className="mt-2 text-xs font-semibold text-amber-800">
                      Retired — hidden from new calls, past logs keep their history.
                    </p>
                  )}

                  {propertySpaces.length > 0 && (
                    <ul className="mt-3 divide-y divide-hairline border-t border-hairline">
                      {propertySpaces.map((space) => (
                        <li
                          key={space.id}
                          className="flex items-center justify-between gap-3 py-2"
                        >
                          <span
                            className={`text-sm ${space.active ? "" : "text-muted line-through"}`}
                          >
                            {space.name}
                          </span>
                          <form action={setSpaceActive}>
                            <input type="hidden" name="id" value={space.id} />
                            <input
                              type="hidden"
                              name="active"
                              value={space.active ? "false" : "true"}
                            />
                            <button
                              type="submit"
                              className="min-h-9 rounded-lg px-3 text-sm font-semibold text-brand-700"
                            >
                              {space.active ? "Retire" : "Restore"}
                            </button>
                          </form>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="card px-4 py-6 text-center text-sm text-muted">No properties yet.</p>
        )}
      </section>
    </div>
  );
}

/** Loads the roster and resolves lockouts outside of render, which must stay pure. */
async function loadPeople() {
  const { data } = await db()
    .from("technicians")
    .select("id, name, company, kind, is_admin, active, pin_hash, locked_until")
    .order("name");

  const now = Date.now();
  return (data ?? []).map((person) => ({
    ...person,
    locked: person.locked_until != null && new Date(person.locked_until).getTime() > now,
  }));
}

async function PeopleTab({ adminId }: { adminId: string }) {
  const people = await loadPeople();

  return (
    <div className="space-y-6">
      <section>
        <h2 className="section-heading mb-2">Add a person</h2>
        <AddTechnicianForm />
      </section>

      <section>
        <h2 className="section-heading mb-2">Engineers and vendors</h2>
        <ul className="space-y-3">
          {people.map((person) => {
            const { locked } = person;
            const isSelf = person.id === adminId;

            return (
              <li key={person.id} className="card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">
                      {person.name}
                      {isSelf && <span className="ml-2 text-xs font-medium text-muted">(you)</span>}
                    </p>
                    <p className="truncate text-sm text-muted">
                      {TECHNICIAN_KIND_LABELS[person.kind as TechnicianKind] ?? person.kind}
                      {person.company ? ` · ${person.company}` : ""}
                    </p>
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap gap-1.5">
                  {person.is_admin && <span className="chip bg-brand-100 text-brand-800">Admin</span>}
                  {!person.active && <span className="chip bg-slate-200 text-slate-700">Inactive</span>}
                  {!person.pin_hash && <span className="chip bg-amber-100 text-amber-900">PIN not set</span>}
                  {locked && <span className="chip bg-red-100 text-red-800">Locked out</span>}
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {(person.pin_hash || locked) && (
                    <form action={resetTechnicianPin}>
                      <input type="hidden" name="id" value={person.id} />
                      <button type="submit" className="btn-secondary min-h-10 px-3 text-sm">
                        Reset PIN
                      </button>
                    </form>
                  )}

                  {!isSelf && (
                    <>
                      <form action={setTechnicianAdmin}>
                        <input type="hidden" name="id" value={person.id} />
                        <input type="hidden" name="is_admin" value={person.is_admin ? "false" : "true"} />
                        <button type="submit" className="btn-secondary min-h-10 px-3 text-sm">
                          {person.is_admin ? "Remove admin" : "Make admin"}
                        </button>
                      </form>

                      <form action={setTechnicianActive}>
                        <input type="hidden" name="id" value={person.id} />
                        <input type="hidden" name="active" value={person.active ? "false" : "true"} />
                        <button
                          type="submit"
                          className={person.active ? "btn-danger min-h-10 px-3 text-sm" : "btn-secondary min-h-10 px-3 text-sm"}
                        >
                          {person.active ? "Deactivate" : "Reactivate"}
                        </button>
                      </form>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
