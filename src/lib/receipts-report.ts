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

export type ReceiptRow = {
  id: string;
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
};

export async function buildReceiptsReport(from: string, to: string): Promise<ReceiptsReport> {
  const [{ data: receipts }, { data: technicians }, { data: properties }] = await Promise.all([
    db()
      .from("expenses")
      .select(
        "id, property_id, property_label, expense_date, amount, merchant, category, notes, receipt_path, technician_id",
      )
      .gte("expense_date", from)
      .lte("expense_date", to),
    db().from("technicians").select("id, name"),
    db().from("properties").select("id, name"),
  ]);

  return groupReceipts(from, to, receipts ?? [], technicians ?? [], properties ?? []);
}

/** The grouping, kept free of the database so the totals can be tested directly. */
export function groupReceipts(
  from: string,
  to: string,
  receipts: ReceiptRecord[],
  technicians: { id: string; name: string }[],
  properties: { id: string; name: string }[],
): ReceiptsReport {
  const nameById = new Map(technicians.map((row) => [row.id, row.name]));
  const propertyNameById = new Map(properties.map((row) => [row.id, row.name]));

  const groups = new Map<string, ReceiptPropertyGroup>();

  for (const receipt of receipts) {
    let group = groups.get(receipt.property_id);
    if (group === undefined) {
      group = {
        propertyId: receipt.property_id,
        // The live name, falling back to the label stored on the receipt if the
        // property has since been renamed or removed.
        propertyName: propertyNameById.get(receipt.property_id) ?? receipt.property_label,
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
    properties: rows,
    amount: Math.round(sum((group) => group.amount) * 100) / 100,
    count: sum((group) => group.count),
    missingFileCount: sum((group) => group.missingFileCount),
    returnCount: sum((group) => group.returnCount),
  };
}
