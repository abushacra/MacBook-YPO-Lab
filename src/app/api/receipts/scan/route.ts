import { NextResponse } from "next/server";

import { canLogReceipts, getCurrentUser } from "@/lib/auth";
import { RECEIPT_BUCKET, db } from "@/lib/supabase";
import { scanReceipt, scanningAvailable } from "@/lib/receipt-scan";

/**
 * Reads a receipt that was already uploaded and returns the form fields it
 * suggests. The upload happens the moment the file is picked, so by the time
 * the chief looks at the amount the image is on the server and this only needs
 * the storage path.
 *
 * Nothing is saved here. The answer pre-fills the form; the chief still
 * confirms it and presses Save.
 */

/** Media types by extension, since the uploader names every file itself. */
const MEDIA_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  pdf: "application/pdf",
};

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  if (!canLogReceipts(user)) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }
  if (!scanningAvailable()) {
    return NextResponse.json({ error: "Receipt reading is not set up." }, { status: 503 });
  }

  let path = "";
  try {
    const body = (await request.json()) as { path?: unknown };
    if (typeof body.path === "string") path = body.path;
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  // Uploads land at `${user.id}/${uuid}.${ext}`, so a path outside the
  // caller's own folder is someone reaching for a receipt that isn't theirs.
  if (!path || !path.startsWith(`${user.id}/`) || path.includes("..")) {
    return NextResponse.json({ error: "Unknown file." }, { status: 400 });
  }

  const mediaType = MEDIA_TYPES[path.split(".").pop()?.toLowerCase() ?? ""];
  if (!mediaType) {
    return NextResponse.json(
      { error: "That file type can't be read. Use a JPG, PNG or PDF." },
      { status: 415 },
    );
  }

  const { data, error } = await db().storage.from(RECEIPT_BUCKET).download(path);
  if (error || !data) {
    return NextResponse.json({ error: "Receipt not found." }, { status: 404 });
  }

  const result = await scanReceipt(new Uint8Array(await data.arrayBuffer()), mediaType);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 502 });
  }

  return NextResponse.json({ fields: result.fields });
}
