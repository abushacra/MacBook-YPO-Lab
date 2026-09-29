import type { ServiceCallReport } from "@/lib/report";
import { buildXlsx, type Cell } from "@/lib/xlsx";
import { HOURS_TYPE_LABELS } from "@/lib/constants";
import { usDate } from "@/lib/payrun-csv";

/**
 * The service call report as a spreadsheet: a block per person, their properties
 * subtotalled underneath, and a grand total at the foot.
 *
 * The property rows under a person always add up to that person's total, because
 * a call covering two properties is counted once — see `groupReport`.
 */
export function reportXlsx(report: ServiceCallReport): Uint8Array {
  const rows: Cell[][] = [];

  rows.push([{ value: "Service calls by engineer", style: "title" }]);
  rows.push([{ value: `${usDate(report.from)} to ${usDate(report.to)}` }]);
  rows.push([]);
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
        } counted once, under the first.`,
      },
    ]);
  }

  return buildXlsx("Service calls", rows, [
    { width: 38 },
    { width: 13 },
    { width: 13 },
    { width: 10 },
    { width: 14 },
    { width: 12 },
    { width: 17 },
    { width: 11 },
  ]);
}
