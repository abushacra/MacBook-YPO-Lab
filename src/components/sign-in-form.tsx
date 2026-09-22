"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { signIn } from "@/lib/actions/auth";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/form-state";
import { FormError } from "@/components/field";
import { SubmitButton } from "@/components/submit-button";

export type SignInTechnician = {
  id: string;
  name: string;
  company: string | null;
  kind: string;
  hasPin: boolean;
};

export function SignInForm({ technicians }: { technicians: SignInTechnician[] }) {
  const [selected, setSelected] = useState<SignInTechnician | null>(null);
  const [state, formAction] = useActionState(signIn, EMPTY_FORM_STATE);

  if (!selected) {
    return <NamePicker technicians={technicians} onSelect={setSelected} />;
  }

  return (
    <PinStep
      key={selected.id}
      technician={selected}
      action={formAction}
      state={state}
      onBack={() => setSelected(null)}
    />
  );
}

function NamePicker({
  technicians,
  onSelect,
}: {
  technicians: SignInTechnician[];
  onSelect: (technician: SignInTechnician) => void;
}) {
  const inHouse = technicians.filter((t) => t.kind === "in_house");
  const vendors = technicians.filter((t) => t.kind !== "in_house");

  if (technicians.length === 0) {
    return (
      <div className="card p-5 text-sm text-muted">
        <p className="font-semibold text-ink">Nobody has been added yet.</p>
        <p className="mt-2">
          Add the first engineer from the Admin screen, or seed one directly in the database. See
          the README for the one-time setup step.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Group title="Kapa engineers" people={inHouse} onSelect={onSelect} />
      <Group title="Outside vendors" people={vendors} onSelect={onSelect} />
    </div>
  );
}

function Group({
  title,
  people,
  onSelect,
}: {
  title: string;
  people: SignInTechnician[];
  onSelect: (technician: SignInTechnician) => void;
}) {
  if (people.length === 0) return null;

  return (
    <section>
      <h2 className="section-heading mb-2">{title}</h2>
      <ul className="space-y-2">
        {people.map((person) => (
          <li key={person.id}>
            <button
              type="button"
              onClick={() => onSelect(person)}
              className="card flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left active:bg-brand-50"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-800">
                {initials(person.name)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-base font-semibold">{person.name}</span>
                {person.company && (
                  <span className="block truncate text-sm text-muted">{person.company}</span>
                )}
              </span>
              {!person.hasPin && (
                <span className="chip bg-amber-100 text-amber-800">Set PIN</span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function PinStep({
  technician,
  action,
  state,
  onBack,
}: {
  technician: SignInTechnician;
  action: (formData: FormData) => void;
  state: FormState;
  onBack: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const isNew = !technician.hasPin;

  // Returning engineers never tap a button: the form submits itself as soon as
  // the fourth digit lands.
  useEffect(() => {
    if (!isNew && pin.length === 4) formRef.current?.requestSubmit();
  }, [isNew, pin]);

  return (
    <form
      ref={formRef}
      // React has already captured the FormData by the time this runs, so
      // emptying the boxes here only affects what the engineer sees: after a
      // rejected PIN the retry is four taps, with nothing to delete first.
      action={(formData) => {
        action(formData);
        setPin("");
        setConfirmPin("");
      }}
      className="space-y-5"
    >
      <input type="hidden" name="technicianId" value={technician.id} />

      <div className="card p-5 text-center">
        <p className="text-sm text-muted">Signing in as</p>
        <p className="text-lg font-bold">{technician.name}</p>
      </div>

      {isNew && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
          First time here — choose a 4-digit PIN you&apos;ll use from now on.
        </p>
      )}

      <PinInput
        label={isNew ? "Choose a 4-digit PIN" : "Enter your PIN"}
        name="pin"
        value={pin}
        onChange={setPin}
        autoFocus
      />

      {isNew && (
        <PinInput
          label="Confirm PIN"
          name="confirmPin"
          value={confirmPin}
          onChange={setConfirmPin}
        />
      )}

      <FormError message={state.error} />

      <SubmitButton pendingLabel="Checking…" disabled={pin.length !== 4}>
        {isNew ? "Set PIN and sign in" : "Sign in"}
      </SubmitButton>

      <button type="button" onClick={onBack} className="btn-secondary w-full">
        Not you? Pick another name
      </button>
    </form>
  );
}

function PinInput({
  label,
  name,
  value,
  onChange,
  autoFocus,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
}) {
  return (
    <div>
      <label className="field-label text-center" htmlFor={`pin-${name}`}>
        {label}
      </label>
      <input
        id={`pin-${name}`}
        name={name}
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={4}
        autoFocus={autoFocus}
        value={value}
        onChange={(event) => onChange(event.target.value.replace(/\D/g, "").slice(0, 4))}
        className="input text-center text-3xl tracking-[0.6em] font-bold"
      />
    </div>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
