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

const schema = z.object({
  call_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the date of the call."),
  hours_type: z.enum(HOURS_TYPES, { message: "Choose regular or after hours." }),
  call_type: z.enum(CALL_TYPES, { message: "Choose emergency or scheduled." }),
  property_id: z.uuid("Choose a property."),
  space_id: z.uuid("Choose a space."),
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
    space_id: text(formData, "space_id"),
  });

  if (!parsed.success) {
    return {
      error: "Fill in the highlighted fields.",
      fieldErrors: toFieldErrors(parsed.error),
    };
  }

  const input = parsed.data;

  // Confirm the space really belongs to the chosen property before trusting
  // ids that arrived from the browser.
  const [{ data: property }, { data: space }] = await Promise.all([
    db().from("properties").select("id, name").eq("id", input.property_id).maybeSingle(),
    db().from("spaces").select("id, name, property_id").eq("id", input.space_id).maybeSingle(),
  ]);

  if (!property) {
    return { error: "That property no longer exists.", fieldErrors: { property_id: "Pick again." } };
  }
  if (!space || space.property_id !== property.id) {
    return {
      error: "That space does not belong to the chosen property.",
      fieldErrors: { space_id: "Pick again." },
    };
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
      space_id: space.id,
      space_label: space.name,
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
