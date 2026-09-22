"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { TECHNICIAN_KINDS } from "@/lib/constants";
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
  const { error } = await db().from("technicians").insert({
    name: parsed.data.name,
    kind: parsed.data.kind,
    company: optionalText(formData, "company"),
    is_admin: checkbox(formData, "is_admin"),
  });

  if (error) {
    return {
      error:
        error.code === "23505"
          ? "Someone with that name is already on the list."
          : "Could not add the person.",
    };
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
