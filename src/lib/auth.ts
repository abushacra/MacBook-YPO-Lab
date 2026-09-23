import "server-only";

import { redirect } from "next/navigation";

import { db } from "@/lib/supabase";
import { readSession } from "@/lib/session";
import type { Tables } from "@/lib/database.types";

export type CurrentUser = Pick<
  Tables<"technicians">,
  "id" | "name" | "company" | "kind" | "is_admin" | "is_chief" | "chief_id"
>;

/**
 * Resolves the signed-in technician against the database on every request, so
 * deactivating someone in Admin takes effect immediately rather than whenever
 * their month-long cookie happens to expire.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await readSession();
  if (!session) return null;

  const { data } = await db()
    .from("technicians")
    .select("id, name, company, kind, is_admin, is_chief, chief_id, active")
    .eq("id", session.sub)
    .maybeSingle();

  if (!data || !data.active) return null;

  return {
    id: data.id,
    name: data.name,
    company: data.company,
    kind: data.kind,
    is_admin: data.is_admin,
    is_chief: data.is_chief,
    chief_id: data.chief_id,
  };
}

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!user.is_admin) redirect("/");
  return user;
}
