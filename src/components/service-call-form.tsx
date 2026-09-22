"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { createServiceCall } from "@/lib/actions/calls";
import { EMPTY_FORM_STATE } from "@/lib/form-state";
import { deviceTodayISO } from "@/lib/format";
import { Field, FormError } from "@/components/field";
import { Segmented } from "@/components/segmented";
import { MediaUploader } from "@/components/media-uploader";
import { SubmitButton } from "@/components/submit-button";

export type PropertyOption = {
  id: string;
  name: string;
  spaces: { id: string; name: string }[];
};

export function ServiceCallForm({
  properties,
  isVendor,
  serverToday,
}: {
  properties: PropertyOption[];
  /**
   * Vendors quote each job, so they get an amount field. In-house engineers
   * are priced from the rate an admin set for them, which is deliberately not
   * shown or editable here.
   */
  isVendor: boolean;
  serverToday: string;
}) {
  const [state, formAction] = useActionState(createServiceCall, EMPTY_FORM_STATE);
  const [propertyId, setPropertyId] = useState(properties.length === 1 ? properties[0].id : "");
  const [space, setSpace] = useState("");
  const [followUp, setFollowUp] = useState(false);
  const [uploading, setUploading] = useState(false);
  const dateRef = useRef<HTMLInputElement>(null);

  // The server renders today in the portfolio's time zone so the field is
  // filled before hydration; the device then corrects it if the engineer is
  // somewhere else.
  useEffect(() => {
    const input = dateRef.current;
    if (input && input.value === serverToday) input.value = deviceTodayISO();
  }, [serverToday]);

  const spaces = properties.find((property) => property.id === propertyId)?.spaces ?? [];
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-6">
      <Field label="Date" htmlFor="call_date" required error={errors.call_date}>
        <input
          ref={dateRef}
          id="call_date"
          name="call_date"
          type="date"
          required
          defaultValue={serverToday}
          className="input"
        />
      </Field>

      <Field label="When" required error={errors.hours_type}>
        <Segmented
          name="hours_type"
          defaultValue="regular"
          options={[
            { value: "regular", label: "Regular hours" },
            { value: "after_hours", label: "After hours", tone: "amber" },
          ]}
        />
      </Field>

      <Field label="Call type" required error={errors.call_type}>
        <Segmented
          name="call_type"
          defaultValue="scheduled"
          options={[
            { value: "scheduled", label: "Scheduled" },
            { value: "emergency", label: "Emergency", tone: "danger" },
          ]}
        />
      </Field>

      <Field label="Property" htmlFor="property_id" required error={errors.property_id}>
        <select
          id="property_id"
          name="property_id"
          required
          value={propertyId}
          onChange={(event) => setPropertyId(event.target.value)}
          className="input"
        >
          <option value="">Choose a property…</option>
          {properties.map((property) => (
            <option key={property.id} value={property.id}>
              {property.name}
            </option>
          ))}
        </select>
      </Field>

      <Field
        label="Space"
        htmlFor="space"
        error={errors.space}
        hint={
          spaces.length > 0
            ? "Tap one below, or type anything. Leave blank for the whole property."
            : "Unit, suite or area. Leave blank for the whole property."
        }
      >
        <input
          id="space"
          name="space"
          type="text"
          list="space-options"
          autoComplete="off"
          enterKeyHint="done"
          maxLength={120}
          value={space}
          onChange={(event) => setSpace(event.target.value)}
          placeholder={spaces[0] ? `e.g. ${spaces[0].name}` : "Suite 210, Lobby, Unit B\u2026"}
          className="input"
        />

        {/* Desktop keyboards get the native suggestion list; phones get the
            chips below, which are quicker to hit and easier to discover. */}
        <datalist id="space-options">
          {spaces.map((option) => (
            <option key={option.id} value={option.name} />
          ))}
        </datalist>

        {spaces.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {spaces.map((option) => {
              const active = space.trim().toLowerCase() === option.name.toLowerCase();
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setSpace(active ? "" : option.name)}
                  aria-pressed={active}
                  className={`chip min-h-10 px-3.5 text-sm ${
                    active ? "bg-brand-700 text-white" : "border border-hairline bg-white text-ink"
                  }`}
                >
                  {option.name}
                </button>
              );
            })}
          </div>
        )}
      </Field>

      <Field label="Work completed" htmlFor="description">
        <textarea
          id="description"
          name="description"
          rows={4}
          placeholder="Replaced condenser fan motor, tested and cleaned up."
          className="textarea"
        />
      </Field>

      {isVendor ? (
        <Field
          label="Amount you are charging"
          htmlFor="billed_amount"
          error={errors.billed_amount}
          hint="The agreed price for this work. Leave blank if it is covered another way."
        >
          <div className="relative">
            <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-xl font-bold text-muted">
              $
            </span>
            <input
              id="billed_amount"
              name="billed_amount"
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              className="input pl-9 text-xl font-bold"
            />
          </div>
        </Field>
      ) : null}

      <div className="card p-4">
        <label className="flex min-h-13 cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            name="follow_up_needed"
            checked={followUp}
            onChange={(event) => setFollowUp(event.target.checked)}
            className="size-6 shrink-0 rounded accent-brand-600"
          />
          <span className="text-base font-semibold">Follow-up needed</span>
        </label>

        {followUp && (
          <div className="mt-3">
            <textarea
              name="follow_up_notes"
              rows={3}
              placeholder="What still needs to happen? Parts on order, return visit, etc."
              className="textarea"
            />
          </div>
        )}
      </div>

      <Field
        label="Photos and files"
        hint="Up to 8 photos or PDFs, from the camera or your phone. They upload while you keep typing."
      >
        <MediaUploader
          name="photos"
          bucket="service-photos"
          browseLabel="Choose files"
          accept="image/*,application/pdf"
          multiple
          maxFiles={8}
          onBusyChange={setUploading}
        />
      </Field>

      <FormError message={state.error} />

      <div
        className="sticky z-20 -mx-4 border-t border-hairline bg-canvas/95 px-4 pt-3 pb-3 backdrop-blur"
        style={{ bottom: "calc(4rem + env(safe-area-inset-bottom))" }}
      >
        <SubmitButton pendingLabel="Saving call…" disabled={uploading}>
          {uploading ? "Waiting for photos…" : "Save service call"}
        </SubmitButton>
      </div>
    </form>
  );
}
