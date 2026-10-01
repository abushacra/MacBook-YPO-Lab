import type { ReceiptPropertyGroup, ReceiptRow, ReceiptsReport } from "@/lib/receipts-report";
import { usDate } from "@/lib/payrun-csv";
import {
  BILL_LOCATION,
  EXPENSE_CATEGORY,
  EXPENSE_PAYEE,
  EXPENSE_PAYMENT_ACCOUNT,
  EXPENSE_PAYMENT_METHOD,
} from "@/lib/quickbooks";

/**
 * Renders the period's credit card receipts as a QuickBooks Online expense
 * import CSV.
 *
 * Matches Intuit's own sample_expenses_import template: the same eighteen
 * headers in the same order, a UTF-8 BOM, CRLF line endings and MM/DD/YYYY
 * dates. Each receipt is one expense with one Category Details line, carrying
 * the property in Customer/Project with Billable set so it can be charged on.
 *
 * Every row is paid to one payee for the card rather than a vendor per shop, so
 * the merchant is recorded in the Description instead.
 *
 * A return is a receipt with a negative amount and imports as a negative one,
 * which is how QuickBooks records a credit back to the card.
 *
 * The template has no column for an attachment, so the files cannot ride in the
 * CSV — `expenseBundle` puts them beside it in a ZIP instead, named by the same
 * Ref No. that appears here.
 */

export const EXPENSE_CSV_HEADERS = [
  "Ref No.",
  "*Payee",
  "Payment Account",
  "*Date",
  "Payment Method",
  "Location",
  "Memo",
  "Type",
  "Category/Account",
  "Product/Service",
  "Qty",
  "Rate",
  "Description",
  "*Amount",
  "Billable",
  "Customer/Project",
  "Tax Rate",
  "Class",
] as const;

function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * The reference that ties a CSV row to its receipt file in the ZIP. Numbered
 * across the whole run rather than per property, so it is unique and sorts in
 * the order the rows appear.
 */
export function expenseRef(to: string, index: number): string {
  return `KAPA-EXP-${to.replace(/-/g, "")}-${index + 1}`;
}

/** Every receipt in the run, in CSV row order, each with the ref it will carry. */
export function numberedReceipts(
  report: ReceiptsReport,
): { ref: string; receipt: ReceiptRow; group: ReceiptPropertyGroup }[] {
  const out: { ref: string; receipt: ReceiptRow; group: ReceiptPropertyGroup }[] = [];

  for (const group of report.properties) {
    for (const receipt of group.receipts) {
      out.push({ ref: expenseRef(report.to, out.length), receipt, group });
    }
  }

  return out;
}

export function expenseCsv(report: ReceiptsReport): string {
  const rows: string[] = [EXPENSE_CSV_HEADERS.map(csvCell).join(",")];

  for (const { ref, receipt, group } of numberedReceipts(report)) {
    /*
     * What the charge was for. The merchant leads, because every row is paid to
     * the one card payee and this is where the shop is recorded; the app's own
     * category and note follow, neither having a column of its own here.
     */
    const description = [
      receipt.merchant,
      receipt.category,
      receipt.notes,
      receipt.amount < 0 ? "Return" : null,
    ]
      .filter((part): part is string => Boolean(part))
      .join(" · ");

    rows.push(
      [
        ref,
        EXPENSE_PAYEE,
        EXPENSE_PAYMENT_ACCOUNT,
        usDate(receipt.date),
        EXPENSE_PAYMENT_METHOD,
        BILL_LOCATION,
        // The ref, so the expense can be found from the receipt file and back
        // without opening the line, then the merchant, so a statement can be
        // reconciled from the memo column alone.
        [ref, receipt.merchant, `logged by ${receipt.loggedBy}`]
          .filter((part): part is string => Boolean(part))
          .join(" · "),
        "Category Details",
        EXPENSE_CATEGORY,
        "", // Product/Service — not an item line
        "", // Qty
        "", // Rate
        description || "Credit card charge",
        receipt.amount.toFixed(2),
        "TRUE",
        group.propertyName,
        "", // Tax Rate
        "", // Class
      ]
        .map(csvCell)
        .join(","),
    );
  }

  return `﻿${rows.join("\r\n")}\r\n`;
}
