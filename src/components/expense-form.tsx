"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";

import { createExpense } from "@/lib/actions/expenses";
import { EMPTY_FORM_STATE } from "@/lib/form-state";
import { EXPENSE_CATEGORIES } from "@/lib/constants";
import { deviceTodayISO } from "@/lib/format";
import { Field, FormError } from "@/components/field";
import { Segmented } from "@/components/segmented";
import { MediaUploader } from "@/components/media-uploader";
import { Spinner, SubmitButton } from "@/components/submit-button";

export type RecentCall = { id: string; label: string };

type ScanFields = {
  merchant: string | null;
  date: string | null;
  amount: number | null;
  isReturn: boolean;
  category: string | null;
  summary: string | null;
};

type Scan =
  | { status: "idle" }
  | { status: "reading" }
  | { status: "read"; filled: string[] }
  | { status: "failed"; reason: string };

export function ExpenseForm({
  properties,
  recentCalls,
  serverToday,
  scanEnabled,
}: {
  properties: { id: string; name: string }[];
  recentCalls: RecentCall[];
  serverToday: string;
  /** Whether the app is set up to read receipts. False hides the whole flow. */
  scanEnabled: boolean;
}) {
  const [state, formAction] = useActionState(createExpense, EMPTY_FORM_STATE);
  const [uploading, setUploading] = useState(false);
  const [scan, setScan] = useState<Scan>({ status: "idle" });
  const [kind, setKind] = useState("charge");

  const amountRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const merchantRef = useRef<HTMLInputElement>(null);
  const categoryRef = useRef<HTMLSelectElement>(null);
  const notesRef = useRef<HTMLTextAreaElement>(null);

  /*
   * A scan only ever fills a field the chief has left alone. Whatever they have
   * already typed wins, so a slow upload finishing late never overwrites it.
   * The date and the charge/return choice start with a value, so they need a
   * flag rather than an emptiness check.
   */
  const dateTouched = useRef(false);
  const kindTouched = useRef(false);

  useEffect(() => {
    const input = dateRef.current;
    if (input && input.value === serverToday) input.value = deviceTodayISO();
  }, [serverToday]);

  const readReceipt = useCallback(
    async (path: string) => {
      if (!scanEnabled) return;
      setScan({ status: "reading" });

      let fields: ScanFields;
      try {
        const response = await fetch("/api/receipts/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path }),
        });
        const payload = (await response.json()) as { fields?: ScanFields; error?: string };
        if (!response.ok || !payload.fields) {
          setScan({
            status: "failed",
            reason: payload.error ?? "Couldn't read that receipt. Fill the fields in by hand.",
          });
          return;
        }
        fields = payload.fields;
      } catch {
        setScan({ status: "failed", reason: "No connection. Fill the fields in by hand." });
        return;
      }

      const filled: string[] = [];

      if (fields.amount !== null && amountRef.current && amountRef.current.value.trim() === "") {
        amountRef.current.value = fields.amount.toFixed(2);
        filled.push("amount");
      }
      if (fields.date !== null && dateRef.current && !dateTouched.current) {
        dateRef.current.value = fields.date;
        filled.push("date");
      }
      if (fields.merchant !== null && merchantRef.current && merchantRef.current.value === "") {
        merchantRef.current.value = fields.merchant;
        filled.push("store");
      }
      if (fields.category !== null && categoryRef.current && categoryRef.current.value === "") {
        categoryRef.current.value = fields.category;
        filled.push("category");
      }
      if (fields.summary !== null && notesRef.current && notesRef.current.value === "") {
        notesRef.current.value = fields.summary;
        filled.push("notes");
      }
      if (fields.isReturn && !kindTouched.current) {
        setKind("return");
        filled.push("return");
      }

      setScan({ status: "read", filled });
    },
    [scanEnabled],
  );

  // Stable, so picking a file does not rebuild the uploader's upload callback.
  const handleUploaded = useCallback(
    (path: string) => {
      void readReceipt(path);
    },
    [readReceipt],
  );
  const handleRemoved = useCallback(() => setScan({ status: "idle" }), []);

  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-6">
      {/*
        * The receipt comes first because picking it is what fills the rest in.
        * It uploads the moment it is chosen, so reading it costs the chief no
        * extra step.
        */}
      <Field
        label="Receipt"
        /* The notice replaces the hint once a scan starts, so the two never
           argue with each other under the same buttons. */
        hint={
          scan.status !== "idle"
            ? undefined
            : scanEnabled
              ? "Snap it first — the amount, date and store below fill themselves in."
              : "Snap it, or pick a photo or PDF already on your phone."
        }
      >
        <MediaUploader
          name="receipt"
          bucket="receipts"
          browseLabel="Choose file"
          accept="image/*,application/pdf"
          onBusyChange={setUploading}
          onUploaded={scanEnabled ? handleUploaded : undefined}
          onRemoved={scanEnabled ? handleRemoved : undefined}
        />
        <ScanNotice scan={scan} />
      </Field>

      {/*
        * A return is chosen rather than typed as a minus sign: a lone "-" is easy
        * to miss on a phone and easy to leave off, and the amount is the same
        * either way. The action applies the sign.
        */}
      <Field label="Charge or return" required>
        <Segmented
          name="kind"
          value={kind}
          onChange={(value) => {
            kindTouched.current = true;
            setKind(value);
          }}
          options={[
            { value: "charge", label: "Charge" },
            { value: "return", label: "Return", tone: "amber" },
          ]}
        />
      </Field>

      <Field label="Amount" htmlFor="amount" required error={errors.amount}>
        <div className="relative">
          <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-xl font-bold text-muted">
            $
          </span>
          <input
            ref={amountRef}
            id="amount"
            name="amount"
            type="text"
            inputMode="decimal"
            required
            placeholder="0.00"
            className="input pl-9 text-xl font-bold"
          />
        </div>
      </Field>

      <Field label="Date on the receipt" htmlFor="expense_date" required error={errors.expense_date}>
        <input
          ref={dateRef}
          id="expense_date"
          name="expense_date"
          type="date"
          required
          defaultValue={serverToday}
          onChange={() => {
            dateTouched.current = true;
          }}
          className="input"
        />
      </Field>

      <Field
        label="Charge to property"
        htmlFor="property_id"
        required
        error={errors.property_id}
        hint="This is the property the expense is reimbursed against. A receipt never says which building, so pick it yourself."
      >
        <select id="property_id" name="property_id" required defaultValue="" className="input">
          <option value="">Choose a property…</option>
          {properties.map((property) => (
            <option key={property.id} value={property.id}>
              {property.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Store or vendor" htmlFor="merchant">
        <input
          ref={merchantRef}
          id="merchant"
          name="merchant"
          type="text"
          placeholder="Home Depot"
          className="input"
        />
      </Field>

      <Field label="Category" htmlFor="category">
        <select
          ref={categoryRef}
          id="category"
          name="category"
          defaultValue=""
          className="input"
        >
          <option value="">No category</option>
          {EXPENSE_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </Field>

      {recentCalls.length > 0 && (
        <Field label="Related service call" htmlFor="service_call_id">
          <select id="service_call_id" name="service_call_id" defaultValue="" className="input">
            <option value="">Not tied to a service call</option>
            {recentCalls.map((call) => (
              <option key={call.id} value={call.id}>
                {call.label}
              </option>
            ))}
          </select>
        </Field>
      )}

      <Field label="Notes" htmlFor="notes">
        <textarea
          ref={notesRef}
          id="notes"
          name="notes"
          rows={3}
          placeholder="What the charge was for."
          className="textarea"
        />
      </Field>

      <FormError message={state.error} />

      <div
        className="sticky z-20 -mx-4 border-t border-hairline bg-canvas/95 px-4 pt-3 pb-3 backdrop-blur"
        style={{ bottom: "calc(4rem + env(safe-area-inset-bottom))" }}
      >
        <SubmitButton pendingLabel="Saving receipt…" disabled={uploading}>
          {uploading ? "Waiting for receipt…" : "Save receipt"}
        </SubmitButton>
      </div>
    </form>
  );
}

/**
 * What the scan did, in the chief's words. A read that filled nothing is worth
 * saying out loud — otherwise a blurred receipt looks like a broken feature.
 */
function ScanNotice({ scan }: { scan: Scan }) {
  if (scan.status === "idle") return null;

  if (scan.status === "reading") {
    return (
      <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-muted">
        <Spinner className="size-4 text-brand-600" />
        Reading the receipt…
      </p>
    );
  }

  if (scan.status === "failed") {
    return (
      <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
        {scan.reason}
      </p>
    );
  }

  if (scan.filled.length === 0) {
    return (
      <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
        Nothing readable on that receipt. Fill the fields in below.
      </p>
    );
  }

  return (
    <p className="mt-3 rounded-xl bg-brand-50 px-3 py-2 text-sm font-semibold text-brand-800">
      Filled in from the receipt: {scan.filled.join(", ")}. Check it before saving.
    </p>
  );
}
