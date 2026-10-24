/**
 * Fact-grounded outfit explanation & styling tip generator (Phase 12).
 *
 * Rules:
 *  - Only state claims backed by the actual selected garments and their known attributes.
 *  - Never invent materials ("breathable linen", "waterproof leather", "cashmere") when `item.material` is null.
 *  - Scrub unverified material/price/brand hallucinations from AI-provided explanations if an item lacks those fields.
 */
import { readPalette } from "@/lib/styling/colour";
import { typeLabel } from "@/lib/styling/taxonomy";
import type { GarmentProfile, OutfitArchetype, StylingConstraints, Violation } from "@/lib/styling/types";

const FABRIC_CLAIMS = /\b(linen|silk|cashmere|wool|merino|suede|velvet|satin|chiffon|gore[- ]?tex|waterproof|moisture[- ]wicking|breathable natural)\b/gi;

/**
 * Generates a concise, factual explanation of why the selected garments work together,
 * grounded strictly in known colours, silhouettes, patterns, and garment types.
 */
export function buildFactExplanation(
  profiles: GarmentProfile[],
  archetype: OutfitArchetype,
  constraints: StylingConstraints,
): string {
  const core = profiles.filter((p) => ["top", "bottom", "onepiece", "outer", "shoes"].includes(p.role));
  const top = profiles.find((p) => p.role === "top");
  const bottom = profiles.find((p) => p.role === "bottom");
  const onepiece = profiles.find((p) => p.role === "onepiece");
  const shoe = profiles.find((p) => p.role === "shoes");
  const outer = profiles.find((p) => p.role === "outer");

  const parts: string[] = [];

  // 1. Colour relationship
  const palette = readPalette(core.map((p) => p.colour));
  if (palette.kind === "neutral_accent" && top && bottom) {
    const accentPiece = core.find((p) => p.colour === palette.chromaticFamilies[0]);
    const neutralPiece = core.find((p) => p.id !== accentPiece?.id && p.colour);
    if (accentPiece && neutralPiece) {
      parts.push(
        `The ${neutralPiece.colour} ${typeLabel(neutralPiece.type)} balances the ${accentPiece.colour} of the ${accentPiece.item.name.toLowerCase()}`,
      );
    } else {
      parts.push(`Uses ${palette.label} to keep the focus clean`);
    }
  } else if (palette.kind === "tonal") {
    parts.push(`The ${palette.label} palette creates a cohesive monochrome look`);
  } else if (palette.kind === "neutral") {
    parts.push(`Built on a clean neutral palette for effortless coordination`);
  } else if (palette.kind === "analogous" || palette.kind === "complementary") {
    parts.push(`Pairs ${palette.label} for intentional colour harmony`);
  } else if (onepiece) {
    parts.push(`Centres the look around your ${onepiece.item.name.toLowerCase()}`);
  } else if (top && bottom) {
    parts.push(`Pairs ${top.item.name.toLowerCase()} with ${bottom.item.name.toLowerCase()}`);
  }

  // 2. Silhouette or layering note
  if (top?.silhouette && bottom?.silhouette && top.silhouette !== bottom.silhouette) {
    parts.push(`pairing a ${top.silhouette} top with ${bottom.silhouette} bottoms for balanced proportions`);
  } else if (outer) {
    parts.push(`layered with ${outer.item.name.toLowerCase()} for structure`);
  }

  // 3. Footwear grounding
  if (shoe) {
    const shoeRole =
      shoe.type === "sneakers"
        ? "keep the outfit grounded and casual"
        : shoe.formality >= 4
        ? "sharpen the silhouette for a polished finish"
        : "complete the look";
    parts.push(`while the ${shoe.item.name.toLowerCase()} ${shoeRole}`);
  }

  void archetype;
  void constraints;

  const sentence = parts.join(", ");
  if (!sentence) return "Coordinated from your available clean wardrobe pieces.";
  return sentence.charAt(0).toUpperCase() + sentence.slice(1) + ".";
}

/**
 * Sanitises an AI-provided explanation so it cannot claim fabrics or properties that are absent
 * from the underlying wardrobe metadata, falling back to `buildFactExplanation` if needed.
 */
export function sanitiseExplanation(
  aiExplanation: string | undefined | null,
  profiles: GarmentProfile[],
  archetype: OutfitArchetype,
  constraints: StylingConstraints,
): string {
  const fallback = buildFactExplanation(profiles, archetype, constraints);
  if (!aiExplanation || !aiExplanation.trim()) return fallback;

  const knownMaterials = profiles
    .map((p) => `${p.item.material ?? ""} ${p.item.name}`.toLowerCase())
    .join(" ");

  let cleaned = aiExplanation.trim();
  const matches = cleaned.match(FABRIC_CLAIMS) ?? [];
  for (const m of matches) {
    if (!knownMaterials.includes(m.toLowerCase())) {
      // AI fabricated a fabric/material claim not supported by item metadata; use factual explanation instead.
      return fallback;
    }
  }
  return cleaned;
}

/** Builds a concise caveat string when Level 2 warnings were tolerated (e.g. bold/experimental mode). */
export function buildCaveat(warnings: Violation[]): string | undefined {
  if (warnings.length === 0) return undefined;
  return warnings[0].message;
}
