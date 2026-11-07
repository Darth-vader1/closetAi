import zlib from "node:zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  craftCatalogPromptWithVision,
  extractMistralGeneratedImageRefs,
  generateStudioCatalogFlatLay,
  resetStudioFlatLayAgentCacheForTests,
} from "@/lib/ai/studio-flatlay-generator";
import {
  resetSegmentationCooldownsForTests,
  runGarmentEnhancementService,
} from "@/lib/wardrobe/enhancement-service";

function createFilledPng(width = 64, height = 64): Uint8Array {
  const rowBytes = width * 4;
  const raw = Buffer.alloc(height * (1 + rowBytes));
  for (let y = 0; y < height; y++) {
    const rowOffset = y * (1 + rowBytes);
    raw[rowOffset] = 0;
    for (let x = 0; x < width; x++) {
      const px = rowOffset + 1 + x * 4;
      const opaque = x >= 8 && x <= width - 8 && y >= 8 && y <= height - 8;
      raw[px] = 40;
      raw[px + 1] = 40;
      raw[px + 2] = 40;
      raw[px + 3] = opaque ? 255 : 0;
    }
  }
  const idat = zlib.deflateSync(raw);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;

  const makeChunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    return Buffer.concat([len, Buffer.from(type, "ascii"), data, Buffer.alloc(4)]);
  };

  return new Uint8Array(
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      makeChunk("IHDR", ihdr),
      makeChunk("IDAT", idat),
      makeChunk("IEND", Buffer.alloc(0)),
    ]),
  );
}

const VALID_JPEG_BYTES = (() => {
  const buf = Buffer.alloc(1024, 0xab);
  buf[0] = 0xff;
  buf[1] = 0xd8;
  buf[2] = 0xff;
  buf[3] = 0xe0;
  buf[buf.length - 2] = 0xff;
  buf[buf.length - 1] = 0xd9;
  return new Uint8Array(buf);
})();

describe("OOTD Multi-Piece Studio Flat-Lay Reliability", () => {
  const origFetch = globalThis.fetch;
  const origMistralKey = process.env.MISTRAL_API_KEY;
  const origRemoveBgKey = process.env.REMOVE_BG_API_KEY;
  const origClearBackdropKey = process.env.CLEAR_BACKDROP_API_KEY;

  beforeEach(() => {
    resetStudioFlatLayAgentCacheForTests();
    resetSegmentationCooldownsForTests();
  });

  afterEach(() => {
    globalThis.fetch = origFetch;
    if (origMistralKey === undefined) delete process.env.MISTRAL_API_KEY;
    else process.env.MISTRAL_API_KEY = origMistralKey;

    if (origRemoveBgKey === undefined) delete process.env.REMOVE_BG_API_KEY;
    else process.env.REMOVE_BG_API_KEY = origRemoveBgKey;

    if (origClearBackdropKey === undefined) delete process.env.CLEAR_BACKDROP_API_KEY;
    else process.env.CLEAR_BACKDROP_API_KEY = origClearBackdropKey;
  });

  it("extracts both Mistral tool_file file_id and blob URL from conversation outputs", () => {
    const refs = extractMistralGeneratedImageRefs({
      outputs: [
        {
          type: "tool.execution",
          name: "image_generation",
          info: {
            result: JSON.stringify({
              url: "https://mistralaiblackforestprod.blob.core.windows.net/images/flatlay-1.jpg",
            }),
          },
        },
        {
          type: "message.output",
          content: [
            {
              type: "tool_file",
              tool: "image_generation",
              file_id: "file-abc-123",
            },
            {
              type: "text",
              text: "OK",
            },
          ],
        },
      ],
    });

    expect(refs).toEqual({
      fileId: "file-abc-123",
      imgUrl: "https://mistralaiblackforestprod.blob.core.windows.net/images/flatlay-1.jpg",
    });
  });

  it("skips extra Vision LLM call for concise OOTD visual descriptions (e.g. 'White leather belt')", async () => {
    const res = await craftCatalogPromptWithVision({
      bytes: VALID_JPEG_BYTES,
      mimeType: "image/jpeg",
      category: "belts",
      hints: {
        name: "White Leather Belt",
        primaryColour: "white",
        visualDescription: "White leather belt",
      },
    });

    expect(res.providerName).toBe("ootd-vision-grounded");
    expect(res.prompt).toContain("White Leather Belt");
  });

  it("downloads via warm Mistral /v1/files/{fileId}/content first and retries image download without re-running FLUX", async () => {
    process.env.MISTRAL_API_KEY = "mstrl_test_key_1";
    const callLog: string[] = [];
    let fileDownloadCalls = 0;

    globalThis.fetch = async (input: RequestInfo | URL) => {
      const url = String(input);
      callLog.push(url);

      if (url === "https://api.mistral.ai/v1/agents") {
        return new Response(JSON.stringify({ id: "ag_flatlay_1" }), { status: 200 });
      }
      if (url === "https://api.mistral.ai/v1/conversations") {
        return new Response(
          JSON.stringify({
            outputs: [
              {
                type: "message.output",
                content: [{ type: "tool_file", file_id: "file_warm_99" }],
              },
              {
                type: "tool.execution",
                info: {
                  result: JSON.stringify({
                    url: "https://mistralaiblackforestprod.blob.core.windows.net/images/coat.jpg",
                  }),
                },
              },
            ],
          }),
          { status: 200 },
        );
      }
      if (url === "https://api.mistral.ai/v1/files/file_warm_99/content") {
        fileDownloadCalls += 1;
        if (fileDownloadCalls === 1) {
          throw new TypeError("fetch failed");
        }
        return new Response(Buffer.from(VALID_JPEG_BYTES), {
          status: 200,
          headers: { "Content-Type": "image/jpeg" },
        });
      }
      return new Response("Unexpected", { status: 500 });
    };

    const result = await generateStudioCatalogFlatLay({
      bytes: VALID_JPEG_BYTES,
      mimeType: "image/jpeg",
      category: "jackets",
      hints: {
        name: "Dark Brown Shearling Jacket",
        primaryColour: "brown",
        visualDescription: "Dark brown shearling-lined winter jacket with wide collar",
      },
    });

    expect(result.ok).toBe(true);
    expect(result.mimeType).toBe("image/jpeg");
    expect(result.provider).toBe("ootd-vision-grounded+mistral-flux");
    // Conversation was only invoked ONCE even though the first image download threw "fetch failed"!
    expect(callLog.filter((u) => u.endsWith("/v1/conversations"))).toHaveLength(1);
    expect(fileDownloadCalls).toBe(2);
    expect(callLog.some((u) => u.includes("blob.core.windows.net"))).toBe(false);
  });

  it("keeps cached Mistral agentId across 429 rate-limit retries instead of re-creating the agent", async () => {
    process.env.MISTRAL_API_KEY = "mstrl_test_key_2";
    let agentCreates = 0;
    let convCalls = 0;

    globalThis.fetch = async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "https://api.mistral.ai/v1/agents") {
        agentCreates += 1;
        return new Response(JSON.stringify({ id: "ag_cached_42" }), { status: 200 });
      }
      if (url === "https://api.mistral.ai/v1/conversations") {
        convCalls += 1;
        if (convCalls === 1) {
          return new Response("Rate limited", {
            status: 429,
            headers: { "Retry-After": "0.05" },
          });
        }
        return new Response(
          JSON.stringify({
            outputs: [
              {
                type: "message.output",
                content: [{ type: "tool_file", file_id: "file_ok_2" }],
              },
            ],
          }),
          { status: 200 },
        );
      }
      if (url === "https://api.mistral.ai/v1/files/file_ok_2/content") {
        return new Response(Buffer.from(VALID_JPEG_BYTES), { status: 200 });
      }
      return new Response("Not found", { status: 404 });
    };

    const result = await generateStudioCatalogFlatLay({
      bytes: VALID_JPEG_BYTES,
      mimeType: "image/jpeg",
      category: "ties",
      hints: {
        name: "Navy & Red Striped Silk Tie",
        primaryColour: "navy",
        visualDescription: "Woven navy silk necktie with diagonal red and white stripes",
      },
    });

    expect(result.ok).toBe(true);
    expect(agentCreates).toBe(1);
    expect(convCalls).toBe(2);
  });

  it("circuit-breaks Remove.bg 403 key across multi-piece batches so pieces 2..N skip Remove.bg immediately", async () => {
    process.env.REMOVE_BG_API_KEY = "invalid_rbg_403_key";
    process.env.CLEAR_BACKDROP_API_KEY = "valid_cb_key";

    const healthyPng = createFilledPng(64, 64);
    let removeBgCalls = 0;
    let clearBackdropCalls = 0;

    globalThis.fetch = async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("api.remove.bg")) {
        removeBgCalls += 1;
        return new Response(JSON.stringify({ errors: [{ title: "Forbidden" }] }), {
          status: 403,
        });
      }
      if (url.includes("clearbackdrop.com")) {
        clearBackdropCalls += 1;
        return new Response(Buffer.from(healthyPng), {
          status: 200,
          headers: { "Content-Type": "image/png" },
        });
      }
      return new Response("Not found", { status: 404 });
    };

    const piece1 = await runGarmentEnhancementService({
      bytes: healthyPng,
      mimeType: "image/png",
      extension: "png",
      mode: "clean-cutout",
      category: "jackets",
    });
    const piece2 = await runGarmentEnhancementService({
      bytes: healthyPng,
      mimeType: "image/png",
      extension: "png",
      mode: "clean-cutout",
      category: "scarves",
    });

    expect(piece1.status).toBe("ok");
    expect(piece1.provider).toBe("clearbackdrop");
    expect(piece2.status).toBe("ok");
    expect(piece2.provider).toBe("clearbackdrop");
    // Remove.bg was only hit on piece 1; piece 2 skipped the 403 key in 0ms!
    expect(removeBgCalls).toBe(1);
    expect(clearBackdropCalls).toBe(2);
  });
});
