import { logger } from "@/lib/logger";

export type ModelSkinTone = "deep" | "rich_brown" | "caramel" | "olive" | "fair";
export type ModelBodyBuild = "tailored" | "athletic" | "curvy" | "tall_slender";

interface GenerateOutfitImageOptions {
  outfitName: string;
  items: Array<{
    name: string;
    category: string;
    primaryColour?: string | null;
    material?: string | null;
  }>;
  styleDescription?: string | null;
  modelGender?: "male" | "female" | "unisex" | null;
  skinTone?: ModelSkinTone | null;
  bodyBuild?: ModelBodyBuild | null;
}

const SKIN_TONE_DESCRIPTIONS: Record<ModelSkinTone, string> = {
  deep: "deep ebony dark brown skin tone",
  rich_brown: "rich warm brown skin tone",
  caramel: "warm caramel bronze skin tone",
  olive: "warm medium olive skin tone",
  fair: "fair light skin tone",
};

const BODY_BUILD_DESCRIPTIONS: Record<ModelBodyBuild, string> = {
  tailored: "classic balanced proportions",
  athletic: "athletic toned build",
  curvy: "curvy full-figured proportions",
  tall_slender: "tall slender runway proportions",
};

function describeModelAttributes(options: GenerateOutfitImageOptions): string {
  const genderTerm =
    options.modelGender === "male"
      ? "male fashion model"
      : options.modelGender === "female"
        ? "female fashion model"
        : "androgynous fashion model";

  const skinPart = options.skinTone ? `with a ${SKIN_TONE_DESCRIPTIONS[options.skinTone]}` : "";
  const buildPart = options.bodyBuild ? `and ${BODY_BUILD_DESCRIPTIONS[options.bodyBuild]}` : "";

  return [genderTerm, skinPart, buildPart].filter(Boolean).join(" ");
}

// Cache the Mistral Image Generation Agent ID across requests on the same server instance
let cachedMistralAgentId: string | null = null;

/**
 * Step 1: Use Groq (openai/gpt-oss-120b) or Mistral (mistral-small-latest)
 * to craft a rich, studio-grade fashion photography prompt from the outfit items.
 */
async function craftEditorialPromptWithGroqOrMistral(
  options: GenerateOutfitImageOptions,
  basePrompt: string,
  signal?: AbortSignal,
): Promise<string> {
  const garmentsSummary = options.items
    .map((i) => {
      const parts = [i.primaryColour, i.material, i.name, `(${i.category})`].filter(Boolean);
      return parts.join(" ");
    })
    .join(", ");

  const modelDescription = describeModelAttributes(options);

  const systemInstruction =
    "You are a Vogue editorial fashion photography director. Write a single concise, vivid 55-word image generation prompt for a full-length studio lookbook photograph of a " +
    modelDescription +
    " wearing the exact garments provided. Explicitly include the model's exact skin tone and body build, sharp natural facial features, realistic skin texture, tailored garment drape, clean minimalist studio backdrop, and soft editorial lighting. Output ONLY the prompt text, no quotes or commentary.";

  const userPrompt = `Model: ${modelDescription}\nOutfit Name: ${options.outfitName}\nStyle: ${options.styleDescription || "Modern editorial"}\nGarments: ${garmentsSummary}`;

  // 1a. Try Groq first (ultra-fast LPU prompt direction)
  const groqKey = (process.env.GROQ_API_KEY || "").trim();
  if (groqKey) {
    try {
      const timeoutSignal = AbortSignal.timeout(8_000);
      const combined = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${groqKey.split(",")[0].trim()}`,
        },
        body: JSON.stringify({
          model: "openai/gpt-oss-120b",
          messages: [
            { role: "system", content: systemInstruction },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.35,
          max_tokens: 160,
        }),
        signal: combined,
      });

      if (res.ok) {
        const data = await res.json();
        const text = data?.choices?.[0]?.message?.content?.trim();
        if (text && text.length > 20) {
          logger.info("outfit.prompt_crafted_by_groq", { length: text.length });
          return text;
        }
      }
    } catch (err) {
      logger.warn("outfit.groq_prompt_fallback", {
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // 1b. Try Mistral second
  const mistralKey = (
    process.env.MISTRAL_API_KEY ||
    (process.env.AI_API_KEY?.startsWith("mstrl_") ? process.env.AI_API_KEY : "") ||
    ""
  ).trim();
  if (mistralKey) {
    try {
      const timeoutSignal = AbortSignal.timeout(10_000);
      const combined = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
      const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${mistralKey.split(",")[0].trim()}`,
        },
        body: JSON.stringify({
          model: "mistral-small-latest",
          messages: [
            { role: "system", content: systemInstruction },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.35,
          max_tokens: 160,
        }),
        signal: combined,
      });

      if (res.ok) {
        const data = await res.json();
        const text = data?.choices?.[0]?.message?.content?.trim();
        if (text && text.length > 20) {
          logger.info("outfit.prompt_crafted_by_mistral", { length: text.length });
          return text;
        }
      }
    } catch (err) {
      logger.warn("outfit.mistral_prompt_fallback", {
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return basePrompt;
}

/**
 * Step 2: Generate a studio-grade photorealistic lookbook image using Mistral's
 * native Black Forest Labs FLUX1.1 [pro] Ultra `image_generation` Agent.
 */
async function tryMistralNativeImageGeneration(
  prompt: string,
  signal?: AbortSignal,
): Promise<Buffer | null> {
  const mistralKey = (
    process.env.MISTRAL_API_KEY ||
    (process.env.AI_API_KEY?.startsWith("mstrl_") ? process.env.AI_API_KEY : "") ||
    ""
  )
    .split(",")[0]
    ?.trim();

  if (!mistralKey) return null;

  try {
    const timeoutSignal = AbortSignal.timeout(35_000);
    const combined = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

    // 2a. Ensure we have a Mistral Agent with the `image_generation` tool
    if (!cachedMistralAgentId) {
      const agentRes = await fetch("https://api.mistral.ai/v1/agents", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${mistralKey}`,
        },
        body: JSON.stringify({
          model: "mistral-medium-2505",
          name: "ClosetAI Editorial Lookbook Photographer",
          description: "Generates high-resolution studio fashion lookbook photographs.",
          instructions:
            "Always invoke the image_generation tool immediately to generate a photorealistic full-body studio fashion lookbook photograph matching the user's description.",
          tools: [{ type: "image_generation" }],
        }),
        signal: combined,
      });

      if (agentRes.ok) {
        const agentData = await agentRes.json();
        if (typeof agentData?.id === "string") {
          cachedMistralAgentId = agentData.id;
        }
      } else {
        logger.warn("outfit.mistral_agent_create_failed", { status: agentRes.status });
        return null;
      }
    }

    if (!cachedMistralAgentId) return null;

    // 2b. Run conversation turn to trigger Black Forest Labs FLUX image generation
    const convRes = await fetch("https://api.mistral.ai/v1/conversations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${mistralKey}`,
      },
      body: JSON.stringify({
        agent_id: cachedMistralAgentId,
        inputs: `Generate this studio fashion lookbook photograph: ${prompt}`,
      }),
      signal: combined,
    });

    if (!convRes.ok) {
      // If cached agent was deleted or invalid, reset cache once
      cachedMistralAgentId = null;
      logger.warn("outfit.mistral_conversation_failed", { status: convRes.status });
      return null;
    }

    const convData = await convRes.json();
    const outputs: Array<Record<string, unknown>> = Array.isArray(convData?.outputs)
      ? convData.outputs
      : [];

    let imageUrl: string | null = null;
    let fileId: string | null = null;

    for (const out of outputs) {
      // Check tool.execution info.result JSON string: {"url": "https://mistralaiblackforestprod.blob.core.windows.net/..."}
      const info = out.info as Record<string, unknown> | undefined;
      if (info && typeof info.result === "string") {
        try {
          const parsedResult = JSON.parse(info.result) as Record<string, unknown>;
          if (typeof parsedResult.url === "string" && parsedResult.url.startsWith("http")) {
            imageUrl = parsedResult.url;
            break;
          }
        } catch {
          /* ignore */
        }
      }

      // Also check markdown content or tool_file chunks as backup
      if (typeof out.content === "string") {
        const match = out.content.match(/https:\/\/[^\s)]+\.(?:jpg|jpeg|png)[^\s)]*/i);
        if (match) {
          imageUrl = match[0];
          break;
        }
      } else if (Array.isArray(out.content)) {
        for (const chunk of out.content) {
          if (chunk && typeof chunk === "object" && (chunk as Record<string, unknown>).file_id) {
            fileId = String((chunk as Record<string, unknown>).file_id);
            break;
          }
        }
      }
    }

    // Download from the signed Black Forest Labs Azure blob URL
    if (imageUrl) {
      const imgRes = await fetch(imageUrl, { signal: combined });
      if (imgRes.ok) {
        const arrayBuf = await imgRes.arrayBuffer();
        const buffer = Buffer.from(arrayBuf);
        if (buffer.length > 5000) {
          logger.info("outfit.mistral_flux_image_success", { byteLength: buffer.length });
          return buffer;
        }
      }
    }

    // Or download via file_id if returned
    if (fileId) {
      const fileRes = await fetch(
        `https://api.mistral.ai/v1/files/${encodeURIComponent(fileId)}/content`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${mistralKey}` },
          signal: combined,
        },
      );
      if (fileRes.ok) {
        const arrayBuf = await fileRes.arrayBuffer();
        const buffer = Buffer.from(arrayBuf);
        if (buffer.length > 5000) {
          logger.info("outfit.mistral_file_image_success", { byteLength: buffer.length });
          return buffer;
        }
      }
    }
  } catch (err) {
    logger.warn("outfit.mistral_native_image_fallback", {
      err: err instanceof Error ? err.message : String(err),
    });
  }

  return null;
}

/**
 * Generates an editorial lookbook on-model image for an outfit.
 * 1. Uses Groq (llama-3.3-70b-versatile) / Mistral to craft an editorial photography prompt.
 * 2. Renders a studio-quality image via Mistral's Black Forest Labs FLUX1.1 [pro] Ultra agent.
 * 3. Falls back only if Mistral's image service is unreachable.
 */
export async function generateOutfitEditorialImage(
  options: GenerateOutfitImageOptions,
  signal?: AbortSignal,
): Promise<{ ok: true; buffer: Buffer; mimeType: "image/jpeg" } | { ok: false; error: string }> {
  const garmentsList = options.items
    .map((i) => `${i.primaryColour ? i.primaryColour + " " : ""}${i.name}`)
    .slice(0, 4)
    .join(", ");

  const modelDescription = describeModelAttributes(options);

  const basePrompt = `A full-length studio editorial fashion photograph of a ${modelDescription} wearing: ${garmentsList}. Clean minimalist studio background, soft cinematic editorial lighting, high fashion magazine shoot, natural skin texture, 8k resolution, photorealistic.`;

  // 1. Craft detailed fashion lookbook prompt using Groq -> Mistral
  const prompt = await craftEditorialPromptWithGroqOrMistral(options, basePrompt, signal);

  // 2. Render studio-grade lookbook image with Mistral's native Black Forest Labs FLUX generator
  const mistralBuffer = await tryMistralNativeImageGeneration(prompt, signal);
  if (mistralBuffer) {
    return { ok: true, buffer: mistralBuffer, mimeType: "image/jpeg" };
  }

  return {
    ok: false,
    error: "The studio lookbook generator is temporarily busy. Please try again in a moment.",
  };
}
