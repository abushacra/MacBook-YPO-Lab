import type { ReportCallRow } from "@/lib/report";
import { formatCalls, formatDate, formatMoney } from "@/lib/format";
import {
  ApprovalBadge,
  CallTypeBadge,
  FollowUpBadge,
  HoursBadge,
} from "@/components/call-badges";

/**
 * Every call in a block, by date. Shared by the by-engineer and by-property
 * views so a call reads identically whichever way the report is grouped — the
 * only difference is whose name is worth repeating.
 */
export function ReportCallList({
  calls,
  heading,
  /** Shown on each row in the by-property view, where the calls span people. */
  nameOf,
  showAmounts,
}: {
  calls: ReportCallRow[];
  heading: string;
  nameOf?: (call: ReportCallRow, index: number) => string;
  showAmounts: boolean;
}) {
  if (calls.length === 0) return null;

  return (
    <>
      <h3 className="section-heading mt-4 mb-1">{heading}</h3>
      <ol className="divide-y divide-hairline border-t border-hairline">
        {calls.map((call, index) => (
          <li
            key={`${call.date}-${index}`}
            className="flex items-start justify-between gap-3 py-2"
          >
            <span className="min-w-0">
              <span className="block text-sm font-semibold">
                {formatDate(call.date, { weekday: "short", year: undefined })} ·{" "}
                {nameOf ? nameOf(call, index) : call.property}
              </span>
              {nameOf ? (
                <span className="block text-xs text-muted">{call.property}</span>
              ) : (
                call.secondProperty && (
                  <span className="block text-sm font-semibold text-muted">
                    + {call.secondProperty}
                  </span>
                )
              )}
              {call.description && (
                <span className="mt-0.5 block text-xs text-muted">{call.description}</span>
              )}
              <span className="mt-1 flex flex-wrap items-center gap-1.5">
                <CallTypeBadge value={call.callType} />
                <HoursBadge value={call.hoursType} />
                {call.followUpNeeded && <FollowUpBadge />}
                {call.approvalStatus !== "approved" && (
                  <ApprovalBadge value={call.approvalStatus} />
                )}
              </span>
            </span>
            <span className="shrink-0 text-right">
              {showAmounts && (
                <span className="block text-sm font-bold">
                  {call.amount === null ? (
                    <span className="text-xs font-semibold text-amber-800">No amount</span>
                  ) : (
                    formatMoney(call.amount)
                  )}
                </span>
              )}
              <span className="block text-xs text-muted">
                {formatCalls(call.weight)} call{call.weight === 1 ? "" : "s"}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </>
  );
}
