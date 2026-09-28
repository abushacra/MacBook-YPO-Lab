import type { PayRun } from "@/lib/payrun";
import { billNumber } from "@/lib/payrun";
import { HOURS_TYPE_LABELS } from "@/lib/constants";
import { BILL_LOCATION } from "@/lib/quickbooks";

/**
 * Renders a pay run as a QuickBooks Online bill-import CSV.
 *
 * Matches Intuit's own sample_bills_import template: the same nineteen headers
 * in the same order, a UTF-8 BOM, CRLF line endings and MM/DD/YYYY dates.
 * Bill-level fields appear only on a bill's first row; later rows for the same
 * Bill Number leave them blank, which is how the importer groups lines onto one
 * bill.
 *
 * An in-house engineer's lines are "Item Details" rows: one service call is one
 * unit of the product, so Quantity is the call count, Rate is what a call was
 * billed at, and the Description names the Service Call Charge behind that rate. Writing Rate
 * and Amount on the row is what makes QuickBooks bill at the rate saved in this
 * app rather than the item's own cost.
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

export function payRunCsv(payRun: PayRun): string {
  const memo = `Service calls ${usDate(payRun.from)} to ${usDate(payRun.to)}`;
  const period = `${usDate(payRun.from)} to ${usDate(payRun.to)}`;
  const rows: string[] = [BILL_CSV_HEADERS.map(csvCell).join(",")];

  payRun.vendors.forEach((vendor, vendorIndex) => {
    const billNo = billNumber(payRun.to, vendorIndex);

    vendor.lines.forEach((line, lineIndex) => {
      const first = lineIndex === 0;
      const calls = `${line.shiftCount} service call${line.shiftCount === 1 ? "" : "s"}`;

      /*
       * An item row prices each call, so it carries the product, the quantity
       * and the rate. A category row carries only the account and the total.
       * Either way the name comes from the bill's own target, which is decided by
       * who the person is rather than typed at download time.
       */
      const detail =
        line.billAs === "item"
          ? {
              type: "Item Details",
              categoryAccount: "",
              productService: vendor.billTarget,
              quantity: String(line.shiftCount),
              rate: line.rate.toFixed(2),
              description: `${calls} at ${line.rate.toFixed(2)} \u00b7 ${HOURS_TYPE_LABELS[line.hoursType]} \u2014 ${period}`,
            }
          : {
              type: "Category Details",
              categoryAccount: vendor.billTarget,
              productService: "",
              quantity: "",
              rate: "",
              description: `${calls} \u2014 ${period}`,
            };

      rows.push(
        [
          billNo,
          first ? vendor.vendorName : "",
          "", // Mailing Address — already on the vendor record in QuickBooks
          "", // Terms — left to the vendor's own terms
          first ? usDate(payRun.to) : "",
          "", // Due Date — derived from those terms
          // Location is a bill-level field, so it sits on the first row and
          // covers every line on that bill.
          first ? BILL_LOCATION : "",
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
