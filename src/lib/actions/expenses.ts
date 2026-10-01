"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { canLogReceipts, requireUser } from "@/lib/auth";
import { RECEIPT_BUCKET, db } from "@/lib/supabase";
import { alertOversight } from "@/lib/push";
import { formatMoney } from "@/lib/format";
import {
  type FormState,
  optionalText,
  storagePaths,
  text,
  toFieldErrors,
} from "@/lib/actions/shared";

/**
 * A return is the same amount owed back, so a typed 45.00 with Return chosen is
 * -45.00. Typing the minus sign directly works too, and choosing Return with it
 * does not flip it back to a charge.
 */
function signedAmount(value: number, isReturn: boolean): number {
  if (!Number.isFinite(value)) return Number.NaN;
  return isReturn ? -Math.abs(value) : value;
}

const schema = z.object({
  expense_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the date on the receipt."),
  property_id: z.uuid("Choose the property this charge belongs to."),
  amount: z
    .number({ message: "Enter the amount of the charge." })
    // A return is a receipt with a negative amount, so it nets off the charge it
    // reverses. Zero is still a mistake rather than a return.
    .refine((value) => value !== 0, "Enter an amount other than zero.")
    .refine((value) => Math.abs(value) <= 1_000_000, "That amount looks too large."),
});

export async function createExpense(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!canLogReceipts(user)) {
    return { error: "Only chief engineers and admins can log receipts." };
  }

  /*
   * A return is entered as a positive amount with the Return option chosen,
   * rather than by typing a minus sign — a lone "-" is easy to miss on a phone,
   * and easy to leave off. The sign is applied here.
   */
  const isReturn = text(formData, "kind") === "return";
  const rawAmount = text(formData, "amount").replace(/[$,\s]/g, "");
  const parsed = schema.safeParse({
    expense_date: text(formData, "expense_date"),
    property_id: text(formData, "property_id"),
    amount: rawAmount === "" ? Number.NaN : signedAmount(Number(rawAmount), isReturn),
  });

  if (!parsed.success) {
    return {
      error: "Fill in the highlighted fields.",
      fieldErrors: toFieldErrors(parsed.error),
    };
  }

  const input = parsed.data;

  // Optional link back to a call the technician logged, so a reimbursement
  // can be read next to the work that caused it.
  const serviceCallId = text(formData, "service_call_id");
  let linkedCallId: string | null = null;
  if (serviceCallId) {
    const { data: call } = await db()
      .from("service_calls")
      .select("id")
      .eq("id", serviceCallId)
      .eq("technician_id", user.id)
      .maybeSingle();
    linkedCallId = call?.id ?? null;
  }

  const { data: property } = await db()
    .from("properties")
    .select("id, name")
    .eq("id", input.property_id)
    .maybeSingle();

  if (!property) {
    return { error: "That property no longer exists.", fieldErrors: { property_id: "Pick again." } };
  }

  const { data: created, error } = await db()
    .from("expenses")
    .insert({
      technician_id: user.id,
      service_call_id: linkedCallId,
      property_id: property.id,
      property_label: property.name,
      expense_date: input.expense_date,
      // Rounded here so the stored value matches the numeric(10,2) column
      // exactly instead of being silently truncated by Postgres.
      amount: Math.round(input.amount * 100) / 100,
      merchant: optionalText(formData, "merchant"),
      category: optionalText(formData, "category"),
      notes: optionalText(formData, "notes"),
      receipt_path: storagePaths(formData, "receipt")[0] ?? null,
    })
    .select("id")
    .single();

  if (error || !created) {
    return { error: "Could not save the receipt. Check your signal and try again." };
  }

  await alertOversight({
    title: input.amount < 0 ? "Return logged" : "Receipt logged",
    body: `${user.name} · ${formatMoney(input.amount)} · ${property.name}`,
    url: "/expenses",
    actorId: user.id,
    chiefId: user.chief_id,
  });

  revalidatePath("/");
  revalidatePath("/expenses");
  redirect("/expenses?saved=1");
}

/**
 * Removes a receipt, for an admin or a chief.
 *
 * The same people who may log receipts may delete them, with one exception: a
 * chief may only delete a receipt they logged themselves, while an admin may
 * delete any. A receipt is a financial record, so this is a correction tool for
 * a wrong amount or a duplicate, not routine housekeeping.
 *
 * The stored image or PDF goes with the row. Supabase refuses storage deletes
 * from SQL, so the Storage API is the only thing that clears it, and a failure
 * there is swallowed: an orphaned file is far better than a receipt that will
 * not delete. The linked service call is untouched — the work happened whatever
 * became of the receipt.
 */
export async function deleteExpense(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!canLogReceipts(user)) return;

  const id = text(formData, "id");
  if (!z.uuid().safeParse(id).success) return;

  const { data: expense } = await db()
    .from("expenses")
    .select("id, technician_id, receipt_path")
    .eq("id", id)
    .maybeSingle();

  if (!expense) return;
  if (!user.is_admin && expense.technician_id !== user.id) return;

  if (expense.receipt_path) {
    await db().storage.from(RECEIPT_BUCKET).remove([expense.receipt_path]);
  }

  await db().from("expenses").delete().eq("id", id);

  revalidatePath("/");
  revalidatePath("/expenses");
  redirect("/expenses?deleted=1");
}
