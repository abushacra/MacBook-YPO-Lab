import "server-only";

import { db } from "@/lib/supabase";
import { asHoursType } from "@/lib/constants";
import { HOURS_TYPE_MULTIPLIERS, baseRate } from "@/lib/rates";
import { billTarget } from "@/lib/quickbooks";

/**
 * Builds a pay run: one vendor bill per person for the chosen dates, with one
 * line per property holding that property's shift total, so each line can be
 * charged to the property's customer for reimbursement.
 *
 * An in-house engineer's lines are product lines; an outside vendor's are
 * expense-category lines. That is the only difference, and it changes how
 * finely the lines are grouped — see the keying in `groupPayRun`.
 *
 * Only shifts that are approved AND priced AND not already billed are included.
 * Anything left out is counted and reported rather than silently dropped —
 * an unpriced shift is money nobody gets paid for.
 */

type PayRunLineBase = {
  propertyId: string;
  /** The property's current name, which is what must match the QuickBooks customer. */
  customerName: string;
  /**
   * Service calls, weighted by charge: a x 1.5 call counts as 1.5 and a x 2 as
   * 2. This is the Quantity on the bill line.
   */
  shiftCount: number;
  amount: number;
};

/**
 * An in-house engineer's calls, billed as a product. Quantity is the weighted
 * service call count and Rate is the Regular rate behind them, so Quantity x
 * Rate equals the amount whatever mix of charges the calls were logged at.
 */
export type PayRunItemLine = PayRunLineBase & {
  billAs: "item";
  /** The Regular rate every call on this line resolves to. */
  rate: number;
};

/**
 * An outside vendor's shifts, billed to an expense category. A category row
 * carries an amount and no quantity or rate, so every shift a vendor worked at
 * one property collapses onto a single line however differently each was quoted.
 */
export type PayRunCategoryLine = PayRunLineBase & {
  billAs: "category";
};

export type PayRunLine = PayRunItemLine | PayRunCategoryLine;

export type PayRunVendor = {
  technicianId: string;
  vendorName: string;
  kind: string;
  /** How this person's whole bill is written: in-house as items, vendors as categories. */
  billAs: PayRunLine["billAs"];
  /**
   * The QuickBooks name every line on this bill posts to — the product/service
   * for an item bill, the expense account for a category one.
   */
  billTarget: string;
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
  hours_type: string;
  billed_amount: number | null;
  approval_status: string;
  billed_at: string | null;
};

export async function buildPayRun(from: string, to: string): Promise<PayRun> {
  const [{ data: shifts }, { data: technicians }, { data: properties }] = await Promise.all([
    db()
      .from("service_calls")
      .select(
        "id, technician_id, call_date, property_id, property_label, property_id_2, hours_type, billed_amount, approval_status, billed_at",
      )
      .gte("call_date", from)
      .lte("call_date", to),
    db().from("technicians").select("id, name, kind, is_chief"),
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
  technicians: { id: string; name: string; kind: string; is_chief: boolean }[],
  properties: { id: string; name: string }[],
): PayRun {
  const technicianById = new Map(technicians.map((row) => [row.id, row]));
  const propertyNameById = new Map(properties.map((row) => [row.id, row.name]));

  let unpricedCount = 0;
  let unapprovedCount = 0;
  let alreadyBilledCount = 0;

  // technician -> line key -> line, with the split-shift tally kept alongside
  const grouped = new Map<string, Map<string, { line: PayRunLine; splitShifts: number }>>();

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

    const billAs = billShiftAs(technicianById.get(shift.technician_id)?.kind);
    const hoursType = asHoursType(shift.hours_type);

    /*
     * What this call counts as, and the Regular rate behind it. A x 1.5 call is
     * one and a half service calls at the Regular rate, which is the same money
     * as one call at one and a half times that rate — so weighting the quantity
     * lets every charge tier share a single line per property.
     */
    const weight = HOURS_TYPE_MULTIPLIERS[hoursType];
    const rate = baseRate(shift.billed_amount, hoursType);

    /*
     * An outside vendor's line is keyed on the property alone: a category row
     * carries only an amount, so differently quoted jobs at one property add up
     * onto one line.
     *
     * An engineer's line is keyed on the property and the Regular rate. The
     * charge is deliberately not in the key any more — that is what merges every
     * tier onto one line — but the rate still is, so a tier an admin re-priced
     * partway through a period cannot put two prices on one line.
     *
     * Keyed on the property id so renaming a property keeps its shifts together.
     */
    const key =
      billAs === "category"
        ? shift.property_id
        : `${shift.property_id}|${rate.toFixed(2)}`;

    let entry = byProperty.get(key);
    if (entry === undefined) {
      const base = {
        propertyId: shift.property_id,
        // The live name is what must match the QuickBooks customer; the stored
        // label is the fallback if the property was renamed out from under us.
        customerName: propertyNameById.get(shift.property_id) ?? shift.property_label,
        shiftCount: 0,
        amount: 0,
      };
      entry = {
        line: billAs === "item" ? { ...base, billAs, rate } : { ...base, billAs },
        splitShifts: 0,
      };
      byProperty.set(key, entry);
    }

    entry.line.shiftCount = Math.round((entry.line.shiftCount + weight) * 100) / 100;
    entry.line.amount = Math.round((entry.line.amount + shift.billed_amount) * 100) / 100;
    if (shift.property_id_2 !== null) entry.splitShifts += 1;
  }

  const vendors: PayRunVendor[] = [...grouped.entries()]
    .map(([technicianId, byProperty]) => {
      const entries = [...byProperty.values()].sort(
        (a, b) =>
          a.line.customerName.localeCompare(b.line.customerName) ||
          lineRate(b.line) - lineRate(a.line),
      );
      const technician = technicianById.get(technicianId);

      return {
        technicianId,
        vendorName: technician?.name ?? "Unknown",
        kind: technician?.kind ?? "in_house",
        billAs: billShiftAs(technician?.kind),
        billTarget: billTarget(technician?.kind ?? "in_house", technician?.is_chief ?? false),
        lines: entries.map((entry) => entry.line),
        total: Math.round(entries.reduce((sum, e) => sum + e.line.amount, 0) * 100) / 100,
        shiftCount:
          Math.round(entries.reduce((sum, e) => sum + e.line.shiftCount, 0) * 100) / 100,
        splitShiftCount: entries.reduce((sum, e) => sum + e.splitShifts, 0),
      };
    })
    .sort((a, b) => a.vendorName.localeCompare(b.vendorName));

  return {
    from,
    to,
    vendors,
    total: Math.round(vendors.reduce((sum, vendor) => sum + vendor.total, 0) * 100) / 100,
    shiftCount:
      Math.round(vendors.reduce((sum, vendor) => sum + vendor.shiftCount, 0) * 100) / 100,
    unpricedCount,
    unapprovedCount,
    alreadyBilledCount,
  };
}

/**
 * Which kind of bill line a person's shifts become. Outside vendors go to an
 * expense category; in-house engineers are billed as a product.
 */
function billShiftAs(kind: string | undefined): PayRunLine["billAs"] {
  return kind === "vendor" ? "category" : "item";
}

/** Sort key only: a category line has no rate, and there is one per property. */
function lineRate(line: PayRunLine): number {
  return line.billAs === "item" ? line.rate : 0;
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
