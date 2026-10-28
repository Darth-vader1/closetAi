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

/**
 * Format a Date object as a local YYYY-MM-DD string according to local calendar values
 * (avoiding timezone offset shifts caused by .toISOString()).
 */
export function formatLocalDate(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
