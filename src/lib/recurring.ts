import "server-only";

import { db } from "@/lib/supabase";

/**
 * Service calls that repeat on a fixed cycle — a standing on-call bonus, a
 * monthly retainer visit — created by a scheduled job rather than typed.
 *
 * Occurrences are derived from `start_date` stepping `interval_days`, so
 * "every other Monday from 26 October" is a start date on a Monday and an
 * interval of 14. Nothing is stored per occurrence: the dates are computed,
 * which means changing a schedule never leaves a stale queue behind.
 *
 * The job is idempotent by construction. It inserts with the schedule id, the
 * date and a sequence number, and a unique index on those three refuses a
 * second copy — a cron that fires twice cannot pay anybody twice, and neither
 * can a manual run.
 */

export type RecurringSchedule = {
  id: string;
  technician_id: string;
  property_id: string;
  property_label: string;
  hours_type: string;
  call_type: string;
  call_count: number;
  amount: number;
  description: string | null;
  admin_only: boolean;
  auto_approve: boolean;
  start_date: string;
  interval_days: number;
  active: boolean;
};

/** A plain YYYY-MM-DD step, kept off Date arithmetic so a DST day cannot shift it. */
function addDays(date: string, days: number): string {
  const at = new Date(`${date}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

/**
 * Every occurrence from the start date up to and including `through`.
 *
 * Capped so a schedule with a start date years back, or an interval someone
 * mistyped, cannot generate thousands of calls in one run.
 */
export function occurrencesThrough(
  schedule: Pick<RecurringSchedule, "start_date" | "interval_days">,
  through: string,
  limit = 200,
): string[] {
  const dates: string[] = [];
  if (schedule.interval_days < 1) return dates;

  let date = schedule.start_date;
  while (date <= through && dates.length < limit) {
    dates.push(date);
    date = addDays(date, schedule.interval_days);
  }
  return dates;
}

export type RecurringRun = {
  scheduleId: string;
  /** Dates whose calls were created by this run. */
  created: string[];
  /** Dates already present, so nothing was written for them. */
  skipped: string[];
  callsCreated: number;
};

/**
 * Creates any occurrence that is due and not already there, for every active
 * schedule, up to and including `through`.
 *
 * Catching up rather than only looking at today means a day the job did not
 * run is filled in on the next one, instead of an occurrence being lost.
 */
export async function runRecurringSchedules(through: string): Promise<RecurringRun[]> {
  const { data: schedules } = await db()
    .from("recurring_service_calls")
    .select("*")
    .eq("active", true);

  const runs: RecurringRun[] = [];

  for (const schedule of (schedules ?? []) as RecurringSchedule[]) {
    const dates = occurrencesThrough(schedule, through);
    const run: RecurringRun = {
      scheduleId: schedule.id,
      created: [],
      skipped: [],
      callsCreated: 0,
    };

    for (const date of dates) {
      const rows = Array.from({ length: schedule.call_count }, (_, seq) => ({
        technician_id: schedule.technician_id,
        call_date: date,
        property_id: schedule.property_id,
        property_label: schedule.property_label,
        hours_type: schedule.hours_type,
        call_type: schedule.call_type,
        description: schedule.description,
        billed_amount: schedule.amount,
        approval_status: schedule.auto_approve ? "approved" : "pending",
        admin_only: schedule.admin_only,
        recurring_id: schedule.id,
        recurrence_seq: seq,
        follow_up_needed: false,
      }));

      /*
       * Inserted as one statement so an occurrence is all-or-nothing: three
       * calls of a bonus should never land as two. A clash on the recurrence
       * index means this date is already done, which is the normal result of
       * the job running again the next day.
       */
      const { error } = await db().from("service_calls").insert(rows);

      if (error) {
        if (error.code === "23505") run.skipped.push(date);
        else throw new Error(`${schedule.id} ${date}: ${error.message}`);
      } else {
        run.created.push(date);
        run.callsCreated += rows.length;
      }
    }

    runs.push(run);
  }

  return runs;
}
