import { NextResponse } from "next/server";

import { env } from "@/lib/env";
import { runRecurringSchedules } from "@/lib/recurring";
import { todayISO } from "@/lib/format";

/**
 * Creates any recurring service call that has come due. Run daily by Vercel
 * Cron — see `vercel.json`.
 *
 * Daily rather than fortnightly on purpose: the job catches up from each
 * schedule's start date, so a day it does not run is filled in on the next
 * one rather than losing an occurrence. Writing the same occurrence twice is
 * refused by the database, so running often is harmless.
 *
 * Vercel sends `Authorization: Bearer $CRON_SECRET` on a cron request. Without
 * that header this route does nothing, so the URL being public does not let
 * anyone create paid work.
 */
export async function POST(request: Request) {
  /*
   * Read inside the guard so a missing secret is a clear 503 rather than an
   * unhandled crash — and so it still refuses the request either way. Never
   * falling open is the point: this route creates paid work.
   */
  let secret: string;
  try {
    secret = env.cronSecret;
  } catch {
    console.error("CRON_SECRET is not set, so recurring service calls cannot run");
    return NextResponse.json({ error: "Scheduling is not configured." }, { status: 503 });
  }

  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  }

  try {
    const runs = await runRecurringSchedules(todayISO());
    const created = runs.reduce((total, run) => total + run.callsCreated, 0);
    return NextResponse.json({ ok: true, created, runs });
  } catch (error) {
    // Logged and reported rather than swallowed: a schedule that silently
    // stops creating work is worse than one that fails loudly.
    console.error("recurring service calls failed", error);
    return NextResponse.json({ error: "Run failed." }, { status: 500 });
  }
}

/** Vercel Cron issues a GET, so both verbs run the same job. */
export const GET = POST;
