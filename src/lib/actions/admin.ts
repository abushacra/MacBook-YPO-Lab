"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { RATE_SLOTS, TECHNICIAN_KINDS } from "@/lib/constants";
import {
  type FormState,
  checkbox,
  optionalText,
  text,
  toFieldErrors,
} from "@/lib/actions/shared";

function refreshAdminViews(): void {
  revalidatePath("/admin");
  revalidatePath("/calls/new");
  revalidatePath("/expenses/new");
}


type ParsedRate = { label: string; amount: number; sort_order: number; is_primary: boolean };

/**
 * Reads the rate rows off a form. A row counts only when it has both a label
 * and a usable amount, so blank slots — including an unused custom tier — are
 * simply skipped rather than saved as zeroes.
 */
function parseRates(formData: FormData): ParsedRate[] {
  const rates: ParsedRate[] = [];

  for (let slot = 0; slot < RATE_SLOTS; slot += 1) {
    const label = text(formData, `rate_label_${slot}`);
    const raw = text(formData, `rate_amount_${slot}`).replace(/[$,\s]/g, "");
    if (!label || raw === "") continue;

    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount < 0 || amount > 1_000_000) continue;

    rates.push({
      label: label.slice(0, 80),
      amount: Math.round(amount * 100) / 100,
      sort_order: slot,
      is_primary: false,
    });
  }

  // Exactly one tier prices this engineer's calls. The admin picks it; if their
  // pick has no amount, the first filled tier stands in so an engineer is never
  // left unpriced.
  const chosenSlot = Number(text(formData, "primary_slot"));
  const chosen = rates.find((rate) => rate.sort_order === chosenSlot) ?? rates[0];
  if (chosen) chosen.is_primary = true;

  return rates;
}

const propertySchema = z.object({
  name: z.string().min(1, "Enter a property name.").max(120, "That name is too long."),
});

export async function addProperty(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();

  const parsed = propertySchema.safeParse({ name: text(formData, "name") });
  if (!parsed.success) {
    return { error: "Check the form.", fieldErrors: toFieldErrors(parsed.error) };
  }

  const { error } = await db()
    .from("properties")
    .insert({ name: parsed.data.name, address: optionalText(formData, "address") });

  if (error) {
    return {
      error:
        error.code === "23505"
          ? "A property with that name already exists."
          : "Could not add the property.",
    };
  }

  refreshAdminViews();
  return { ok: true };
}

const spaceSchema = z.object({
  property_id: z.uuid("Pick a property."),
  name: z.string().min(1, "Enter a space name.").max(120, "That name is too long."),
});

export async function addSpace(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();

  const parsed = spaceSchema.safeParse({
    property_id: text(formData, "property_id"),
    name: text(formData, "name"),
  });
  if (!parsed.success) {
    return { error: "Check the form.", fieldErrors: toFieldErrors(parsed.error) };
  }

  const { error } = await db()
    .from("spaces")
    .insert({ property_id: parsed.data.property_id, name: parsed.data.name });

  if (error) {
    return {
      error:
        error.code === "23505"
          ? "That space already exists on this property."
          : "Could not add the space.",
    };
  }

  refreshAdminViews();
  return { ok: true };
}

const technicianSchema = z.object({
  name: z.string().min(1, "Enter a name.").max(120, "That name is too long."),
  kind: z.enum(TECHNICIAN_KINDS, { message: "Choose in-house or vendor." }),
});

export async function addTechnician(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();

  const parsed = technicianSchema.safeParse({
    name: text(formData, "name"),
    kind: text(formData, "kind"),
  });
  if (!parsed.success) {
    return { error: "Check the form.", fieldErrors: toFieldErrors(parsed.error) };
  }

  // No PIN is set here: the person picks their own the first time they open
  // the app, so nobody has to hand out a starter PIN.
  const { data: created, error } = await db()
    .from("technicians")
    .insert({
      name: parsed.data.name,
      kind: parsed.data.kind,
      company: optionalText(formData, "company"),
      is_admin: checkbox(formData, "is_admin"),
      // Only in-house engineers can be chiefs; the database enforces this too.
      is_chief: parsed.data.kind === "in_house" && checkbox(formData, "is_chief"),
      chief_id: chiefIdFrom(formData),
    })
    .select("id")
    .single();

  if (error || !created) {
    return {
      error:
        error?.code === "23505"
          ? "Someone with that name is already on the list."
          : error?.message?.includes("chief")
            ? "Pick a chief engineer from the list, or leave it blank."
            : "Could not add the person.",
    };
  }

  // Rates are for in-house engineers, who are paid per call. Vendors quote
  // their own amount on each call instead.
  if (parsed.data.kind === "in_house") {
    const rates = parseRates(formData);
    if (rates.length > 0) {
      await db()
        .from("technician_rates")
        .insert(rates.map((rate) => ({ ...rate, technician_id: created.id })));
    }
  }

  refreshAdminViews();
  revalidatePath("/login");
  return { ok: true };
}

function idFrom(formData: FormData): string | null {
  const id = text(formData, "id");
  return z.uuid().safeParse(id).success ? id : null;
}

export async function setPropertyActive(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = idFrom(formData);
  if (!id) return;

  await db()
    .from("properties")
    .update({ active: text(formData, "active") === "true" })
    .eq("id", id);
  refreshAdminViews();
}

export async function setSpaceActive(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = idFrom(formData);
  if (!id) return;

  await db()
    .from("spaces")
    .update({ active: text(formData, "active") === "true" })
    .eq("id", id);
  refreshAdminViews();
}

/** Reads an optional "reports to" selection. */
function chiefIdFrom(formData: FormData): string | null {
  const value = text(formData, "chief_id");
  return value && z.uuid().safeParse(value).success ? value : null;
}

/**
 * Tags or untags someone as a chief engineer. The database refuses to untag a
 * chief who still has people reporting to them, which surfaces here as a
 * no-op rather than orphaning a team.
 */
export async function setTechnicianChief(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = idFrom(formData);
  if (!id) return;

  const { error } = await db()
    .from("technicians")
    .update({ is_chief: text(formData, "is_chief") === "true" })
    .eq("id", id);

  if (!error) {
    refreshAdminViews();
    revalidatePath("/calls");
  }
}

/** Puts someone under a chief engineer, or clears their reporting line. */
export async function assignChief(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = idFrom(formData);
  if (!id) return;

  const chiefId = chiefIdFrom(formData);
  if (chiefId === id) return;

  await db().from("technicians").update({ chief_id: chiefId }).eq("id", id);
  refreshAdminViews();
}

export async function setTechnicianActive(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = idFrom(formData);
  // Deactivating yourself would lock you out of Admin, so it is not offered.
  if (!id || id === admin.id) return;

  await db()
    .from("technicians")
    .update({ active: text(formData, "active") === "true" })
    .eq("id", id);
  refreshAdminViews();
  revalidatePath("/login");
}

export async function setTechnicianAdmin(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = idFrom(formData);
  if (!id || id === admin.id) return;

  await db()
    .from("technicians")
    .update({ is_admin: text(formData, "is_admin") === "true" })
    .eq("id", id);
  refreshAdminViews();
}

/**
 * Removes a property outright, along with its spaces. Only possible while no
 * service call or receipt references it — those rows are the company's record
 * of work done and money spent, and the database blocks the delete rather than
 * cascading into them. Properties that have been used are retired instead.
 */
export async function deleteProperty(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = idFrom(formData);
  if (!id) return;

  const { data: usage } = await db()
    .from("property_usage")
    .select("service_call_count, expense_count")
    .eq("property_id", id)
    .maybeSingle();

  if ((usage?.service_call_count ?? 0) > 0 || (usage?.expense_count ?? 0) > 0) return;

  await db().from("properties").delete().eq("id", id);
  refreshAdminViews();
}

/**
 * Removes a space. Always safe: service calls keep the space they recorded as
 * a plain label, so deleting the entry only takes it off the suggestion list.
 */
export async function deleteSpace(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = idFrom(formData);
  if (!id) return;

  await db().from("spaces").delete().eq("id", id);
  refreshAdminViews();
}

/**
 * Replaces an engineer's rate tiers wholesale. Past service calls keep the
 * label and amount they were logged with, so re-pricing never rewrites what
 * someone has already been paid for.
 */
export async function saveTechnicianRates(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();

  const id = idFrom(formData);
  if (!id) return { error: "Unknown person." };

  const { data: technician } = await db()
    .from("technicians")
    .select("id, kind")
    .eq("id", id)
    .maybeSingle();

  if (!technician) return { error: "Unknown person." };
  if (technician.kind !== "in_house") {
    return { error: "Rates apply to in-house engineers. Vendors quote each call." };
  }

  const rates = parseRates(formData);

  await db().from("technician_rates").delete().eq("technician_id", id);
  if (rates.length > 0) {
    const { error } = await db()
      .from("technician_rates")
      .insert(rates.map((rate) => ({ ...rate, technician_id: id })));
    if (error) return { error: "Could not save the rates." };
  }

  refreshAdminViews();
  return { ok: true };
}

export async function resetTechnicianPin(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = idFrom(formData);
  if (!id) return;

  // Clearing the hash sends them back through "choose a PIN" on next sign-in.
  await db()
    .from("technicians")
    .update({ pin_hash: null, failed_pin_attempts: 0, locked_until: null })
    .eq("id", id);
  refreshAdminViews();
}
