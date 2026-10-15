/** Formats an ISO timestamp relative to a fixed reference time (for stable SSR output). */
export function formatRelative(iso: string, nowMs: number): string {
  const diff = nowMs - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Intl.DateTimeFormat("en", { dateStyle: "short" }).format(new Date(iso));
}

/** Calendar day in a fixed IANA zone, as yyyy-mm-dd (for stable grouping). */
function localDayKey(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function shiftDayKey(dayKey: string, deltaDays: number): string {
  const d = new Date(`${dayKey}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

/** Day divider label for message threads (uses profile timezone on server + client). */
export function formatMessageDayLabel(
  iso: string,
  referenceNowMs: number,
  timeZone: string,
): string {
  const tz = timeZone.trim() || "UTC";
  const msgDay = localDayKey(iso, tz);
  const refDay = localDayKey(new Date(referenceNowMs).toISOString(), tz);
  if (msgDay === refDay) return "Today";
  if (msgDay === shiftDayKey(refDay, -1)) return "Yesterday";
  try {
    return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: tz }).format(new Date(iso));
  } catch {
    return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(iso));
  }
}

/** Time under a message bubble; same timezone on SSR and hydration. */
export function formatMessageTime(iso: string, timeZone: string): string {
  const tz = timeZone.trim() || "UTC";
  try {
    return new Intl.DateTimeFormat("en", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: tz,
    }).format(new Date(iso));
  } catch {
    return new Intl.DateTimeFormat("en", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "UTC",
    }).format(new Date(iso));
  }
}
