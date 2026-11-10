"use client";

import { useActionState } from "react";

import { setServiceCallDate } from "@/lib/actions/calls";
import { EMPTY_FORM_STATE } from "@/lib/form-state";
import { Field, FormError } from "@/components/field";
import { SubmitButton } from "@/components/submit-button";

/**
 * Corrects the date a service call was worked. Admin only — the date decides
 * which pay run and which reporting period the call belongs to.
 */
export function CallDateForm({
  callId,
  callDate,
  paid,
}: {
  callId: string;
  callDate: string;
  /** Already on a pay run marked billed, which is worth saying before a change. */
  paid: boolean;
}) {
  const [state, formAction] = useActionState(setServiceCallDate, EMPTY_FORM_STATE);

  return (
    <form action={formAction} className="mt-3">
      <input type="hidden" name="id" value={callId} />
      <Field label="Date worked" htmlFor="call_date" error={state.fieldErrors?.call_date}>
        <input
          id="call_date"
          name="call_date"
          type="date"
          required
          defaultValue={callDate}
          className="input"
        />
      </Field>

      {paid && (
        <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
          This call has already been paid. Changing the date will not re-bill it — what keeps
          it off a later pay run is that it is marked paid, not its date — but it will move
          which period a report counts it in.
        </p>
      )}

      <FormError message={state.error} />
      {state.ok && (
        <p role="status" className="mt-2 text-xs font-semibold text-emerald-700">
          Date changed.
        </p>
      )}

      <SubmitButton pendingLabel="Saving…" className="btn-secondary mt-3 w-full">
        Save date
      </SubmitButton>
    </form>
  );
}
