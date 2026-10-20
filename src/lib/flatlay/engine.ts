import { categoryGroup } from "@/lib/wardrobe/categories";
import type { WardrobeItem } from "@/lib/wardrobe/queries";
import type {
  FlatlayAspectRatio,
  FlatlayItem,
  FlatlayPreset,
} from "./types";
import { CANVAS_ASPECT_RATIOS } from "./types";

interface GenerateFlatlayOptions {
  preset?: FlatlayPreset;
  aspectRatio?: FlatlayAspectRatio;
  canvasWidth?: number;
  canvasHeight?: number;
  seed?: number; // for alternative layout variations on regenerate
}

/**
 * Simple pseudo-random generator with seed for deterministic layouts
 */
function pseudoRandom(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/**
 * Deterministically generates initial canvas placement for selected wardrobe items
 */
export function generateFlatlayPlacement(
  items: WardrobeItem[],
  options: GenerateFlatlayOptions = {},
): FlatlayItem[] {
  if (!items || items.length === 0) return [];

  const preset = options.preset ?? "collage";
  const aspectRatio = options.aspectRatio ?? "4:5";
  const dim = CANVAS_ASPECT_RATIOS[aspectRatio] ?? { width: 1200, height: 1500 };
  const W = options.canvasWidth ?? dim.width;
  const H = options.canvasHeight ?? dim.height;
  const seed = options.seed ?? 42;
  const rng = pseudoRandom(seed);

  // Group items semantically by wardrobe role
  const fullbodies: WardrobeItem[] = [];
  const tops: WardrobeItem[] = [];
  const outers: WardrobeItem[] = [];
  const bottoms: WardrobeItem[] = [];
  const shoes: WardrobeItem[] = [];
  const bags: WardrobeItem[] = [];
  const accessories: WardrobeItem[] = [];
  const others: WardrobeItem[] = [];

  for (const item of items) {
    const group = categoryGroup(item.category);
    if (group === "fullbody" || group === "traditional") {
      fullbodies.push(item);
    } else if (group === "outerwear") {
      outers.push(item);
    } else if (group === "top") {
      tops.push(item);
    } else if (group === "bottom") {
      bottoms.push(item);
    } else if (group === "footwear") {
      shoes.push(item);
    } else if (item.category.includes("bag")) {
      bags.push(item);
    } else if (group === "accessory") {
      accessories.push(item);
    } else {
      others.push(item);
    }
  }

  switch (preset) {
    case "editorial":
      return layoutEditorial(items, { W, H, fullbodies, tops, outers, bottoms, shoes, bags, accessories, others, rng });
    case "streetwear":
      return layoutStreetwear(items, { W, H, fullbodies, tops, outers, bottoms, shoes, bags, accessories, others, rng });
    case "minimal":
      return layoutMinimal(items, { W, H, fullbodies, tops, outers, bottoms, shoes, bags, accessories, others, rng });
    case "catalogue":
      return layoutCatalogue(items, { W, H });
    case "collage":
    default:
      return layoutCollage(items, { W, H, fullbodies, tops, outers, bottoms, shoes, bags, accessories, others, rng });
  }
}

interface LayoutContext {
  W: number;
  H: number;
  fullbodies: WardrobeItem[];
  tops: WardrobeItem[];
  outers: WardrobeItem[];
  bottoms: WardrobeItem[];
  shoes: WardrobeItem[];
  bags: WardrobeItem[];
  accessories: WardrobeItem[];
  others: WardrobeItem[];
  rng: () => number;
}

/**
 * 1. Reference Collage Preset (The target fashion moodboard)
 * Asymmetric, artistic angles, varied garment sizes, balanced negative space
 */
function layoutCollage(items: WardrobeItem[], ctx: LayoutContext): FlatlayItem[] {
  const { W, H, fullbodies, tops, outers, bottoms, shoes, bags, accessories, others, rng } = ctx;
  const result: FlatlayItem[] = [];
  let zIndexCounter = 1;

  const hasFullbody = fullbodies.length > 0;
  const hasOuter = outers.length > 0;
  const hasTop = tops.length > 0;
  const hasBottom = bottoms.length > 0;

  // Jitter generator for organic asymmetric look
  const jitterAngle = (base: number, range: number) => {
    return Number((base + (rng() - 0.5) * range).toFixed(1));
  };

  if (hasFullbody) {
    // Center-left anchor for dress/robe
    const dress = fullbodies[0];
    const dw = W * 0.52;
    const dh = H * 0.62;
    result.push({
      id: `flatlay_${dress.id}`,
      wardrobeItemId: dress.id,
      name: dress.name,
      category: dress.category,
      imagePath: dress.imagePath,
      x: W * 0.46,
      y: H * 0.44,
      width: dw,
      height: dh,
      rotation: jitterAngle(-2, 4),
      scaleX: 1,
      scaleY: 1,
      zIndex: zIndexCounter++,
      shadow: true,
    });
  } else {
    // Tops & Bottoms Combination
    if (hasTop) {
      const top = tops[0];
      const tw = W * (hasOuter ? 0.42 : 0.48);
      const th = H * 0.40;
      result.push({
        id: `flatlay_${top.id}`,
        wardrobeItemId: top.id,
        name: top.name,
        category: top.category,
        imagePath: top.imagePath,
        x: hasOuter ? W * 0.42 : W * 0.48,
        y: H * 0.32,
        width: tw,
        height: th,
        rotation: jitterAngle(-3, 6),
        scaleX: 1,
        scaleY: 1,
        zIndex: zIndexCounter++,
        shadow: true,
      });
    }

    if (hasOuter) {
      const outer = outers[0];
      const ow = W * 0.46;
      const oh = H * 0.44;
      result.push({
        id: `flatlay_${outer.id}`,
        wardrobeItemId: outer.id,
        name: outer.name,
        category: outer.category,
        imagePath: outer.imagePath,
        x: W * 0.68,
        y: H * 0.30,
        width: ow,
        height: oh,
        rotation: jitterAngle(4, 6),
        scaleX: 1,
        scaleY: 1,
        zIndex: zIndexCounter++,
        shadow: true,
      });
    }

    if (hasBottom) {
      const bottom = bottoms[0];
      const bw = W * 0.46;
      const bh = H * 0.46;
      result.push({
        id: `flatlay_${bottom.id}`,
        wardrobeItemId: bottom.id,
        name: bottom.name,
        category: bottom.category,
        imagePath: bottom.imagePath,
        x: W * 0.50,
        y: H * 0.65,
        width: bw,
        height: bh,
        rotation: jitterAngle(2, 5),
        scaleX: 1,
        scaleY: 1,
        zIndex: zIndexCounter++,
        shadow: true,
      });
    }
  }

  // Shoes: bottom right or grounded
  if (shoes.length > 0) {
    const shoe = shoes[0];
    const sw = W * 0.34;
    const sh = H * 0.28;
    result.push({
      id: `flatlay_${shoe.id}`,
      wardrobeItemId: shoe.id,
      name: shoe.name,
      category: shoe.category,
      imagePath: shoe.imagePath,
      x: W * 0.76,
      y: H * 0.82,
      width: sw,
      height: sh,
      rotation: jitterAngle(-6, 8),
      scaleX: 1,
      scaleY: 1,
      zIndex: zIndexCounter++,
      shadow: true,
    });
  }

  // Bag: upper right or lower left
  if (bags.length > 0) {
    const bag = bags[0];
    const bw = W * 0.32;
    const bh = H * 0.28;
    result.push({
      id: `flatlay_${bag.id}`,
      wardrobeItemId: bag.id,
      name: bag.name,
      category: bag.category,
      imagePath: bag.imagePath,
      x: W * 0.22,
      y: H * 0.74,
      width: bw,
      height: bh,
      rotation: jitterAngle(6, 6),
      scaleX: 1,
      scaleY: 1,
      zIndex: zIndexCounter++,
      shadow: true,
    });
  }

  // Additional accessories arranged around remaining pockets
  const remaining = [
    ...fullbodies.slice(1),
    ...tops.slice(1),
    ...outers.slice(1),
    ...bottoms.slice(1),
    ...shoes.slice(1),
    ...bags.slice(1),
    ...accessories,
    ...others,
  ];

  const accessorySlots = [
    { x: W * 0.18, y: H * 0.22, w: W * 0.24, h: H * 0.22, rot: -5 },
    { x: W * 0.82, y: H * 0.18, w: W * 0.22, h: H * 0.20, rot: 8 },
    { x: W * 0.18, y: H * 0.50, w: W * 0.20, h: H * 0.18, rot: 3 },
    { x: W * 0.84, y: H * 0.54, w: W * 0.22, h: H * 0.20, rot: -4 },
    { x: W * 0.48, y: H * 0.90, w: W * 0.22, h: H * 0.18, rot: 0 },
  ];

  remaining.forEach((item, idx) => {
    const slot = accessorySlots[idx % accessorySlots.length];
    const isSmallAcc = item.category.includes("watch") || item.category.includes("glasses") || item.category.includes("jewel");
    const scale = isSmallAcc ? 0.75 : 1.0;

    result.push({
      id: `flatlay_${item.id}`,
      wardrobeItemId: item.id,
      name: item.name,
      category: item.category,
      imagePath: item.imagePath,
      x: slot.x + (rng() - 0.5) * 30,
      y: slot.y + (rng() - 0.5) * 30,
      width: slot.w * scale,
      height: slot.h * scale,
      rotation: jitterAngle(slot.rot, 8),
      scaleX: 1,
      scaleY: 1,
      zIndex: zIndexCounter++,
      shadow: true,
    });
  });

  return result;
}

/**
 * 2. Editorial Magazine Preset
 * Clean vertical hierarchy, strict balanced alignment, subtle ±1.5° rotation
 */
function layoutEditorial(items: WardrobeItem[], ctx: LayoutContext): FlatlayItem[] {
  const { W, H, fullbodies, tops, outers, bottoms, shoes, bags, accessories, others } = ctx;
  const result: FlatlayItem[] = [];
  let zIndex = 1;

  if (fullbodies.length > 0) {
    const dress = fullbodies[0];
    result.push({
      id: `flatlay_${dress.id}`,
      wardrobeItemId: dress.id,
      name: dress.name,
      category: dress.category,
      imagePath: dress.imagePath,
      x: W * 0.5,
      y: H * 0.42,
      width: W * 0.55,
      height: H * 0.58,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      zIndex: zIndex++,
      shadow: true,
    });
  } else {
    if (tops.length > 0) {
      const top = tops[0];
      result.push({
        id: `flatlay_${top.id}`,
        wardrobeItemId: top.id,
        name: top.name,
        category: top.category,
        imagePath: top.imagePath,
        x: W * 0.5,
        y: H * 0.32,
        width: W * 0.48,
        height: H * 0.38,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        zIndex: zIndex++,
        shadow: true,
      });
    }

    if (bottoms.length > 0) {
      const bottom = bottoms[0];
      result.push({
        id: `flatlay_${bottom.id}`,
        wardrobeItemId: bottom.id,
        name: bottom.name,
        category: bottom.category,
        imagePath: bottom.imagePath,
        x: W * 0.5,
        y: H * 0.64,
        width: W * 0.46,
        height: H * 0.44,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        zIndex: zIndex++,
        shadow: true,
      });
    }

    if (outers.length > 0) {
      const outer = outers[0];
      result.push({
        id: `flatlay_${outer.id}`,
        wardrobeItemId: outer.id,
        name: outer.name,
        category: outer.category,
        imagePath: outer.imagePath,
        x: W * 0.78,
        y: H * 0.34,
        width: W * 0.40,
        height: H * 0.38,
        rotation: 1,
        scaleX: 1,
        scaleY: 1,
        zIndex: zIndex++,
        shadow: true,
      });
    }
  }

  if (shoes.length > 0) {
    result.push({
      id: `flatlay_${shoes[0].id}`,
      wardrobeItemId: shoes[0].id,
      name: shoes[0].name,
      category: shoes[0].category,
      imagePath: shoes[0].imagePath,
      x: W * 0.5,
      y: H * 0.86,
      width: W * 0.34,
      height: H * 0.24,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      zIndex: zIndex++,
      shadow: true,
    });
  }

  if (bags.length > 0) {
    result.push({
      id: `flatlay_${bags[0].id}`,
      wardrobeItemId: bags[0].id,
      name: bags[0].name,
      category: bags[0].category,
      imagePath: bags[0].imagePath,
      x: W * 0.22,
      y: H * 0.76,
      width: W * 0.30,
      height: H * 0.26,
      rotation: -1,
      scaleX: 1,
      scaleY: 1,
      zIndex: zIndex++,
      shadow: true,
    });
  }

  const extras = [...tops.slice(1), ...bottoms.slice(1), ...outers.slice(1), ...shoes.slice(1), ...bags.slice(1), ...accessories, ...others];
  extras.forEach((item, i) => {
    const isLeft = i % 2 === 0;
    const yStep = H * (0.2 + (i * 0.18));
    result.push({
      id: `flatlay_${item.id}`,
      wardrobeItemId: item.id,
      name: item.name,
      category: item.category,
      imagePath: item.imagePath,
      x: isLeft ? W * 0.18 : W * 0.82,
      y: Math.min(yStep, H * 0.88),
      width: W * 0.22,
      height: H * 0.20,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      zIndex: zIndex++,
      shadow: true,
    });
  });

  return result;
}

/**
 * 3. Streetwear / Y2K Preset
 * Dynamic expressive angles (-10° to 10°), oversized statement items
 */
function layoutStreetwear(items: WardrobeItem[], ctx: LayoutContext): FlatlayItem[] {
  const { W, H, tops, outers, bottoms, shoes, bags, accessories, others, fullbodies, rng } = ctx;
  const result: FlatlayItem[] = [];
  let zIndex = 1;

  const coreTops = [...outers, ...tops, ...fullbodies];
  if (coreTops.length > 0) {
    const mainTop = coreTops[0];
    result.push({
      id: `flatlay_${mainTop.id}`,
      wardrobeItemId: mainTop.id,
      name: mainTop.name,
      category: mainTop.category,
      imagePath: mainTop.imagePath,
      x: W * 0.44,
      y: H * 0.32,
      width: W * 0.56,
      height: H * 0.46,
      rotation: -6 + rng() * 4,
      scaleX: 1,
      scaleY: 1,
      zIndex: zIndex++,
      shadow: true,
    });
  }

  if (bottoms.length > 0) {
    const b = bottoms[0];
    result.push({
      id: `flatlay_${b.id}`,
      wardrobeItemId: b.id,
      name: b.name,
      category: b.category,
      imagePath: b.imagePath,
      x: W * 0.54,
      y: H * 0.65,
      width: W * 0.50,
      height: H * 0.48,
      rotation: 5 + rng() * 4,
      scaleX: 1,
      scaleY: 1,
      zIndex: zIndex++,
      shadow: true,
    });
  }

  if (shoes.length > 0) {
    const s = shoes[0];
    result.push({
      id: `flatlay_${s.id}`,
      wardrobeItemId: s.id,
      name: s.name,
      category: s.category,
      imagePath: s.imagePath,
      x: W * 0.74,
      y: H * 0.84,
      width: W * 0.38,
      height: H * 0.30,
      rotation: -10 + rng() * 5,
      scaleX: 1,
      scaleY: 1,
      zIndex: zIndex++,
      shadow: true,
    });
  }

  if (bags.length > 0) {
    const bag = bags[0];
    result.push({
      id: `flatlay_${bag.id}`,
      wardrobeItemId: bag.id,
      name: bag.name,
      category: bag.category,
      imagePath: bag.imagePath,
      x: W * 0.22,
      y: H * 0.72,
      width: W * 0.34,
      height: H * 0.30,
      rotation: 8 + rng() * 4,
      scaleX: 1,
      scaleY: 1,
      zIndex: zIndex++,
      shadow: true,
    });
  }

  const extras = [...coreTops.slice(1), ...bottoms.slice(1), ...shoes.slice(1), ...bags.slice(1), ...accessories, ...others];
  extras.forEach((item, idx) => {
    const xPos = idx % 2 === 0 ? W * 0.16 : W * 0.84;
    const yPos = H * (0.16 + idx * 0.20);
    result.push({
      id: `flatlay_${item.id}`,
      wardrobeItemId: item.id,
      name: item.name,
      category: item.category,
      imagePath: item.imagePath,
      x: xPos,
      y: Math.min(yPos, H * 0.88),
      width: W * 0.26,
      height: H * 0.22,
      rotation: (idx % 2 === 0 ? -12 : 12) + (rng() - 0.5) * 6,
      scaleX: 1,
      scaleY: 1,
      zIndex: zIndex++,
      shadow: true,
    });
  });

  return result;
}

/**
 * 4. Minimal / Capsule Preset
 * Generous breathing space, 0° rotation, balanced serenity
 */
function layoutMinimal(items: WardrobeItem[], ctx: LayoutContext): FlatlayItem[] {
  const { W, H, fullbodies, tops, outers, bottoms, shoes, bags, accessories, others } = ctx;
  const result: FlatlayItem[] = [];
  let zIndex = 1;

  const allItems = [...fullbodies, ...tops, ...outers, ...bottoms, ...shoes, ...bags, ...accessories, ...others];
  const count = allItems.length;

  if (count <= 3) {
    // Elegant vertical stack with generous spacing
    const step = H / (count + 1);
    allItems.forEach((item, i) => {
      result.push({
        id: `flatlay_${item.id}`,
        wardrobeItemId: item.id,
        name: item.name,
        category: item.category,
        imagePath: item.imagePath,
        x: W * 0.5,
        y: step * (i + 1),
        width: W * 0.42,
        height: H * 0.28,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        zIndex: zIndex++,
        shadow: false,
      });
    });
  } else {
    // 2-column balanced arrangement
    const cols = 2;
    const rows = Math.ceil(count / cols);
    const colStep = W / (cols + 1);
    const rowStep = H / (rows + 1);

    allItems.forEach((item, idx) => {
      const c = idx % cols;
      const r = Math.floor(idx / cols);
      result.push({
        id: `flatlay_${item.id}`,
        wardrobeItemId: item.id,
        name: item.name,
        category: item.category,
        imagePath: item.imagePath,
        x: colStep * (c + 1),
        y: rowStep * (r + 1),
        width: W * 0.36,
        height: H * 0.26,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        zIndex: zIndex++,
        shadow: false,
      });
    });
  }

  return result;
}

/**
 * 5. Catalogue / Grid Preset
 * Structured product-like grid with consistent padding and alignment
 */
function layoutCatalogue(items: WardrobeItem[], { W, H }: { W: number; H: number }): FlatlayItem[] {
  const result: FlatlayItem[] = [];
  const count = items.length;
  const cols = count <= 4 ? 2 : count <= 9 ? 3 : 4;
  const rows = Math.ceil(count / cols);

  const cellW = (W * 0.88) / cols;
  const cellH = (H * 0.88) / rows;
  const startX = W * 0.06 + cellW / 2;
  const startY = H * 0.06 + cellH / 2;

  items.forEach((item, idx) => {
    const c = idx % cols;
    const r = Math.floor(idx / cols);

    result.push({
      id: `flatlay_${item.id}`,
      wardrobeItemId: item.id,
      name: item.name,
      category: item.category,
      imagePath: item.imagePath,
      x: startX + c * cellW,
      y: startY + r * cellH,
      width: cellW * 0.85,
      height: cellH * 0.85,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      zIndex: idx + 1,
      shadow: true,
    });
  });

  return result;
}
