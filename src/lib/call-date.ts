/**
 * Validation for the date a service call was worked.
 *
 * Its own module rather than living beside the action that uses it: the
 * actions file is a "use server" module, where every export must be an async
 * server action, and this is a plain synchronous check. Keeping it here also
 * means it can be exercised without a database.
 */

/**
 * Lower bound on a corrected date: the company's work does not predate this,
 * so anything earlier is a mistyped year rather than a real date.
 */
const EARLIEST_CALL_YEAR = 2020;

/**
 * Whether a typed date is one a service call could have been worked on.
 *
 * Separate from the action so the rules can be exercised directly. Three
 * things go wrong with a typed date: the wrong shape, a shape that is not a
 * day (2026-02-30 passes a regex and is not a date), and a mistyped year
 * (2206 for 2026), which is the one that would quietly move a call out of
 * every report.
 */
export function checkCallDate(
  date: string,
  today = new Date(),
): { ok: true } | { ok: false; message: string; fieldMessage: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ok: false, message: "Pick a date.", fieldMessage: "Pick a date." };
  }

  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    return { ok: false, message: "That is not a real date.", fieldMessage: "Not a real date." };
  }

  const year = parsed.getUTCFullYear();
  const latest = today.getUTCFullYear() + 1;
  if (year < EARLIEST_CALL_YEAR || year > latest) {
    return {
      ok: false,
      message: `Use a date between ${EARLIEST_CALL_YEAR} and ${latest}.`,
      fieldMessage: "That year looks wrong.",
    };
  }

  return { ok: true };
}
