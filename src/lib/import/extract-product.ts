import {
  CATEGORIES,
  categoryDefaultCareType,
  PATTERNS,
  WARDROBE_COLOURS,
  type CareType,
} from "@/lib/wardrobe/categories";
import { emptyItemValues } from "@/components/wardrobe/item-fields";
import type { ItemFieldsInput } from "@/lib/validation/wardrobe";
import { normalizeProductUrl } from "@/lib/import/url-utils";

export type ExtractionSource = "json-ld" | "opengraph" | "microdata" | "none";

export type ProductImageKind = "garment-only" | "model" | "detail" | "gallery";

export interface ExtractedProductImage {
  url: string;
  alt: string | null;
  kind: ProductImageKind;
  reason: string;
  width?: number | null;
  height?: number | null;
}

export interface ExtractedProductMetadata {
  title: string | null;
  brand: string | null;
  description: string | null;
  images: ExtractedProductImage[];
  recommendedImageIndex: number;
  color: string | null;
  material: string | null;
  category: string | null;
  productUrl: string;
  normalizedUrl: string;
  extractionSource: ExtractionSource;
  sourcesUsed: ExtractionSource[];
}

export type ExtractProductResult =
  | {
      ok: true;
      product: ExtractedProductMetadata;
      suggestedFields: Partial<ItemFieldsInput>;
      warnings: string[];
    }
  | {
      ok: false;
      code:
        | "BLOCKED_BY_STORE"
        | "NO_PRODUCT_DATA"
        | "EMPTY_HTML";
      message: string;
      fallbackHint: string;
    };

const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
  "&#x27;": "'",
  "&#x2F;": "/",
  "&ndash;": "–",
  "&mdash;": "—",
};

function decodeHtmlEntities(input: string): string {
  return input
    .replace(
      /&(?:amp|lt|gt|quot|apos|nbsp|#39|#x27|#x2F|ndash|mdash);/gi,
      (match) => HTML_ENTITIES[match.toLowerCase()] ?? match,
    )
    .replace(/&#(\d+);/g, (_, dec: string) => {
      const code = Number.parseInt(dec, 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : _;
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : _;
    });
}

function cleanText(raw: unknown, maxLength = 300): string | null {
  if (typeof raw !== "string") return null;
  const withoutTags = raw.replace(/<[^>]*>/g, " ");
  const decoded = decodeHtmlEntities(withoutTags)
    .replace(/\s+/g, " ")
    .trim();
  if (!decoded) return null;
  return decoded.length > maxLength ? decoded.slice(0, maxLength).trim() : decoded;
}

function resolveCandidateUrl(rawUrl: unknown, baseUrl: string): string | null {
  if (typeof rawUrl !== "string") return null;
  const trimmed = decodeHtmlEntities(rawUrl).trim();
  if (!trimmed || trimmed.startsWith("data:") || trimmed.startsWith("javascript:")) {
    return null;
  }
  try {
    const resolved = new URL(trimmed, baseUrl);
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") {
      return null;
    }
    return resolved.toString();
  } catch {
    return null;
  }
}

function isLikelyDecorativeOrNonProductImage(url: string, alt: string | null): boolean {
  const lowerUrl = url.toLowerCase();
  const lowerAlt = (alt ?? "").toLowerCase();

  if (
    lowerUrl.endsWith(".svg") ||
    lowerUrl.endsWith(".gif") ||
    lowerUrl.includes("sprite") ||
    lowerUrl.includes("favicon") ||
    lowerUrl.includes("/logo") ||
    lowerUrl.includes("logo-") ||
    lowerUrl.includes("logo_") ||
    lowerUrl.includes("icon-") ||
    lowerUrl.includes("/icons/") ||
    lowerUrl.includes("payment") ||
    lowerUrl.includes("badge") ||
    lowerUrl.includes("placeholder") ||
    lowerUrl.includes("blank.") ||
    lowerUrl.includes("1x1") ||
    lowerUrl.includes("pixel") ||
    lowerUrl.includes("tracking") ||
    lowerUrl.includes("avatar") ||
    lowerUrl.includes("flag")
  ) {
    return true;
  }

  if (
    lowerAlt === "logo" ||
    lowerAlt.includes("brand logo") ||
    lowerAlt.includes("payment") ||
    lowerAlt.includes("trustpilot")
  ) {
    return true;
  }

  return false;
}

/**
 * Classifies an image URL + alt text into `"garment-only"`, `"model"`, `"detail"`, or `"gallery"`.
 * Retailers frequently encode shot types in URLs or alt text (e.g., `packshot`, `flat`, `still-life`,
 * `product`, `ghost`, `front_flat` vs `model`, `on-body`, `lookbook`, `worn`, `full-length`).
 */
export function classifyProductImage(
  url: string,
  alt: string | null,
  index: number,
): { kind: ProductImageKind; reason: string; score: number } {
  const combined = `${url} ${alt ?? ""}`.toLowerCase();

  const garmentKeywords = [
    "packshot",
    "flatlay",
    "flat-lay",
    "flat_lay",
    "still-life",
    "still_life",
    "stilllife",
    "cutout",
    "cut-out",
    "ghost",
    "mannequin",
    "isolated",
    "product-only",
    "product_only",
    "garment-only",
    "garment_only",
    "laydown",
    "lay-down",
    "nobg",
    "ecomm",
    "_flat",
    "-flat",
    "/flat/",
    "_pack",
    "-pack",
    "_still",
    "-still",
  ];

  const modelKeywords = [
    "model",
    "on-body",
    "on_body",
    "onbody",
    "lookbook",
    "editorial",
    "lifestyle",
    "wearing",
    "worn",
    "outfit",
    "full-body",
    "full_body",
    "catwalk",
    "runway",
    "_model",
    "-model",
    "/model/",
  ];

  const detailKeywords = [
    "detail",
    "closeup",
    "close-up",
    "close_up",
    "fabric",
    "texture",
    "swatch",
    "zoom",
    "label",
    "care-tag",
  ];

  const isDetail = detailKeywords.some((k) => combined.includes(k));
  const isGarmentOnly = garmentKeywords.some((k) => combined.includes(k));
  const isModel = modelKeywords.some((k) => combined.includes(k));

  if (isDetail && !isGarmentOnly) {
    return {
      kind: "detail",
      reason: "Fabric or close-up detail shot",
      score: 35 - Math.min(index, 10),
    };
  }

  if (isGarmentOnly && !isModel) {
    return {
      kind: "garment-only",
      reason: "Garment-only / flat-lay product photograph",
      score: 100 - Math.min(index, 10),
    };
  }

  if (isModel && !isGarmentOnly) {
    return {
      kind: "model",
      reason: "Model photograph",
      score: 65 - Math.min(index, 10),
    };
  }

  return {
    kind: "gallery",
    reason: index === 0 ? "Primary gallery image" : `Gallery view #${index + 1}`,
    score: 75 - Math.min(index * 2, 20),
  };
}

function buildDeduplicatedGallery(
  candidates: Array<{
    url: string;
    alt?: string | null;
    width?: number | null;
    height?: number | null;
  }>,
  baseUrl: string,
): { images: ExtractedProductImage[]; recommendedImageIndex: number } {
  const seenNormalized = new Set<string>();
  const rawList: Array<{
    url: string;
    alt: string | null;
    width?: number | null;
    height?: number | null;
  }> = [];

  for (const candidate of candidates) {
    const resolved = resolveCandidateUrl(candidate.url, baseUrl);
    if (!resolved) continue;
    const alt = cleanText(candidate.alt, 180);
    if (isLikelyDecorativeOrNonProductImage(resolved, alt)) continue;

    // Deduplicate identical URLs (ignoring trivial tracking fragments)
    let dedupeKey = resolved;
    try {
      const u = new URL(resolved);
      u.hash = "";
      dedupeKey = u.toString();
    } catch {
      // keep resolved
    }

    if (seenNormalized.has(dedupeKey)) continue;
    seenNormalized.add(dedupeKey);

    rawList.push({
      url: resolved,
      alt,
      width: candidate.width ?? null,
      height: candidate.height ?? null,
    });
    if (rawList.length >= 16) break;
  }

  let bestIndex = 0;
  let bestScore = -Infinity;

  const images: ExtractedProductImage[] = rawList.map((item, index) => {
    const classified = classifyProductImage(item.url, item.alt, index);
    if (classified.score > bestScore) {
      bestScore = classified.score;
      bestIndex = index;
    }
    return {
      url: item.url,
      alt: item.alt,
      kind: classified.kind,
      reason: classified.reason,
      width: item.width,
      height: item.height,
    };
  });

  return {
    images,
    recommendedImageIndex: images.length > 0 ? bestIndex : 0,
  };
}

// --- Priority A: Schema.org JSON-LD Product / ProductGroup extraction --------------------------

interface PartialProductExtract {
  title: string | null;
  brand: string | null;
  description: string | null;
  color: string | null;
  material: string | null;
  category: string | null;
  url: string | null;
  images: Array<{ url: string; alt?: string | null }>;
}

function hasProductSchemaType(typeVal: unknown): boolean {
  const checkSingle = (v: unknown): boolean => {
    if (typeof v !== "string") return false;
    const normalized = v.trim().replace(/^https?:\/\/schema\.org\//i, "").toLowerCase();
    return (
      normalized === "product" ||
      normalized === "productgroup" ||
      normalized === "individualproduct" ||
      normalized === "productmodel" ||
      normalized === "clothing"
    );
  };
  if (Array.isArray(typeVal)) return typeVal.some(checkSingle);
  return checkSingle(typeVal);
}

function extractImagesFromJsonLdValue(
  val: unknown,
  defaultAlt: string | null,
): Array<{ url: string; alt?: string | null }> {
  const out: Array<{ url: string; alt?: string | null }> = [];
  const visit = (item: unknown) => {
    if (!item) return;
    if (typeof item === "string") {
      out.push({ url: item, alt: defaultAlt });
      return;
    }
    if (Array.isArray(item)) {
      for (const sub of item) visit(sub);
      return;
    }
    if (typeof item === "object") {
      const obj = item as Record<string, unknown>;
      const urlCandidate =
        obj.url ?? obj.contentUrl ?? obj.thumbnailUrl ?? obj["@id"];
      const altCandidate =
        cleanText(obj.caption ?? obj.name ?? obj.description, 160) ?? defaultAlt;
      if (typeof urlCandidate === "string") {
        out.push({ url: urlCandidate, alt: altCandidate });
      } else if (Array.isArray(urlCandidate)) {
        for (const u of urlCandidate) {
          if (typeof u === "string") out.push({ url: u, alt: altCandidate });
        }
      }
    }
  };
  visit(val);
  return out;
}

function extractBrandFromJsonLd(brandVal: unknown): string | null {
  if (!brandVal) return null;
  if (typeof brandVal === "string") return cleanText(brandVal, 100);
  if (Array.isArray(brandVal)) {
    for (const item of brandVal) {
      const found = extractBrandFromJsonLd(item);
      if (found) return found;
    }
    return null;
  }
  if (typeof brandVal === "object") {
    const obj = brandVal as Record<string, unknown>;
    return cleanText(obj.name ?? obj.legalName ?? obj.alternateName, 100);
  }
  return null;
}

function extractStringOrListField(val: unknown, maxLen = 100): string | null {
  if (!val) return null;
  if (typeof val === "string") return cleanText(val, maxLen);
  if (Array.isArray(val)) {
    const parts = val
      .map((item) => {
        if (typeof item === "string") return cleanText(item, maxLen);
        if (item && typeof item === "object") {
          const obj = item as Record<string, unknown>;
          return cleanText(obj.name ?? obj.value, maxLen);
        }
        return null;
      })
      .filter((p): p is string => Boolean(p));
    if (parts.length === 0) return null;
    return cleanText(parts.join(", "), maxLen);
  }
  if (typeof val === "object") {
    const obj = val as Record<string, unknown>;
    return cleanText(obj.name ?? obj.value, maxLen);
  }
  return null;
}

function extractAdditionalProperty(
  props: unknown,
  targetNames: string[],
): string | null {
  if (!Array.isArray(props)) return null;
  for (const prop of props) {
    if (!prop || typeof prop !== "object") continue;
    const obj = prop as Record<string, unknown>;
    const propName = cleanText(obj.name ?? obj.propertyID, 60)?.toLowerCase();
    if (!propName) continue;
    if (targetNames.some((t) => propName === t || propName.includes(t))) {
      const value = extractStringOrListField(obj.value ?? obj.description, 100);
      if (value) return value;
    }
  }
  return null;
}

function collectProductNodesFromJsonLd(root: unknown, acc: Record<string, unknown>[]): void {
  if (!root) return;
  if (Array.isArray(root)) {
    for (const item of root) collectProductNodesFromJsonLd(item, acc);
    return;
  }
  if (typeof root !== "object") return;
  const obj = root as Record<string, unknown>;

  if (hasProductSchemaType(obj["@type"])) {
    acc.push(obj);
  }

  if (Array.isArray(obj["@graph"])) {
    collectProductNodesFromJsonLd(obj["@graph"], acc);
  }
  if (obj.mainEntity) {
    collectProductNodesFromJsonLd(obj.mainEntity, acc);
  }
  if (obj.hasVariant) {
    collectProductNodesFromJsonLd(obj.hasVariant, acc);
  }
  if (obj.isVariantOf) {
    collectProductNodesFromJsonLd(obj.isVariantOf, acc);
  }
}

function parseJsonLdProducts(html: string): PartialProductExtract | null {
  const scriptRegex =
    /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const productNodes: Record<string, unknown>[] = [];

  let match: RegExpExecArray | null;
  while ((match = scriptRegex.exec(html)) !== null) {
    const rawContent = match[1]?.trim();
    if (!rawContent) continue;

    const cleanedContent = rawContent
      .replace(/^\s*<!--/, "")
      .replace(/-->\s*$/, "")
      .trim();

    try {
      const parsed = JSON.parse(cleanedContent);
      collectProductNodesFromJsonLd(parsed, productNodes);
    } catch {
      // Tolerate malformed JSON-LD blocks when other blocks or OpenGraph tags exist
    }
  }

  if (productNodes.length === 0) return null;

  const merged: PartialProductExtract = {
    title: null,
    brand: null,
    description: null,
    color: null,
    material: null,
    category: null,
    url: null,
    images: [],
  };

  for (const node of productNodes) {
    const nodeTitle = cleanText(node.name ?? node.headline, 180);
    if (!merged.title && nodeTitle) merged.title = nodeTitle;

    if (!merged.brand) {
      merged.brand = extractBrandFromJsonLd(node.brand ?? node.manufacturer);
    }

    if (!merged.description) {
      merged.description = cleanText(node.description, 500);
    }

    if (!merged.color) {
      merged.color =
        extractStringOrListField(node.color ?? node.colour, 80) ??
        extractAdditionalProperty(node.additionalProperty, ["color", "colour", "shade"]);
    }

    if (!merged.material) {
      merged.material =
        extractStringOrListField(node.material, 100) ??
        extractAdditionalProperty(node.additionalProperty, [
          "material",
          "fabric",
          "composition",
        ]);
    }

    if (!merged.category) {
      merged.category =
        extractStringOrListField(node.category, 100) ??
        extractAdditionalProperty(node.additionalProperty, ["category", "garment type", "product type"]);
    }

    if (!merged.url && typeof node.url === "string") {
      merged.url = node.url;
    }

    const nodeImages = extractImagesFromJsonLdValue(
      node.image ?? node.photos ?? node.logo,
      nodeTitle ?? merged.title,
    );
    merged.images.push(...nodeImages);

    // Also inspect nested offers or variants if they carry extra gallery images or URLs
    if (Array.isArray(node.hasVariant)) {
      for (const variant of node.hasVariant) {
        if (variant && typeof variant === "object") {
          const vObj = variant as Record<string, unknown>;
          const vAlt = cleanText(vObj.name ?? vObj.color, 160) ?? merged.title;
          merged.images.push(...extractImagesFromJsonLdValue(vObj.image, vAlt));
          if (!merged.color) {
            merged.color = extractStringOrListField(vObj.color ?? vObj.colour, 80);
          }
          if (!merged.material) {
            merged.material = extractStringOrListField(vObj.material, 100);
          }
        }
      }
    }
  }

  const hasMeaningfulData = Boolean(
    merged.title || merged.images.length > 0 || merged.brand || merged.description,
  );
  return hasMeaningfulData ? merged : null;
}

// --- Priority B: OpenGraph & Meta Tags extraction ----------------------------------------------

function parseAttributes(tagHtml: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRegex =
    /([a-zA-Z0-9_:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  let match: RegExpExecArray | null;
  while ((match = attrRegex.exec(tagHtml)) !== null) {
    const key = match[1].toLowerCase();
    const val = match[2] ?? match[3] ?? match[4] ?? "";
    attrs[key] = decodeHtmlEntities(val);
  }
  return attrs;
}

function parseOpenGraphAndMeta(html: string): PartialProductExtract | null {
  const metaRegex = /<meta\b[^>]*>/gi;
  const metaValues = new Map<string, string[]>();

  let match: RegExpExecArray | null;
  while ((match = metaRegex.exec(html)) !== null) {
    const attrs = parseAttributes(match[0]);
    const key = (attrs.property ?? attrs.name ?? attrs.itemprop ?? "")
      .trim()
      .toLowerCase();
    const content = (attrs.content ?? attrs.value ?? "").trim();
    if (!key || !content) continue;
    const list = metaValues.get(key) ?? [];
    list.push(content);
    metaValues.set(key, list);
  }

  const firstMeta = (...keys: string[]): string | null => {
    for (const k of keys) {
      const vals = metaValues.get(k);
      if (vals && vals.length > 0) {
        const cleaned = cleanText(vals[0], 300);
        if (cleaned) return cleaned;
      }
    }
    return null;
  };

  const title = firstMeta("og:title", "twitter:title", "product:title", "title");
  const brand = firstMeta(
    "product:brand",
    "og:brand",
    "brand",
    "twitter:data1",
    "og:site_name",
  );
  const description = firstMeta(
    "og:description",
    "twitter:description",
    "description",
  );
  const color = firstMeta(
    "product:color",
    "product:colour",
    "og:color",
    "color",
  );
  const material = firstMeta(
    "product:material",
    "og:material",
    "material",
  );
  const category = firstMeta(
    "product:category",
    "og:product:category",
    "category",
  );
  const url = firstMeta("og:url");

  const imageUrls: string[] = [];
  for (const imgKey of [
    "og:image:secure_url",
    "og:image",
    "og:image:url",
    "product:image",
    "twitter:image",
    "twitter:image:src",
  ]) {
    const vals = metaValues.get(imgKey);
    if (vals) imageUrls.push(...vals);
  }

  const altText = firstMeta("og:image:alt", "twitter:image:alt") ?? title;
  const images = imageUrls.map((u) => ({ url: u, alt: altText }));

  const hasProductSignals = Boolean(
    title || images.length > 0 || brand || color || material || category,
  );
  if (!hasProductSignals) return null;

  return {
    title,
    brand,
    description,
    color,
    material,
    category,
    url,
    images,
  };
}

// --- Priority C: Microdata & Semantic HTML Product Fallback ------------------------------------

function parseMicrodataAndGalleryHtml(html: string): PartialProductExtract | null {
  const extractItempropText = (propName: string, maxLen = 160): string | null => {
    const regex = new RegExp(
      `<([a-z0-9]+)\\b[^>]*itemprop\\s*=\\s*["']${propName}["'][^>]*>([\\s\\S]*?)<\\/\\1>`,
      "i",
    );
    const m = regex.exec(html);
    if (m?.[2]) {
      const cleaned = cleanText(m[2], maxLen);
      if (cleaned) return cleaned;
    }
    return null;
  };

  let title = extractItempropText("name", 180);
  if (!title) {
    const h1Match = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
    if (h1Match?.[1]) {
      title = cleanText(h1Match[1], 180);
    }
  }

  const brand = extractItempropText("brand", 100);
  const description = extractItempropText("description", 400);
  const color = extractItempropText("color", 80) ?? extractItempropText("colour", 80);
  const material = extractItempropText("material", 100);
  const category = extractItempropText("category", 100);

  let canonicalUrl: string | null = null;
  const linkRegex = /<link\b[^>]*rel\s*=\s*["']canonical["'][^>]*>/i;
  const linkMatch = linkRegex.exec(html);
  if (linkMatch) {
    const attrs = parseAttributes(linkMatch[0]);
    if (attrs.href) canonicalUrl = attrs.href;
  }

  // Extract candidate product gallery images from <img> tags
  const images: Array<{ url: string; alt?: string | null }> = [];
  const imgRegex = /<img\b[^>]*>/gi;
  let imgMatch: RegExpExecArray | null;
  while ((imgMatch = imgRegex.exec(html)) !== null) {
    const attrs = parseAttributes(imgMatch[0]);
    const isItempropImage = (attrs.itemprop ?? "").toLowerCase().includes("image");
    const classOrId = `${attrs.class ?? ""} ${attrs.id ?? ""} ${attrs["data-testid"] ?? ""}`.toLowerCase();
    const isProductGalleryImg =
      isItempropImage ||
      classOrId.includes("product") ||
      classOrId.includes("gallery") ||
      classOrId.includes("pdp") ||
      classOrId.includes("main-image") ||
      classOrId.includes("packshot") ||
      classOrId.includes("zoom");

    // Pick best resolution from srcset / data-src / src
    let candidateSrc =
      attrs["data-zoom-image"] ??
      attrs["data-large_image"] ??
      attrs["data- highres"] ??
      attrs["data-src"] ??
      attrs.src ??
      "";

    const srcset = attrs.srcset ?? attrs["data-srcset"];
    if (srcset) {
      const parts = srcset
        .split(",")
        .map((s) => s.trim().split(/\s+/)[0])
        .filter(Boolean);
      if (parts.length > 0) {
        candidateSrc = parts[parts.length - 1];
      }
    }

    if (!candidateSrc) continue;
    const width = attrs.width ? Number.parseInt(attrs.width, 10) : null;
    const height = attrs.height ? Number.parseInt(attrs.height, 10) : null;
    if ((width && width < 100) || (height && height < 100)) continue;

    if (isProductGalleryImg || images.length < 6) {
      images.push({
        url: candidateSrc,
        alt: cleanText(attrs.alt, 160) ?? title,
      });
    }
  }

  const hasAny = Boolean(title || brand || color || material || images.length > 0);
  if (!hasAny) return null;

  return {
    title,
    brand,
    description,
    color,
    material,
    category,
    url: canonicalUrl,
    images,
  };
}

function isBotChallengeHtml(html: string): boolean {
  const lower = html.toLowerCase();
  const hasBotMarkers =
    lower.includes("cf-browser-verification") ||
    lower.includes("challenge-platform") ||
    lower.includes("attention required! | cloudflare") ||
    lower.includes("access denied") ||
    lower.includes("pardon our interruption") ||
    lower.includes("perimeterx") ||
    lower.includes("datadome") ||
    lower.includes("verify you are human") ||
    lower.includes("enable javascript and cookies to continue") ||
    (lower.includes("kwcdn.com") && lower.includes("assets/chl/js")) ||
    (lower.includes("function _0x") && lower.includes("challenge"));

  const hasAnyProductHint =
    lower.includes("application/ld+json") ||
    lower.includes("og:title") ||
    lower.includes("product:brand") ||
    lower.includes("itemprop=");

  return hasBotMarkers && !hasAnyProductHint;
}

function stripStoreSuffixFromTitle(title: string, brand: string | null): string {
  // Remove trailing " | Store Name" or " - Official Store" when the prefix is a meaningful title
  const splitPipe = title.split(/\s+[|—–]\s+/);
  if (splitPipe.length > 1 && splitPipe[0].trim().length >= 4) {
    return splitPipe[0].trim();
  }
  const splitDash = title.split(/\s+-\s+/);
  if (splitDash.length > 2 && splitDash[0].trim().length >= 5) {
    const lastSeg = splitDash[splitDash.length - 1].trim().toLowerCase();
    if (
      (brand && lastSeg.includes(brand.toLowerCase())) ||
      lastSeg.includes(".com") ||
      lastSeg.includes("official") ||
      lastSeg.includes("shop") ||
      lastSeg.includes("store")
    ) {
      return splitDash.slice(0, -1).join(" - ").trim();
    }
  }
  return title;
}

// --- Taxonomy mapping to ClosetAI Wardrobe Fields ----------------------------------------------

const CATEGORY_KEYWORDS: ReadonlyArray<{ slug: string; terms: string[] }> = [
  { slug: "polo-shirts", terms: ["polo shirt", "polo top", "pique polo", "rugby polo", "polo"] },
  { slug: "t-shirts", terms: ["t-shirt", "t shirt", "tee shirt", "graphic tee", "baby tee", "crewneck tee", "vest top", "tank top", "camisole", "singlet", "bodysuit", "crop top", "tee"] },
  { slug: "hoodies", terms: ["hoodie", "hooded sweatshirt", "zip-up hoodie", "sweatshirt"] },
  { slug: "sweaters", terms: ["sweater", "jumper", "cardigan", "knitwear", "pullover", "turtleneck", "rollneck", "crewneck knit", "vest knit"] },
  { slug: "blazers", terms: ["blazer", "suit jacket", "sport coat", "tuxedo jacket", "dinner jacket"] },
  { slug: "windbreakers", terms: ["windbreaker", "anorak", "raincoat", "rain jacket", "shell jacket", "wind jacket"] },
  { slug: "jackets", terms: ["jacket", "coat", "trench", "parka", "puffer", "bomber", "gilet", "overcoat", "peacoat", "denim jacket", "leather jacket", "shacket", "fleece"] },
  { slug: "shirts", terms: ["shirt", "blouse", "button-down", "button-up", "oxford shirt", "overshirt", "tunic", "poplin shirt", "linen shirt", "flannel shirt"] },
  { slug: "jorts", terms: ["jorts", "denim shorts", "jean shorts"] },
  { slug: "capri-pants", terms: ["capri", "cropped pants", "pedal pushers", "3/4 pants"] },
  { slug: "jeans", terms: ["jeans", "denim pants", "straight leg jean", "wide leg jean", "skinny jean", "mom jean", "baggy jean", "raw denim"] },
  { slug: "shorts", terms: ["shorts", "chino shorts", "cargo shorts", "bermuda shorts", "running shorts", "cycling shorts"] },
  { slug: "skirts", terms: ["skirt", "mini skirt", "midi skirt", "maxi skirt", "pleated skirt", "pencil skirt", "skort"] },
  { slug: "trousers", terms: ["trousers", "pants", "chinos", "slacks", "joggers", "track pants", "sweatpants", "cargo pants", "leggings", "culottes", "tailored pants", "wide-leg pants"] },
  { slug: "dresses", terms: ["dress", "gown", "maxi dress", "midi dress", "mini dress", "sundress", "slip dress", "shirt dress", "jumpsuit", "romper", "playsuit"] },
  { slug: "traditional", terms: ["agbada", "kaftan", "senator", "ankara", "buba", "iro", "dashiki", "aso-oke", "adire", "isiagu", "wrapper", "kimono", "sari", "kurta", "abayas", "abaya"] },
  { slug: "sneakers", terms: ["sneakers", "sneaker", "trainers", "trainer", "running shoes", "tennis shoes", "plimsolls", "kicks"] },
  { slug: "boots", terms: ["boots", "chelsea boot", "ankle boot", "combat boot", "desert boot", "chukka", "knee-high boot"] },
  { slug: "sandals", terms: ["sandals", "sandal", "slides", "flip-flops", "flip flops", "mules", "espadrilles", "clogs", "slippers"] },
  { slug: "shoes", terms: ["loafers", "heels", "pumps", "oxfords", "derbies", "brogues", "flats", "ballerina", "mary janes", "court shoes", "footwear", "shoes"] },
  { slug: "bags", terms: ["handbag", "tote bag", "shoulder bag", "crossbody", "backpack", "clutch", "duffel", "satchel", "messenger bag", "belt bag", "purse", "bag"] },
  { slug: "watches", terms: ["wristwatch", "chronograph", "timepiece", "watch"] },
  { slug: "belts", terms: ["belt", "waist belt", "leather belt"] },
  { slug: "sunglasses", terms: ["sunglasses", "eyewear", "shades", "aviators", "wayfarers", "glasses"] },
  { slug: "caps", terms: ["baseball cap", "trucker cap", "snapback", "dad cap", "beanie", "cap"] },
  { slug: "hats", terms: ["bucket hat", "fedora", "sun hat", "straw hat", "beret", "panama hat", "hat"] },
  { slug: "wigs", terms: ["wig", "lace front", "hairpiece"] },
  { slug: "jewellery", terms: ["necklace", "bracelet", "earrings", "earring", "ring", "pendant", "bangle", "choker", "anklet", "cufflinks", "jewelry", "jewellery"] },
  { slug: "ties", terms: ["necktie", "bow tie", "bowtie", "cravat", "silk tie", "tie"] },
  { slug: "scarves", terms: ["scarf", "scarves", "shawl", "pashmina", "bandana", "neckerchief"] },
  { slug: "socks", terms: ["socks", "ankle socks", "crew socks", "tights", "hosiery", "stockings"] },
  { slug: "underwear", terms: ["underwear", "boxers", "briefs", "bra", "bralette", "lingerie", "panties", "knickers", "trunks", "undershirt"] },
  { slug: "accessories", terms: ["wallet", "cardholder", "gloves", "umbrella", "keychain", "hair clip", "headband", "accessory"] },
];

const COLOUR_SYNONYMS: ReadonlyArray<{
  canonical: (typeof WARDROBE_COLOURS)[number];
  terms: string[];
}> = [
  { canonical: "black", terms: ["black", "jet", "onyx", "ebony", "noir", "carbon"] },
  { canonical: "white", terms: ["white", "optic white", "snow", "ivory", "chalk", "alabaster", "off-white", "off white"] },
  { canonical: "cream", terms: ["cream", "ecru", "oatmeal", "vanilla", "eggshell", "bone", "natural"] },
  { canonical: "beige", terms: ["beige", "sand", "camel", "tan", "khaki", "taupe", "stone", "nude", "fawn", "biscuit", "latte", "champagne"] },
  { canonical: "brown", terms: ["brown", "chocolate", "espresso", "coffee", "mocha", "chestnut", "cognac", "mahogany", "walnut", "cocoa", "rust", "terracotta", "cinnamon"] },
  { canonical: "grey", terms: ["grey", "gray", "charcoal", "slate", "graphite", "heather", "marl", "silver", "pewter", "gunmetal"] },
  { canonical: "ash", terms: ["ash", "light grey", "light gray", "dove grey"] },
  { canonical: "navy", terms: ["navy", "midnight blue", "dark blue", "ink blue", "marine", "indigo"] },
  { canonical: "blue", terms: ["blue", "cobalt", "sky blue", "baby blue", "royal blue", "teal", "turquoise", "aqua", "cyan", "cerulean", "denim blue", "light blue", "chambray", "cornflower"] },
  { canonical: "olive", terms: ["olive", "khaki green", "army green", "military green", "moss", "sage"] },
  { canonical: "green", terms: ["green", "emerald", "forest green", "mint", "lime", "jade", "pistachio", "pine", "bottle green", "kelly green", "hunter green"] },
  { canonical: "burgundy", terms: ["burgundy", "maroon", "wine", "bordeaux", "merlot", "oxblood", "claret", "plum", "berry"] },
  { canonical: "red", terms: ["red", "crimson", "scarlet", "cherry", "ruby", "vermilion", "coral red", "brick"] },
  { canonical: "pink", terms: ["pink", "blush", "rose", "magenta", "fuchsia", "salmon", "peach", "dusty pink", "millennial pink", "hot pink", "lilac pink"] },
  { canonical: "orange", terms: ["orange", "tangerine", "apricot", "amber", "burnt orange", "papaya", "ginger", "copper"] },
  { canonical: "yellow", terms: ["yellow", "mustard", "gold", "lemon", "canary", "butter", "ochre", "saffron", "chartreuse"] },
  { canonical: "purple", terms: ["purple", "lavender", "violet", "lilac", "mauve", "amethyst", "aubergine", "eggplant", "orchid"] },
  { canonical: "multicolour", terms: ["multicolour", "multicolor", "multi-colour", "multi-color", "rainbow", "colourblock", "colorblock", "tie-dye", "multi"] },
];

const PATTERN_SYNONYMS: ReadonlyArray<{
  canonical: (typeof PATTERNS)[number];
  terms: string[];
}> = [
  { canonical: "striped", terms: ["striped", "stripe", "pinstripe", "breton"] },
  { canonical: "checked", terms: ["checked", "check", "gingham", "houndstooth", "tattersall"] },
  { canonical: "plaid", terms: ["plaid", "tartan", "flannel check"] },
  { canonical: "floral", terms: ["floral", "flower", "botanical", "daisy", "rose print"] },
  { canonical: "polka_dot", terms: ["polka dot", "polka-dot", "spotted", "dots"] },
  { canonical: "camouflage", terms: ["camouflage", "camo"] },
  { canonical: "graphic", terms: ["graphic", "logo print", "slogan", "band tee"] },
  { canonical: "printed", terms: ["printed", "animal print", "leopard", "zebra", "paisley", "geometric", "abstract print", "monogram"] },
];

export function matchClosetCategory(
  rawCategory: string | null,
  rawTitle: string | null,
  rawDescription: string | null,
): { category: string | null; subcategory: string | null } {
  const sources = [
    rawCategory?.toLowerCase() ?? "",
    rawTitle?.toLowerCase() ?? "",
    rawDescription?.toLowerCase() ?? "",
  ];

  // Check explicit category & title first before falling back to description
  for (const text of sources.slice(0, 2)) {
    if (!text) continue;
    for (const entry of CATEGORY_KEYWORDS) {
      for (const term of entry.terms) {
        const regex = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}s?\\b`, "i");
        if (regex.test(text)) {
          return {
            category: entry.slug,
            subcategory: rawCategory && rawCategory.length <= 60 ? rawCategory : null,
          };
        }
      }
    }
  }

  // Fallback check on description if category and title didn't match
  const desc = sources[2];
  if (desc) {
    for (const entry of CATEGORY_KEYWORDS) {
      for (const term of entry.terms) {
        const regex = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}s?\\b`, "i");
        if (regex.test(desc)) {
          return {
            category: entry.slug,
            subcategory: rawCategory && rawCategory.length <= 60 ? rawCategory : null,
          };
        }
      }
    }
  }

  // Also check if rawCategory directly matches a ClosetAI category slug or label
  if (rawCategory) {
    const norm = rawCategory.trim().toLowerCase();
    const direct = CATEGORIES.find(
      (c) => c.value === norm || c.label.toLowerCase() === norm,
    );
    if (direct) return { category: direct.value, subcategory: null };
  }

  return { category: null, subcategory: rawCategory && rawCategory.length <= 60 ? rawCategory : null };
}

export function matchClosetColours(
  rawColor: string | null,
  rawTitle: string | null,
): {
  primaryColour: (typeof WARDROBE_COLOURS)[number] | null;
  secondaryColours: (typeof WARDROBE_COLOURS)[number][];
} {
  const matched: (typeof WARDROBE_COLOURS)[number][] = [];

  const scanText = (text: string) => {
    const lower = text.toLowerCase();
    const hits: Array<{
      canonical: (typeof WARDROBE_COLOURS)[number];
      index: number;
    }> = [];

    for (const entry of COLOUR_SYNONYMS) {
      let earliestIndex = Infinity;
      for (const term of entry.terms) {
        const regex = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
        const m = regex.exec(lower);
        if (m && m.index < earliestIndex) {
          earliestIndex = m.index;
        }
      }
      if (earliestIndex !== Infinity) {
        hits.push({ canonical: entry.canonical, index: earliestIndex });
      }
    }

    hits.sort((a, b) => a.index - b.index);
    for (const hit of hits) {
      if (!matched.includes(hit.canonical)) {
        matched.push(hit.canonical);
      }
    }
  };

  if (rawColor) scanText(rawColor);
  if (matched.length === 0 && rawTitle) scanText(rawTitle);

  return {
    primaryColour: matched[0] ?? null,
    secondaryColours: matched.slice(1, 5),
  };
}

function matchClosetPattern(
  rawTitle: string | null,
  rawDescription: string | null,
): (typeof PATTERNS)[number] | null {
  const combined = `${rawTitle ?? ""} ${rawDescription ?? ""}`.toLowerCase();
  if (!combined.trim()) return null;

  for (const entry of PATTERN_SYNONYMS) {
    for (const term of entry.terms) {
      const regex = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
      if (regex.test(combined)) {
        return entry.canonical;
      }
    }
  }
  return null;
}

function extractMaterialFromDescription(description: string | null): string | null {
  if (!description) return null;
  // Look for patterns like "100% Cotton", "80% Wool, 20% Polyamide", or common fabrics
  const pctMatch =
    /\b(?:\d{1,3}%\s*(?:organic\s+|recycled\s+)?(?:cotton|linen|wool|silk|cashmere|polyester|nylon|viscose|elastane|spandex|leather|suede|denim|modal|lyocell|tencel|acrylic|hemp)(?:[\s,/+-]+\d{1,3}%\s*(?:cotton|linen|wool|silk|cashmere|polyester|nylon|viscose|elastane|spandex|modal|lyocell|tencel|acrylic))*)/i.exec(
      description,
    );
  if (pctMatch?.[0]) {
    return cleanText(pctMatch[0], 60);
  }
  return null;
}

/**
 * Maps extracted store metadata into ClosetAI's `ItemFieldsInput` structure.
 * Never fabricates fields that have no basis in the extracted product metadata.
 */
export function mapProductMetadataToWardrobeFields(
  product: Pick<
    ExtractedProductMetadata,
    "title" | "brand" | "description" | "color" | "material" | "category"
  >,
): ItemFieldsInput {
  const defaults = emptyItemValues();

  const { category: matchedCategory, subcategory } = matchClosetCategory(
    product.category,
    product.title,
    product.description,
  );

  const { primaryColour, secondaryColours } = matchClosetColours(
    product.color,
    product.title,
  );

  const pattern = matchClosetPattern(product.title, product.description);

  const cleanMaterial = cleanText(
    product.material ?? extractMaterialFromDescription(product.description),
    60,
  );

  // Build a clear item name (include brand prefix if not already in the title)
  let name = cleanText(product.title, 120) ?? "";
  if (name && product.brand) {
    const cleanBrand = cleanText(product.brand, 50);
    if (
      cleanBrand &&
      !name.toLowerCase().includes(cleanBrand.toLowerCase()) &&
      `${cleanBrand} ${name}`.length <= 120
    ) {
      name = `${cleanBrand} ${name}`;
    }
  }

  // Only set category if matched; otherwise leave default so the user can pick or edit
  const resolvedCategory = matchedCategory ?? defaults.category;
  const resolvedCareType: CareType = matchedCategory
    ? categoryDefaultCareType(matchedCategory)
    : (defaults.careType ?? "WASHABLE");

  return {
    ...defaults,
    name,
    category: resolvedCategory,
    subcategory: subcategory ?? "",
    brand: product.brand ?? defaults.brand ?? "",
    price: defaults.price,
    currency: defaults.currency,
    primaryColour,
    secondaryColours,
    pattern,
    material: cleanMaterial ?? "",
    style: null,
    occasions: [],
    seasons: [],
    warmthLevel: null,
    isFavourite: false,
    careType: resolvedCareType,
  };
}

/**
 * Extracts product metadata from an HTML document following the strict priority order:
 *   A. Schema.org JSON-LD Product / ProductGroup data
 *   B. OpenGraph / product meta tags
 *   C. Microdata & semantic HTML product gallery
 *   D. Returns a structured `NO_PRODUCT_DATA` / `BLOCKED_BY_STORE` failure if no valid product data exists
 */
export function extractProductFromHtml(
  html: string,
  pageUrl: string,
): ExtractProductResult {
  const trimmedHtml = html.trim();
  if (!trimmedHtml) {
    return {
      ok: false,
      code: "EMPTY_HTML",
      message: "The store returned an empty page.",
      fallbackHint:
        "Take a screenshot or save the product image, then paste (Ctrl+V) or upload it directly below.",
    };
  }

  if (isBotChallengeHtml(trimmedHtml)) {
    return {
      ok: false,
      code: "BLOCKED_BY_STORE",
      message:
        "This store blocked automated product extraction (anti-bot protection).",
      fallbackHint:
        "You can right-click the product photo on the store page, click 'Copy image', and press Ctrl+V here — or upload a screenshot.",
    };
  }

  const jsonLd = parseJsonLdProducts(trimmedHtml);
  const openGraph = parseOpenGraphAndMeta(trimmedHtml);
  const microdata = parseMicrodataAndGalleryHtml(trimmedHtml);

  const sourcesUsed: ExtractionSource[] = [];
  if (jsonLd) sourcesUsed.push("json-ld");
  if (openGraph) sourcesUsed.push("opengraph");
  if (microdata) sourcesUsed.push("microdata");

  const primarySource: ExtractionSource =
    sourcesUsed[0] ?? "none";

  // Merge fields strictly according to priority: A (JSON-LD) -> B (OpenGraph) -> C (Microdata)
  const rawTitle = jsonLd?.title ?? openGraph?.title ?? microdata?.title ?? null;
  const brand = jsonLd?.brand ?? openGraph?.brand ?? microdata?.brand ?? null;
  const title = rawTitle ? stripStoreSuffixFromTitle(rawTitle, brand) : null;
  const description =
    jsonLd?.description ?? openGraph?.description ?? microdata?.description ?? null;
  const color = jsonLd?.color ?? openGraph?.color ?? microdata?.color ?? null;
  const material =
    jsonLd?.material ?? openGraph?.material ?? microdata?.material ?? null;
  const category =
    jsonLd?.category ?? openGraph?.category ?? microdata?.category ?? null;

  const candidateCanonicalUrl =
    resolveCandidateUrl(
      jsonLd?.url ?? openGraph?.url ?? microdata?.url,
      pageUrl,
    ) ?? pageUrl;

  const allCandidateImages = [
    ...(jsonLd?.images ?? []),
    ...(openGraph?.images ?? []),
    ...(microdata?.images ?? []),
  ];

  const { images, recommendedImageIndex } = buildDeduplicatedGallery(
    allCandidateImages,
    pageUrl,
  );

  // Never claim success if no valid product data was extracted
  if (!title && images.length === 0) {
    return {
      ok: false,
      code: "NO_PRODUCT_DATA",
      message:
        "We couldn't find structured product details or product photos on this page.",
      fallbackHint:
        "Copy the product image from the store and press Ctrl+V on this page, or choose a photo from your device.",
    };
  }

  const warnings: string[] = [];
  if (images.length === 0) {
    warnings.push(
      "Product details were found, but the store didn't expose any downloadable product photos. Paste or upload a product photo to continue.",
    );
  }
  if (!title) {
    warnings.push("Product title wasn't provided by the store — please enter a name before saving.");
  }

  let normalizedUrl = candidateCanonicalUrl;
  try {
    normalizedUrl = normalizeProductUrl(pageUrl);
  } catch {
    normalizedUrl = pageUrl;
  }

  const product: ExtractedProductMetadata = {
    title,
    brand,
    description,
    images,
    recommendedImageIndex,
    color,
    material,
    category,
    productUrl: pageUrl,
    normalizedUrl,
    extractionSource: primarySource,
    sourcesUsed,
  };

  const suggestedFields = mapProductMetadataToWardrobeFields(product);

  return {
    ok: true,
    product,
    suggestedFields,
    warnings,
  };
}

// --- Clipboard Paste Helpers -------------------------------------------------------------------

export {
  type ClipboardPasteClassification,
  isEditablePasteTarget,
  classifyClipboardPaste,
} from "./clipboard";

