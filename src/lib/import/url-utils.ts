/**
 * URL normalization and query-parameter cleaning utilities.
 * Pure JavaScript with zero Node.js dependencies — safe for browser client components,
 * edge environments, and Node.js server runtimes alike.
 */

export const TRACKING_QUERY_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  "fbclid",
  "gclid",
  "dclid",
  "msclkid",
  "twclid",
  "ttclid",
  "igshid",
  "mc_cid",
  "mc_eid",
  "_ga",
  "_gl",
  "yclid",
  "rb_clickid",
  "s_kwcid",
  "ctaref",
  "share_source",
]);

/**
 * Normalizes a product URL for consistent storage and duplicate detection by stripping
 * marketing/tracking parameters, hashes, and redundant trailing slashes.
 */
export function normalizeProductUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.length > 2048) {
    throw new Error("Invalid URL: must be between 1 and 2048 characters.");
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("Invalid URL syntax.");
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Unsupported URL protocol (only http: and https: are allowed).");
  }

  parsed.hash = "";

  if (
    (parsed.protocol === "https:" && parsed.port === "443") ||
    (parsed.protocol === "http:" && parsed.port === "80")
  ) {
    parsed.port = "";
  }

  const keptParams: Array<[string, string]> = [];
  for (const [key, value] of parsed.searchParams.entries()) {
    const lowerKey = key.toLowerCase();
    if (
      TRACKING_QUERY_PARAMS.has(lowerKey) ||
      lowerKey.startsWith("utm_") ||
      lowerKey.startsWith("aff_")
    ) {
      continue;
    }
    keptParams.push([key, value]);
  }

  keptParams.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
  parsed.search = "";
  for (const [k, v] of keptParams) {
    parsed.searchParams.append(k, v);
  }

  if (parsed.pathname.length > 1 && parsed.pathname.endsWith("/")) {
    parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  }

  return parsed.toString();
}
