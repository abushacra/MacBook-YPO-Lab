import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { db, isBucket } from "@/lib/supabase";

/**
 * Both storage buckets are private. Signed-in staff reach a file through here,
 * which mints a short-lived signed URL and redirects to it, so no durable
 * public link to a receipt or job photo ever exists.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const bucket = searchParams.get("bucket") ?? "";
  const path = searchParams.get("path") ?? "";

  if (!isBucket(bucket) || !path) {
    return NextResponse.json({ error: "Unknown file." }, { status: 400 });
  }

  const { data, error } = await db().storage.from(bucket).createSignedUrl(path, 300);
  if (error || !data) {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }

  return NextResponse.redirect(data.signedUrl);
}
