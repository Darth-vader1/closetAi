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

/**
 * Step 1: Use the multi-provider Vision chain (Groq / Mistral / Gemini)
 * to inspect the clothing or footwear item and craft an ultra-detailed
 * studio product-photography prompt.
 */
async function craftCatalogPromptWithVision(
  options: GenerateStudioFlatLayOptions,
  signal?: AbortSignal,
): Promise<{ prompt: string; providerName: string }> {
  const ai = getAiProvider();
  const defaultPrompt =
    "Commercial luxury e-commerce product photograph: A clean top-down catalog flat-lay of the footwear/garment placed neatly on a seamless pure white studio background (#FFFFFF). Crisp pristine interior lining, clean insoles, no human feet, no socks, no hands, no human body parts, empty product resting flat. Soft diffused studio shadows, high-end Nordstrom/SSENSE footwear catalog, sharp focus, 8k resolution.";

  if (!ai.available) {
    return { prompt: defaultPrompt, providerName: "default" };
  }

  const visionPrompt = [
    "Analyze this footwear or garment photograph for an ultra-high-end e-commerce product studio flat-lay.",
    "Return JSON strictly with:",
    "- itemType: concise item title (e.g. 'two-tone brown and cream leather penny loafers', 'cashmere knit sweater')",
    "- colorPalette: exact colors (e.g. 'chocolate brown calfskin and ivory cream vamp')",
    "- materials: material finish (e.g. 'polished leather, tonal welt stitching, leather sole')",
    "- keyDetails: notable accents (e.g. 'strap with cutout slit, pristine beige leather insole lining')",
    "- flatlayPrompt: a vivid 55-to-75-word generation prompt describing this exact product in an ultra-clean catalog flat-lay on pure white background (#FFFFFF). The prompt MUST explicitly state: clean empty leather insole/interior lining, top-down 45-degree angle, absolutely NO human feet, NO socks, NO hands, NO mannequins, empty product resting flat, soft diffused natural contact shadows, tack sharp focus, 8k resolution.",
  ].join("\n");

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
        "You are an elite fashion catalog art director and luxury product photographer. Output JSON strictly matching schema.",
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
          name: "ClosetAI Studio Flatlay Retoucher",
          description: "Generates high-resolution studio fashion catalog photographs.",
          instructions:
            "Always invoke the image_generation tool immediately to generate a photorealistic top-down studio catalog flat-lay photograph matching the user's description. No human feet, no socks, no hands, clean white studio background.",
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
 * Generates an automated ChatGPT-style commercial catalog flat-lay:
 * 1. Analyzes the uploaded photo with AI Vision (Gemini / Groq / Mistral) to inspect colors, materials, and silhouettes.
 * 2. Inpaints clean interior linings/insoles and erases feet, socks, and hands.
 * 3. Renders a pristine studio flat-lay via Black Forest Labs FLUX 1.1 Pro Ultra.
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
