import { requireAdmin } from "@/lib/auth";
import { RECEIPT_BUCKET, db } from "@/lib/supabase";
import { buildReceiptsReport, type ReceiptPropertyGroup, type ReceiptRow } from "@/lib/receipts-report";
import { expenseCsv, numberedReceipts } from "@/lib/expense-csv";
import { buildPdf, readJpeg, type PdfPage } from "@/lib/pdf";
import { zip, type ZipEntry } from "@/lib/zip";
import { formatMoney } from "@/lib/format";
import { usDate } from "@/lib/payrun-csv";

/**
 * The period's receipts as a ZIP: the QuickBooks expense import CSV, and one
 * combined PDF per property holding that property's receipts, a page each.
 *
 * QuickBooks' expense import has no column for an attachment, so a file cannot
 * ride in the CSV. One PDF per property is what actually gets filed: it is the
 * bundle a property's owner or an accountant is sent, and attaching one
 * document beats attaching fourteen loose photos.
 *
 * Every page names the Ref No. its CSV row carries, so a receipt can still be
 * matched to its expense line.
 *
 * A receipt whose file has gone missing from storage still gets a page saying
 * so rather than failing the download, and anything that is not a JPEG is left
 * in the ZIP as its own file — see `readJpeg`.
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

  // Named once, up front: two property names can sanitise to the same file
  // name, and the second would silently overwrite the first in the ZIP.
  const pdfNames = pdfNamesFor(report.properties);
  const pdfName = (group: ReceiptPropertyGroup) => pdfNames.get(group.propertyId)!;

  const entries: ZipEntry[] = [
    { name: "expenses.csv", bytes: text.encode(expenseCsv(report)) },
  ];

  const manifest: string[] = ["Ref No.,Property,Date,Amount,PDF,Page,Receipt file"];

  // Pages gather per property, so each property's PDF can be written once its
  // receipts have all been fetched.
  const pagesByProperty = new Map<string, PdfPage[]>();
  const rowsByProperty = new Map<string, string[][]>();

  for (const { ref, receipt, group } of numberedReceipts(report)) {
    const pages = pagesByProperty.get(group.propertyId) ?? [];
    pagesByProperty.set(group.propertyId, pages);
    const rows = rowsByProperty.get(group.propertyId) ?? [];
    rowsByProperty.set(group.propertyId, rows);

    let image: Uint8Array | null = null;
    let note: string | undefined;
    let fileName = "";

    if (receipt.receiptPath) {
      const { data } = await db().storage.from(RECEIPT_BUCKET).download(receipt.receiptPath);
      if (!data) {
        note = "The receipt file is missing from storage.";
        fileName = "missing from storage";
      } else {
        const bytes = new Uint8Array(await data.arrayBuffer());
        const extension = receipt.receiptPath.split(".").pop()?.toLowerCase() ?? "jpg";

        if (readJpeg(bytes)) {
          image = bytes;
          fileName = "in the PDF";
        } else {
          /*
           * Only JPEG can be placed on a page without a decoder. Anything else
           * — a PDF receipt, a PNG, a HEIC the browser could not convert — is
           * kept as its own file so nothing is lost, and its page says where
           * to find it.
           */
          fileName = `receipts/${ref}.${extension}`;
          entries.push({ name: fileName, bytes });
          note = `This receipt is a .${extension} file and could not be combined. It is in the ZIP as ${ref}.${extension}.`;
        }
      }
    } else {
      note = "No receipt file was attached to this expense.";
      fileName = "none attached";
    }

    pages.push({ caption: captionFor(ref, receipt), image, note });
    rows.push([
      ref,
      group.propertyName,
      receipt.date,
      receipt.amount.toFixed(2),
      pdfName(group),
      String(pages.length),
      fileName,
    ]);
  }

  for (const group of report.properties) {
    const pages = pagesByProperty.get(group.propertyId) ?? [];
    entries.push({ name: pdfName(group), bytes: buildPdf(pages) });
    for (const row of rowsByProperty.get(group.propertyId) ?? []) {
      manifest.push(row.map(csvCell).join(","));
    }
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

/** What each page says above the photo, so a page stands alone once printed. */
function captionFor(ref: string, receipt: ReceiptRow): string[] {
  return [
    `${ref} - ${receipt.merchant ?? "Credit card charge"}`,
    [
      usDate(receipt.date),
      formatMoney(receipt.amount),
      receipt.amount < 0 ? "Return" : null,
      receipt.category,
      `Logged by ${receipt.loggedBy}`,
    ]
      .filter(Boolean)
      .join("  -  "),
  ];
}

/**
 * One file name per property, from the property name.
 *
 * A property name can hold anything a person typed: a slash would make a path
 * inside the ZIP, and two names that differ only in punctuation would collide
 * and silently overwrite each other. Both are dealt with here rather than at
 * the point of use, so every name is decided against all the others.
 */
function pdfNamesFor(groups: ReceiptPropertyGroup[]): Map<string, string> {
  const names = new Map<string, string>();
  const taken = new Set<string>();

  for (const group of groups) {
    const base =
      group.propertyName
        .replace(/[^A-Za-z0-9 _.-]+/g, " ")
        .trim()
        .replace(/\s+/g, " ")
        .slice(0, 60)
        .trim() || "Property";

    let name = base;
    for (let n = 2; taken.has(name.toLowerCase()); n += 1) name = `${base} (${n})`;

    taken.add(name.toLowerCase());
    names.set(group.propertyId, `receipts/${name}.pdf`);
  }

  return names;
}

function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
