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
