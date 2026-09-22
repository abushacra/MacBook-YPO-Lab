"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { createServiceCall } from "@/lib/actions/calls";
import { EMPTY_FORM_STATE } from "@/lib/form-state";
import { deviceTodayISO } from "@/lib/format";
import { Field, FormError } from "@/components/field";
import { PropertySpaceFields, type PropertyOption } from "@/components/property-space-fields";

export type { PropertyOption };
import { Segmented } from "@/components/segmented";
import { MediaUploader } from "@/components/media-uploader";
import { SubmitButton } from "@/components/submit-button";

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
  const [showSecond, setShowSecond] = useState(false);
  const [propertyId2, setPropertyId2] = useState("");
  const [space2, setSpace2] = useState("");
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

      <Field label="Service Time" required error={errors.hours_type}>
        <Segmented
          name="hours_type"
          defaultValue="regular"
          options={[
            { value: "regular", label: "Regular" },
            { value: "after_hours", label: "OT Rate", tone: "amber" },
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

      <PropertySpaceFields
        properties={properties}
        suffix=""
        label={showSecond ? "Property 1" : "Property"}
        required
        propertyId={propertyId}
        onPropertyChange={setPropertyId}
        space={space}
        onSpaceChange={setSpace}
        errors={errors}
        excludeId={showSecond ? propertyId2 : undefined}
      />

      <div className="card p-4">
        <label className="flex min-h-13 cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={showSecond}
            onChange={(event) => setShowSecond(event.target.checked)}
            className="size-6 shrink-0 rounded accent-brand-600"
          />
          <span className="text-base font-semibold">
            This call covers a second property
          </span>
        </label>

        {showSecond && (
          <div className="mt-4 space-y-5">
            <PropertySpaceFields
              properties={properties}
              suffix="_2"
              label="Property 2"
              propertyId={propertyId2}
              onPropertyChange={setPropertyId2}
              space={space2}
              onSpaceChange={setSpace2}
              errors={errors}
              excludeId={propertyId}
            />
          </div>
        )}
      </div>

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
