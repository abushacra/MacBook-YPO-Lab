import { type HoursType } from "./constants";

/**
 * What each Shift Charge does to an engineer's assigned rate. The rate an admin
 * sets is the price of one Regular shift; the premium tiers are multiples of it.
 */
export const HOURS_TYPE_MULTIPLIERS: Record<HoursType, number> = {
  regular: 1,
  after_hours: 1.5,
  double_time: 2,
};

/**
 * Price one shift: the engineer's assigned rate times the Shift Charge it was
 * logged at, rounded to the cent. Kept pure and separate from the save path so
 * the arithmetic can be tested without a database.
 */
export function shiftRate(tierAmount: number, hoursType: HoursType): number {
  return Math.round(tierAmount * HOURS_TYPE_MULTIPLIERS[hoursType] * 100) / 100;
}

/**
 * How the priced shift reads on screen for an admin: the tier that set the rate,
 * and the multiple applied to it when it was not a Regular shift.
 */
export function shiftRateLabel(tierLabel: string, hoursType: HoursType): string {
  const multiplier = HOURS_TYPE_MULTIPLIERS[hoursType];
  return multiplier === 1 ? tierLabel : `${tierLabel} × ${multiplier}`;
}
