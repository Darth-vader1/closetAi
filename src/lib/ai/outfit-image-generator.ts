import { logger } from "@/lib/logger";

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
}

/**
 * Generates an editorial lookbook on-model image for an outfit.
 * Prioritizes Google Imagen 3 / Nano Banana when GEMINI_API_KEY is set,
 * and falls back gracefully to backup lookbook generators.
 */
export async function generateOutfitEditorialImage(
  options: GenerateOutfitImageOptions,
  signal?: AbortSignal,
): Promise<{ ok: true; buffer: Buffer; mimeType: "image/jpeg" } | { ok: false; error: string }> {
  const garmentsList = options.items
    .map((i) => `${i.primaryColour ? i.primaryColour + " " : ""}${i.name}`)
    .slice(0, 4)
    .join(", ");

  const modelTerm =
    options.modelGender === "male"
      ? "male fashion model, stylish handsome man"
      : options.modelGender === "female"
        ? "female fashion model, elegant stylish woman"
        : "fashion model";

  const prompt = `A full-length studio editorial fashion photograph of a ${modelTerm} wearing: ${garmentsList}. Clean minimalist studio background, soft cinematic editorial lighting, high fashion magazine shoot, natural skin texture, 8k resolution, photorealistic.`;

  // 1. Try Puter AI txt2img with user's PUTER_API_TOKEN
  const puterToken = process.env.PUTER_API_TOKEN?.trim();
  if (puterToken) {
    try {
      logger.info("outfit.generating_with_puter", { modelGender: options.modelGender });

      const resp = await fetch("https://api.puter.com/drivers/call", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${puterToken}`,
        },
        body: JSON.stringify({
          interface: "puter-image-generation",
          driver: "puter-image-generation",
          method: "generate",
          args: {
            prompt,
          },
        }),
      });

      if (resp.ok) {
        const data = await resp.json();
        const resultPayload = data.result || data;

        // Puter returns { src: "data:image/jpeg;base64,..." } or { image: "..." } or direct URL
        const srcString: string | undefined =
          resultPayload.src ||
          resultPayload.image ||
          resultPayload.url ||
          (typeof resultPayload === "string" ? resultPayload : undefined);

        if (srcString && srcString.startsWith("data:image/")) {
          const matches = srcString.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
          if (matches && matches[2]) {
            const buffer = Buffer.from(matches[2], "base64");
            logger.info("outfit.puter_generation_success", { byteLength: buffer.length });
            return { ok: true, buffer, mimeType: "image/jpeg" };
          }
        } else if (srcString && srcString.startsWith("http")) {
          const imgFetch = await fetch(srcString);
          if (imgFetch.ok) {
            const arrayBuf = await imgFetch.arrayBuffer();
            const buffer = Buffer.from(arrayBuf);
            logger.info("outfit.puter_url_fetch_success", { byteLength: buffer.length });
            return { ok: true, buffer, mimeType: "image/jpeg" };
          }
        }
      } else {
        const errText = await resp.text();
        logger.warn("outfit.puter_http_error", { status: resp.status, errText: errText.slice(0, 300) });
      }
    } catch (err) {
      logger.warn("outfit.puter_fallback_triggered", {
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // 2. Fallback candidate generators
  const cleanPrompt = `${modelTerm} wearing ${garmentsList}, clean studio photography, vogue editorial style, full body shot, high resolution`;
  const encodedPrompt = encodeURIComponent(cleanPrompt);
  const seed = Math.floor(Math.random() * 100000);

  const candidateUrls = [
    `https://image.pollinations.ai/prompt/${encodedPrompt}?width=600&height=800&seed=${seed}&model=turbo&nologo=true`,
    `https://image.pollinations.ai/prompt/${encodedPrompt}?width=600&height=800&seed=${seed}&model=flux&nologo=true`,
  ];

  for (const url of candidateUrls) {
    try {
      const timeoutSignal = AbortSignal.timeout(30_000);
      const combinedSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

      const res = await fetch(url, {
        method: "GET",
        headers: {
          "Accept": "image/jpeg, image/png, image/*",
          "User-Agent": "ClosetAI/1.0",
        },
        signal: combinedSignal,
      });

      if (res.ok) {
        const arrayBuffer = await res.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        if (buffer.length > 1000) {
          return { ok: true, buffer, mimeType: "image/jpeg" };
        }
      }
    } catch (err) {
      logger.warn("outfit.image_candidate_failed", { url, err });
    }
  }

  return {
    ok: false,
    error: "The image generator is temporarily busy. Please try again in a few moments.",
  };
}
