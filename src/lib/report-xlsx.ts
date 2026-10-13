import type { ReportCallRow, ServiceCallReport } from "@/lib/report";
import type { ReceiptsReport } from "@/lib/receipts-report";
import { buildXlsx, type Cell, type Sheet } from "@/lib/xlsx";
import {
  APPROVAL_LABELS,
  CALL_TYPE_LABELS,
  HOURS_TYPE_LABELS,
  type ApprovalStatus,
  type CallType,
} from "@/lib/constants";
import { usDate } from "@/lib/payrun-csv";

/**
 * The service call report as a spreadsheet.
 *
 * **By property** is the work grouped for charging a property's customer: a
 * property, then the engineers who attended it. Its figures come from the By
 * engineer rows added up in a different order, so the two sheets can never
 * disagree.
 *
 * **By engineer** is a block per person with their properties subtotalled
 * underneath and a grand total at the foot. The property rows under a person
 * always add up to that person's total, because a call covering two properties
 * is counted once — see `groupReport`.
 *
 * **Detail** is every call, one per row, oldest first within each person. It is
 * a flat table rather than indented blocks so Excel can sort, filter and pivot
 * it; the engineer's name repeats on every row for the same reason.
 *
 * Then **one tab per property** and **one tab per engineer**, each the calls of
 * that one property or person — the spreadsheet answer to one printed page
 * each, for handing a single building's or a single engineer's work to someone
 * who should not receive the rest.
 *
 * The **Service calls** column on each detail row is what that call counts as —
 * 1, 1.5 or 2 by its Service Call Charge — so the column adds up to the figure
 * on the summary.
 *
 * `showAmounts` drops every money column rather than zeroing it. A chief reads
 * these for their own team, and an amount is a pay rate by another name.
 */
export type ReportSheetOptions = { showAmounts: boolean };

/**
 * A workbook of a hundred tabs helps nobody, and the summary sheets already
 * carry every property and person. Past this the per-tab breakdown stops and
 * the summary says so.
 */
const MAX_TABS_PER_GROUPING = 40;

export function reportXlsx(
  report: ServiceCallReport,
  options: ReportSheetOptions,
  receipts?: ReceiptsReport,
): Uint8Array {
  const { showAmounts } = options;
  const properties = report.properties.slice(0, MAX_TABS_PER_GROUPING);
  const people = report.people.slice(0, MAX_TABS_PER_GROUPING);

  return buildXlsx(
    uniqueNames([
      { name: "By engineer", rows: summaryRows(report, showAmounts), columns: summaryColumns(showAmounts) },
      { name: "By property", rows: propertyRows(report, showAmounts), columns: propertyColumns(showAmounts) },
      { name: "Detail", rows: detailRows(report, showAmounts), columns: detailColumns(showAmounts) },
      ...properties.map((property) => ({
        name: property.propertyName,
        rows: onePropertyRows(report, property, showAmounts),
        columns: detailColumns(showAmounts, false),
      })),
      ...people.map((person) => ({
        name: person.name,
        rows: onePersonRows(report, person, showAmounts),
        columns: detailColumns(showAmounts),
      })),
      ...(receipts && showAmounts
        ? [{ name: "Receipts", rows: receiptRows(receipts), columns: RECEIPT_COLUMNS }]
        : []),
    ]),
  );
}

/**
 * Excel refuses a workbook with two sheets of the same name, and names here
 * come from property and person names, which can collide outright or after
 * being cut to Excel's 31 characters. A clash gets a counter rather than
 * losing the sheet.
 */
function uniqueNames(sheets: Sheet[]): Sheet[] {
  const seen = new Set<string>();

  return sheets.map((sheet) => {
    // Matching how the writer will cut and fold the name, so a clash is caught
    // on the name Excel will actually see.
    const base = sheet.name.replace(/[:\\/?*[\]]/g, " ").trim().slice(0, 31).trim();
    let name = base === "" ? "Sheet" : base;

    for (let n = 2; seen.has(name.toLowerCase()); n += 1) {
      const suffix = ` (${n})`;
      name = `${base.slice(0, 31 - suffix.length).trim()}${suffix}`;
    }

    seen.add(name.toLowerCase());
    return { ...sheet, name };
  });
}

/** An amount column simply is not there for a reader who may not see money. */
function money(
  show: boolean,
  value: number | null,
  style: "money" | "boldMoney" = "money",
): Cell[] {
  if (!show) return [];
  return [value === null ? { value: "" } : { value, style }];
}

function heading(show: boolean, label: string): Cell[] {
  return show ? [{ value: label, style: "bold" as const }] : [];
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

const propertyColumns = (showAmounts: boolean) => [
  { width: 38 },
  { width: 13 },
  ...(showAmounts ? [{ width: 13 }] : []),
  { width: 11 },
];

/**
 * The same work, property first. Every figure here is a figure from the By
 * engineer sheet added up in a different order, so the two always agree — which
 * is what makes this the sheet to charge a property's customer from.
 */
function propertyRows(report: ServiceCallReport, showAmounts: boolean): Cell[][] {
  const rows: Cell[][] = [];

  rows.push([{ value: "Service calls by property", style: "title" }]);
  rows.push([{ value: `${usDate(report.from)} to ${usDate(report.to)}` }]);
  rows.push([
    {
      value:
        "Service calls counts every tier in one figure: a x 1.5 call counts as 1.5 and a x 2 as 2. A call that covered two properties counts half at each, so these are this property's own share.",
    },
  ]);
  rows.push([
    { value: "Property / engineer", style: "bold" },
    { value: "Service calls", style: "bold" },
    ...heading(showAmounts, "Amount"),
    { value: "No amount", style: "bold" },
  ]);

  for (const property of report.properties) {
    rows.push([
      { value: property.propertyName, style: "bold" },
      { value: property.callCount, style: "bold" },
      ...money(showAmounts, property.amount, "boldMoney"),
      { value: property.unpricedCount },
    ]);

    for (const engineer of property.engineers) {
      rows.push([
        { value: `    ${engineer.name}` },
        { value: engineer.callCount },
        ...money(showAmounts, engineer.amount),
        { value: engineer.unpricedCount },
      ]);
    }

    rows.push([]);
  }

  rows.push([
    { value: "All properties", style: "bold" },
    { value: report.callCount, style: "bold" },
    ...money(showAmounts, report.amount, "boldMoney"),
    { value: report.unpricedCount, style: "bold" },
  ]);

  rows.push(...tabNote(report.properties.length, "property"));

  /*
   * No note about calls that also covered a second building. This sheet and
   * the per-property tabs beside it are what a property's own customer sees,
   * and the other building is somebody else's address. The By engineer sheet
   * keeps the note, where it explains why a person's property subtotals add up
   * to their total.
   */

  return rows;
}

const summaryColumns = (showAmounts: boolean) => [
  { width: 38 },
  { width: 13 },
  ...(showAmounts ? [{ width: 13 }] : []),
  { width: 17 },
  { width: 11 },
];

function summaryRows(report: ServiceCallReport, showAmounts: boolean): Cell[][] {
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
    ...heading(showAmounts, "Amount"),
    { value: "Awaiting approval", style: "bold" },
    { value: "No amount", style: "bold" },
  ]);

  for (const person of report.people) {
    rows.push([
      { value: person.name, style: "bold" },
      { value: person.callCount, style: "bold" },
      ...money(showAmounts, person.amount, "boldMoney"),
      { value: person.pendingCount },
      { value: person.unpricedCount },
    ]);

    for (const property of person.properties) {
      rows.push([
        // Indented so the hierarchy survives a sort or a copy-paste, which
        // grouped rows or merged cells would not.
        { value: `    ${property.propertyName}` },
        { value: property.callCount },
        ...money(showAmounts, property.amount),
        { value: "" },
        { value: property.unpricedCount },
      ]);
    }

    rows.push([]);
  }

  rows.push([
    { value: "All engineers", style: "bold" },
    { value: report.callCount, style: "bold" },
    ...money(showAmounts, report.amount, "boldMoney"),
    { value: report.pendingCount, style: "bold" },
    { value: report.unpricedCount, style: "bold" },
  ]);

  rows.push(...tabNote(report.people.length, "engineer"));

  if (report.secondPropertyCount > 0) {
    rows.push([]);
    rows.push([
      {
        value: `${report.secondPropertyCount} call${
          report.secondPropertyCount === 1 ? "" : "s"
        } also covered a second property, and ${
          report.secondPropertyCount === 1 ? "is" : "are"
        } split half to each, so the property rows above are halves. The Detail sheet marks each one; which two properties they were is on the by-property sheets.`,
      },
    ]);
  }

  return rows;
}

const detailColumns = (showAmounts: boolean, showSplit = true) => [
  { width: 22 },
  { width: 12 },
  { width: 30 },
  ...(showSplit ? [{ width: 8 }] : []),
  { width: 13 },
  { width: 18 },
  { width: 12 },
  { width: 17 },
  { width: 10 },
  ...(showAmounts ? [{ width: 12 }] : []),
  { width: 52 },
];

function detailHeadingRow(showAmounts: boolean, showSplit = true): Cell[] {
  return [
    "Engineer",
    "Date",
    "Property",
    // Not the other property's name — a sheet that says a call was split
    // explains the halves without putting one customer's address on another's
    // page. The by-property sheets are where each half is actually shown.
    ...(showSplit ? ["Split"] : []),
    "Service calls",
    "Service Call Charge",
    "Call type",
    "Approval",
    "Follow-up",
    ...(showAmounts ? ["Amount"] : []),
    "Work completed",
  ].map((value) => ({ value, style: "bold" as const }));
}

/** One call as a detail row. The engineer is named on every row so the table sorts. */
function detailRow(
  engineerName: string,
  call: ReportCallRow,
  showAmounts: boolean,
  showSplit = true,
): Cell[] {
  return [
    { value: engineerName },
    { value: usDate(call.date) },
    { value: call.property },
    ...(showSplit ? [{ value: call.isSplit ? "Half" : "" }] : []),
    // What this call counts as, beside the charge that sets it, so the column
    // can simply be added up.
    { value: call.weight },
    { value: HOURS_TYPE_LABELS[call.hoursType] },
    { value: CALL_TYPE_LABELS[call.callType as CallType] ?? call.callType },
    { value: APPROVAL_LABELS[call.approvalStatus as ApprovalStatus] ?? call.approvalStatus },
    { value: call.followUpNeeded ? "Yes" : "" },
    // Left blank rather than zero when a call has no amount, so an unpriced
    // call cannot be mistaken for one that was worth nothing.
    ...money(showAmounts, call.amount),
    { value: call.description ?? "" },
  ];
}

/** The closing total under a block of detail rows. */
function detailTotal(
  label: string,
  callCount: number,
  amount: number,
  showAmounts: boolean,
  showSplit = true,
): Cell[] {
  return [
    { value: label, style: "bold" },
    { value: "" },
    { value: "" },
    ...(showSplit ? [{ value: "" }] : []),
    { value: callCount, style: "bold" },
    { value: "service calls" },
    { value: "" },
    { value: "" },
    { value: "" },
    ...money(showAmounts, amount, "boldMoney"),
  ];
}

function rangeHeader(report: ServiceCallReport, title: string): Cell[][] {
  return [
    [{ value: title, style: "title" }],
    [{ value: `${usDate(report.from)} to ${usDate(report.to)}` }],
    [{ value: scopeLine(report) }],
  ];
}

/** Says in the sheet itself which calls it was built from, so a printout stands alone. */
function scopeLine(report: ServiceCallReport): string {
  const paid =
    report.filters.paid === "unpaid"
      ? "Unpaid service calls only"
      : report.filters.paid === "paid"
        ? "Paid service calls only"
        : "Paid and unpaid service calls";
  return `${paid}. A x 1.5 call counts as 1.5 service calls and a x 2 as 2, and a call covering two properties counts half at each.`;
}

function tabNote(total: number, noun: string): Cell[][] {
  if (total <= MAX_TABS_PER_GROUPING) return [];
  return [
    [],
    [
      {
        value: `Only the first ${MAX_TABS_PER_GROUPING} of ${total} ${noun} tabs are included; every ${noun} is still listed above.`,
      },
    ],
  ];
}

function detailRows(report: ServiceCallReport, showAmounts: boolean): Cell[][] {
  const rows: Cell[][] = rangeHeader(report, "Service calls by date");
  rows.push([]);
  rows.push(detailHeadingRow(showAmounts));

  for (const person of report.people) {
    for (const call of person.calls) {
      rows.push(detailRow(person.name, call, showAmounts));
    }
  }

  rows.push([]);
  rows.push(detailTotal("All engineers", report.callCount, report.amount, showAmounts));

  return rows;
}

/**
 * One property's own tab: every call at that building, whoever attended it.
 * This is the sheet to hand to a single property's owner, which is why it
 * carries its own heading and total rather than relying on the summary.
 */
function onePropertyRows(
  report: ServiceCallReport,
  property: ServiceCallReport["properties"][number],
  showAmounts: boolean,
): Cell[][] {
  const rows: Cell[][] = rangeHeader(report, property.propertyName);
  rows.push([]);
  // No Split column here: every figure on this tab is already this property's
  // own half, so the word would raise a question the page must not answer.
  rows.push(detailHeadingRow(showAmounts, false));

  for (const call of property.calls) {
    rows.push(detailRow(call.engineerName, call, showAmounts, false));
  }

  rows.push([]);
  rows.push(
    detailTotal(property.propertyName, property.callCount, property.amount, showAmounts, false),
  );

  if (property.unpricedCount > 0) {
    rows.push([]);
    rows.push([
      {
        value: `${property.unpricedCount} call${
          property.unpricedCount === 1 ? " has" : "s have"
        } no amount yet.`,
      },
    ]);
  }

  return rows;
}

/** One person's own tab: every call they logged, in date order. */
function onePersonRows(
  report: ServiceCallReport,
  person: ServiceCallReport["people"][number],
  showAmounts: boolean,
): Cell[][] {
  const rows: Cell[][] = rangeHeader(report, person.name);
  rows.push([]);
  rows.push(detailHeadingRow(showAmounts));

  for (const call of person.calls) {
    rows.push(detailRow(person.name, call, showAmounts));
  }

  rows.push([]);
  rows.push(detailTotal(person.name, person.callCount, person.amount, showAmounts));

  if (person.pendingCount > 0) {
    rows.push([]);
    rows.push([
      {
        value: `${person.pendingCount} call${
          person.pendingCount === 1 ? " is" : "s are"
        } still awaiting approval.`,
      },
    ]);
  }

  return rows;
}
