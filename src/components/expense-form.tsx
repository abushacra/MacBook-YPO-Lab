"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { createExpense } from "@/lib/actions/expenses";
import { EMPTY_FORM_STATE } from "@/lib/form-state";
import { EXPENSE_CATEGORIES } from "@/lib/constants";
import { deviceTodayISO } from "@/lib/format";
import { Field, FormError } from "@/components/field";
import { MediaUploader } from "@/components/media-uploader";
import { SubmitButton } from "@/components/submit-button";

export type RecentCall = { id: string; label: string };

export function ExpenseForm({
  properties,
  recentCalls,
  serverToday,
}: {
  properties: { id: string; name: string }[];
  recentCalls: RecentCall[];
  serverToday: string;
}) {
  const [state, formAction] = useActionState(createExpense, EMPTY_FORM_STATE);
  const [uploading, setUploading] = useState(false);
  const dateRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const input = dateRef.current;
    if (input && input.value === serverToday) input.value = deviceTodayISO();
  }, [serverToday]);

  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-6">
      <Field label="Amount charged" htmlFor="amount" required error={errors.amount}>
        <div className="relative">
          <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-xl font-bold text-muted">
            $
          </span>
          <input
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
          className="input"
        />
      </Field>

      <Field
        label="Charge to property"
        htmlFor="property_id"
        required
        error={errors.property_id}
        hint="This is the property the expense is reimbursed against."
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

      <Field
        label="Receipt"
        hint="Snap it, or pick a photo or PDF already on your phone."
      >
        <MediaUploader
          name="receipt"
          bucket="receipts"
          browseLabel="Choose file"
          accept="image/*,application/pdf"
          onBusyChange={setUploading}
        />
      </Field>

      <Field label="Store or vendor" htmlFor="merchant">
        <input
          id="merchant"
          name="merchant"
          type="text"
          placeholder="Home Depot"
          className="input"
        />
      </Field>

      <Field label="Category" htmlFor="category">
        <select id="category" name="category" defaultValue="" className="input">
          <option value="">No category</option>
          {EXPENSE_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </Field>

      {recentCalls.length > 0 && (
        <Field label="Related maintenance shift" htmlFor="service_call_id">
          <select id="service_call_id" name="service_call_id" defaultValue="" className="input">
            <option value="">Not tied to a shift</option>
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
