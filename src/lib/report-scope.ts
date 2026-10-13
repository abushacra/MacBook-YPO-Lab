import "server-only";

import { db } from "@/lib/supabase";
import { asPaidFilter, type ReportFilters } from "@/lib/report";
import { canSeeReportAmounts, type CurrentUser } from "@/lib/auth";
import { isUuid } from "@/lib/format";

/**
 * Who a reader may see in a report, and what they asked to narrow it to.
 *
 * One resolver for both the screen and the spreadsheet download, so the two can
 * never disagree about the boundary. The screens could not enforce it on their
 * own anyway: a download is a plain URL anyone can edit.
 */

export type RequestedScope = {
  paid: string;
  technicianId: string;
  propertyId: string;
};

/**
 * An admin sees everyone. A chief sees their own team and themselves — the
 * same people whose calls route to them for approval — and nobody else, no
 * matter what the URL asks for.
 */
export async function visibleTechnicianIds(user: CurrentUser): Promise<string[] | null> {
  if (user.is_admin) return null;

  const { data } = await db().from("technicians").select("id").eq("chief_id", user.id);
  return [user.id, ...(data ?? []).map((row) => row.id)];
}

export async function reportFiltersFor(
  user: CurrentUser,
  requested: RequestedScope,
): Promise<ReportFilters> {
  const visible = await visibleTechnicianIds(user);

  /*
   * A screen for one person is only honoured if that person is inside the
   * reader's boundary. Asking for someone outside it narrows to nobody rather
   * than quietly widening to everyone, which is what dropping the screen
   * would do.
   */
  const asked = isUuid(requested.technicianId) ? requested.technicianId : null;
  const technicianId =
    asked !== null && visible !== null && !visible.includes(asked) ? NOBODY : asked;

  return {
    paid: asPaidFilter(requested.paid),
    visibleTechnicianIds: visible,
    technicianId,
    propertyId: isUuid(requested.propertyId) ? requested.propertyId : null,
  };
}

/** A real uuid that matches no technician, so an out-of-bounds screen returns nothing. */
const NOBODY = "00000000-0000-0000-0000-000000000000";

/** The people a reader may screen the report down to, for the picker. */
export async function reportPeople(
  user: CurrentUser,
): Promise<{ id: string; name: string; kind: string }[]> {
  const visible = await visibleTechnicianIds(user);

  let query = db().from("technicians").select("id, name, kind").order("name");
  if (visible !== null) query = query.in("id", visible);

  const { data } = await query;
  return data ?? [];
}

export { canSeeReportAmounts };
