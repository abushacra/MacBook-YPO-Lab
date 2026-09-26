import type { PayRun } from "@/lib/payrun";
import { billNumber } from "@/lib/payrun";

/**
 * Renders a pay run as a QuickBooks Online bill-import CSV.
 *
 * Matches Intuit's own sample_bills_import template: the same nineteen headers
 * in the same order, a UTF-8 BOM, CRLF line endings and MM/DD/YYYY dates.
 * Bill-level fields appear only on a bill's first row; later rows for the same
 * Bill Number leave them blank, which is how the importer groups lines onto one
 * bill.
 *
 * Every line is a "Category Details" row — an expense posted to an account —
 * carrying the property as Customer/Project with Billable set, so the line can
 * be charged on for reimbursement.
 */

export const BILL_CSV_HEADERS = [
  "*Bill Number",
  "*Vendor",
  "Mailing Address",
  "Terms",
  "*Bill Date",
  "Due Date",
  "Location",
  "Memo",
  "*Type",
  "Category/Account",
  "Product/Service",
  "Quantity",
  "Rate",
  "Description",
  "Amount",
  "Billable",
  "Customer/Project",
  "Tax Rate",
  "Class",
] as const;

function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** QuickBooks reads the dates in this file as MM/DD/YYYY. */
export function usDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  return `${month}/${day}/${year}`;
}

export function payRunCsv(payRun: PayRun, account: string): string {
  const memo = `Maintenance shifts ${usDate(payRun.from)} to ${usDate(payRun.to)}`;
  const rows: string[] = [BILL_CSV_HEADERS.map(csvCell).join(",")];

  payRun.vendors.forEach((vendor, vendorIndex) => {
    const billNo = billNumber(payRun.to, vendorIndex);

    vendor.lines.forEach((line, lineIndex) => {
      const first = lineIndex === 0;

      rows.push(
        [
          billNo,
          first ? vendor.vendorName : "",
          "", // Mailing Address — already on the vendor record in QuickBooks
          "", // Terms — left to the vendor's own terms
          first ? usDate(payRun.to) : "",
          "", // Due Date — derived from those terms
          "", // Location
          first ? memo : "",
          "Category Details",
          account,
          "", // Product/Service — not an item line
          "", // Quantity
          "", // Rate
          `${line.shiftCount} shift${line.shiftCount === 1 ? "" : "s"} — ${usDate(payRun.from)} to ${usDate(payRun.to)}`,
          line.amount.toFixed(2),
          "TRUE",
          line.customerName,
          "", // Tax Rate
          "", // Class
        ]
          .map(csvCell)
          .join(","),
      );
    });
  });

  return `﻿${rows.join("\r\n")}\r\n`;
}
