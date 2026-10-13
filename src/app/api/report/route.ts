import { canSeeReportAmounts, requireReportAccess } from "@/lib/auth";
import { buildReport } from "@/lib/report";
import { buildReceiptsReport } from "@/lib/receipts-report";
import { reportXlsx } from "@/lib/report-xlsx";
import { reportFiltersFor } from "@/lib/report-scope";

export async function GET(request: Request) {
  const user = await requireReportAccess();

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";

  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return new Response("Pick a valid date range.", { status: 400 });
  }

  // The same resolver the screen uses, so a download can never reach past what
  // the reader can see on it.
  const filters = await reportFiltersFor(user, {
    paid: searchParams.get("paid") ?? "",
    technicianId: searchParams.get("technician") ?? "",
    propertyId: searchParams.get("property") ?? "",
  });

  const showAmounts = canSeeReportAmounts(user);
  const [report, receipts] = await Promise.all([
    buildReport(from, to, filters),
    showAmounts ? buildReceiptsReport(from, to) : null,
  ]);

  return new Response(reportXlsx(report, { showAmounts }, receipts ?? undefined) as BodyInit, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="kapa-service-calls-${from}-to-${to}.xlsx"`,
    },
  });
}
