import type { ServiceCallReport } from "@/lib/report";
import type { ReceiptsReport } from "@/lib/receipts-report";
import { buildXlsx, type Cell } from "@/lib/xlsx";
import {
  APPROVAL_LABELS,
  CALL_TYPE_LABELS,
  HOURS_TYPE_LABELS,
  type ApprovalStatus,
  type CallType,
} from "@/lib/constants";
import { usDate } from "@/lib/payrun-csv";

/**
 * The service call report as a spreadsheet, in three sheets.
 *
 * **By property** is the same work grouped the other way, for charging a
 * property's customer: a property, then the engineers who attended it. Its
 * figures come from the By engineer rows added up in a different order, so the
 * two sheets can never disagree.
 *
 * **By engineer** is a block per person with their properties subtotalled underneath
 * and a grand total at the foot. The property rows under a person always add up
 * to that person's total, because a call covering two properties is counted once
 * — see `groupReport`.
 *
 * **Detail** is every call, one per row, oldest first within each person and the
 * people in the same order as the summary. It is a flat table rather than
 * indented blocks so Excel can sort, filter and pivot it; the engineer's name
 * repeats on every row for the same reason.
 *
 * The **Service calls** column on each detail row is what that call counts as —
 * 1, 1.5 or 2 by its Service Call Charge — so the column adds up to the figure
 * on the summary.
 */
export function reportXlsx(
  report: ServiceCallReport,
  receipts?: ReceiptsReport,
): Uint8Array {
  return buildXlsx([
    { name: "By engineer", rows: summaryRows(report), columns: SUMMARY_COLUMNS },
    { name: "By property", rows: propertyRows(report), columns: PROPERTY_COLUMNS },
    { name: "Detail", rows: detailRows(report), columns: DETAIL_COLUMNS },
    ...(receipts
      ? [{ name: "Receipts", rows: receiptRows(receipts), columns: RECEIPT_COLUMNS }]
      : []),
  ]);
}

const RECEIPT_COLUMNS = [
  { width: 30 },
  { width: 12 },
  { width: 26 },
  { width: 20 },
  { width: 13 },
  { width: 22 },
  { width: 14 },
  { width: 34 },
];

/** The period's credit card receipts, grouped by the property they are charged to. */
function receiptRows(report: ReceiptsReport): Cell[][] {
  const rows: Cell[][] = [];

  rows.push([{ value: "Credit card receipts by property", style: "title" }]);
  rows.push([{ value: `${usDate(report.from)} to ${usDate(report.to)}` }]);
  rows.push([
    { value: "A return is a negative amount, so it nets off the charge it reverses." },
  ]);
  rows.push([
    { value: "Property / receipt", style: "bold" },
    { value: "Date", style: "bold" },
    { value: "Merchant", style: "bold" },
    { value: "Category", style: "bold" },
    { value: "Amount", style: "bold" },
    { value: "Logged by", style: "bold" },
    { value: "Receipt file", style: "bold" },
    { value: "Notes", style: "bold" },
  ]);

  for (const property of report.properties) {
    rows.push([
      { value: property.propertyName, style: "bold" },
      { value: "" },
      { value: "" },
      { value: "" },
      { value: property.amount, style: "boldMoney" },
      { value: "" },
      { value: `${property.count} receipt${property.count === 1 ? "" : "s"}` },
      { value: "" },
    ]);

    for (const receipt of property.receipts) {
      rows.push([
        { value: "" },
        { value: usDate(receipt.date) },
        { value: receipt.merchant ?? "" },
        { value: receipt.category ?? "" },
        { value: receipt.amount, style: "money" },
        { value: receipt.loggedBy },
        { value: receipt.receiptPath === null ? "none attached" : "attached" },
        { value: receipt.notes ?? "" },
      ]);
    }

    rows.push([]);
  }

  rows.push([
    { value: "All properties", style: "bold" },
    { value: "" },
    { value: "" },
    { value: "" },
    { value: report.amount, style: "boldMoney" },
    { value: "" },
    { value: `${report.count} receipt${report.count === 1 ? "" : "s"}`, style: "bold" },
    { value: "" },
  ]);

  if (report.missingFileCount > 0) {
    rows.push([]);
    rows.push([
      {
        value: `${report.missingFileCount} receipt${
          report.missingFileCount === 1 ? " has" : "s have"
        } no image or PDF attached.`,
      },
    ]);
  }

  return rows;
}

const PROPERTY_COLUMNS = [{ width: 38 }, { width: 13 }, { width: 13 }, { width: 11 }];

/**
 * The same work, property first. Every figure here is a figure from the By
 * engineer sheet added up in a different order, so the two always agree — which
 * is what makes this the sheet to charge a property's customer from.
 */
function propertyRows(report: ServiceCallReport): Cell[][] {
  const rows: Cell[][] = [];

  rows.push([{ value: "Service calls by property", style: "title" }]);
  rows.push([{ value: `${usDate(report.from)} to ${usDate(report.to)}` }]);
  rows.push([
    {
      value:
        "Service calls counts every tier in one figure: a x 1.5 call counts as 1.5 and a x 2 as 2.",
    },
  ]);
  rows.push([
    { value: "Property / engineer", style: "bold" },
    { value: "Service calls", style: "bold" },
    { value: "Amount", style: "bold" },
    { value: "No amount", style: "bold" },
  ]);

  for (const property of report.properties) {
    rows.push([
      { value: property.propertyName, style: "bold" },
      { value: property.callCount, style: "bold" },
      { value: property.amount, style: "boldMoney" },
      { value: property.unpricedCount },
    ]);

    for (const engineer of property.engineers) {
      rows.push([
        { value: `    ${engineer.name}` },
        { value: engineer.callCount },
        { value: engineer.amount, style: "money" },
        { value: engineer.unpricedCount },
      ]);
    }

    rows.push([]);
  }

  rows.push([
    { value: "All properties", style: "bold" },
    { value: report.callCount, style: "bold" },
    { value: report.amount, style: "boldMoney" },
    { value: report.unpricedCount, style: "bold" },
  ]);

  if (report.secondPropertyCount > 0) {
    rows.push([]);
    rows.push([
      {
        value: `${report.secondPropertyCount} call${
          report.secondPropertyCount === 1 ? "" : "s"
        } also covered a second property, and ${
          report.secondPropertyCount === 1 ? "is" : "are"
        } counted once here, under the first. The second property is named on each call in the Detail sheet.`,
      },
    ]);
  }

  return rows;
}

const SUMMARY_COLUMNS = [{ width: 38 }, { width: 13 }, { width: 13 }, { width: 17 }, { width: 11 }];

function summaryRows(report: ServiceCallReport): Cell[][] {
  const rows: Cell[][] = [];

  rows.push([{ value: "Service calls by engineer", style: "title" }]);
  rows.push([{ value: `${usDate(report.from)} to ${usDate(report.to)}` }]);
  rows.push([
    {
      value:
        "Service calls counts every tier in one figure: a x 1.5 call counts as 1.5 and a x 2 as 2. The Detail sheet shows what each call counted as.",
    },
  ]);
  rows.push([
    { value: "Engineer / property", style: "bold" },
    { value: "Service calls", style: "bold" },
    { value: "Amount", style: "bold" },
    { value: "Awaiting approval", style: "bold" },
    { value: "No amount", style: "bold" },
  ]);

  for (const person of report.people) {
    rows.push([
      { value: person.name, style: "bold" },
      { value: person.callCount, style: "bold" },
      { value: person.amount, style: "boldMoney" },
      { value: person.pendingCount },
      { value: person.unpricedCount },
    ]);

    for (const property of person.properties) {
      rows.push([
        // Indented so the hierarchy survives a sort or a copy-paste, which
        // grouped rows or merged cells would not.
        { value: `    ${property.propertyName}` },
        { value: property.callCount },
        { value: property.amount, style: "money" },
        { value: "" },
        { value: property.unpricedCount },
      ]);
    }

    rows.push([]);
  }

  rows.push([
    { value: "All engineers", style: "bold" },
    { value: report.callCount, style: "bold" },
    { value: report.amount, style: "boldMoney" },
    { value: report.pendingCount, style: "bold" },
    { value: report.unpricedCount, style: "bold" },
  ]);

  if (report.secondPropertyCount > 0) {
    rows.push([]);
    rows.push([
      {
        value: `${report.secondPropertyCount} call${
          report.secondPropertyCount === 1 ? "" : "s"
        } also covered a second property, and ${
          report.secondPropertyCount === 1 ? "is" : "are"
        } counted once, under the first. The second property is named on each call in the Detail sheet.`,
      },
    ]);
  }

  return rows;
}

const DETAIL_COLUMNS = [
  { width: 22 },
  { width: 12 },
  { width: 30 },
  { width: 30 },
  { width: 13 },
  { width: 18 },
  { width: 12 },
  { width: 17 },
  { width: 10 },
  { width: 12 },
  { width: 52 },
];

function detailRows(report: ServiceCallReport): Cell[][] {
  const rows: Cell[][] = [];

  rows.push([{ value: "Service calls by date", style: "title" }]);
  rows.push([{ value: `${usDate(report.from)} to ${usDate(report.to)}` }]);
  rows.push([]);
  rows.push(
    [
      "Engineer",
      "Date",
      "Property",
      "Second property",
      "Service calls",
      "Service Call Charge",
      "Call type",
      "Approval",
      "Follow-up",
      "Amount",
      "Work completed",
    ].map((value) => ({ value, style: "bold" as const })),
  );

  for (const person of report.people) {
    for (const call of person.calls) {
      rows.push([
        { value: person.name },
        { value: usDate(call.date) },
        { value: call.property },
        { value: call.secondProperty ?? "" },
        // What this call counts as, beside the charge that sets it, so the
        // column can simply be added up.
        { value: call.weight },
        { value: HOURS_TYPE_LABELS[call.hoursType] },
        { value: CALL_TYPE_LABELS[call.callType as CallType] ?? call.callType },
        { value: APPROVAL_LABELS[call.approvalStatus as ApprovalStatus] ?? call.approvalStatus },
        { value: call.followUpNeeded ? "Yes" : "" },
        // Left blank rather than zero when a call has no amount, so an unpriced
        // call cannot be mistaken for one that was worth nothing.
        call.amount === null ? { value: "" } : { value: call.amount, style: "money" },
        { value: call.description ?? "" },
      ]);
    }
  }

  rows.push([]);
  rows.push([
    { value: "All engineers", style: "bold" },
    { value: "" },
    { value: "" },
    { value: "" },
    { value: report.callCount, style: "bold" },
    { value: "service calls" },
    { value: "" },
    { value: "" },
    { value: "" },
    { value: report.amount, style: "boldMoney" },
  ]);

  return rows;
}
