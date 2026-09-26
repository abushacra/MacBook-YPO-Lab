"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { payRunShiftIds } from "@/lib/payrun";
import { text } from "@/lib/actions/shared";

/**
 * Stamps every shift in the window as billed, so a later pay run over
 * overlapping dates cannot pay the same work twice. Run this once the bills
 * are actually in QuickBooks.
 */
export async function markPayRunBilled(formData: FormData): Promise<void> {
  await requireAdmin();

  const from = text(formData, "from");
  const to = text(formData, "to");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return;

  const ids = await payRunShiftIds(from, to);
  if (ids.length === 0) return;

  await db()
    .from("service_calls")
    .update({ billed_at: new Date().toISOString(), billed_reference: `Pay run ${from} to ${to}` })
    .in("id", ids);

  revalidatePath("/payrun");
  revalidatePath("/calls");
}
