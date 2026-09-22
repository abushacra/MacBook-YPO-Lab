import { CALL_TYPE_LABELS, HOURS_TYPE_LABELS, type CallType, type HoursType } from "@/lib/constants";

export function CallTypeBadge({ value }: { value: string }) {
  const emergency = value === "emergency";
  return (
    <span
      className={`chip ${emergency ? "bg-red-100 text-red-800" : "bg-brand-100 text-brand-800"}`}
    >
      {CALL_TYPE_LABELS[value as CallType] ?? value}
    </span>
  );
}

export function HoursBadge({ value }: { value: string }) {
  const afterHours = value === "after_hours";
  return (
    <span
      className={`chip ${afterHours ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-700"}`}
    >
      {HOURS_TYPE_LABELS[value as HoursType] ?? value}
    </span>
  );
}

export function FollowUpBadge() {
  return <span className="chip bg-violet-100 text-violet-800">Follow-up</span>;
}
