"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdmin, requireUser } from "@/lib/auth";
import { PHOTO_BUCKET, db } from "@/lib/supabase";
import { alertOversight } from "@/lib/push";
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
  hours_type: z.enum(HOURS_TYPES, { message: "Choose a Shift Charge." }),
  call_type: z.enum(CALL_TYPES, { message: "Choose emergency or scheduled." }),
  property_id: z.uuid("Choose a property."),
  space: z.string().max(MAX_SPACE_LENGTH, "That space name is too long."),
  property_id_2: z.union([z.uuid(), z.literal("")]),
  space_2: z.string().max(MAX_SPACE_LENGTH, "That space name is too long."),
});

type ResolvedLocation = {
  propertyId: string;
  propertyLabel: string;
  spaceId: string | null;
  spaceLabel: string | null;
};

/**
 * Turns a property id and a typed space into what gets stored.
 *
 * Space is optional and free-text. When it matches one of that property's
 * managed spaces, ignoring case, it is linked and stored under the list's
 * spelling — so typing "suite 210" and tapping *Suite 210* land on the same
 * record. Anything else is kept verbatim as a label with no link.
 */
async function resolveLocation(
  propertyId: string,
  typedSpace: string,
): Promise<ResolvedLocation | null> {
  const { data: property } = await db()
    .from("properties")
    .select("id, name")
    .eq("id", propertyId)
    .maybeSingle();

  if (!property) return null;

  let spaceId: string | null = null;
  let spaceLabel: string | null = null;

  if (typedSpace) {
    const { data: spaces } = await db()
      .from("spaces")
      .select("id, name")
      .eq("property_id", property.id);

    const match = (spaces ?? []).find(
      (candidate) => candidate.name.toLowerCase() === typedSpace.toLowerCase(),
    );

    spaceId = match?.id ?? null;
    spaceLabel = match?.name ?? typedSpace;
  }

  return { propertyId: property.id, propertyLabel: property.name, spaceId, spaceLabel };
}

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
    property_id_2: text(formData, "property_id_2"),
    space_2: text(formData, "space_2"),
  });

  if (!parsed.success) {
    return {
      error: "Fill in the highlighted fields.",
      fieldErrors: toFieldErrors(parsed.error),
    };
  }

  const input = parsed.data;

  const primary = await resolveLocation(input.property_id, input.space);
  if (!primary) {
    return { error: "That property no longer exists.", fieldErrors: { property_id: "Pick again." } };
  }

  // One call can cover two properties, for an engineer who works both in a day.
  let secondary: ResolvedLocation | null = null;
  if (input.property_id_2) {
    if (input.property_id_2 === input.property_id) {
      return {
        error: "Pick a different second property.",
        fieldErrors: { property_id_2: "Already chosen above." },
      };
    }

    secondary = await resolveLocation(input.property_id_2, input.space_2);
    if (!secondary) {
      return {
        error: "That second property no longer exists.",
        fieldErrors: { property_id_2: "Pick again." },
      };
    }
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
      property_id: primary.propertyId,
      property_label: primary.propertyLabel,
      space_id: primary.spaceId,
      space_label: primary.spaceLabel,
      property_id_2: secondary?.propertyId ?? null,
      property_label_2: secondary?.propertyLabel ?? null,
      space_id_2: secondary?.spaceId ?? null,
      space_label_2: secondary?.spaceLabel ?? null,
      rate_id: rateId,
      billed_label: billedLabel,
      billed_amount: billedAmount,
      // Snapshotted so moving someone to a new chief later never pulls work
      // out of the old chief's queue.
      routed_to_chief_id: user.chief_id,
      description: optionalText(formData, "description"),
      follow_up_needed: followUpNeeded,
      follow_up_notes: followUpNeeded ? optionalText(formData, "follow_up_notes") : null,
    })
    .select("id")
    .single();

  if (error || !created) {
    return { error: "Could not save the maintenance shift. Check your signal and try again." };
  }

  const photos = storagePaths(formData, "photos");
  if (photos.length > 0) {
    await db()
      .from("service_call_photos")
      .insert(photos.map((storage_path) => ({ service_call_id: created.id, storage_path })));
  }

  await alertOversight({
    title: "Maintenance shift logged",
    body: `${user.name} · ${primary.propertyLabel}${
      primary.spaceLabel ? ` · ${primary.spaceLabel}` : ""
    }`,
    url: `/calls/${created.id}`,
    actorId: user.id,
    chiefId: user.chief_id,
  });

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

/**
 * A chief approves or sends back a call from their team. Admins can act on any
 * call, which keeps things moving when a chief is away or when the engineer
 * has no chief assigned yet.
 */
export async function reviewServiceCall(formData: FormData): Promise<void> {
  const user = await requireUser();

  const id = text(formData, "id");
  const decision = text(formData, "decision");
  if (!z.uuid().safeParse(id).success) return;
  if (decision !== "approved" && decision !== "rejected") return;

  const { data: call } = await db()
    .from("service_calls")
    .select("id, technician_id, routed_to_chief_id")
    .eq("id", id)
    .maybeSingle();

  if (!call) return;

  // Admins can sign off anything, including shifts they logged themselves —
  // they are the backstop for shifts whose author has no chief. A chief is
  // still held to the separation: their own shifts go to their own chief.
  const isRoutedChief =
    user.is_chief && call.routed_to_chief_id === user.id && call.technician_id !== user.id;
  if (!isRoutedChief && !user.is_admin) return;

  await db()
    .from("service_calls")
    .update({
      approval_status: decision,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      review_note: optionalText(formData, "review_note"),
    })
    .eq("id", id);

  revalidatePath("/");
  revalidatePath("/calls");
  revalidatePath(`/calls/${id}`);
}

/**
 * Removes a maintenance shift outright, admin only.
 *
 * The shift's photo and PDF rows cascade with it, and their files are taken out
 * of storage here — Supabase refuses storage deletes from SQL, so the Storage
 * API is the only thing that clears them. A receipt logged against the shift is
 * kept and simply unlinked: that is a financial record assigned to a property,
 * and it should not disappear because the shift it referenced did.
 */
export async function deleteServiceCall(formData: FormData): Promise<void> {
  await requireAdmin();

  const id = text(formData, "id");
  if (!z.uuid().safeParse(id).success) return;

  const { data: attachments } = await db()
    .from("service_call_photos")
    .select("storage_path")
    .eq("service_call_id", id);

  const paths = (attachments ?? []).map((row) => row.storage_path);
  if (paths.length > 0) {
    await db().storage.from(PHOTO_BUCKET).remove(paths);
  }

  const { error } = await db().from("service_calls").delete().eq("id", id);
  if (error) return;

  revalidatePath("/");
  revalidatePath("/calls");
  revalidatePath("/expenses");
  redirect("/calls?deleted=1");
}
