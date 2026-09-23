"use client";

import { useRef } from "react";

import { assignChief } from "@/lib/actions/admin";

/** Sets who a person reports to, saving as soon as the choice changes. */
export function ChiefSelect({
  technicianId,
  chiefId,
  chiefs,
}: {
  technicianId: string;
  chiefId: string | null;
  chiefs: { id: string; name: string }[];
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={assignChief} className="mt-3">
      <input type="hidden" name="id" value={technicianId} />
      <label className="field-label" htmlFor={`chief-${technicianId}`}>
        Reports to
      </label>
      <select
        id={`chief-${technicianId}`}
        name="chief_id"
        defaultValue={chiefId ?? ""}
        onChange={() => formRef.current?.requestSubmit()}
        className="input"
      >
        <option value="">No chief</option>
        {chiefs.map((chief) => (
          <option key={chief.id} value={chief.id}>
            {chief.name}
          </option>
        ))}
      </select>
      <noscript>
        <button type="submit" className="btn-secondary mt-2 w-full">
          Save
        </button>
      </noscript>
    </form>
  );
}
