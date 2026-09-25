export type SegmentedOption = {
  value: string;
  label: string;
  tone?: "brand" | "danger" | "amber";
};

/**
 * Two or three large, always-visible choices. Faster than a dropdown for the
 * fields an engineer sets on every single call.
 */
const TONES: Record<NonNullable<SegmentedOption["tone"]>, string> = {
  brand: "peer-checked:border-brand-600 peer-checked:bg-brand-600 peer-checked:text-white",
  danger: "peer-checked:border-red-600 peer-checked:bg-red-600 peer-checked:text-white",
  amber: "peer-checked:border-amber-500 peer-checked:bg-amber-500 peer-checked:text-white",
};

export function Segmented({
  name,
  options,
  defaultValue,
}: {
  name: string;
  options: SegmentedOption[];
  defaultValue?: string;
}) {
  return (
    <div className={`grid gap-2 ${options.length >= 3 ? "grid-cols-3" : "grid-cols-2"}`}>
      {options.map((option) => (
        <label key={option.value} className="cursor-pointer">
          <input
            type="radio"
            name={name}
            value={option.value}
            defaultChecked={defaultValue === option.value}
            className="peer sr-only"
          />
          <span
            className={`flex min-h-13 items-center justify-center rounded-xl border border-hairline bg-white px-2 text-center text-sm font-semibold text-ink transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-brand-300 sm:text-base ${
              TONES[option.tone ?? "brand"]
            }`}
          >
            {option.label}
          </span>
        </label>
      ))}
    </div>
  );
}
