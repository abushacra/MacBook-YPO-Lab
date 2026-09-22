"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { CALL_TYPES, HOURS_TYPES } from "@/lib/constants";
import {
  type FormState,
  checkbox,
  optionalText,
  storagePaths,
  text,
  toFieldErrors,
} from "@/lib/actions/shared";

const MAX_SPACE_LENGTH = 120;

const schema = z.object({
  call_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the date of the call."),
  hours_type: z.enum(HOURS_TYPES, { message: "Choose regular or after hours." }),
  call_type: z.enum(CALL_TYPES, { message: "Choose emergency or scheduled." }),
  property_id: z.uuid("Choose a property."),
  space: z.string().max(MAX_SPACE_LENGTH, "That space name is too long."),
});

export async function createServiceCall(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();

  const parsed = schema.safeParse({
    call_date: text(formData, "call_date"),
    hours_type: text(formData, "hours_type"),
    call_type: text(formData, "call_type"),
    property_id: text(formData, "property_id"),
    space: text(formData, "space"),
  });

  if (!parsed.success) {
    return {
      error: "Fill in the highlighted fields.",
      fieldErrors: toFieldErrors(parsed.error),
    };
  }

  const input = parsed.data;

  const { data: property } = await db()
    .from("properties")
    .select("id, name")
    .eq("id", input.property_id)
    .maybeSingle();

  if (!property) {
    return { error: "That property no longer exists.", fieldErrors: { property_id: "Pick again." } };
  }

  // Space is optional and can be typed free-hand. When what was typed matches
  // one of the property's managed spaces, link to it and store that spelling,
  // so picking "suite 210" off the list and typing it by hand end up as the
  // same row. Anything else is kept verbatim as a label with no link.
  let spaceId: string | null = null;
  let spaceLabel: string | null = null;

  if (input.space) {
    const { data: spaces } = await db()
      .from("spaces")
      .select("id, name")
      .eq("property_id", property.id);

    const match = (spaces ?? []).find(
      (candidate) => candidate.name.toLowerCase() === input.space.toLowerCase(),
    );

    spaceId = match?.id ?? null;
    spaceLabel = match?.name ?? input.space;
  }

  // What the call is worth, resolved by who is logging it: an admin-set rate
  // for in-house engineers, the amount they agreed for vendors.
  let rateId: string | null = null;
  let billedLabel: string | null = null;
  let billedAmount: number | null = null;

  if (user.kind === "in_house") {
    // Priced from the tier an admin marked active for this engineer. Nothing
    // about the rate comes from the form, so an engineer can neither see their
    // rate nor influence what a call is billed at.
    const { data: rate } = await db()
      .from("technician_rates")
      .select("id, label, amount")
      .eq("technician_id", user.id)
      .eq("is_primary", true)
      .maybeSingle();

    if (rate) {
      rateId = rate.id;
      billedLabel = rate.label;
      billedAmount = rate.amount;
    }
  } else {
    const raw = text(formData, "billed_amount").replace(/[$,\s]/g, "");
    if (raw !== "") {
      const amount = Number(raw);
      if (!Number.isFinite(amount) || amount < 0 || amount > 1_000_000) {
        return {
          error: "Check the amount you are charging.",
          fieldErrors: { billed_amount: "Enter a dollar amount." },
        };
      }
      billedLabel = "Agreed amount";
      billedAmount = Math.round(amount * 100) / 100;
    }
  }

  const followUpNeeded = checkbox(formData, "follow_up_needed");

  const { data: created, error } = await db()
    .from("service_calls")
    .insert({
      technician_id: user.id,
      call_date: input.call_date,
      hours_type: input.hours_type,
      call_type: input.call_type,
      property_id: property.id,
      property_label: property.name,
      space_id: spaceId,
      space_label: spaceLabel,
      rate_id: rateId,
      billed_label: billedLabel,
      billed_amount: billedAmount,
      description: optionalText(formData, "description"),
      follow_up_needed: followUpNeeded,
      follow_up_notes: followUpNeeded ? optionalText(formData, "follow_up_notes") : null,
    })
    .select("id")
    .single();

  if (error || !created) {
    return { error: "Could not save the service call. Check your signal and try again." };
  }

  const photos = storagePaths(formData, "photos");
  if (photos.length > 0) {
    await db()
      .from("service_call_photos")
      .insert(photos.map((storage_path) => ({ service_call_id: created.id, storage_path })));
  }

  revalidatePath("/");
  revalidatePath("/calls");
  redirect(`/calls/${created.id}?saved=1`);
}

export async function setFollowUpResolved(formData: FormData): Promise<void> {
  await requireUser();

  const id = text(formData, "id");
  if (!z.uuid().safeParse(id).success) return;

  await db().from("service_calls").update({ follow_up_needed: false }).eq("id", id);

  revalidatePath("/");
  revalidatePath("/calls");
  revalidatePath(`/calls/${id}`);
}
