/**
 * Where a pay run's bill lines land in QuickBooks Online. These are names, not
 * ids, and QuickBooks matches them literally — every one must already exist
 * there or the import fails on that row.
 *
 * Change a name here and it applies to the next download; nothing is stored
 * against past bills, which are already in QuickBooks by then.
 */

/** Goes in the Location column on every bill. Requires location tracking to be on. */
export const BILL_LOCATION = "Limited - Kapa Capital";

/** The expense account an outside vendor's calls are posted to. */
export const VENDOR_EXPENSE_CATEGORY = "Reimbursable Expenses";

/** The product/service an in-house engineer's calls are billed as. */
export const ENGINEER_ITEM = "Kapa Service Call - Tech";

/** The product/service a chief engineer's own calls are billed as. */
export const CHIEF_ITEM = "Kapa Service Call - Supervisor";

/**
 * What a person's bill lines post to, by who they are. Outside vendors go to an
 * expense category; engineers are billed as a product, and a chief's own calls
 * carry the supervisor item rather than the tech one.
 */
export function billTarget(kind: string, isChief: boolean): string {
  if (kind === "vendor") return VENDOR_EXPENSE_CATEGORY;
  return isChief ? CHIEF_ITEM : ENGINEER_ITEM;
}

/** The card the receipts were paid from, for the expense import. */
export const EXPENSE_PAYMENT_ACCOUNT = "KPC Chase (autopay)";

/** How those expenses were paid, in QuickBooks' own wording. */
export const EXPENSE_PAYMENT_METHOD = "Credit Card";

/** The account a credit card receipt is posted to. */
export const EXPENSE_CATEGORY = "Reimbursable Expenses";

/**
 * Who every credit card expense is paid to. One payee for the whole card rather
 * than a vendor per merchant: the card is what was paid, and the shop is a
 * detail of the charge, which rides in the Description instead.
 */
export const EXPENSE_PAYEE = "Credit Card Purchase";
