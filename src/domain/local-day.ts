/** True when `tz` is an IANA timezone this runtime knows. */
export function isValidTimeZone(tz: string): boolean {
  if (tz.trim() === "") return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

function localParts(date: Date, tz: string): { y: number; m: number; d: number; h: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  return { y: get("year"), m: get("month"), d: get("day"), h: get("hour") };
}

/** Whole days since 1970-01-01 of the calendar date `date` falls on in `tz`. */
export function localDayNumber(date: Date, tz: string): number {
  const { y, m, d } = localParts(date, tz);
  return Math.floor(Date.UTC(y, m - 1, d) / DAY_MS);
}

/** Hour of the day (0..23) in `tz`. */
export function localHour(date: Date, tz: string): number {
  return localParts(date, tz).h;
}

/** Weekday of a day number, 0 = Mon … 6 = Sun. Day 0 (1970-01-01) was a Thursday. */
export function weekdayOfDayNumber(n: number): number {
  return (((n + 3) % 7) + 7) % 7;
}

/** "YYYY-MM-DD" for a day number. */
export function isoDateOfDayNumber(n: number): string {
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}
