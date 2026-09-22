export const HOURS_TYPES = ["regular", "after_hours"] as const;
export const CALL_TYPES = ["emergency", "scheduled"] as const;
export const TECHNICIAN_KINDS = ["in_house", "vendor"] as const;

export type HoursType = (typeof HOURS_TYPES)[number];
export type CallType = (typeof CALL_TYPES)[number];
export type TechnicianKind = (typeof TECHNICIAN_KINDS)[number];

export const HOURS_TYPE_LABELS: Record<HoursType, string> = {
  regular: "Regular hours",
  after_hours: "After hours",
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
