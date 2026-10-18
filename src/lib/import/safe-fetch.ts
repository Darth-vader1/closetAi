import crypto from "node:crypto";
import dns from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { sniffImage, type SniffedImage } from "@/lib/security/image-sniff";
import { normalizeProductUrl, TRACKING_QUERY_PARAMS } from "@/lib/import/url-utils";

export { normalizeProductUrl, TRACKING_QUERY_PARAMS };

export const MAX_HTML_BYTES = 1.5 * 1024 * 1024; // 1.5 MB max HTML document
export const MAX_IMPORT_IMAGE_BYTES = 4 * 1024 * 1024; // 4 MB max product image
export const MAX_REDIRECTS = 4;
export const DEFAULT_FETCH_TIMEOUT_MS = 9_000;

export type SafeFetchErrorCode =
  | "INVALID_URL"
  | "UNSUPPORTED_PROTOCOL"
  | "PROHIBITED_HOST"
  | "PROHIBITED_IP"
  | "DNS_RESOLUTION_FAILED"
  | "TOO_MANY_REDIRECTS"
  | "RESPONSE_TOO_LARGE"
  | "TIMEOUT"
  | "UNSUPPORTED_CONTENT_TYPE"
  | "UPSTREAM_BLOCKED"
  | "UPSTREAM_ERROR"
  | "INVALID_IMAGE";

export class SafeFetchError extends Error {
  readonly code: SafeFetchErrorCode;
  readonly statusCode?: number;

  constructor(code: SafeFetchErrorCode, message: string, statusCode?: number) {
    super(message);
    this.name = "SafeFetchError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export interface DnsResolvedAddress {
  address: string;
  family: 4 | 6;
}

export type DnsLookupFn = (hostname: string) => Promise<DnsResolvedAddress[]>;

export interface SafeTransportRequest {
  url: URL;
  pinnedAddress: DnsResolvedAddress;
  headers: Record<string, string>;
  timeoutMs: number;
  maxBytes: number;
  signal?: AbortSignal;
}

export interface SafeTransportResponse {
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
  body: Uint8Array;
}

export type SafeTransportFn = (req: SafeTransportRequest) => Promise<SafeTransportResponse>;


const PROHIBITED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "ip6-localhost",
  "ip6-loopback",
  "metadata",
  "metadata.google.internal",
  "metadata.goog",
  "instance-data",
  "kubernetes.default",
  "kubernetes.default.svc",
]);

const PROHIBITED_HOST_SUFFIXES = [
  ".localhost",
  ".local",
  ".localdomain",
  ".internal",
  ".home.arpa",
  ".intranet",
  ".corp",
  ".lan",
];

/**
 * Parses an IPv4 dotted-quad string into a 32-bit unsigned integer, or returns null.
 */
function parseIpv4ToUint32(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let result = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    if (part.length > 1 && part.startsWith("0")) return null;
    const octet = Number(part);
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) return null;
    result = ((result << 8) | octet) >>> 0;
  }
  return result >>> 0;
}

function inCidr4(ipUint32: number, baseDotted: string, prefixBits: number): boolean {
  const base = parseIpv4ToUint32(baseDotted);
  if (base === null) return false;
  const mask = prefixBits === 0 ? 0 : (~0 << (32 - prefixBits)) >>> 0;
  return (ipUint32 & mask) >>> 0 === (base & mask) >>> 0;
}

/**
 * Expands an IPv6 address into 8 16-bit words (0..0xffff), or returns null if invalid.
 */
function parseIpv6ToWords(rawIp: string): number[] | null {
  // Strip IPv6 zone index (%eth0) or brackets
  const cleaned = rawIp.replace(/^\[|\]$/g, "").split("%")[0].trim().toLowerCase();
  if (!cleaned || net.isIP(cleaned) !== 6) return null;

  let working = cleaned;
  // Convert embedded trailing IPv4 (e.g. ::ffff:127.0.0.1) into two hex words
  const lastColon = working.lastIndexOf(":");
  if (lastColon !== -1 && working.slice(lastColon + 1).includes(".")) {
    const ipv4Part = working.slice(lastColon + 1);
    const v4Int = parseIpv4ToUint32(ipv4Part);
    if (v4Int === null) return null;
    const highWord = ((v4Int >>> 16) & 0xffff).toString(16);
    const lowWord = (v4Int & 0xffff).toString(16);
    working = `${working.slice(0, lastColon)}:${highWord}:${lowWord}`;
  }

  const doubleColonParts = working.split("::");
  if (doubleColonParts.length > 2) return null;

  const parseSegmentList = (seg: string): number[] | null => {
    if (!seg) return [];
    const tokens = seg.split(":");
    const words: number[] = [];
    for (const t of tokens) {
      if (!/^[0-9a-f]{1,4}$/i.test(t)) return null;
      words.push(Number.parseInt(t, 16));
    }
    return words;
  };

  if (doubleColonParts.length === 1) {
    const words = parseSegmentList(doubleColonParts[0]);
    return words && words.length === 8 ? words : null;
  }

  const left = parseSegmentList(doubleColonParts[0]);
  const right = parseSegmentList(doubleColonParts[1]);
  if (!left || !right) return null;
  const missing = 8 - (left.length + right.length);
  if (missing < 1) return null;
  return [...left, ...new Array<number>(missing).fill(0), ...right];
}

/**
 * Returns true if the IP address (IPv4 or IPv6) is loopback, private, link-local,
 * CGNAT, cloud metadata, multicast, benchmarking, documentation, or reserved.
 */
export function isProhibitedIpAddress(rawIp: string): boolean {
  if (!rawIp || typeof rawIp !== "string") return true;
  const trimmed = rawIp.replace(/^\[|\]$/g, "").trim();
  if (!trimmed || trimmed.includes("%")) return true;

  const ipVersion = net.isIP(trimmed);
  if (ipVersion === 4) {
    const ip32 = parseIpv4ToUint32(trimmed);
    if (ip32 === null) return true;

    return (
      inCidr4(ip32, "0.0.0.0", 8) || // "This" network (RFC 1122)
      inCidr4(ip32, "10.0.0.0", 8) || // Private-Use (RFC 1918)
      inCidr4(ip32, "100.64.0.0", 10) || // Shared CGNAT Space (RFC 6598)
      inCidr4(ip32, "127.0.0.0", 8) || // Loopback (RFC 1122)
      inCidr4(ip32, "169.254.0.0", 16) || // Link-Local & Cloud Metadata 169.254.169.254 (RFC 3927)
      inCidr4(ip32, "172.16.0.0", 12) || // Private-Use (RFC 1918)
      inCidr4(ip32, "192.0.0.0", 24) || // IETF Protocol Assignments (RFC 6890)
      inCidr4(ip32, "192.0.2.0", 24) || // TEST-NET-1 (RFC 5737)
      inCidr4(ip32, "192.88.99.0", 24) || // 6to4 Relay Anycast (RFC 7526)
      inCidr4(ip32, "192.168.0.0", 16) || // Private-Use (RFC 1918)
      inCidr4(ip32, "198.18.0.0", 15) || // Benchmarking (RFC 2544)
      inCidr4(ip32, "198.51.100.0", 24) || // TEST-NET-2 (RFC 5737)
      inCidr4(ip32, "203.0.113.0", 24) || // TEST-NET-3 (RFC 5737)
      inCidr4(ip32, "224.0.0.0", 4) || // Multicast (RFC 5771)
      inCidr4(ip32, "240.0.0.0", 4) // Reserved & Limited Broadcast 255.255.255.255
    );
  }

  if (ipVersion === 6) {
    const words = parseIpv6ToWords(trimmed);
    if (!words) return true;

    const allZeroPrefix6 = words.slice(0, 6).every((w) => w === 0);
    const allZeroPrefix5 = words.slice(0, 5).every((w) => w === 0);

    // ::/128 unspecified or ::1/128 loopback
    if (allZeroPrefix6 && words[6] === 0 && (words[7] === 0 || words[7] === 1)) {
      return true;
    }

    // IPv4-mapped ::ffff:0:0/96 or IPv4-compatible ::/96
    if ((allZeroPrefix5 && words[5] === 0xffff) || allZeroPrefix6) {
      const embeddedV4 = `${(words[6] >>> 8) & 0xff}.${words[6] & 0xff}.${(words[7] >>> 8) & 0xff}.${words[7] & 0xff}`;
      if (isProhibitedIpAddress(embeddedV4)) return true;
    }

    // IPv4-translated ::ffff:0:0:0/96
    if (
      words[0] === 0 &&
      words[1] === 0 &&
      words[2] === 0 &&
      words[3] === 0 &&
      words[4] === 0xffff &&
      words[5] === 0
    ) {
      const embeddedV4 = `${(words[6] >>> 8) & 0xff}.${words[6] & 0xff}.${(words[7] >>> 8) & 0xff}.${words[7] & 0xff}`;
      if (isProhibitedIpAddress(embeddedV4)) return true;
    }

    // NAT64 64:ff9b::/96 and 64:ff9b:1::/48
    if (words[0] === 0x0064 && words[1] === 0xff9b) {
      return true;
    }

    // 6to4 2002::/16 (embeds IPv4 in words[1..2])
    if (words[0] === 0x2002) {
      const embeddedV4 = `${(words[1] >>> 8) & 0xff}.${words[1] & 0xff}.${(words[2] >>> 8) & 0xff}.${words[2] & 0xff}`;
      if (isProhibitedIpAddress(embeddedV4)) return true;
    }

    // Teredo 2001:0000::/32, Documentation 2001:db8::/32, Benchmark 2001:2::/48, ORCHID 2001:10::/28 & 2001:20::/28
    if (words[0] === 0x2001) {
      if (
        words[1] === 0x0000 ||
        words[1] === 0x0db8 ||
        (words[1] === 0x0002 && words[2] === 0x0000) ||
        (words[1] & 0xfff0) === 0x0010 ||
        (words[1] & 0xfff0) === 0x0020
      ) {
        return true;
      }
    }

    // Unique Local fc00::/7 (fc00..fdff)
    if ((words[0] & 0xfe00) === 0xfc00) return true;

    // Link-Local fe80::/10 (fe80..febf)
    if ((words[0] & 0xffc0) === 0xfe80) return true;

    // Site-Local fec0::/10 (deprecated)
    if ((words[0] & 0xffc0) === 0xfec0) return true;

    // Multicast ff00::/8
    if ((words[0] & 0xff00) === 0xff00) return true;

    // Discard-Only 100::/64
    if (words[0] === 0x0100 && words[1] === 0 && words[2] === 0 && words[3] === 0) {
      return true;
    }

    return false;
  }

  return true;
}

/**
 * Checks whether a hostname is an obfuscated numeric/octal/hex IPv4 literal
 * (e.g. "2130706433", "0x7f.0.0.1", "0177.0.0.1", "127.1").
 */
function isSuspiciousNumericHost(hostname: string): boolean {
  if (/^\d+$/.test(hostname)) return true;
  if (/^0x[0-9a-f]+$/i.test(hostname)) return true;
  const parts = hostname.split(".");
  if (parts.every((p) => /^\d+$/.test(p) || /^0x[0-9a-f]+$/i.test(p))) {
    // If all labels are numeric/hex, it MUST be a standard 4-octet decimal IPv4
    return parseIpv4ToUint32(hostname) === null;
  }
  return false;
}

/**
 * Validates that a raw URL string uses HTTP/HTTPS, has no credentials, uses standard ports,
 * and does not target a prohibited hostname or literal IP.
 */
export function validateExternalUrlSyntax(rawUrl: string): URL {
  if (typeof rawUrl !== "string") {
    throw new SafeFetchError("INVALID_URL", "Please enter a valid product link.");
  }
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.length > 2048) {
    throw new SafeFetchError("INVALID_URL", "Please enter a valid product link (under 2,048 characters).");
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new SafeFetchError("INVALID_URL", "That doesn't look like a valid web address.");
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new SafeFetchError(
      "UNSUPPORTED_PROTOCOL",
      "Only standard http:// and https:// store links are supported.",
    );
  }

  if (parsed.username || parsed.password) {
    throw new SafeFetchError(
      "INVALID_URL",
      "Links containing embedded credentials are not allowed.",
    );
  }

  if (parsed.port && parsed.port !== "80" && parsed.port !== "443") {
    throw new SafeFetchError(
      "PROHIBITED_HOST",
      "Links using non-standard network ports are not allowed.",
    );
  }

  const host = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host) {
    throw new SafeFetchError("INVALID_URL", "Please enter a complete store product URL.");
  }

  if (
    PROHIBITED_HOSTNAMES.has(host) ||
    PROHIBITED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))
  ) {
    throw new SafeFetchError(
      "PROHIBITED_HOST",
      "Internal, local, and private network addresses are not allowed.",
    );
  }

  if (isSuspiciousNumericHost(host)) {
    throw new SafeFetchError(
      "PROHIBITED_IP",
      "Direct or obfuscated IP addresses are not allowed.",
    );
  }

  const literalIpType = net.isIP(host);
  if (literalIpType !== 0) {
    if (isProhibitedIpAddress(host)) {
      throw new SafeFetchError(
        "PROHIBITED_IP",
        "Private, loopback, and reserved IP addresses are not allowed.",
      );
    }
  } else if (!host.includes(".")) {
    throw new SafeFetchError(
      "PROHIBITED_HOST",
      "Please enter a public store domain name.",
    );
  }

  return parsed;
}


const defaultDnsLookup: DnsLookupFn = async (hostname: string) => {
  const records = await dns.lookup(hostname, { all: true, verbatim: true });
  return records
    .filter((r): r is { address: string; family: 4 | 6 } => r.family === 4 || r.family === 6)
    .map((r) => ({ address: r.address, family: r.family }));
};

/**
 * Resolves a hostname via DNS and verifies that EVERY returned IPv4/IPv6 record is public.
 * Returns the first validated IP record to pin at connection time (preventing DNS rebinding).
 */
export async function resolveAndValidateHostIps(
  hostname: string,
  lookupFn: DnsLookupFn = defaultDnsLookup,
): Promise<DnsResolvedAddress> {
  const cleanHost = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const literalFamily = net.isIP(cleanHost);
  if (literalFamily === 4 || literalFamily === 6) {
    if (isProhibitedIpAddress(cleanHost)) {
      throw new SafeFetchError(
        "PROHIBITED_IP",
        "Private, loopback, and reserved IP addresses are not allowed.",
      );
    }
    return { address: cleanHost, family: literalFamily };
  }

  let records: DnsResolvedAddress[];
  try {
    records = await lookupFn(cleanHost);
  } catch {
    throw new SafeFetchError(
      "DNS_RESOLUTION_FAILED",
      "Could not resolve that store's domain name. Check the link and try again.",
    );
  }

  if (!records || records.length === 0) {
    throw new SafeFetchError(
      "DNS_RESOLUTION_FAILED",
      "Could not resolve that store's domain name.",
    );
  }

  for (const rec of records) {
    if (isProhibitedIpAddress(rec.address)) {
      throw new SafeFetchError(
        "PROHIBITED_IP",
        "That address resolves to a restricted or internal network and cannot be fetched.",
      );
    }
  }

  const preferredIpv4 = records.find((r) => r.family === 4);
  return preferredIpv4 ?? records[0];
}

/**
 * Default Node HTTP/HTTPS transport that pins the socket connection to `pinnedAddress`
 * via a custom `lookup` callback so DNS rebinding cannot occur between DNS validation
 * and TCP connection establishment. Never forwards cookies or credentials.
 */
const defaultPinnedNodeTransport: SafeTransportFn = (req: SafeTransportRequest) => {
  return new Promise<SafeTransportResponse>((resolve, reject) => {
    const isHttps = req.url.protocol === "https:";
    const requestModule = isHttps ? https : http;
    const pinnedLookup = (
      _hostname: string,
      options: unknown,
      callback?: (
        err: NodeJS.ErrnoException | null,
        address: string | Array<{ address: string; family: number }>,
        family?: number,
      ) => void,
    ) => {
      const cb = typeof options === "function" ? (options as typeof callback) : callback;
      const optsObj = typeof options === "object" && options !== null ? (options as { all?: boolean }) : {};
      if (!cb) return;
      if (optsObj.all) {
        cb(null, [{ address: req.pinnedAddress.address, family: req.pinnedAddress.family }]);
      } else {
        cb(null, req.pinnedAddress.address, req.pinnedAddress.family);
      }
    };

    const clientReq = requestModule.request(
      {
        protocol: req.url.protocol,
        hostname: req.url.hostname.replace(/^\[|\]$/g, ""),
        port: req.url.port ? Number(req.url.port) : isHttps ? 443 : 80,
        path: `${req.url.pathname}${req.url.search}`,
        method: "GET",
        headers: req.headers,
        lookup: pinnedLookup as never,
        servername: req.url.hostname.replace(/^\[|\]$/g, ""),
        timeout: req.timeoutMs,
        agent: false,
      },
      (res) => {
        const statusCode = res.statusCode ?? 0;
        const declaredLen = Number(res.headers["content-length"] ?? "0");
        if (Number.isFinite(declaredLen) && declaredLen > req.maxBytes) {
          res.destroy();
          reject(
            new SafeFetchError(
              "RESPONSE_TOO_LARGE",
              `The remote response exceeds the maximum allowed size (${Math.round(req.maxBytes / (1024 * 1024))} MB).`,
            ),
          );
          return;
        }

        const chunks: Buffer[] = [];
        let totalBytes = 0;

        res.on("data", (chunk: Buffer) => {
          totalBytes += chunk.length;
          if (totalBytes > req.maxBytes) {
            res.destroy();
            reject(
              new SafeFetchError(
                "RESPONSE_TOO_LARGE",
                `The remote response exceeds the maximum allowed size (${Math.round(req.maxBytes / (1024 * 1024))} MB).`,
              ),
            );
            return;
          }
          chunks.push(chunk);
        });

        res.on("end", () => {
          clearTimeout(timer);
          resolve({
            statusCode,
            headers: res.headers,
            body: new Uint8Array(Buffer.concat(chunks)),
          });
        });

        res.on("error", (err) => {
          clearTimeout(timer);
          reject(
            new SafeFetchError(
              "UPSTREAM_ERROR",
              err.message || "Error reading response from store.",
            ),
          );
        });
      },
    );

    const timer = setTimeout(() => {
      clientReq.destroy();
      reject(
        new SafeFetchError(
          "TIMEOUT",
          "The store took too long to respond. Try pasting a screenshot or uploading the image directly.",
        ),
      );
    }, req.timeoutMs);

    if (req.signal) {
      if (req.signal.aborted) {
        clearTimeout(timer);
        clientReq.destroy();
        reject(new SafeFetchError("TIMEOUT", "Request was cancelled."));
        return;
      }
      req.signal.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          clientReq.destroy();
          reject(new SafeFetchError("TIMEOUT", "Request was cancelled."));
        },
        { once: true },
      );
    }

    clientReq.on("timeout", () => {
      clearTimeout(timer);
      clientReq.destroy();
      reject(
        new SafeFetchError(
          "TIMEOUT",
          "Connection to the store timed out. Try pasting a screenshot or uploading the image directly.",
        ),
      );
    });

    clientReq.on("error", (err) => {
      clearTimeout(timer);
      if (err instanceof SafeFetchError) {
        reject(err);
        return;
      }
      reject(
        new SafeFetchError(
          "UPSTREAM_ERROR",
          "Could not connect to that store. Try pasting a screenshot or uploading the image directly.",
        ),
      );
    });

    clientReq.end();
  });
};

export interface SafeFetchOptions {
  maxBytes?: number;
  maxRedirects?: number;
  timeoutMs?: number;
  acceptHeader?: string;
  lookupFn?: DnsLookupFn;
  transportFn?: SafeTransportFn;
  signal?: AbortSignal;
}

export interface SafeFetchResult {
  finalUrl: string;
  normalizedFinalUrl: string;
  statusCode: number;
  contentType: string;
  body: Uint8Array;
}

function getHeaderString(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string {
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === lower) {
      return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
    }
  }
  return "";
}

/**
 * Fetches an untrusted URL safely with strict SSRF, DNS-rebinding, redirect-hop,
 * timeout, and response-size protections.
 */
export async function safeFetchUrl(
  rawUrl: string,
  options: SafeFetchOptions = {},
): Promise<SafeFetchResult> {
  const maxBytes = options.maxBytes ?? MAX_HTML_BYTES;
  const maxRedirects = options.maxRedirects ?? MAX_REDIRECTS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
  const lookupFn = options.lookupFn ?? defaultDnsLookup;
  const transportFn = options.transportFn ?? defaultPinnedNodeTransport;

  let currentUrl = validateExternalUrlSyntax(rawUrl);

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const pinnedAddress = await resolveAndValidateHostIps(currentUrl.hostname, lookupFn);

    const response = await transportFn({
      url: currentUrl,
      pinnedAddress,
      timeoutMs,
      maxBytes,
      signal: options.signal,
      headers: {
        Accept:
          options.acceptHeader ??
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "identity",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      },
    });

    if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
      if (hop >= maxRedirects) {
        throw new SafeFetchError(
          "TOO_MANY_REDIRECTS",
          `That link redirected too many times (over ${maxRedirects} redirects).`,
        );
      }
      const location = getHeaderString(response.headers, "location").trim();
      if (!location) {
        throw new SafeFetchError(
          "UPSTREAM_ERROR",
          "The store returned an invalid redirect response.",
        );
      }

      let nextUrl: URL;
      try {
        nextUrl = new URL(location, currentUrl);
      } catch {
        throw new SafeFetchError(
          "INVALID_URL",
          "The store redirected to an invalid address.",
        );
      }

      currentUrl = validateExternalUrlSyntax(nextUrl.toString());
      continue;
    }

    const contentType = getHeaderString(response.headers, "content-type").toLowerCase();
    return {
      finalUrl: currentUrl.toString(),
      normalizedFinalUrl: normalizeProductUrl(currentUrl.toString()),
      statusCode: response.statusCode,
      contentType,
      body: response.body,
    };
  }

  throw new SafeFetchError("TOO_MANY_REDIRECTS", "Too many redirects.");
}

/**
 * Fetches an HTML product page safely and validates its status and content type.
 */
export async function safeFetchHtml(
  rawUrl: string,
  options: Omit<SafeFetchOptions, "maxBytes" | "acceptHeader"> = {},
): Promise<{ html: string; finalUrl: string; normalizedFinalUrl: string }> {
  const result = await safeFetchUrl(rawUrl, {
    ...options,
    maxBytes: MAX_HTML_BYTES,
    acceptHeader: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  });

  if (result.statusCode === 401 || result.statusCode === 403 || result.statusCode === 429 || result.statusCode === 503) {
    throw new SafeFetchError(
      "UPSTREAM_BLOCKED",
      `This store blocked automated product access (HTTP ${result.statusCode}). You can paste a screenshot or product image instead, or enter the details manually.`,
      result.statusCode,
    );
  }

  if (result.statusCode < 200 || result.statusCode >= 300) {
    throw new SafeFetchError(
      "UPSTREAM_ERROR",
      `The store returned HTTP ${result.statusCode} for that product link.`,
      result.statusCode,
    );
  }

  if (
    result.contentType &&
    !result.contentType.includes("text/html") &&
    !result.contentType.includes("application/xhtml+xml") &&
    !result.contentType.includes("text/plain")
  ) {
    throw new SafeFetchError(
      "UNSUPPORTED_CONTENT_TYPE",
      "That link does not point to a web page. Paste a store product page URL or paste an image directly.",
    );
  }

  const html = new TextDecoder("utf-8", { fatal: false }).decode(result.body);
  return {
    html,
    finalUrl: result.finalUrl,
    normalizedFinalUrl: result.normalizedFinalUrl,
  };
}

export interface ValidatedImportedImage {
  bytes: Uint8Array;
  mimeType: SniffedImage["mimeType"];
  extension: SniffedImage["extension"];
  width: number;
  height: number;
  sha256: string;
}

/**
 * Extracts image width and height from JPEG, PNG, or WebP headers without native dependencies.
 */
export function parseImageDimensions(
  bytes: Uint8Array,
  mimeType: SniffedImage["mimeType"],
): { width: number; height: number } | null {
  if (mimeType === "image/png") {
    // PNG IHDR chunk starts at byte 8 (length 4, 'IHDR' 4, width 4, height 4)
    if (bytes.length < 24) return null;
    const ihdrTag = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
    if (ihdrTag !== "IHDR") return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const width = view.getUint32(16, false);
    const height = view.getUint32(20, false);
    return width > 0 && height > 0 ? { width, height } : null;
  }

  if (mimeType === "image/webp") {
    if (bytes.length < 30) return null;
    const chunkType = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (chunkType === "VP8 ") {
      // Lossy WebP: frame tag at 20..22, start code 0x9d 0x01 0x2a at 23..25, width/height at 26..29
      if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) return null;
      const width = view.getUint16(26, true) & 0x3fff;
      const height = view.getUint16(28, true) & 0x3fff;
      return width > 0 && height > 0 ? { width, height } : null;
    }
    if (chunkType === "VP8L") {
      // Lossless WebP: signature 0x2f at byte 20, packed 14-bit width/height at 21..24
      if (bytes[20] !== 0x2f) return null;
      const bits = view.getUint32(21, true);
      const width = (bits & 0x3fff) + 1;
      const height = ((bits >>> 14) & 0x3fff) + 1;
      return width > 0 && height > 0 ? { width, height } : null;
    }
    if (chunkType === "VP8X") {
      // Extended WebP: 24-bit width-1 at 24..26, 24-bit height-1 at 27..29
      const width = 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16));
      const height = 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16));
      return width > 0 && height > 0 ? { width, height } : null;
    }
    return null;
  }

  if (mimeType === "image/jpeg") {
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
    let offset = 2;
    while (offset + 8 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset++;
        continue;
      }
      const marker = bytes[offset + 1];
      // Skip padding 0xff bytes
      if (marker === 0xff) {
        offset++;
        continue;
      }
      // Standalone markers without length
      if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
        offset += 2;
        continue;
      }
      if (offset + 4 > bytes.length) return null;
      const segLength = (bytes[offset + 2] << 8) | bytes[offset + 3];
      if (segLength < 2 || offset + 2 + segLength > bytes.length) return null;

      // SOF0..SOF3, SOF5..SOF7, SOF9..SOF11, SOF13..SOF15
      const isSof =
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf);
      if (isSof) {
        if (offset + 9 > bytes.length) return null;
        const height = (bytes[offset + 5] << 8) | bytes[offset + 6];
        const width = (bytes[offset + 7] << 8) | bytes[offset + 8];
        return width > 0 && height > 0 ? { width, height } : null;
      }

      offset += 2 + segLength;
    }
    return null;
  }

  return null;
}

/**
 * Validates raw image bytes by magic bytes, structural header dimensions, and pixel bounds.
 */
export function parseAndValidateImageBytes(bytes: Uint8Array): ValidatedImportedImage {
  if (!bytes || bytes.length === 0) {
    throw new SafeFetchError("INVALID_IMAGE", "The image file is empty.");
  }
  if (bytes.length > MAX_IMPORT_IMAGE_BYTES) {
    throw new SafeFetchError("RESPONSE_TOO_LARGE", "That image exceeds the 4 MB size limit.");
  }

  const kind = sniffImage(bytes);
  if (!kind) {
    throw new SafeFetchError(
      "INVALID_IMAGE",
      "Only valid JPEG, PNG, and WebP product images are supported.",
    );
  }

  const dims = parseImageDimensions(bytes, kind.mimeType);
  if (!dims) {
    throw new SafeFetchError(
      "INVALID_IMAGE",
      "That image file appears to be truncated or corrupted.",
    );
  }

  if (dims.width < 32 || dims.height < 32) {
    throw new SafeFetchError(
      "INVALID_IMAGE",
      "That image is too small (tracking pixel or icon). Select a larger product photo.",
    );
  }

  if (dims.width > 6000 || dims.height > 6000 || dims.width * dims.height > 25_000_000) {
    throw new SafeFetchError(
      "INVALID_IMAGE",
      "That image has unsupported dimensions (over 6000×6000 px).",
    );
  }

  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");

  return {
    bytes,
    mimeType: kind.mimeType,
    extension: kind.extension,
    width: dims.width,
    height: dims.height,
    sha256,
  };
}

/**
 * Safely fetches and validates a remote product image URL.
 */
export async function safeFetchImage(
  rawImageUrl: string,
  options: Omit<SafeFetchOptions, "maxBytes" | "acceptHeader"> = {},
): Promise<ValidatedImportedImage> {
  const result = await safeFetchUrl(rawImageUrl, {
    ...options,
    maxBytes: MAX_IMPORT_IMAGE_BYTES,
    acceptHeader: "image/webp,image/png,image/jpeg,image/*;q=0.8,*/*;q=0.5",
  });

  if (result.statusCode < 200 || result.statusCode >= 300) {
    throw new SafeFetchError(
      "UPSTREAM_ERROR",
      `Could not download that product image (HTTP ${result.statusCode}).`,
      result.statusCode,
    );
  }

  return parseAndValidateImageBytes(result.body);
}
