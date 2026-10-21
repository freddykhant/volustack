import { dayNumberOfIsoDate } from "~/domain/local-day";

export const CUE_DISMISSED_KEY = "mesodapt.cue.dismissed";
const KEEP_DAYS = 3;

/** Cue ids start with their date ("YYYY-MM-DD:…"); ones older than KEEP_DAYS are dropped. */
function fresh(ids: Iterable<string>, today: string): string[] {
  const t = dayNumberOfIsoDate(today);
  return [...ids].filter((id) => {
    const n = dayNumberOfIsoDate(id.slice(0, 10));
    return Number.isFinite(n) && t - n <= KEEP_DAYS;
  });
}

/** Cues this viewer dismissed. Storage is a convenience: any failure reads as none. */
export function readDismissed(storage: Pick<Storage, "getItem"> | null, today: string): Set<string> {
  try {
    const raw = storage?.getItem(CUE_DISMISSED_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return new Set();
    return new Set(fresh(parsed.filter((x): x is string => typeof x === "string"), today));
  } catch {
    return new Set();
  }
}

export function writeDismissed(storage: Pick<Storage, "setItem"> | null, ids: Set<string>, today: string): void {
  try {
    storage?.setItem(CUE_DISMISSED_KEY, JSON.stringify(fresh(ids, today)));
  } catch {
    // Not remembered on this device; the cue simply shows again next visit.
  }
}
