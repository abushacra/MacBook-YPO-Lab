import "server-only";

import { db } from "@/lib/supabase";

/**
 * Credit card receipts for a date range, grouped by the property they were
 * charged to — the view for reimbursement, where what matters is what each
 * property owes rather than who paid it.
 *
 * A return is a negative amount, so it nets off the charge it reverses inside
 * its property's total rather than being listed apart from it.
 */

/**
 * Which receipts a run covers. Exported means an admin marked an expense
 * import done — the mirror of a service call being billed, and the thing that
 * stops the same receipt reaching QuickBooks twice.
 */
export const EXPORT_FILTERS = ["unexported", "exported", "all"] as const;
export type ExportFilter = (typeof EXPORT_FILTERS)[number];

export function asExportFilter(value: string): ExportFilter {
  return (EXPORT_FILTERS as readonly string[]).includes(value)
    ? (value as ExportFilter)
    : "unexported";
}

export type ReceiptRow = {
  id: string;
  /** When this receipt went to QuickBooks, or null while it is outstanding. */
  exportedAt: string | null;
  date: string;
  merchant: string | null;
  category: string | null;
  notes: string | null;
  amount: number;
  loggedBy: string;
  /** The stored image or PDF, if one was attached. */
  receiptPath: string | null;
};

export type ReceiptPropertyGroup = {
  propertyId: string;
  propertyName: string;
  /**
   * The QuickBooks customer this property's spend is reimbursed by, which is
   * what the Customer column on the expense import must match. Several
   * properties can share one, so it is stored rather than derived; it falls
   * back to the property name when nothing is mapped.
   */
  quickbooksCustomer: string;
  amount: number;
  /** Receipts, counting a return as one of them. */
  count: number;
  /** Receipts with no image or PDF attached — nothing to send an accountant. */
  missingFileCount: number;
  returnCount: number;
  receipts: ReceiptRow[];
};

export type ReceiptsReport = {
  from: string;
  to: string;
  filter: ExportFilter;
  /** In range but left out by the filter, so a short run is never a surprise. */
  filteredOutCount: number;
  properties: ReceiptPropertyGroup[];
  amount: number;
  count: number;
  missingFileCount: number;
  returnCount: number;
};

export type ReceiptRecord = {
  id: string;
  property_id: string;
  property_label: string;
  expense_date: string;
  amount: number;
  merchant: string | null;
  category: string | null;
  notes: string | null;
  receipt_path: string | null;
  technician_id: string;
  exported_at: string | null;
};

export async function buildReceiptsReport(
  from: string,
  to: string,
  filter: ExportFilter = "all",
): Promise<ReceiptsReport> {
  // Everything in range is fetched and the filter applied in the grouping, so
  // what the filter left out can be counted rather than silently missing.
  const [{ data: receipts }, { data: technicians }, { data: properties }] = await Promise.all([
    db()
      .from("expenses")
      .select(
        "id, property_id, property_label, expense_date, amount, merchant, category, notes, receipt_path, technician_id, exported_at",
      )
      .gte("expense_date", from)
      .lte("expense_date", to),
    db().from("technicians").select("id, name"),
    db().from("properties").select("id, name, quickbooks_customer"),
  ]);

  return groupReceipts(from, to, receipts ?? [], technicians ?? [], properties ?? [], filter);
}

/** The ids a run covers, for stamping them exported. */
export async function receiptExportIds(
  from: string,
  to: string,
  filter: ExportFilter,
): Promise<string[]> {
  let query = db()
    .from("expenses")
    .select("id")
    .gte("expense_date", from)
    .lte("expense_date", to);

  if (filter === "unexported") query = query.is("exported_at", null);
  if (filter === "exported") query = query.not("exported_at", "is", null);

  const { data } = await query;
  return (data ?? []).map((row) => row.id);
}

/** The grouping, kept free of the database so the totals can be tested directly. */
export function groupReceipts(
  from: string,
  to: string,
  receipts: ReceiptRecord[],
  technicians: { id: string; name: string }[],
  properties: { id: string; name: string; quickbooks_customer: string | null }[],
  filter: ExportFilter = "all",
): ReceiptsReport {
  const nameById = new Map(technicians.map((row) => [row.id, row.name]));
  const propertyById = new Map(properties.map((row) => [row.id, row]));

  const groups = new Map<string, ReceiptPropertyGroup>();
  let filteredOutCount = 0;

  for (const receipt of receipts) {
    const exported = receipt.exported_at !== null;
    if ((filter === "unexported" && exported) || (filter === "exported" && !exported)) {
      filteredOutCount += 1;
      continue;
    }

    let group = groups.get(receipt.property_id);
    if (group === undefined) {
      const property = propertyById.get(receipt.property_id);
      // The live name, falling back to the label stored on the receipt if the
      // property has since been renamed or removed.
      const propertyName = property?.name ?? receipt.property_label;

      group = {
        propertyId: receipt.property_id,
        propertyName,
        // Unmapped falls back to the property name, which is what the import
        // carried before customers were mapped at all.
        quickbooksCustomer: property?.quickbooks_customer ?? propertyName,
        amount: 0,
        count: 0,
        missingFileCount: 0,
        returnCount: 0,
        receipts: [],
      };
      groups.set(receipt.property_id, group);
    }

    group.amount = Math.round((group.amount + receipt.amount) * 100) / 100;
    group.count += 1;
    if (receipt.receipt_path === null) group.missingFileCount += 1;
    if (receipt.amount < 0) group.returnCount += 1;

    group.receipts.push({
      id: receipt.id,
      date: receipt.expense_date,
      merchant: receipt.merchant,
      category: receipt.category,
      notes: receipt.notes,
      amount: receipt.amount,
      loggedBy: nameById.get(receipt.technician_id) ?? "Unknown",
      receiptPath: receipt.receipt_path,
      exportedAt: receipt.exported_at,
    });
  }

  const rows = [...groups.values()]
    .map((group) => ({
      ...group,
      // Oldest first, the order a statement reads in.
      receipts: [...group.receipts].sort((a, b) => a.date.localeCompare(b.date)),
    }))
    // Biggest spend first, which is the one worth looking at.
    .sort((a, b) => b.amount - a.amount || a.propertyName.localeCompare(b.propertyName));

  const sum = (pick: (group: ReceiptPropertyGroup) => number) =>
    rows.reduce((total, group) => total + pick(group), 0);

  return {
    from,
    to,
    filter,
    filteredOutCount,
    properties: rows,
    amount: Math.round(sum((group) => group.amount) * 100) / 100,
    count: sum((group) => group.count),
    missingFileCount: sum((group) => group.missingFileCount),
    returnCount: sum((group) => group.returnCount),
  };
}
