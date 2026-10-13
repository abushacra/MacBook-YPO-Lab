/**
 * How a service call that covered two properties is divided between them.
 *
 * Half each, for reporting and for billing alike. A call is one call however
 * many buildings it touched, so halving keeps every total honest: two halves
 * are one call and two half-amounts are the amount. That is what separates
 * this from counting the call at both properties, which inflates the totals.
 *
 * Both the report and the pay run share this, so a property's figure on a
 * report and its line on a bill can never disagree.
 */

export type CallShare = {
  propertyId: string;
  propertyLabel: string;
  spaceLabel: string | null;
  /** This property's part of the service call count: the whole, or half of it. */
  weight: number;
  /** This property's part of the money, in whole cents. */
  amount: number;
  /** Whether the call was divided at all, for a page that should say so. */
  isSplit: boolean;
};

export type SplittableCall = {
  property_id: string;
  property_label: string;
  space_label?: string | null;
  property_id_2: string | null;
  property_label_2?: string | null;
  space_label_2?: string | null;
};

/**
 * Divides a call's weight and money between the properties it covered.
 *
 * The money is halved in cents and the odd one given to the first property,
 * so the two shares always add back to exactly what the call was priced at —
 * splitting in dollars and rounding each half would quietly invent or lose a
 * penny on every odd-cent call.
 *
 * A second property equal to the first is treated as one property, since
 * halving a call between a building and itself would be two half-rows for the
 * same place.
 */
export function splitCall(call: SplittableCall, weight: number, amount: number): CallShare[] {
  const whole: CallShare = {
    propertyId: call.property_id,
    propertyLabel: call.property_label,
    spaceLabel: call.space_label ?? null,
    weight,
    amount,
    isSplit: false,
  };

  if (call.property_id_2 === null || call.property_id_2 === call.property_id) {
    return [whole];
  }

  const cents = Math.round(amount * 100);
  // The odd cent goes to the first property, so the division is repeatable
  // rather than depending on which half happens to be computed first.
  const firstCents = Math.ceil(cents / 2);

  return [
    {
      ...whole,
      // Weights are whole or half steps, so halving them stays exact in binary
      // and never needs the rounding the money does.
      weight: weight / 2,
      amount: firstCents / 100,
      isSplit: true,
    },
    {
      propertyId: call.property_id_2,
      propertyLabel: call.property_label_2 ?? "",
      spaceLabel: call.space_label_2 ?? null,
      weight: weight / 2,
      amount: (cents - firstCents) / 100,
      isSplit: true,
    },
  ];
}
