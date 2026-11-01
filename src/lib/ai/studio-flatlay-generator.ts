import { getAiProvider } from "@/lib/ai/service";
import { logger } from "@/lib/logger";

export interface GenerateStudioFlatLayOptions {
  bytes: Uint8Array;
  mimeType: string;
  category?: string | null;
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

let cachedFlatLayAgentId: string | null = null;

type GarmentFamily = "footwear" | "bottoms" | "onepiece" | "accessories" | "tops";

export function classifyFlatLayFamily(category?: string | null): GarmentFamily {
  const c = (category || "").toLowerCase().trim();
  if (
    ["shoes", "sneakers", "boots", "heels", "sandals", "loafers", "flats", "slippers"].some((k) =>
      c.includes(k),
    )
  ) {
    return "footwear";
  }
  if (["trousers", "jeans", "shorts", "skirts", "leggings", "pants", "chinos"].some((k) => c.includes(k))) {
    return "bottoms";
  }
  if (
    ["dresses", "jumpsuits", "rompers", "kaftan", "agbada", "aso-ebi", "senator", "gown", "suit"].some((k) =>
      c.includes(k),
    )
  ) {
    return "onepiece";
  }
  if (
    ["bags", "belts", "hats", "caps", "sunglasses", "watches", "jewel", "scarves", "ties", "handbag", "purse"].some(
      (k) => c.includes(k),
    )
  ) {
    return "accessories";
  }
  return "tops";
}

function getFamilyFramingRules(family: GarmentFamily): {
  defaultPrompt: string;
  framingRule: string;
} {
  switch (family) {
    case "footwear":
      return {
        defaultPrompt:
          "Commercial luxury e-commerce product photograph: A clean top-down 45-degree catalog shot of the pair of shoes placed neatly on a seamless pure white studio background (#FFFFFF). Pristine empty interior insole lining, no human feet, no ankles, no socks, no hands, empty footwear resting cleanly. Soft diffused studio contact shadows, SSENSE/Nordstrom footwear catalog quality, tack sharp focus, 8k resolution.",
        framingRule:
          "clean empty interior insole lining, neat pair at a 45-degree catalog angle on pure white (#FFFFFF), absolutely NO human feet, NO ankles, NO socks, NO legs, NO hands.",
      };
    case "bottoms":
      return {
        defaultPrompt:
          "Commercial luxury e-commerce flat-lay photograph: The trousers/skirt/shorts laid completely flat full-length from waist to hem in a crisp top-down 90-degree studio flat-lay on a seamless pure white background (#FFFFFF). Clean empty inner waistband, neatly smoothed fabric, no human waist, no hips, no legs, no shoes, no tucked-in shirt, standalone unworn garment only, soft natural contact shadow, SSENSE/COS catalog style, 8k.",
        framingRule:
          "top-down 90-degree full-length flat-lay laid neatly flat from waistband to hem on pure white (#FFFFFF), clean empty inner waistband visible, absolutely NO human waist, NO legs, NO skin, NO shoes, NO overlapping top.",
      };
    case "onepiece":
      return {
        defaultPrompt:
          "Commercial luxury e-commerce flat-lay photograph: Full-length dress or one-piece garment laid flat symmetrically from neckline to hem in a clean top-down studio flat-lay on a seamless pure white background (#FFFFFF). Crisp empty neckline and sleeves arranged naturally, smoothed drape, absolutely no human body, no neck, no arms, no legs, no mannequin, soft diffused contact shadow, Net-a-Porter catalog style, 8k.",
        framingRule:
          "top-down full-length studio flat-lay from neckline to hem on pure white (#FFFFFF), sleeves and skirt arranged symmetrically, clean empty interior neckline, absolutely NO human torso, NO neck, NO arms, NO legs, NO mannequin.",
      };
    case "accessories":
      return {
        defaultPrompt:
          "Commercial luxury e-commerce product photograph: Standalone fashion accessory or bag centered cleanly on a seamless pure white studio background (#FFFFFF), straps and hardware arranged neatly, no hands, no human body, no mirror or phone, soft natural studio contact shadow, crisp product focus, 8k.",
        framingRule:
          "standalone centered studio product photograph on pure white (#FFFFFF), straps and hardware neatly arranged, absolutely NO human hands, NO shoulders, NO body parts.",
      };
    case "tops":
    default:
      return {
        defaultPrompt:
          "Commercial luxury e-commerce flat-lay photograph: Unworn top/shirt/jacket laid neatly flat in a crisp top-down 90-degree studio flat-lay on a seamless pure white background (#FFFFFF). Sleeves angled cleanly outward, crisp empty collar/inside neck label area visible, smoothed fabric, no human neck, no chest, no arms, no hands, no smartphone, no trousers, standalone garment only, soft studio contact shadow, COS/MR PORTER catalog quality, 8k.",
        framingRule:
          "top-down 90-degree unworn studio flat-lay on pure white (#FFFFFF) with sleeves neatly angled and clean empty inside collar/neckline visible, absolutely NO human neck, NO skin, NO arms, NO hands, NO phone, NO overlapping bottoms or bags.",
      };
  }
}

/**
 * Step 1: Use the multi-provider Vision chain (Groq / Mistral / Gemini)
 * to inspect the clothing, accessory, or footwear item (even when worn in an OOTD selfie!)
 * and craft an ultra-detailed de-bodied studio flat-lay prompt preserving exact garment fidelity.
 */
export async function craftCatalogPromptWithVision(
  options: GenerateStudioFlatLayOptions,
  signal?: AbortSignal,
): Promise<{ prompt: string; providerName: string }> {
  const ai = getAiProvider();
  const family = classifyFlatLayFamily(options.category);
  const { defaultPrompt, framingRule } = getFamilyFramingRules(family);

  if (!ai.available) {
    return { prompt: defaultPrompt, providerName: "default" };
  }

  const visionPrompt = [
    "This photo shows a garment, pair of shoes, or accessory (often cropped from a worn OOTD / mirror selfie).",
    "Extract ONLY the target garment's exact visual design so we can render an unworn e-commerce studio flat-lay without any human body parts.",
    options.category ? `Target garment category hint: ${options.category}.` : "",
    "Return JSON strictly with:",
    "- itemType: concise specific garment title (e.g. 'relaxed light-blue Oxford button-down shirt', 'high-waisted pleated beige chinos', 'black leather penny loafers')",
    "- colorPalette: exact colors and tones of the garment only (ignore skin, room lighting, or other clothes)",
    "- materials: fabric weave, knit, or leather finish",
    "- keyDetails: collar/neckline, sleeve length, buttons/zippers, pockets, graphics/stripes, hem cut",
    `- flatlayPrompt: a vivid 60-to-85-word generation prompt describing THIS EXACT garment alone in an ultra-clean commercial catalog photo: ${framingRule} Preserve exact color, pattern, collar, sleeve length, and construction details truthfully.`,
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
      logger.info("studio_flatlay.vision_prompt_crafted", {
        provider: ai.provider.name,
        family,
        length: raw.flatlayPrompt.length,
      });
      return { prompt: raw.flatlayPrompt, providerName: ai.provider.name };
    }
  } catch (err) {
    logger.warn("studio_flatlay.vision_analysis_failed", {
      err: err instanceof Error ? err.message : String(err),
    });
  }

  return { prompt: defaultPrompt, providerName: ai.provider.name };
}

/**
 * Step 2: Render the commercial studio flat-lay via Mistral's Black Forest Labs FLUX 1.1 Pro Ultra agent.
 */
async function renderWithMistralFlux(
  prompt: string,
  signal?: AbortSignal,
): Promise<{ buffer: Buffer; mimeType: "image/jpeg" } | null> {
  const mistralKey = (
    process.env.MISTRAL_API_KEY ||
    (process.env.AI_API_KEY?.startsWith("mstrl_") ? process.env.AI_API_KEY : "") ||
    ""
  )
    .split(",")[0]
    ?.trim();

  if (!mistralKey) return null;

  try {
    const timeoutSignal = AbortSignal.timeout(45_000);
    const combined = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

    // Ensure we have a Mistral agent configured with image_generation
    if (!cachedFlatLayAgentId) {
      const agentRes = await fetch("https://api.mistral.ai/v1/agents", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${mistralKey}`,
        },
        body: JSON.stringify({
          model: "mistral-medium-2505",
          name: "ClosetAI OOTD Garment Flatlay Extractor",
          description: "Generates standalone unworn e-commerce studio flat-lay photographs of clothing, footwear, and accessories.",
          instructions:
            "Always invoke the image_generation tool immediately to generate a photorealistic standalone unworn e-commerce studio catalog flat-lay photograph matching the user's garment description on a pure white (#FFFFFF) background. Never include human body parts, skin, neck, arms, legs, feet, hands, phones, or mannequins.",
          tools: [{ type: "image_generation" }],
        }),
        signal: combined,
      });

      if (agentRes.ok) {
        const agentData = await agentRes.json();
        if (typeof agentData?.id === "string") {
          cachedFlatLayAgentId = agentData.id;
        }
      } else {
        logger.warn("studio_flatlay.mistral_agent_failed", { status: agentRes.status });
        return null;
      }
    }

    if (!cachedFlatLayAgentId) return null;

    // Run conversation turn to generate FLUX image
    const convRes = await fetch("https://api.mistral.ai/v1/conversations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${mistralKey}`,
      },
      body: JSON.stringify({
        agent_id: cachedFlatLayAgentId,
        inputs: prompt,
      }),
      signal: combined,
    });

    if (!convRes.ok) {
      cachedFlatLayAgentId = null;
      logger.warn("studio_flatlay.mistral_conv_failed", { status: convRes.status });
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
        const match = out.content.match(/https:\/\/[^\s)]+\.(?:jpg|jpeg|png)[^\s)]*/i);
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
      err: err instanceof Error ? err.message : String(err),
    });
  }

  return null;
}

/**
 * Generates an automated de-bodied e-commerce catalog flat-lay for any clothing category:
 * 1. Analyzes the uploaded/cropped photo with AI Vision (Groq / Mistral / Gemini) to extract exact garment colors, materials, cut, and details.
 * 2. Strips human limbs, neck, hands, feet, phones, and overlapping clothing.
 * 3. Renders a pristine standalone unworn studio flat-lay via FLUX 1.1 Pro Ultra on #FFFFFF.
 */
export async function generateStudioCatalogFlatLay(
  options: GenerateStudioFlatLayOptions,
): Promise<GenerateStudioFlatLayResult> {
  // Step 1: Vision analysis
  const { prompt, providerName } = await craftCatalogPromptWithVision(options, options.signal);

  // Step 2: Render with Mistral FLUX
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
