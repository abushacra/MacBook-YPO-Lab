import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { SignInForm, type SignInTechnician } from "@/components/sign-in-form";

export const metadata = { title: "Sign in · Kapa Service Log" };

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");

  const { data } = await db()
    .from("technicians")
    .select("id, name, company, kind, pin_hash")
    .eq("active", true)
    /*
     * A billing-only record exists to be paid, never to sign in. This list
     * lets anyone claim a person who has not set a PIN yet, so leaving one
     * here would hand out an account — and name it on the sign-in screen.
     */
    .eq("billing_only", false)
    .order("name");

  const technicians: SignInTechnician[] = (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    company: row.company,
    kind: row.kind,
    hasPin: row.pin_hash !== null,
  }));

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 py-8">
      <div className="mb-8 text-center">
        <span
          aria-hidden="true"
          className="mx-auto mb-3 flex size-14 items-center justify-center rounded-2xl bg-brand-800 text-2xl font-black text-white"
        >
          K
        </span>
        <h1 className="text-xl font-bold">Kapa Service Log</h1>
        <p className="mt-1 text-sm text-muted">Tap your name to sign in.</p>
      </div>

      <SignInForm technicians={technicians} />
    </main>
  );
}
