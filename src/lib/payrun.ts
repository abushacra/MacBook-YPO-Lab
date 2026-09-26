import "server-only";

import { db } from "@/lib/supabase";

/**
 * Builds a pay run: one vendor bill per person for the chosen dates, with one
 * line per property holding that property's shift total, so each line can be
 * charged to the property's customer for reimbursement.
 *
 * Only shifts that are approved AND priced AND not already billed are included.
 * Anything left out is counted and reported rather than silently dropped —
 * an unpriced shift is money nobody gets paid for.
 */

export type PayRunLine = {
  propertyId: string;
  /** The property's current name, which is what must match the QuickBooks customer. */
  customerName: string;
  shiftCount: number;
  amount: number;
};

export type PayRunVendor = {
  technicianId: string;
  vendorName: string;
  kind: string;
  lines: PayRunLine[];
  total: number;
  shiftCount: number;
  /** Shifts covering two properties: their whole amount sits on the first. */
  splitShiftCount: number;
};

export type PayRun = {
  from: string;
  to: string;
  vendors: PayRunVendor[];
  total: number;
  shiftCount: number;
  /** Approved shifts in range with no amount — excluded, and worth chasing. */
  unpricedCount: number;
  /** Shifts in range still waiting on approval — excluded until signed off. */
  unapprovedCount: number;
  alreadyBilledCount: number;
};

export type PayRunShift = {
  technician_id: string;
  property_id: string;
  property_label: string;
  property_id_2: string | null;
  billed_amount: number | null;
  approval_status: string;
  billed_at: string | null;
};

export async function buildPayRun(from: string, to: string): Promise<PayRun> {
  const [{ data: shifts }, { data: technicians }, { data: properties }] = await Promise.all([
    db()
      .from("service_calls")
      .select(
        "id, technician_id, call_date, property_id, property_label, property_id_2, billed_amount, approval_status, billed_at",
      )
      .gte("call_date", from)
      .lte("call_date", to),
    db().from("technicians").select("id, name, kind"),
    db().from("properties").select("id, name"),
  ]);

  return groupPayRun(
    from,
    to,
    shifts ?? [],
    technicians ?? [],
    properties ?? [],
  );
}

/**
 * The grouping and totalling, kept free of the database so it can be exercised
 * directly. This is payroll arithmetic; it is worth being able to test.
 */
export function groupPayRun(
  from: string,
  to: string,
  shifts: PayRunShift[],
  technicians: { id: string; name: string; kind: string }[],
  properties: { id: string; name: string }[],
): PayRun {
  const technicianById = new Map(technicians.map((row) => [row.id, row]));
  const propertyNameById = new Map(properties.map((row) => [row.id, row.name]));

  let unpricedCount = 0;
  let unapprovedCount = 0;
  let alreadyBilledCount = 0;

  // technician -> property key -> line
  const grouped = new Map<string, Map<string, PayRunLine & { splitShifts: number }>>();

  for (const shift of shifts) {
    if (shift.approval_status !== "approved") {
      unapprovedCount += 1;
      continue;
    }
    if (shift.billed_at !== null) {
      alreadyBilledCount += 1;
      continue;
    }
    if (shift.billed_amount === null) {
      unpricedCount += 1;
      continue;
    }

    const byProperty = grouped.get(shift.technician_id) ?? new Map();
    grouped.set(shift.technician_id, byProperty);

    // Group on the id so renaming a property keeps its shifts on one line.
    const key = shift.property_id;
    const line = byProperty.get(key) ?? {
      propertyId: shift.property_id,
      // The live name is what must match the QuickBooks customer; the stored
      // label is the fallback if the property was renamed out from under us.
      customerName: propertyNameById.get(shift.property_id) ?? shift.property_label,
      shiftCount: 0,
      amount: 0,
      splitShifts: 0,
    };

    line.shiftCount += 1;
    line.amount = Math.round((line.amount + shift.billed_amount) * 100) / 100;
    if (shift.property_id_2 !== null) line.splitShifts += 1;
    byProperty.set(key, line);
  }

  const vendors: PayRunVendor[] = [...grouped.entries()]
    .map(([technicianId, byProperty]) => {
      const lines = [...byProperty.values()].sort((a, b) =>
        a.customerName.localeCompare(b.customerName),
      );
      const technician = technicianById.get(technicianId);

      return {
        technicianId,
        vendorName: technician?.name ?? "Unknown",
        kind: technician?.kind ?? "in_house",
        lines: lines.map(({ propertyId, customerName, shiftCount, amount }) => ({
          propertyId,
          customerName,
          shiftCount,
          amount,
        })),
        total: Math.round(lines.reduce((sum, line) => sum + line.amount, 0) * 100) / 100,
        shiftCount: lines.reduce((sum, line) => sum + line.shiftCount, 0),
        splitShiftCount: lines.reduce((sum, line) => sum + line.splitShifts, 0),
      };
    })
    .sort((a, b) => a.vendorName.localeCompare(b.vendorName));

  return {
    from,
    to,
    vendors,
    total: Math.round(vendors.reduce((sum, vendor) => sum + vendor.total, 0) * 100) / 100,
    shiftCount: vendors.reduce((sum, vendor) => sum + vendor.shiftCount, 0),
    unpricedCount,
    unapprovedCount,
    alreadyBilledCount,
  };
}

/** Bill numbers must be unique per vendor for an importer to group lines correctly. */
export function billNumber(to: string, index: number): string {
  return `KSL-${to.replace(/-/g, "")}-${index + 1}`;
}

/** Ids of every shift a pay run covers, for marking them billed. */
export async function payRunShiftIds(from: string, to: string): Promise<string[]> {
  const { data } = await db()
    .from("service_calls")
    .select("id")
    .gte("call_date", from)
    .lte("call_date", to)
    .eq("approval_status", "approved")
    .is("billed_at", null)
    .not("billed_amount", "is", null);

  return (data ?? []).map((row) => row.id);
}
