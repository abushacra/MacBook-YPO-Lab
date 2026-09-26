import { requireAdmin } from "@/lib/auth";
import { buildPayRun } from "@/lib/payrun";
import { payRunCsv } from "@/lib/payrun-csv";

export async function GET(request: Request) {
  await requireAdmin();

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";
  const account = searchParams.get("account") ?? "";

  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return new Response("Pick a valid date range.", { status: 400 });
  }

  const payRun = await buildPayRun(from, to);

  return new Response(payRunCsv(payRun, account), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="kapa-bills-${from}-to-${to}.csv"`,
    },
  });
}
