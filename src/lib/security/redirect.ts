/**
 * Only allow same-site, path-only redirect targets. Rejects absolute URLs,
 * protocol-relative URLs ("//evil.com"), backslash tricks and control characters,
 * so a crafted ?next= parameter can never send a user off-site after login.
 */
export function safeRedirectPath(input: string | null | undefined, fallback = "/dashboard"): string {
  if (!input) return fallback;
  if (!input.startsWith("/")) return fallback;
  if (input.startsWith("//") || input.includes("\\")) return fallback;
  if (/[\u0000-\u001f\u007f]/.test(input)) return fallback;
  return input;
}
