import { type HoursType } from "./constants";

/**
 * What each Service Call Charge does to an engineer's assigned rate. The rate an admin
 * sets is the price of one Regular shift; the premium tiers are multiples of it.
 */
export const HOURS_TYPE_MULTIPLIERS: Record<HoursType, number> = {
  regular: 1,
  after_hours: 1.5,
  double_time: 2,
};

/**
 * Price one shift: the engineer's assigned rate times the Service Call Charge it was
 * logged at, rounded to the cent. Kept pure and separate from the save path so
 * the arithmetic can be tested without a database.
 */
export function shiftRate(tierAmount: number, hoursType: HoursType): number {
  return Math.round(tierAmount * HOURS_TYPE_MULTIPLIERS[hoursType] * 100) / 100;
}

/**
 * The Regular rate behind a priced call: what it was billed at, divided back by
 * the multiple that was applied.
 *
 * This is what lets every tier share one bill line. Three Regular calls at $130
 * and two at x 1.5 are 6 service calls' worth of work at $130 each, so the line
 * reads 6 x 130.00 = 780.00 rather than splitting into two lines at two prices.
 *
 * The division is exact for any rate whose premium tiers land on whole cents,
 * which is every rate ending in an even number of cents — $130 gives $195 and
 * $260. A rate like $133.33 prices a x 1.5 call at $199.995, which was rounded
 * to $200.00 when the call was saved, so dividing back gives $133.33 with a
 * third of a cent lost. `groupPayRun` keeps each line's amount as the true sum
 * of its calls rather than recomputing it, so that fraction can never reach
 * anyone's pay.
 */
export function baseRate(amount: number, hoursType: HoursType): number {
  return Math.round((amount / HOURS_TYPE_MULTIPLIERS[hoursType]) * 100) / 100;
}

/**
 * How the priced shift reads on screen for an admin: the tier that set the rate,
 * and the multiple applied to it when it was not a Regular shift.
 */
export function shiftRateLabel(tierLabel: string, hoursType: HoursType): string {
  const multiplier = HOURS_TYPE_MULTIPLIERS[hoursType];
  return multiplier === 1 ? tierLabel : `${tierLabel} × ${multiplier}`;
}
