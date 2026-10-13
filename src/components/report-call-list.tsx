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
 *
 * A call that covered two properties names only the one it is counted under.
 * The other building is deliberately absent: on a by-property page it would be
 * one customer's address on another customer's report, and on either page a
 * bare "+ somewhere else" beside a call that counts once here reads as a
 * second call rather than as a footnote about counting.
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
              {nameOf && <span className="block text-xs text-muted">{call.property}</span>}
              {call.description && (
                <span className="mt-0.5 block text-xs text-muted">{call.description}</span>
              )}
              <span className="mt-1 flex flex-wrap items-center gap-1.5">
                <CallTypeBadge value={call.callType} />
                <HoursBadge value={call.hoursType} />
                {call.followUpNeeded && <FollowUpBadge />}
                {/* Says why the count reads as a half, without naming where
                    the other half went — that is the other property's page. */}
                {call.isSplit && (
                  <span className="chip bg-zinc-100 text-zinc-700">Half of a shared call</span>
                )}
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
