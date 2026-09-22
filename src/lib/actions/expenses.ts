"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/supabase";
import {
  type FormState,
  optionalText,
  storagePaths,
  text,
  toFieldErrors,
} from "@/lib/actions/shared";

const schema = z.object({
  expense_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the date on the receipt."),
  property_id: z.uuid("Choose the property this charge belongs to."),
  amount: z
    .number({ message: "Enter the amount of the charge." })
    .positive("Enter an amount greater than zero.")
    .max(1_000_000, "That amount looks too large."),
});

export async function createExpense(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();

  const rawAmount = text(formData, "amount").replace(/[$,\s]/g, "");
  const parsed = schema.safeParse({
    expense_date: text(formData, "expense_date"),
    property_id: text(formData, "property_id"),
    amount: rawAmount === "" ? Number.NaN : Number(rawAmount),
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

  revalidatePath("/");
  revalidatePath("/expenses");
  redirect("/expenses?saved=1");
}
