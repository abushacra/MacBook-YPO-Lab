import type { ServiceCallReport } from "@/lib/report";
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
 * The service call report as a spreadsheet, in two sheets.
 *
 * **Summary** is a block per person with their properties subtotalled underneath
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
export function reportXlsx(report: ServiceCallReport): Uint8Array {
  return buildXlsx([
    { name: "Summary", rows: summaryRows(report), columns: SUMMARY_COLUMNS },
    { name: "Detail", rows: detailRows(report), columns: DETAIL_COLUMNS },
  ]);
}

const SUMMARY_COLUMNS = [
  { width: 38 },
  { width: 13 },
  { width: 13 },
  { width: 10 },
  { width: 18 },
  { width: 16 },
  { width: 17 },
  { width: 11 },
];

function summaryRows(report: ServiceCallReport): Cell[][] {
  const rows: Cell[][] = [];

  rows.push([{ value: "Service calls by engineer", style: "title" }]);
  rows.push([{ value: `${usDate(report.from)} to ${usDate(report.to)}` }]);
  rows.push([
    {
      value:
        "A x 1.5 call counts as 1.5 service calls and a x 2 as 2, so Service calls can differ from the number of calls logged.",
    },
  ]);
  rows.push([
    { value: "Engineer / property", style: "bold" },
    { value: "Service calls", style: "bold" },
    { value: "Amount", style: "bold" },
    { value: "Regular", style: "bold" },
    { value: HOURS_TYPE_LABELS.after_hours, style: "bold" },
    { value: HOURS_TYPE_LABELS.double_time, style: "bold" },
    { value: "Awaiting approval", style: "bold" },
    { value: "No amount", style: "bold" },
  ]);

  for (const person of report.people) {
    rows.push([
      { value: person.name, style: "bold" },
      { value: person.callCount, style: "bold" },
      { value: person.amount, style: "boldMoney" },
      { value: person.byCharge.regular },
      { value: person.byCharge.after_hours },
      { value: person.byCharge.double_time },
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
        { value: "" },
        { value: "" },
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
    { value: "" },
    { value: "" },
    { value: "" },
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
