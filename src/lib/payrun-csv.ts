import type { PayRun } from "@/lib/payrun";
import { billNumber } from "@/lib/payrun";
import { HOURS_TYPE_LABELS } from "@/lib/constants";

/**
 * Renders a pay run as a QuickBooks Online bill-import CSV.
 *
 * Matches Intuit's own sample_bills_import template: the same nineteen headers
 * in the same order, a UTF-8 BOM, CRLF line endings and MM/DD/YYYY dates.
 * Bill-level fields appear only on a bill's first row; later rows for the same
 * Bill Number leave them blank, which is how the importer groups lines onto one
 * bill.
 *
 * An in-house engineer's lines are "Item Details" rows: one shift is one unit of
 * the product, so Quantity is the shift count, Rate is what a shift was billed
 * at, and the Description names the Shift Charge behind that rate.
 *
 * An outside vendor's lines are "Category Details" rows posted to an expense
 * category. A category row carries an amount with no quantity or rate, so a
 * vendor's whole total for a property sits on one line whatever each job was
 * quoted at.
 *
 * Either way the line carries the property as Customer/Project with Billable
 * set, so it can be charged on for reimbursement.
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

/** What each kind of line is posted to in QuickBooks. Both are names, not ids. */
export type BillTargets = {
  /** The product/service an engineer's shifts are billed as. */
  productService: string;
  /** The expense category an outside vendor's shifts are posted to. */
  expenseCategory: string;
};

export function payRunCsv(payRun: PayRun, targets: BillTargets): string {
  const memo = `Maintenance shifts ${usDate(payRun.from)} to ${usDate(payRun.to)}`;
  const period = `${usDate(payRun.from)} to ${usDate(payRun.to)}`;
  const rows: string[] = [BILL_CSV_HEADERS.map(csvCell).join(",")];

  payRun.vendors.forEach((vendor, vendorIndex) => {
    const billNo = billNumber(payRun.to, vendorIndex);

    vendor.lines.forEach((line, lineIndex) => {
      const first = lineIndex === 0;
      const shifts = `${line.shiftCount} shift${line.shiftCount === 1 ? "" : "s"}`;

      // An item row prices each shift; a category row only carries the total.
      const detail =
        line.billAs === "item"
          ? {
              type: "Item Details",
              categoryAccount: "",
              productService: targets.productService,
              quantity: String(line.shiftCount),
              rate: line.rate.toFixed(2),
              description: `${shifts} at ${line.rate.toFixed(2)} \u00b7 ${HOURS_TYPE_LABELS[line.hoursType]} \u2014 ${period}`,
            }
          : {
              type: "Category Details",
              categoryAccount: targets.expenseCategory,
              productService: "",
              quantity: "",
              rate: "",
              description: `${shifts} \u2014 ${period}`,
            };

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
          detail.type,
          detail.categoryAccount,
          detail.productService,
          detail.quantity,
          detail.rate,
          detail.description,
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
