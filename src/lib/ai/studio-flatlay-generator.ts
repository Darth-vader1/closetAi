import { getAiProvider } from "@/lib/ai/service";
import { logger } from "@/lib/logger";
import { sniffImage } from "@/lib/security/image-sniff";

export interface StudioGarmentHints {
  name?: string | null;
  subcategory?: string | null;
  primaryColour?: string | null;
  secondaryColours?: string[] | null;
  pattern?: string | null;
  material?: string | null;
  visualDescription?: string | null;
}

export interface GenerateStudioFlatLayOptions {
  bytes: Uint8Array;
  mimeType: string;
  category?: string | null;
  hints?: StudioGarmentHints | null;
  forceVision?: boolean;
  signal?: AbortSignal;
}

export interface GenerateStudioFlatLayResult {
  ok: boolean;
  base64Image?: string;
  mimeType?: string;
  provider?: string;
  model?: string;
  error?: string;
}

function getAgentCache(): Map<string, string> {
  const g = globalThis as typeof globalThis & {
    __closetAiFlatlayAgentCacheV3?: Map<string, string>;
  };
  if (!g.__closetAiFlatlayAgentCacheV3) {
    g.__closetAiFlatlayAgentCacheV3 = new Map<string, string>();
  }
  return g.__closetAiFlatlayAgentCacheV3;
}

export function resetStudioFlatLayAgentCacheForTests(): void {
  getAgentCache().clear();
}

export type GarmentFamily =
  | "footwear"
  | "bottoms"
  | "onepiece"
  | "traditional"
  | "belts"
  | "ties"
  | "textiles"
  | "headwear"
  | "jewellery_watches"
  | "bags"
  | "accessories"
  | "tops";

export function classifyFlatLayFamily(
  category?: string | null,
  subcategory?: string | null,
): GarmentFamily {
  const combined = `${category || ""} ${subcategory || ""}`.toLowerCase().trim();
  if (
    [
      "shoes",
      "sneakers",
      "boots",
      "heels",
      "stiletto",
      "pumps",
      "wedges",
      "slingback",
      "sandals",
      "loafers",
      "flats",
      "ballet",
      "slippers",
      "clogs",
      "clog",
      "crocs",
      "slides",
      "mules",
    ].some((k) => combined.includes(k))
  ) {
    return "footwear";
  }
  if (
    [
      "traditional",
      "kaftan",
      "caftan",
      "agbada",
      "aso-ebi",
      "aso-oke",
      "senator",
      "ankara",
      "boubou",
      "bubu",
      "iro",
      "dashiki",
      "danshiki",
      "isiagu",
      "abaya",
      "jalabiya",
      "kente",
      "adire",
    ].some((k) => combined.includes(k))
  ) {
    return "traditional";
  }
  if (
    [
      "dresses",
      "jumpsuits",
      "jumpsuit",
      "rompers",
      "romper",
      "playsuit",
      "gown",
      "suit",
    ].some((k) => combined.includes(k))
  ) {
    return "onepiece";
  }
  if (
    [
      "trousers",
      "jeans",
      "shorts",
      "skirts",
      "leggings",
      "pants",
      "chinos",
      "sweatpants",
      "joggers",
      "jorts",
      "capri",
      "palazzo",
      "culottes",
    ].some((k) => combined.includes(k))
  ) {
    return "bottoms";
  }
  if (["belts", "belt"].some((k) => combined.includes(k))) {
    return "belts";
  }
  if (
    ["ties", "necktie", "bow tie", "bowtie", "cravat"].some((k) =>
      combined.includes(k),
    ) ||
    /\btie\b/.test(combined)
  ) {
    return "ties";
  }
  if (
    ["scarves", "scarf", "shawl", "stole", "bandana"].some((k) =>
      combined.includes(k),
    )
  ) {
    return "textiles";
  }
  if (
    [
      "headwraps",
      "headwrap",
      "headtie",
      "gele",
      "turban",
      "hats",
      "caps",
      "fila",
      "kufi",
      "abeti",
      "beret",
      "fedora",
      "fascinator",
      "wigs",
      "wig",
    ].some((k) => combined.includes(k))
  ) {
    return "headwear";
  }
  if (
    [
      "watches",
      "watch",
      "jewellery",
      "jewelry",
      "necklace",
      "pendant",
      "cross",
      "locket",
      "medallion",
      "choker",
      "chain",
      "earring",
      "bracelet",
      "bangle",
      "ring",
      "beads",
      "brooch",
      "cufflink",
      "sunglasses",
      "glasses",
      "eyewear",
    ].some((k) => combined.includes(k))
  ) {
    return "jewellery_watches";
  }
  if (
    [
      "bags",
      "handbag",
      "clutch",
      "purse",
      "tote",
      "crossbody",
      "backpack",
      "satchel",
    ].some((k) => combined.includes(k))
  ) {
    return "bags";
  }
  if (combined.includes("accessories") || combined.includes("accessory")) {
    return "accessories";
  }
  return "tops";
}

function getFamilyFramingRules(family: GarmentFamily): {
  defaultSubject: string;
  framingRule: string;
} {
  switch (family) {
    case "footwear":
      return {
        defaultSubject: "pair of shoes",
        framingRule:
          "clean top-down 45-degree commercial footwear catalog shot of the matching pair placed neatly on a seamless pure white studio background (#FFFFFF), pristine empty interior insole lining and heel/strap silhouette clearly visible, soft diffused contact shadow, absolutely NO human feet, NO ankles, NO socks, NO legs, NO hands.",
      };
    case "traditional":
      return {
        defaultSubject: "traditional African attire",
        framingRule:
          "top-down 90-degree full-length luxury studio flat-lay of the standalone unworn traditional African garment arranged symmetrically from neckline to hem on a seamless pure white background (#FFFFFF), faithfully showcasing intricate chest/neckline embroidery, Ankara/Aso-Oke/lace/Adire textile motifs, wide sleeves, and matching drape, soft contact shadow, absolutely NO human body, NO head, NO neck, NO arms, NO hands, NO legs, NO mannequin.",
      };
    case "onepiece":
      return {
        defaultSubject: "full-length dress or jumpsuit",
        framingRule:
          "top-down 90-degree full-length studio flat-lay arranged symmetrically from neckline/bodice to hem on a seamless pure white background (#FFFFFF), clean empty interior neckline, straps/sleeves and skirt/legs arranged naturally, soft contact shadow, absolutely NO human torso, NO neck, NO arms, NO legs, NO mannequin.",
      };
    case "bottoms":
      return {
        defaultSubject: "pair of trousers or skirt",
        framingRule:
          "crisp top-down 90-degree full-length studio flat-lay laid completely flat from waistband to hem on a seamless pure white background (#FFFFFF), clean empty inner waistband visible, natural fabric/pleat drape smoothed neatly, pristine uniform fabric texture with NO distressing, NO bleach stains, and NO graphic prints unless specified, soft contact shadow, absolutely NO human waist, NO hips, NO legs, NO skin, NO belt, NO shoes, NO tucked-in top.",
      };
    case "belts":
      return {
        defaultSubject: "fashion waist belt",
        framingRule:
          "commercial luxury e-commerce product photograph of the standalone unworn belt neatly coiled in a clean spiral or laid horizontally on a seamless pure white background (#FFFFFF), clearly showcasing the leather/woven/chain strap texture, stitching, keeper loop, and metal buckle hardware, soft contact shadow, absolutely NO human waist, NO hips, NO trousers, NO belt loops.",
      };
    case "ties":
      return {
        defaultSubject: "silk necktie or bow tie",
        framingRule:
          "crisp top-down 90-degree studio flat-lay of the standalone unworn necktie (laid flat vertically showing pointed blade and tail) or bow tie (centered symmetrically) on a seamless pure white background (#FFFFFF), showcasing exact silk/jacquard weave and pattern, soft contact shadow, absolutely NO shirt collar, NO human neck, NO suit jacket.",
      };
    case "textiles":
      return {
        defaultSubject: "woven fashion scarf",
        framingRule:
          "top-down 90-degree studio flat-lay of the rectangular scarf or shawl unfolded neatly flat on a seamless pure white background (#FFFFFF), clearly showing its full intersecting weave/pattern geometry and fringed or hemmed ends, soft contact shadow, absolutely NO human neck, NO shoulders, NO chest, NO overlapping shirt.",
      };
    case "headwear":
      return {
        defaultSubject: "structured headwear or Gele headtie",
        framingRule:
          "standalone 3/4-angle luxury catalog studio product photograph centered on a seamless pure white background (#FFFFFF), preserving exact crown structure, brim, Fila embroidery, or sculptural pleated Gele headtie folds, soft contact shadow, absolutely NO human head, NO face, NO skin, NO mannequin bust.",
      };
    case "jewellery_watches":
      return {
        defaultSubject: "luxury watch, pendant necklace, jewellery, or eyewear",
        framingRule:
          "macro commercial luxury product photograph laid out symmetrically on a seamless pure white background (#FFFFFF), full necklace chain/cord loop and pendant/cross geometry or watch dial/gemstone/frame details tack-sharp, soft diffused reflection shadow, absolutely NO human neck, NO chest, NO wrist, NO ears, NO fingers, NO face, NO skin, NO underlying shirt or scarf fabric.",
      };
    case "bags":
      return {
        defaultSubject: "standalone handbag or clutch",
        framingRule:
          "upright 3/4-front luxury e-commerce studio product photograph of the standalone bag or clutch centered on a seamless pure white background (#FFFFFF), handles/straps, clasp, and hardware styled neatly, soft studio contact shadow, absolutely NO human hands, NO arm, NO shoulder, NO body.",
      };
    case "accessories":
      return {
        defaultSubject: "standalone fashion accessory",
        framingRule:
          "centered commercial e-commerce studio product photograph on a seamless pure white background (#FFFFFF), clean product geometry and details arranged neatly, soft contact shadow, absolutely NO human hands, NO shoulders, NO body parts, NO mirror or smartphone.",
      };
    case "tops":
    default:
      return {
        defaultSubject: "unworn top or blouse",
        framingRule:
          "crisp top-down 90-degree unworn studio flat-lay on a seamless pure white background (#FFFFFF) with sleeves or straps angled cleanly and clean empty inside neckline/collar visible, smoothed fabric, soft contact shadow, absolutely NO human neck, NO skin, NO arms, NO hands, NO smartphone, NO overlapping scarf, tie, necklace, or bottoms.",
      };
  }
}

function formatPatternRequirement(pattern?: string | null): string | null {
  const p = (pattern || "").toLowerCase().trim();
  if (!p || p === "unknown") return null;
  if (p === "plaid" || p === "checked") {
    return `intersecting ${p} tartan/check grid weave with both horizontal and vertical crossing bars (NOT plain vertical stripes)`;
  }
  if (p === "camouflage") {
    return "organic multi-tone camouflage / marbled pattern";
  }
  if (p === "solid" || p === "plain") {
    return "completely solid, pristine unpatterned fabric throughout, strictly uniform monochrome body with ZERO graphic prints, ZERO distressing, ZERO bleach splatters, ZERO claw or scratch marks, and ZERO extraneous patterns (preserving only authentic contrast collar, cuff, or drawstring trim if present)";
  }
  return `${p.replace(/_/g, " ")} pattern`;
}

/**
 * Builds an authoritative, color-locked and silhouette-locked catalog flat-lay prompt
 * from structured garment metadata so FLUX never drifts to generic blue jeans or black slides.
 */
export function buildGroundedPromptFromHints(
  family: GarmentFamily,
  category?: string | null,
  hints?: StudioGarmentHints | null,
): string {
  const { defaultSubject, framingRule } = getFamilyFramingRules(family);
  const name = hints?.name?.trim() || "";
  const subcategory = hints?.subcategory?.trim() || "";
  let primary =
    hints?.primaryColour && hints.primaryColour !== "unknown"
      ? hints.primaryColour.trim()
      : "";

  if (!primary && name) {
    const colorMatch = name.match(
      /\b(black|white|grey|gray|ash|navy|blue|green|olive|brown|beige|cream|red|burgundy|pink|orange|yellow|purple)\b/i,
    );
    if (colorMatch) {
      primary = colorMatch[1].toLowerCase();
    }
  }

  const secondaries = (hints?.secondaryColours ?? [])
    .map((c) => c.trim())
    .filter((c) => Boolean(c) && c !== "unknown" && c !== primary);
  const material = hints?.material?.trim() || "";
  const visualDesc = hints?.visualDescription?.trim() || "";
  const patternDesc = formatPatternRequirement(hints?.pattern);

  const lowerName = name.toLowerCase();
  const lowerSub = subcategory.toLowerCase();
  const isFullZip =
    lowerSub.includes("full-zip") ||
    lowerSub.includes("full zip") ||
    lowerName.includes("zip-up") ||
    lowerName.includes("zip up") ||
    lowerName.includes("full zip") ||
    (lowerName.includes("zip") && !lowerName.includes("half") && !lowerName.includes("quarter"));

  const closureClause = isFullZip
    ? "Front closure specification: Continuous full-length front metal zipper running all the way from the bottom ribbed hem up to the hood collar (full-zip jacket/hoodie, NOT a half-zip or quarter-zip pullover)."
    : "";

  const subjectParts = [
    primary && !name.toLowerCase().includes(primary.toLowerCase()) ? primary : "",
    name || subcategory || category || defaultSubject,
    subcategory && !name.toLowerCase().includes(subcategory.toLowerCase())
      ? `(${subcategory})`
      : "",
  ].filter(Boolean);

  const subjectLabel = subjectParts.join(" ").trim() || defaultSubject;

  const colorLockParts: string[] = [];
  if (primary) {
    if (primary.toLowerCase() === "black") {
      colorLockParts.push("dominant garment color MUST be solid pitch black (RGB ~#111111). Absolutely NEVER substitute white, cream, or light grey fabric");
    } else if (primary.toLowerCase() === "white") {
      colorLockParts.push("dominant garment color MUST be crisp clean white");
    } else {
      colorLockParts.push(`dominant color MUST be ${primary}`);
    }
  }
  if (secondaries.length > 0) {
    colorLockParts.push(`secondary/trim colors: ${secondaries.join(", ")}`);
  }

  const specClauses = [
    `Commercial luxury e-commerce product photograph of a standalone unworn ${subjectLabel}.`,
    closureClause,
    visualDesc ? `Exact garment construction: ${visualDesc.replace(/\.$/, "")}.` : "",
    colorLockParts.length > 0
      ? `STRICT COLOR LOCK: ${colorLockParts.join("; ")}. Never substitute unrelated colors (never turn a black hoodie into white or grey; never turn grey sweatpants into blue denim jeans; never turn colored clogs/shoes into black leather slides).`
      : "",
    patternDesc ? `Pattern specification: ${patternDesc}.` : "",
    material ? `Fabric/material texture: ${material}.` : "",
    `Framing & composition: ${framingRule}`,
    "SSENSE / MR PORTER studio catalog photography, tack-sharp fabric fidelity, true-to-life colors, 8k resolution.",
  ].filter(Boolean);

  return specClauses.join(" ");
}

/**
 * Step 1: Craft an ultra-detailed de-bodied studio flat-lay prompt preserving exact garment fidelity.
 * - If rich full-scene OOTD `visualDescription` is already available (and not forceVision), synthesize
 *   the grounded prompt directly without burning extra Vision calls or losing full-outfit context.
 * - Otherwise inspect the photo with Vision anchored by `hints`, falling back to `buildGroundedPromptFromHints`.
 */
export async function craftCatalogPromptWithVision(
  options: GenerateStudioFlatLayOptions,
  signal?: AbortSignal,
): Promise<{ prompt: string; providerName: string }> {
  const family = classifyFlatLayFamily(
    options.category,
    options.hints?.subcategory,
  );
  const { framingRule } = getFamilyFramingRules(family);
  const groundedFallback = buildGroundedPromptFromHints(
    family,
    options.category,
    options.hints,
  );

  const trimmedVisualDesc = options.hints?.visualDescription?.trim() ?? "";
  const hasRichOotdVisualDesc =
    !options.forceVision &&
    (trimmedVisualDesc.length >= 12 ||
      (trimmedVisualDesc.length > 0 &&
        Boolean(options.hints?.name?.trim()) &&
        Boolean(options.hints?.primaryColour?.trim())));

  if (hasRichOotdVisualDesc) {
    return { prompt: groundedFallback, providerName: "ootd-vision-grounded" };
  }

  const ai = getAiProvider();
  if (!ai.available) {
    return { prompt: groundedFallback, providerName: "default" };
  }

  const hintLines: string[] = [];
  if (options.hints?.name) hintLines.push(`Target item name: ${options.hints.name}`);
  if (options.category || options.hints?.subcategory) {
    hintLines.push(
      `Target category/subtype: ${[options.category, options.hints?.subcategory].filter(Boolean).join(" / ")}`,
    );
  }
  const resolvedPrimary =
    options.hints?.primaryColour ||
    (options.hints?.name
      ? options.hints.name.match(
          /\b(black|white|grey|gray|ash|navy|blue|green|olive|brown|beige|cream|red|burgundy|pink|orange|yellow|purple)\b/i,
        )?.[1]
      : null);
  if (resolvedPrimary) {
    hintLines.push(`Known primary color: ${resolvedPrimary}`);
  }
  if (options.hints?.secondaryColours?.length) {
    hintLines.push(
      `Known secondary/trim colors: ${options.hints.secondaryColours.join(", ")}`,
    );
  }
  if (options.hints?.pattern) {
    hintLines.push(`Known pattern: ${options.hints.pattern}`);
  }
  if (options.hints?.material) {
    hintLines.push(`Known material: ${options.hints.material}`);
  }

  const visionPrompt = [
    "This photo shows a garment, scarf, pair of shoes, or accessory (often cropped from a worn OOTD / mirror selfie where other clothes or arms may overlap).",
    "Extract ONLY the target item's exact visual design so we can render an unworn e-commerce studio flat-lay without any human body parts or overlapping garments.",
    hintLines.length > 0
      ? `AUTHORITATIVE TARGET ITEM HINTS (isolate ONLY this item and keep its exact color/type):\n${hintLines.join("\n")}`
      : "",
    "Return JSON strictly with:",
    "- itemType: concise specific garment title (e.g. 'sky-blue black-trim ringer t-shirt', 'heather-grey wide-leg drawstring sweatpants', 'blue camo perforated foam clogs', 'beige and brown tartan plaid fringed scarf')",
    "- colorPalette: exact colors and contrast trims of THIS target garment only (ignore skin, room lighting, and overlapping scarves/shirts)",
    "- materials: exact fabric weave, fleece knit, wool tartan, molded EVA foam, or leather finish",
    "- keyDetails: collar/ringer trim, sleeve cuffs, elastic drawstring vs tailored waistband, pattern geometry (plaid grid vs stripes, camo), toe-box shape (clogs vs slides)",
    `- flatlayPrompt: a vivid 65-to-95-word generation prompt describing THIS EXACT garment alone in an ultra-clean commercial catalog photo: ${framingRule} Preserve exact colors, contrast trims, fabric texture, pattern geometry, and silhouette truthfully.`,
  ]
    .filter(Boolean)
    .join("\n");

  const jsonSchema: Record<string, unknown> = {
    type: "object",
    properties: {
      itemType: { type: "string" },
      colorPalette: { type: "string" },
      materials: { type: "string" },
      keyDetails: { type: "string" },
      flatlayPrompt: { type: "string" },
    },
    required: ["itemType", "colorPalette", "materials", "keyDetails", "flatlayPrompt"],
    additionalProperties: false,
  };

  try {
    const normalizedMime: "image/jpeg" | "image/png" | "image/webp" =
      options.mimeType === "image/png" || options.mimeType === "image/webp"
        ? options.mimeType
        : "image/jpeg";

    const visionTimeoutSignal = AbortSignal.timeout(15_000);
    const visionSignal = signal
      ? AbortSignal.any([signal, visionTimeoutSignal])
      : visionTimeoutSignal;

    const raw = (await ai.provider.generateJson({
      task: "garment_enhancement",
      kind: "vision",
      system:
        "You are an elite fashion catalog art director extracting exact garment specifications from OOTD and wardrobe photos. Output JSON strictly matching schema.",
      prompt: visionPrompt,
      image: {
        bytes: options.bytes,
        mimeType: normalizedMime,
      },
      jsonSchema,
      signal: visionSignal,
    })) as { flatlayPrompt?: string; itemType?: string };

    if (raw && typeof raw.flatlayPrompt === "string" && raw.flatlayPrompt.length > 25) {
      const enrichedPrompt = buildGroundedPromptFromHints(family, options.category, {
        ...options.hints,
        visualDescription: raw.flatlayPrompt,
      });
      logger.info("studio_flatlay.vision_prompt_crafted", {
        provider: ai.provider.name,
        family,
        length: enrichedPrompt.length,
      });
      return { prompt: enrichedPrompt, providerName: ai.provider.name };
    }
  } catch (err) {
    logger.warn("studio_flatlay.vision_analysis_failed", {
      err: err instanceof Error ? err.message : String(err),
    });
  }

  return { prompt: groundedFallback, providerName: ai.provider.name };
}

function getMistralKeyPool(): string[] {
  const raw =
    process.env.MISTRAL_API_KEY ||
    (process.env.AI_API_KEY?.startsWith("mstrl_") ? process.env.AI_API_KEY : "") ||
    "";
  return raw
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
}

function describeFetchError(err: unknown): { message: string; cause?: string } {
  const message = err instanceof Error ? err.message : String(err);
  if (err && typeof err === "object" && "cause" in err && err.cause) {
    const c = err.cause;
    const causeMsg =
      c instanceof Error
        ? `${c.name}: ${c.message}${"code" in c && c.code ? ` (${String(c.code)})` : ""}`
        : String(c);
    return { message, cause: causeMsg };
  }
  return { message };
}

export function extractMistralGeneratedImageRefs(convData: unknown): {
  fileId: string | null;
  imgUrl: string | null;
} {
  let fileId: string | null = null;
  let imgUrl: string | null = null;

  if (!convData || typeof convData !== "object") {
    return { fileId, imgUrl };
  }

  const outputs = (convData as { outputs?: unknown }).outputs;
  if (!Array.isArray(outputs)) {
    return { fileId, imgUrl };
  }

  const urlRegex = /https:\/\/[^\s)"']+\.(?:jpg|jpeg|png|webp)[^\s)"']*/i;

  for (const rawOut of outputs) {
    if (!rawOut || typeof rawOut !== "object") continue;
    const out = rawOut as Record<string, unknown>;

    if (!fileId && typeof out.file_id === "string" && out.file_id.trim()) {
      fileId = out.file_id.trim();
    }

    const info = out.info;
    if (info && typeof info === "object") {
      const infoRecord = info as Record<string, unknown>;
      if (!fileId && typeof infoRecord.file_id === "string" && infoRecord.file_id.trim()) {
        fileId = infoRecord.file_id.trim();
      }
      if (typeof infoRecord.result === "string") {
        try {
          const parsed = JSON.parse(infoRecord.result) as Record<string, unknown>;
          if (!imgUrl && typeof parsed.url === "string" && parsed.url.startsWith("http")) {
            imgUrl = parsed.url;
          }
          if (!fileId && typeof parsed.file_id === "string" && parsed.file_id.trim()) {
            fileId = parsed.file_id.trim();
          }
        } catch {
          const match = infoRecord.result.match(urlRegex);
          if (!imgUrl && match) imgUrl = match[0];
        }
      }
    }

    if (!imgUrl && typeof out.url === "string" && out.url.startsWith("http")) {
      imgUrl = out.url;
    }

    if (typeof out.content === "string") {
      const match = out.content.match(urlRegex);
      if (!imgUrl && match) {
        imgUrl = match[0];
      }
    } else if (Array.isArray(out.content)) {
      for (const chunk of out.content) {
        if (!chunk || typeof chunk !== "object") continue;
        const c = chunk as Record<string, unknown>;
        if (!fileId && typeof c.file_id === "string" && c.file_id.trim()) {
          fileId = c.file_id.trim();
        }
        if (!imgUrl && typeof c.url === "string" && c.url.startsWith("http")) {
          imgUrl = c.url;
        }
        if (!imgUrl && typeof c.text === "string") {
          const match = c.text.match(urlRegex);
          if (match) imgUrl = match[0];
        }
      }
    }
  }

  return { fileId, imgUrl };
}

async function downloadGeneratedMistralImage(params: {
  fileId: string | null;
  imgUrl: string | null;
  mistralKey: string;
  parentSignal?: AbortSignal;
}): Promise<{ buffer: Buffer; mimeType: "image/jpeg" | "image/png" | "image/webp" } | null> {
  const { fileId, imgUrl, mistralKey, parentSignal } = params;

  const targets: Array<{
    kind: "mistral_file" | "blob_url";
    url: string;
    headers?: Record<string, string>;
  }> = [];

  // Prefer the warm api.mistral.ai connection first when file_id is present,
  // avoiding cold DNS/TLS handshakes to external blob storage hosts.
  if (fileId) {
    targets.push({
      kind: "mistral_file",
      url: `https://api.mistral.ai/v1/files/${encodeURIComponent(fileId)}/content`,
      headers: { Authorization: `Bearer ${mistralKey}` },
    });
  }
  if (imgUrl) {
    targets.push({
      kind: "blob_url",
      url: imgUrl,
    });
  }

  for (const target of targets) {
    for (let dlAttempt = 0; dlAttempt < 2; dlAttempt++) {
      if (parentSignal?.aborted) return null;
      try {
        const dlTimeout = AbortSignal.timeout(22_000);
        const dlSignal = parentSignal
          ? AbortSignal.any([parentSignal, dlTimeout])
          : dlTimeout;

        const res = await fetch(target.url, {
          method: "GET",
          ...(target.headers ? { headers: target.headers } : {}),
          signal: dlSignal,
        });

        if (res.ok) {
          const arrayBuf = await res.arrayBuffer();
          const buffer = Buffer.from(arrayBuf);
          if (buffer.length > 500) {
            const sniffed = sniffImage(
              new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength),
            );
            return {
              buffer,
              mimeType: sniffed?.mimeType ?? "image/jpeg",
            };
          }
        } else if (res.status >= 400 && res.status < 500 && res.status !== 429) {
          // Non-retryable 4xx on this target; move to next target
          break;
        }
      } catch (dlErr) {
        const info = describeFetchError(dlErr);
        logger.warn("studio_flatlay.image_download_retry", {
          target: target.kind,
          dlAttempt,
          err: info.message,
          ...(info.cause ? { cause: info.cause } : {}),
        });
      }

      if (dlAttempt === 0 && !parentSignal?.aborted) {
        await new Promise((r) => setTimeout(r, 450));
      }
    }
  }

  return null;
}

async function ensureMistralFlatLayAgent(
  mistralKey: string,
  parentSignal?: AbortSignal,
): Promise<string | null> {
  const agentCache = getAgentCache();
  const cached = agentCache.get(mistralKey);
  if (cached) return cached;

  for (let agentAttempt = 0; agentAttempt < 2; agentAttempt++) {
    if (parentSignal?.aborted) return null;
    try {
      const agentTimeout = AbortSignal.timeout(18_000);
      const signal = parentSignal
        ? AbortSignal.any([parentSignal, agentTimeout])
        : agentTimeout;

      const agentRes = await fetch("https://api.mistral.ai/v1/agents", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${mistralKey}`,
        },
        body: JSON.stringify({
          model: "mistral-medium-2505",
          name: "ClosetAI OOTD Garment Flatlay Extractor v3",
          description:
            "Generates faithful standalone unworn e-commerce studio flat-lay photographs of clothing, scarves, footwear, and accessories.",
          instructions:
            "Invoke the image_generation tool immediately on the first turn to generate a photorealistic standalone unworn e-commerce studio catalog flat-lay photograph on a pure white (#FFFFFF) background. STRICTLY obey every color, contrast trim, fabric texture (e.g. grey cotton fleece sweatpants vs denim; perforated foam clogs vs leather slides; plaid check scarf with fringe vs stripes), and silhouette in the user prompt. Never invent human body parts, skin, neck, arms, legs, feet, hands, phones, or mannequins. For solid or unpatterned garments, keep the fabric completely clean, uniform, and pristine with ZERO artificial graphics, scratch/claw marks, bleach stains, or distressing. After image_generation completes, reply ONLY with 'OK' and no additional text.",
          tools: [{ type: "image_generation" }],
        }),
        signal,
      });

      if (agentRes.ok) {
        const agentData = (await agentRes.json()) as { id?: unknown };
        if (typeof agentData?.id === "string" && agentData.id.trim()) {
          const createdId = agentData.id.trim();
          agentCache.set(mistralKey, createdId);
          return createdId;
        }
      } else {
        logger.warn("studio_flatlay.mistral_agent_failed", {
          status: agentRes.status,
          agentAttempt,
        });
        if (agentRes.status === 401 || agentRes.status === 403) {
          return null;
        }
      }
    } catch (err) {
      const info = describeFetchError(err);
      logger.warn("studio_flatlay.mistral_agent_exception", {
        agentAttempt,
        err: info.message,
        ...(info.cause ? { cause: info.cause } : {}),
      });
    }

    if (agentAttempt === 0 && !parentSignal?.aborted) {
      await new Promise((r) => setTimeout(r, 600));
    }
  }

  return null;
}

/**
 * Step 2: Render the commercial studio flat-lay via Mistral's Black Forest Labs FLUX 1.1 Pro Ultra agent.
 */
async function renderWithMistralFlux(
  prompt: string,
  signal?: AbortSignal,
): Promise<{
  buffer: Buffer;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
} | null> {
  const mistralKeys = getMistralKeyPool();
  if (mistralKeys.length === 0) return null;

  const agentCache = getAgentCache();
  const maxAttempts = Math.max(3, Math.min(mistralKeys.length + 1, 4));
  const startedAt = Date.now();
  const TOTAL_BUDGET_MS = 112_000;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (signal?.aborted) return null;

    const elapsedMs = Date.now() - startedAt;
    const remainingBudgetMs = TOTAL_BUDGET_MS - elapsedMs;
    // Need at least 22s left in total budget to start a new FLUX conversation turn
    if (attempt > 0 && remainingBudgetMs < 22_000) {
      break;
    }

    const mistralKey = mistralKeys[attempt % mistralKeys.length];
    try {
      const agentId = await ensureMistralFlatLayAgent(mistralKey, signal);
      if (!agentId) {
        if (attempt < maxAttempts - 1 && !signal?.aborted) {
          await new Promise((r) => setTimeout(r, 700));
          continue;
        }
        return null;
      }

      const convBudgetMs = Math.min(
        68_000,
        Math.max(25_000, TOTAL_BUDGET_MS - (Date.now() - startedAt)),
      );
      const convTimeoutSignal = AbortSignal.timeout(convBudgetMs);
      const convSignal = signal
        ? AbortSignal.any([signal, convTimeoutSignal])
        : convTimeoutSignal;

      const convRes = await fetch("https://api.mistral.ai/v1/conversations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${mistralKey}`,
        },
        body: JSON.stringify({
          agent_id: agentId,
          inputs: `Call image_generation immediately to render this standalone unworn studio flat-lay photograph: ${prompt}`,
        }),
        signal: convSignal,
      });

      if (!convRes.ok) {
        // Only invalidate cached agent if the agent ID itself was rejected/deleted
        if (
          convRes.status === 400 ||
          convRes.status === 401 ||
          convRes.status === 404 ||
          convRes.status === 422
        ) {
          agentCache.delete(mistralKey);
        }
        logger.warn("studio_flatlay.mistral_conv_failed", {
          status: convRes.status,
          attempt,
        });
        if (
          (convRes.status === 429 ||
            convRes.status >= 500 ||
            convRes.status === 404) &&
          attempt < maxAttempts - 1 &&
          !signal?.aborted
        ) {
          const retryAfterHeader = Number(convRes.headers.get("retry-after"));
          const backoffMs =
            convRes.status === 429
              ? Number.isFinite(retryAfterHeader) && retryAfterHeader > 0
                ? Math.min(retryAfterHeader * 1000, 4500)
                : 2000
              : 1000;
          await new Promise((r) => setTimeout(r, backoffMs));
          continue;
        }
        return null;
      }

      const convData = await convRes.json();
      const { fileId, imgUrl } = extractMistralGeneratedImageRefs(convData);

      if (!fileId && !imgUrl) {
        logger.warn("studio_flatlay.no_image_in_outputs", { attempt });
        if (attempt < maxAttempts - 1 && !signal?.aborted) {
          await new Promise((r) => setTimeout(r, 800));
          continue;
        }
        return null;
      }

      // Download generated image with its own isolated timeout & retry so a completed
      // FLUX render is never discarded if the initial blob download socket stalls.
      const downloaded = await downloadGeneratedMistralImage({
        fileId,
        imgUrl,
        mistralKey,
        parentSignal: signal,
      });

      if (downloaded) {
        return downloaded;
      }

      logger.warn("studio_flatlay.image_download_exhausted", {
        attempt,
        hasFileId: Boolean(fileId),
        hasImgUrl: Boolean(imgUrl),
      });
    } catch (err) {
      const info = describeFetchError(err);
      logger.warn("studio_flatlay.render_failed", {
        attempt,
        err: info.message,
        ...(info.cause ? { cause: info.cause } : {}),
      });
      if (signal?.aborted) return null;
      if (attempt < maxAttempts - 1) {
        await new Promise((r) => setTimeout(r, 900));
      }
    }
  }

  return null;
}

/**
 * Generates an automated de-bodied e-commerce catalog flat-lay for any clothing category:
 * 1. Uses grounded full-OOTD visual specs or analyzes the photo with AI Vision anchored by itemHints.
 * 2. Strips human limbs, neck, hands, feet, phones, and overlapping clothing.
 * 3. Renders a faithful standalone unworn studio flat-lay via FLUX 1.1 Pro Ultra on #FFFFFF.
 */
export async function generateStudioCatalogFlatLay(
  options: GenerateStudioFlatLayOptions,
): Promise<GenerateStudioFlatLayResult> {
  const { prompt, providerName } = await craftCatalogPromptWithVision(
    options,
    options.signal,
  );

  const rendered = await renderWithMistralFlux(prompt, options.signal);
  if (rendered) {
    const base64Image = `data:${rendered.mimeType};base64,${rendered.buffer.toString("base64")}`;
    return {
      ok: true,
      base64Image,
      mimeType: rendered.mimeType,
      provider: `${providerName}+mistral-flux`,
      model: "mistral-medium-2505+flux-1.1-pro-ultra",
    };
  }

  return {
    ok: false,
    error:
      "Studio flat-lay generator is temporarily busy or unavailable. Applied clean cutout instead.",
  };
}
