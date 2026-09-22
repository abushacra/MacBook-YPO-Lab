"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { db } from "@/lib/supabase";
import { endSession, startSession } from "@/lib/session";
import { PIN_LENGTH, hashPin, isValidPinFormat, pinWeakness, verifyPin } from "@/lib/pin";
import { type FormState, text } from "@/lib/actions/shared";

const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

const schema = z.object({
  technicianId: z.uuid("Pick your name from the list."),
  pin: z.string().regex(new RegExp(`^\\d{${PIN_LENGTH}}$`), `Enter your ${PIN_LENGTH}-digit PIN.`),
});

export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = schema.safeParse({
    technicianId: text(formData, "technicianId"),
    pin: text(formData, "pin"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check your PIN and try again." };
  }

  const { technicianId, pin } = parsed.data;
  const confirmPin = text(formData, "confirmPin");

  const { data: technician } = await db()
    .from("technicians")
    .select("id, name, is_admin, pin_hash, active, failed_pin_attempts, locked_until")
    .eq("id", technicianId)
    .maybeSingle();

  if (!technician || !technician.active) {
    return { error: "That name is no longer active. Ask your manager to re-enable it." };
  }

  if (technician.locked_until && new Date(technician.locked_until) > new Date()) {
    const minutes = Math.max(
      1,
      Math.ceil((new Date(technician.locked_until).getTime() - Date.now()) / 60000),
    );
    return { error: `Too many wrong PINs. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.` };
  }

  // First sign-in: the technician chooses their own PIN rather than being
  // issued one, so no starter PIN has to be passed around.
  if (!technician.pin_hash) {
    if (!isValidPinFormat(confirmPin) || confirmPin !== pin) {
      return { error: "The two PINs did not match." };
    }
    const weakness = pinWeakness(pin);
    if (weakness) return { error: weakness };

    await db()
      .from("technicians")
      .update({ pin_hash: await hashPin(pin), failed_pin_attempts: 0, locked_until: null })
      .eq("id", technician.id);

    await startSession(technician);
    redirect("/");
  }

  if (!(await verifyPin(pin, technician.pin_hash))) {
    const attempts = technician.failed_pin_attempts + 1;
    const locked = attempts >= MAX_ATTEMPTS;

    await db()
      .from("technicians")
      .update({
        failed_pin_attempts: locked ? 0 : attempts,
        locked_until: locked
          ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000).toISOString()
          : null,
      })
      .eq("id", technician.id);

    return {
      error: locked
        ? `Too many wrong PINs. Try again in ${LOCKOUT_MINUTES} minutes.`
        : `That PIN didn't match. ${MAX_ATTEMPTS - attempts} ${
            MAX_ATTEMPTS - attempts === 1 ? "try" : "tries"
          } left.`,
    };
  }

  if (technician.failed_pin_attempts > 0 || technician.locked_until) {
    await db()
      .from("technicians")
      .update({ failed_pin_attempts: 0, locked_until: null })
      .eq("id", technician.id);
  }

  await startSession(technician);
  redirect("/");
}

export async function signOut(): Promise<void> {
  await endSession();
  redirect("/login");
}
