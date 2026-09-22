/** The portfolio's local time zone, used for "today" defaults and display. */
export const APP_TIME_ZONE = process.env.NEXT_PUBLIC_APP_TIME_ZONE || "America/New_York";

/** Today's date as YYYY-MM-DD in the given time zone. */
export function todayISO(timeZone: string = APP_TIME_ZONE): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Today's date as YYYY-MM-DD according to the device running the browser. */
export function deviceTodayISO(): string {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * Formats a YYYY-MM-DD date column. Built from the parts rather than
 * `new Date(iso)`, which parses as UTC and can render the previous day.
 */
export function formatDate(iso: string, opts: Intl.DateTimeFormatOptions = {}): string {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return iso;
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    ...opts,
  }).format(new Date(year, month - 1, day));
}

export function formatMoney(amount: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIME_ZONE,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

/** "Kapa Plaza · Suite 210", or just the property when no space was recorded. */
export function formatLocation(property: string, space: string | null): string {
  return space ? `${property} \u00b7 ${space}` : property;
}
