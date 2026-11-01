import { getAiProvider } from "@/lib/ai/service";
import { logger } from "@/lib/logger";

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

const agentIdByKeyV2 = new Map<string, string>();

export type GarmentFamily =
  | "footwear"
  | "bottoms"
  | "onepiece"
  | "textiles"
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
      "sandals",
      "loafers",
      "flats",
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
    ].some((k) => combined.includes(k))
  ) {
    return "bottoms";
  }
  if (
    [
      "dresses",
      "jumpsuits",
      "rompers",
      "kaftan",
      "agbada",
      "aso-ebi",
      "senator",
      "gown",
      "suit",
    ].some((k) => combined.includes(k))
  ) {
    return "onepiece";
  }
  if (
    [
      "scarves",
      "scarf",
      "ties",
      "tie",
      "shawl",
      "gele",
      "headwrap",
      "bandana",
    ].some((k) => combined.includes(k))
  ) {
    return "textiles";
  }
  if (
    [
      "bags",
      "belts",
      "hats",
      "caps",
      "sunglasses",
      "watches",
      "jewel",
      "handbag",
      "purse",
      "accessories",
    ].some((k) => combined.includes(k))
  ) {
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
          "clean top-down 45-degree commercial footwear catalog shot of the matching pair placed neatly on a seamless pure white studio background (#FFFFFF), pristine empty interior insole lining, soft diffused contact shadow, absolutely NO human feet, NO ankles, NO socks, NO legs, NO hands.",
      };
    case "bottoms":
      return {
        defaultSubject: "pair of trousers",
        framingRule:
          "crisp top-down 90-degree full-length studio flat-lay laid completely flat from waistband to hem on a seamless pure white background (#FFFFFF), clean empty inner waistband visible, natural fabric drape smoothed neatly, soft contact shadow, absolutely NO human waist, NO hips, NO legs, NO skin, NO shoes, NO tucked-in shirt.",
      };
    case "onepiece":
      return {
        defaultSubject: "full-length garment",
        framingRule:
          "top-down 90-degree full-length studio flat-lay arranged symmetrically from neckline to hem on a seamless pure white background (#FFFFFF), clean empty interior neckline, sleeves arranged naturally, soft contact shadow, absolutely NO human torso, NO neck, NO arms, NO legs, NO mannequin.",
      };
    case "textiles":
      return {
        defaultSubject: "woven fashion scarf",
        framingRule:
          "top-down 90-degree studio flat-lay of the rectangular scarf or neckwear unfolded neatly flat on a seamless pure white background (#FFFFFF), clearly showing its full intersecting weave/pattern geometry and fringed or hemmed ends, soft contact shadow, absolutely NO human neck, NO shoulders, NO chest, NO overlapping shirt.",
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
        defaultSubject: "unworn top",
        framingRule:
          "crisp top-down 90-degree unworn studio flat-lay on a seamless pure white background (#FFFFFF) with sleeves angled cleanly outward and clean empty inside collar/neckline visible, smoothed fabric, soft contact shadow, absolutely NO human neck, NO skin, NO arms, NO hands, NO smartphone, NO overlapping scarf, necklace, or trousers.",
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
  if (p === "solid") {
    return "solid unpatterned body (preserving any contrast collar, cuff, or drawstring trim)";
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
  const primary =
    hints?.primaryColour && hints.primaryColour !== "unknown"
      ? hints.primaryColour.trim()
      : "";
  const secondaries = (hints?.secondaryColours ?? [])
    .map((c) => c.trim())
    .filter((c) => Boolean(c) && c !== "unknown" && c !== primary);
  const material = hints?.material?.trim() || "";
  const visualDesc = hints?.visualDescription?.trim() || "";
  const patternDesc = formatPatternRequirement(hints?.pattern);

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
    colorLockParts.push(`dominant color MUST be ${primary}`);
  }
  if (secondaries.length > 0) {
    colorLockParts.push(`secondary/trim colors: ${secondaries.join(", ")}`);
  }

  const specClauses = [
    `Commercial luxury e-commerce product photograph of a standalone unworn ${subjectLabel}.`,
    visualDesc ? `Exact garment construction: ${visualDesc.replace(/\.$/, "")}.` : "",
    colorLockParts.length > 0
      ? `STRICT COLOR LOCK: ${colorLockParts.join("; ")}. Never substitute unrelated colors (never turn grey sweatpants into blue denim jeans; never turn colored clogs/shoes into black leather slides).`
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

  const hasRichOotdVisualDesc =
    !options.forceVision &&
    Boolean(
      options.hints?.visualDescription &&
        options.hints.visualDescription.trim().length >= 20,
    );

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
  if (options.hints?.primaryColour) {
    hintLines.push(`Known primary color: ${options.hints.primaryColour}`);
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
      signal,
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

/**
 * Step 2: Render the commercial studio flat-lay via Mistral's Black Forest Labs FLUX 1.1 Pro Ultra agent.
 */
async function renderWithMistralFlux(
  prompt: string,
  signal?: AbortSignal,
): Promise<{ buffer: Buffer; mimeType: "image/jpeg" } | null> {
  const mistralKeys = getMistralKeyPool();
  if (mistralKeys.length === 0) return null;

  const maxAttempts = Math.max(2, Math.min(mistralKeys.length + 1, 3));

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const mistralKey = mistralKeys[attempt % mistralKeys.length];
    try {
      const timeoutSignal = AbortSignal.timeout(45_000);
      const combined = signal
        ? AbortSignal.any([signal, timeoutSignal])
        : timeoutSignal;

      let agentId = agentIdByKeyV2.get(mistralKey) ?? null;

      if (!agentId) {
        const agentRes = await fetch("https://api.mistral.ai/v1/agents", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${mistralKey}`,
          },
          body: JSON.stringify({
            model: "mistral-medium-2505",
            name: "ClosetAI OOTD Garment Flatlay Extractor v2",
            description:
              "Generates faithful standalone unworn e-commerce studio flat-lay photographs of clothing, scarves, footwear, and accessories.",
            instructions:
              "Always invoke the image_generation tool immediately to generate a photorealistic standalone unworn e-commerce studio catalog flat-lay photograph on a pure white (#FFFFFF) background. STRICTLY obey every color, contrast trim, fabric texture (e.g. grey cotton fleece sweatpants vs denim; perforated foam clogs vs leather slides; plaid check scarf with fringe vs stripes), and silhouette in the user prompt. Never invent human body parts, skin, neck, arms, legs, feet, hands, phones, or mannequins.",
            tools: [{ type: "image_generation" }],
          }),
          signal: combined,
        });

        if (agentRes.ok) {
          const agentData = await agentRes.json();
          if (typeof agentData?.id === "string") {
            const createdId: string = agentData.id;
            agentId = createdId;
            agentIdByKeyV2.set(mistralKey, createdId);
          }
        } else {
          logger.warn("studio_flatlay.mistral_agent_failed", {
            status: agentRes.status,
            attempt,
          });
          if (
            (agentRes.status === 429 || agentRes.status >= 500) &&
            attempt < maxAttempts - 1 &&
            !combined.aborted
          ) {
            await new Promise((r) => setTimeout(r, 1400));
            continue;
          }
          return null;
        }
      }

      if (!agentId) return null;

      const convRes = await fetch("https://api.mistral.ai/v1/conversations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${mistralKey}`,
        },
        body: JSON.stringify({
          agent_id: agentId,
          inputs: prompt,
        }),
        signal: combined,
      });

      if (!convRes.ok) {
        agentIdByKeyV2.delete(mistralKey);
        logger.warn("studio_flatlay.mistral_conv_failed", {
          status: convRes.status,
          attempt,
        });
        if (
          (convRes.status === 429 || convRes.status >= 500) &&
          attempt < maxAttempts - 1 &&
          !combined.aborted
        ) {
          await new Promise((r) => setTimeout(r, 1500));
          continue;
        }
        return null;
      }

      const convData = await convRes.json();
      let imgUrl: string | null = null;

      for (const out of convData.outputs || []) {
        if (out.info && typeof out.info.result === "string") {
          try {
            const parsed = JSON.parse(out.info.result) as Record<string, unknown>;
            if (typeof parsed.url === "string" && parsed.url.startsWith("http")) {
              imgUrl = parsed.url;
              break;
            }
          } catch {
            /* ignore parse error */
          }
        }
        if (!imgUrl && typeof out.content === "string") {
          const match = out.content.match(
            /https:\/\/[^\s)]+\.(?:jpg|jpeg|png)[^\s)]*/i,
          );
          if (match) {
            imgUrl = match[0];
            break;
          }
        }
      }

      if (imgUrl) {
        const imgRes = await fetch(imgUrl, { signal: combined });
        if (imgRes.ok) {
          const arrayBuf = await imgRes.arrayBuffer();
          const buffer = Buffer.from(arrayBuf);
          if (buffer.length > 5000) {
            return { buffer, mimeType: "image/jpeg" };
          }
        }
      }
    } catch (err) {
      logger.warn("studio_flatlay.render_failed", {
        attempt,
        err: err instanceof Error ? err.message : String(err),
      });
      if (signal?.aborted) return null;
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
