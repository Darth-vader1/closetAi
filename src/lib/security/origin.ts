/**
 * Defence in depth for cookie-authenticated POST route handlers: require the request to originate from
 * our own site. Requests without an Origin header (non-browser clients) are rejected too, since our
 * own UI always sends one on POST.
 */
export function isSameOrigin(headers: { get(name: string): string | null }): boolean {
  const origin = headers.get("origin");
  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** Storage object paths must live inside the caller's own folder: "<userId>/<file>". */
export function isOwnStoragePath(path: unknown, userId: string): path is string {
  if (typeof path !== "string" || path.length > 300) return false;
  const parts = path.split("/");
  if (parts.length !== 2) return false;
  const [folder, file] = parts;
  return folder === userId && /^[0-9a-f-]{36}\.(jpg|png|webp)$/.test(file);
}
