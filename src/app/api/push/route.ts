import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/supabase";

type SubscriptionBody = {
  endpoint?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown };
};

/** Records this device so alerts can reach it. */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as SubscriptionBody;
  const endpoint = body.endpoint;
  const p256dh = body.keys?.p256dh;
  const auth = body.keys?.auth;

  if (typeof endpoint !== "string" || typeof p256dh !== "string" || typeof auth !== "string") {
    return NextResponse.json({ error: "Incomplete subscription." }, { status: 400 });
  }

  // The endpoint is unique per device, so re-subscribing on the same phone
  // moves the row to whoever is signed in rather than piling up duplicates.
  const { error } = await db()
    .from("push_subscriptions")
    .upsert({ technician_id: user.id, endpoint, p256dh, auth }, { onConflict: "endpoint" });

  if (error) return NextResponse.json({ error: "Could not turn on alerts." }, { status: 500 });

  return NextResponse.json({ ok: true });
}

/** Forgets this device. */
export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as SubscriptionBody;
  if (typeof body.endpoint !== "string") {
    return NextResponse.json({ error: "No device given." }, { status: 400 });
  }

  await db()
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", body.endpoint)
    .eq("technician_id", user.id);

  return NextResponse.json({ ok: true });
}
