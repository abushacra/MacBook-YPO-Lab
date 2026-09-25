export const HOURS_TYPES = ["regular", "after_hours", "double_time"] as const;
export const CALL_TYPES = ["emergency", "scheduled"] as const;
export const TECHNICIAN_KINDS = ["in_house", "vendor"] as const;

export type HoursType = (typeof HOURS_TYPES)[number];
export type CallType = (typeof CALL_TYPES)[number];
export type TechnicianKind = (typeof TECHNICIAN_KINDS)[number];

/**
 * Display text for the Shift Charge field. The stored values keep their
 * original spelling — renaming them would mean rewriting shifts already
 * logged — so `after_hours` is the x 1.5 tier.
 */
export const HOURS_TYPE_LABELS: Record<HoursType, string> = {
  regular: "Regular",
  after_hours: "x 1.5 Shift",
  double_time: "x 2 Shift",
};

export const CALL_TYPE_LABELS: Record<CallType, string> = {
  emergency: "Emergency",
  scheduled: "Scheduled",
};

export const TECHNICIAN_KIND_LABELS: Record<TechnicianKind, string> = {
  in_house: "In-house engineer",
  vendor: "Outside vendor",
};

export const EXPENSE_CATEGORIES = [
  "Parts & materials",
  "Tools",
  "Supplies",
  "Fuel",
  "Equipment rental",
  "Permits & fees",
  "Subcontractor",
  "Other",
] as const;

/**
 * Labels pre-filled for a new in-house engineer's three standard tiers, by
 * role. Usually only the row matching the person's own role carries a rate and
 * the rest are left blank. Labels are editable and nothing in the app matches
 * on these strings.
 */
export const DEFAULT_RATE_TIERS = [
  "Chief Engineer",
  "Building Engineer",
  "Assistant Engineer",
] as const;

/** How many rate rows the admin screens show per engineer: three plus a custom. */
export const RATE_SLOTS = DEFAULT_RATE_TIERS.length + 1;

export const APPROVAL_STATUSES = ["pending", "approved", "rejected"] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const APPROVAL_LABELS: Record<ApprovalStatus, string> = {
  pending: "Awaiting approval",
  approved: "Approved",
  rejected: "Sent back",
};
