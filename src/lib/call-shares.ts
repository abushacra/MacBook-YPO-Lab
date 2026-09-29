/**
 * How one service call is divided across the properties it covered.
 *
 * A call names one or two properties and carries a single amount. When it covers
 * two, each property gets its own line — on the bill so each customer can be
 * charged, and in the report so the counts read as buildings attended — and the
 * amount is split evenly between them.
 *
 * Splitting rather than repeating is what keeps the money honest: putting the
 * whole amount on both lines would bill twice for one call and pay the engineer
 * twice for one day's work. The halves always add back to exactly what the call
 * was worth.
 */

export type PropertyShare = {
  propertyId: string;
  /** The label stored on the call, used only if the property has since been deleted. */
  propertyLabel: string;
  amount: number;
};

/**
 * Splits an amount into `parts` shares that sum to exactly the original.
 *
 * Done in whole cents, with any leftover cent going to the first share, so two
 * halves of $125.01 come out as $62.51 and $62.50 rather than two $62.505s that
 * round to more or less than the call was worth.
 */
export function splitAmount(amount: number, parts: number): number[] {
  const cents = Math.round(amount * 100);
  const base = Math.trunc(cents / parts);
  const remainder = cents - base * parts;

  return Array.from({ length: parts }, (_, index) => {
    // The remainder can be negative if an amount ever were, so it is spread by
    // sign rather than assumed positive.
    const extra = index < Math.abs(remainder) ? Math.sign(remainder) : 0;
    return (base + extra) / 100;
  });
}

/** The one or two property shares a call resolves to. */
export function propertyShares(
  call: {
    property_id: string;
    property_label: string;
    property_id_2: string | null;
    property_label_2: string | null;
  },
  amount: number,
): PropertyShare[] {
  if (call.property_id_2 === null) {
    return [
      { propertyId: call.property_id, propertyLabel: call.property_label, amount },
    ];
  }

  const [first, second] = splitAmount(amount, 2);

  return [
    { propertyId: call.property_id, propertyLabel: call.property_label, amount: first! },
    {
      propertyId: call.property_id_2,
      propertyLabel: call.property_label_2 ?? "Second property",
      amount: second!,
    },
  ];
}
