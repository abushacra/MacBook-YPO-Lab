import { requireAdmin } from "@/lib/auth";
import { RECEIPT_BUCKET, db } from "@/lib/supabase";
import { buildReceiptsReport } from "@/lib/receipts-report";
import { expenseCsv, numberedReceipts } from "@/lib/expense-csv";
import { zip, type ZipEntry } from "@/lib/zip";

/**
 * The period's receipts as a ZIP: the QuickBooks expense import CSV, and the
 * receipt images and PDFs beside it.
 *
 * QuickBooks' expense import has no column for an attachment, so a file cannot
 * ride in the CSV. Each receipt file is named with the same Ref No. its row
 * carries, so attaching them after the import is a matter of matching names
 * rather than hunting through a date range.
 *
 * A receipt whose file has gone missing from storage is skipped rather than
 * failing the whole download — its row is still in the CSV, and the manifest
 * says the file was not there.
 */
export async function GET(request: Request) {
  await requireAdmin();

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";

  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return new Response("Pick a valid date range.", { status: 400 });
  }

  const report = await buildReceiptsReport(from, to);
  const text = new TextEncoder();

  const entries: ZipEntry[] = [
    { name: "expenses.csv", bytes: text.encode(expenseCsv(report)) },
  ];

  const manifest: string[] = ["Ref No.,Property,Date,Amount,Receipt file"];

  for (const { ref, receipt, group } of numberedReceipts(report)) {
    let fileName = "";

    if (receipt.receiptPath) {
      const { data } = await db().storage.from(RECEIPT_BUCKET).download(receipt.receiptPath);
      if (data) {
        const extension = receipt.receiptPath.split(".").pop() ?? "jpg";
        fileName = `${ref}.${extension}`;
        entries.push({
          name: `receipts/${fileName}`,
          bytes: new Uint8Array(await data.arrayBuffer()),
        });
      } else {
        fileName = "missing from storage";
      }
    } else {
      fileName = "none attached";
    }

    const cell = (value: string) =>
      /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

    manifest.push(
      [ref, group.propertyName, receipt.date, receipt.amount.toFixed(2), fileName]
        .map(cell)
        .join(","),
    );
  }

  entries.push({
    name: "receipts-manifest.csv",
    bytes: text.encode(`﻿${manifest.join("\r\n")}\r\n`),
  });

  return new Response(zip(entries) as BodyInit, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="kapa-expenses-${from}-to-${to}.zip"`,
    },
  });
}
