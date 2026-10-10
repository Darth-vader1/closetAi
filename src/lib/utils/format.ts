/** Format a UTC timestamp as a calendar date in the user's own timezone, e.g. "9 Oct 2026". */
export function formatDate(iso: string | null, timeZone: string, fallback = "Not recorded"): string {
  if (!iso) return fallback;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return fallback;
  try {
    return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(date);
  }
}
