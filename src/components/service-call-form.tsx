"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { createServiceCall } from "@/lib/actions/calls";
import { EMPTY_FORM_STATE } from "@/lib/form-state";
import { deviceTodayISO } from "@/lib/format";
import { HOURS_TYPE_SHORT_LABELS } from "@/lib/constants";
import { Field, FormError } from "@/components/field";
import { PropertySpaceFields, type PropertyOption } from "@/components/property-space-fields";

export type { PropertyOption };
import { Segmented } from "@/components/segmented";
import { MediaUploader } from "@/components/media-uploader";
import { SubmitButton } from "@/components/submit-button";

/** Someone an admin or chief may log a call for. */
export type CallSubjectOption = { id: string; name: string; isVendor: boolean };

export function ServiceCallForm({
  properties,
  isVendor,
  subjects,
  selfId,
  serverToday,
}: {
  properties: PropertyOption[];
  /**
   * Vendors quote each job, so they get an amount field. In-house engineers
   * are priced from the rate an admin set for them, which is deliberately not
   * shown or editable here.
   */
  isVendor: boolean;
  /**
   * Everyone the signed-in person may log for, themselves included. Empty for an
   * ordinary engineer, who can only log their own work and so needs no picker.
   */
  subjects: CallSubjectOption[];
  selfId: string;
  serverToday: string;
}) {
  const [state, formAction] = useActionState(createServiceCall, EMPTY_FORM_STATE);
  const [subjectId, setSubjectId] = useState(selfId);

  /*
   * The amount field belongs to whoever the call is FOR, not whoever is typing:
   * an admin logging for an outside vendor still needs to enter that vendor's
   * agreed price, and logging for an engineer must not offer one.
   */
  const subject = subjects.find((person) => person.id === subjectId);
  const amountApplies = subjects.length > 0 ? (subject?.isVendor ?? false) : isVendor;
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
      {subjects.length > 0 && (
        <Field
          label="Logged for"
          htmlFor="technician_id"
          required
          error={errors.technician_id}
          hint="Whose service call this is. It is priced at their rate and goes to their chief for approval."
        >
          <select
            id="technician_id"
            name="technician_id"
            value={subjectId}
            onChange={(event) => setSubjectId(event.target.value)}
            className="input"
          >
            {subjects.map((person) => (
              <option key={person.id} value={person.id}>
                {person.id === selfId ? `${person.name} (you)` : person.name}
              </option>
            ))}
          </select>
        </Field>
      )}

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

      <Field label="Service Call Charge" required error={errors.hours_type}>
        <Segmented
          name="hours_type"
          defaultValue="regular"
          options={[
            { value: "regular", label: HOURS_TYPE_SHORT_LABELS.regular },
            {
              value: "after_hours",
              label: HOURS_TYPE_SHORT_LABELS.after_hours,
              tone: "amber",
            },
            {
              value: "double_time",
              label: HOURS_TYPE_SHORT_LABELS.double_time,
              tone: "danger",
            },
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
            This service call covers a second property
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

      {amountApplies ? (
        <Field
          label={
            subject && subject.id !== selfId
              ? `Amount ${subject.name} is charging`
              : "Amount you are charging"
          }
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
        <SubmitButton pendingLabel="Saving service call…" disabled={uploading}>
          {uploading ? "Waiting for photos…" : "Save service call"}
        </SubmitButton>
      </div>
    </form>
  );
}
