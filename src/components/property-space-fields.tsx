"use client";

import { Field } from "@/components/field";

export type PropertyOption = {
  id: string;
  name: string;
  spaces: { id: string; name: string }[];
};

type Props = {
  properties: PropertyOption[];
  /** "" for the first property, "_2" for the second. */
  suffix: "" | "_2";
  label: string;
  required?: boolean;
  propertyId: string;
  onPropertyChange: (value: string) => void;
  space: string;
  onSpaceChange: (value: string) => void;
  errors: Record<string, string>;
  /** Keeps the second picker from offering the property already chosen above. */
  excludeId?: string;
};

export function PropertySpaceFields({
  properties,
  suffix,
  label,
  required = false,
  propertyId,
  onPropertyChange,
  space,
  onSpaceChange,
  errors,
  excludeId,
}: Props) {
  const propertyField = `property_id${suffix}`;
  const spaceField = `space${suffix}`;
  const datalistId = `space-options${suffix}`;

  const choices = properties.filter((property) => property.id !== excludeId);
  const spaces = properties.find((property) => property.id === propertyId)?.spaces ?? [];

  return (
    <>
      <Field
        label={label}
        htmlFor={propertyField}
        required={required}
        error={errors[propertyField]}
      >
        <select
          id={propertyField}
          name={propertyField}
          required={required}
          value={propertyId}
          onChange={(event) => onPropertyChange(event.target.value)}
          className="input"
        >
          <option value="">Choose a property…</option>
          {choices.map((property) => (
            <option key={property.id} value={property.id}>
              {property.name}
            </option>
          ))}
        </select>
      </Field>

      <Field
        label={suffix ? "Space at second property" : "Space"}
        htmlFor={spaceField}
        error={errors[spaceField]}
        hint={
          spaces.length > 0
            ? "Tap one below, or type anything. Leave blank for the whole property."
            : "Unit, suite or area. Leave blank for the whole property."
        }
      >
        <input
          id={spaceField}
          name={spaceField}
          type="text"
          list={datalistId}
          autoComplete="off"
          enterKeyHint="done"
          maxLength={120}
          value={space}
          onChange={(event) => onSpaceChange(event.target.value)}
          placeholder={spaces[0] ? `e.g. ${spaces[0].name}` : "Suite 210, Lobby, Unit B…"}
          className="input"
        />

        {/* Desktop keyboards get the native suggestion list; phones get the
            chips below, which are quicker to hit and easier to discover. */}
        <datalist id={datalistId}>
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
                  onClick={() => onSpaceChange(active ? "" : option.name)}
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
    </>
  );
}
