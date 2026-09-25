"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { addProperty, addSpace, addTechnician, saveTechnicianRates } from "@/lib/actions/admin";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/form-state";
import { TECHNICIAN_KIND_LABELS, TECHNICIAN_KINDS } from "@/lib/constants";
import { Field, FormError } from "@/components/field";
import { SubmitButton } from "@/components/submit-button";
import { RateRows, type RateRow } from "@/components/rate-rows";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

/** Clears the inputs after a successful add so the next one can be typed straight in. */
function useResettingAction(action: Action) {
  const [state, formAction] = useActionState(action, EMPTY_FORM_STATE);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  return { state, formAction, formRef };
}

export function AddPropertyForm() {
  const { state, formAction, formRef } = useResettingAction(addProperty);

  return (
    <form ref={formRef} action={formAction} className="card space-y-4 p-4">
      <Field label="Property name" htmlFor="new-property-name" required error={state.fieldErrors?.name}>
        <input id="new-property-name" name="name" required className="input" placeholder="Kapa Plaza" />
      </Field>
      <Field label="Address" htmlFor="new-property-address">
        <input id="new-property-address" name="address" className="input" placeholder="100 Main Street" />
      </Field>
      <FormError message={state.error} />
      <SubmitButton pendingLabel="Adding…">Add property</SubmitButton>
    </form>
  );
}

export function AddSpaceForm({ properties }: { properties: { id: string; name: string }[] }) {
  const { state, formAction, formRef } = useResettingAction(addSpace);

  return (
    <form ref={formRef} action={formAction} className="card space-y-4 p-4">
      <Field label="Property" htmlFor="new-space-property" required error={state.fieldErrors?.property_id}>
        <select id="new-space-property" name="property_id" required defaultValue="" className="input">
          <option value="">Choose a property…</option>
          {properties.map((property) => (
            <option key={property.id} value={property.id}>
              {property.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Space name" htmlFor="new-space-name" required error={state.fieldErrors?.name}>
        <input id="new-space-name" name="name" required className="input" placeholder="Suite 210" />
      </Field>
      <FormError message={state.error} />
      <SubmitButton pendingLabel="Adding…">Add space</SubmitButton>
    </form>
  );
}

export function AddTechnicianForm({ chiefs }: { chiefs: { id: string; name: string }[] }) {
  const { state, formAction, formRef } = useResettingAction(addTechnician);
  const [kind, setKind] = useState<string>("in_house");
  const [isChief, setIsChief] = useState(false);

  return (
    <form ref={formRef} action={formAction} className="card space-y-4 p-4">
      <Field label="Full name" htmlFor="new-tech-name" required error={state.fieldErrors?.name}>
        <input id="new-tech-name" name="name" required className="input" placeholder="Chris Moreno" />
      </Field>

      <Field label="Type" htmlFor="new-tech-kind" required error={state.fieldErrors?.kind}>
        <select
          id="new-tech-kind"
          name="kind"
          required
          value={kind}
          onChange={(event) => setKind(event.target.value)}
          className="input"
        >
          {TECHNICIAN_KINDS.map((option) => (
            <option key={option} value={option}>
              {TECHNICIAN_KIND_LABELS[option]}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Company" htmlFor="new-tech-company" hint="For outside vendors.">
        <input id="new-tech-company" name="company" className="input" placeholder="Ace Mechanical" />
      </Field>

      <label className="flex min-h-13 cursor-pointer items-center gap-3">
        <input type="checkbox" name="is_admin" className="size-6 shrink-0 rounded accent-brand-600" />
        <span className="text-base font-semibold">Can manage properties and people</span>
      </label>

      {kind === "in_house" && (
        <label className="flex min-h-13 cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            name="is_chief"
            checked={isChief}
            onChange={(event) => setIsChief(event.target.checked)}
            className="size-6 shrink-0 rounded accent-brand-600"
          />
          <span className="text-base font-semibold">
            Chief Engineer — approves their team&apos;s maintenance shifts
          </span>
        </label>
      )}

      {!isChief && chiefs.length > 0 && (
        <Field
          label="Reports to"
          htmlFor="new-tech-chief"
          hint="Their maintenance shifts go to this chief for approval."
        >
          <select id="new-tech-chief" name="chief_id" defaultValue="" className="input">
            <option value="">No chief yet</option>
            {chiefs.map((chief) => (
              <option key={chief.id} value={chief.id}>
                {chief.name}
              </option>
            ))}
          </select>
        </Field>
      )}

      {kind === "in_house" ? (
        <div>
          <p className="field-label">Maintenance shift rates</p>
          <p className="mb-3 text-xs text-muted">
            What this engineer is paid per completed shift.
          </p>
          <RateRows />
        </div>
      ) : (
        <p className="rounded-xl bg-brand-50 px-3 py-2 text-xs text-brand-900">
          Vendors enter the amount they agreed on each shift, so there are no
          rates to set here.
        </p>
      )}

      <p className="rounded-xl bg-brand-50 px-3 py-2 text-xs text-brand-900">
        They choose their own 4-digit PIN the first time they open the app.
      </p>

      <FormError message={state.error} />
      <SubmitButton pendingLabel="Adding…">Add person</SubmitButton>
    </form>
  );
}

/** Edits the rate tiers of an engineer already on the list. */
export function TechnicianRatesForm({
  technicianId,
  rates,
}: {
  technicianId: string;
  rates: RateRow[];
}) {
  const [state, formAction] = useActionState(saveTechnicianRates, EMPTY_FORM_STATE);

  return (
    <form action={formAction} className="mt-3 border-t border-hairline pt-3">
      <input type="hidden" name="id" value={technicianId} />
      <p className="field-label">Maintenance shift rates</p>
      <RateRows rates={rates} />
      <FormError message={state.error} />
      <div className="mt-3 flex items-center gap-3">
        <SubmitButton className="btn-secondary min-h-10 px-3 text-sm" pendingLabel="Saving…">
          Save rates
        </SubmitButton>
        {state.ok && <span className="text-sm font-semibold text-emerald-700">Saved.</span>}
      </div>
    </form>
  );
}
