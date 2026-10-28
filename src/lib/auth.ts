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
    .select("id, name, company, kind, is_admin, is_chief, chief_id, active, billing_only")
    .eq("id", session.sub)
    .maybeSingle();

  // A billing-only record is never a signed-in person, so a cookie naming one
  // is not a session however it came about.
  if (!data || !data.active || data.billing_only) return null;

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

/**
 * Receipts are an oversight task: chiefs log them, and admins can too since
 * an admin is the backstop everywhere else in the app.
 */
export function canLogReceipts(user: CurrentUser): boolean {
  return user.is_chief || user.is_admin;
}

export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!user.is_admin) redirect("/");
  return user;
}

/**
 * Reports are open to chiefs as well as admins, but they are not the same
 * report: a chief sees their own team, and no money. See
 * `canSeeReportAmounts`.
 */
export function canRunReports(user: CurrentUser): boolean {
  return user.is_admin || user.is_chief;
}

export async function requireReportAccess(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!canRunReports(user)) redirect("/");
  return user;
}

/**
 * An amount on a service call is what the engineer is paid for it, so it is a
 * pay rate by another name and stays admin-only — the same rule that keeps
 * rates off the service call form and out of an engineer's own history. A
 * chief gets the counts, which is what chasing unpaid work actually needs.
 */
export function canSeeReportAmounts(user: CurrentUser): boolean {
  return user.is_admin;
}

/**
 * Who may add an engineer or a vendor. A chief can staff their own team; what
 * they cannot do is grant admin, mint another chief, or move someone onto a
 * different chief's team — `addTechnician` forces all three.
 */
export function canAddPeople(user: CurrentUser): boolean {
  return user.is_admin || user.is_chief;
}

export async function requirePeopleAccess(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!canAddPeople(user)) redirect("/");
  return user;
}
