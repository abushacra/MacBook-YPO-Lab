import { requireAdmin } from "@/lib/auth";
import { buildReport } from "@/lib/report";
import { buildReceiptsReport } from "@/lib/receipts-report";
import { reportXlsx } from "@/lib/report-xlsx";

export async function GET(request: Request) {
  await requireAdmin();

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";

  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return new Response("Pick a valid date range.", { status: 400 });
  }

  const [report, receipts] = await Promise.all([
    buildReport(from, to),
    buildReceiptsReport(from, to),
  ]);

  return new Response(reportXlsx(report, receipts) as BodyInit, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="kapa-service-calls-${from}-to-${to}.xlsx"`,
    },
  });
}
