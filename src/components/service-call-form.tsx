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
  serverToday,
}: {
  properties: PropertyOption[];
  serverToday: string;
}) {
  const [state, formAction] = useActionState(createServiceCall, EMPTY_FORM_STATE);
  const [propertyId, setPropertyId] = useState(properties.length === 1 ? properties[0].id : "");
  const [spaceId, setSpaceId] = useState("");
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
          onChange={(event) => {
            setPropertyId(event.target.value);
            setSpaceId("");
          }}
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
        htmlFor="space_id"
        required
        error={errors.space_id}
        hint={
          propertyId && spaces.length === 0
            ? "This property has no spaces yet — ask an admin to add them."
            : undefined
        }
      >
        <select
          id="space_id"
          name="space_id"
          required
          value={spaceId}
          onChange={(event) => setSpaceId(event.target.value)}
          disabled={!propertyId}
          className="input disabled:bg-canvas disabled:text-muted"
        >
          <option value="">{propertyId ? "Choose a space…" : "Pick a property first"}</option>
          {spaces.map((space) => (
            <option key={space.id} value={space.id}>
              {space.name}
            </option>
          ))}
        </select>
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

      <Field label="Photos of the work" hint="Up to 8. They upload while you keep typing.">
        <MediaUploader
          name="photos"
          bucket="service-photos"
          addLabel="Add photos"
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
