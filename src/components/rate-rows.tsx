"use client";

import { DEFAULT_RATE_TIERS, RATE_SLOTS } from "@/lib/constants";

export type RateRow = { label: string; amount: number; isPrimary?: boolean };

/**
 * Admin-only. Engineers never see their rates: one tier is marked active here
 * and every call that engineer logs is priced from it automatically.
 *
 * Three standard slots come pre-filled with role labels, plus a custom one.
 * Labels are editable — nothing in the app matches on the text.
 */
export function RateRows({ rates = [] }: { rates?: RateRow[] }) {
  const primaryIndex = Math.max(
    0,
    rates.findIndex((rate) => rate.isPrimary),
  );

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">
        Fill in the tier that matches this engineer&apos;s role and mark it
        active. Leave the rest blank.
      </p>

      <div className="flex items-center gap-2 px-1 text-[11px] font-bold tracking-wide text-muted uppercase">
        <span className="w-10 shrink-0 text-center">Use</span>
        <span className="min-w-0 flex-1">Tier</span>
        <span className="w-28 shrink-0">Per call</span>
      </div>

      {Array.from({ length: RATE_SLOTS }, (_, slot) => {
        const existing = rates[slot];
        const isCustom = slot >= DEFAULT_RATE_TIERS.length;

        return (
          <div key={slot} className="flex items-center gap-2">
            <span className="flex w-10 shrink-0 justify-center">
              <input
                type="radio"
                name="primary_slot"
                value={slot}
                defaultChecked={slot === primaryIndex}
                aria-label={`Use tier ${slot + 1} for this engineer`}
                className="size-6 accent-brand-600"
              />
            </span>

            <div className="min-w-0 flex-1">
              <label className="sr-only" htmlFor={`rate-label-${slot}`}>
                {isCustom ? "Custom tier name" : `Tier ${slot + 1} name`}
              </label>
              <input
                id={`rate-label-${slot}`}
                name={`rate_label_${slot}`}
                type="text"
                maxLength={80}
                defaultValue={existing?.label ?? DEFAULT_RATE_TIERS[slot] ?? ""}
                placeholder={isCustom ? "Custom tier name" : "Tier name"}
                className="input"
              />
            </div>

            <div className="relative w-28 shrink-0">
              <label className="sr-only" htmlFor={`rate-amount-${slot}`}>
                Rate for tier {slot + 1}
              </label>
              <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 font-bold text-muted">
                $
              </span>
              <input
                id={`rate-amount-${slot}`}
                name={`rate_amount_${slot}`}
                type="text"
                inputMode="decimal"
                defaultValue={existing ? existing.amount.toFixed(2) : ""}
                placeholder="0.00"
                className="input pl-7 font-semibold"
              />
            </div>
          </div>
        );
      })}

      <p className="text-xs text-muted">
        Changing a rate later never alters calls already logged — each one keeps
        the amount it was saved with.
      </p>
    </div>
  );
}
