import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { PHOTO_BUCKET, RECEIPT_BUCKET, db, isBucket } from "@/lib/supabase";

/**
 * Photos and receipts upload here the moment they are picked, before the form
 * is submitted, so a slow cellular upload never blocks the Save button. Files
 * go through a Route Handler rather than a Server Action because Server
 * Actions cap request bodies at 1MB.
 */

// Vercel rejects request bodies over 4.5MB before they reach this handler;
// the browser caps at 4MB so the failure is a message, not a dead request.
const MAX_BYTES = 4.5 * 1024 * 1024;

const ALLOWED: Record<string, readonly string[]> = {
  [PHOTO_BUCKET]: [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
    "application/pdf",
  ],
  [RECEIPT_BUCKET]: [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
    "application/pdf",
  ],
};

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "application/pdf": "pdf",
};

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const form = await request.formData();
  const bucket = form.get("bucket");
  const file = form.get("file");

  if (typeof bucket !== "string" || !isBucket(bucket)) {
    return NextResponse.json({ error: "Unknown upload target." }, { status: 400 });
  }
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "No file received." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "That file is larger than 4MB." }, { status: 413 });
  }
  if (!ALLOWED[bucket].includes(file.type)) {
    return NextResponse.json(
      { error: "Use a photo (JPG, PNG, HEIC) or a PDF." },
      { status: 415 },
    );
  }

  const path = `${user.id}/${randomUUID()}.${EXTENSIONS[file.type]}`;
  const { error } = await db()
    .storage.from(bucket)
    .upload(path, await file.arrayBuffer(), { contentType: file.type, upsert: false });

  if (error) {
    return NextResponse.json({ error: "Upload failed. Try again." }, { status: 502 });
  }

  return NextResponse.json({ path });
}
