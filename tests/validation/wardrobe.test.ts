import { describe, expect, it } from "vitest";
import { createItemSchema, escapeLike, itemFieldsSchema, parseWardrobeQuery } from "@/lib/validation/wardrobe";
import { CATEGORIES, categoryGroup, categoryLabel, isCategory } from "@/lib/wardrobe/categories";

const validItem = {
  name: "  Navy tee ",
  category: "t-shirts",
  subcategory: "",
  primaryColour: "navy",
  secondaryColours: [],
  pattern: null,
  material: "  ",
  style: "casual",
  occasions: ["everyday"],
  seasons: ["all_year"],
  warmthLevel: null,
  isFavourite: false,
};

describe("itemFieldsSchema", () => {
  it("trims text and turns blank optional fields into null", () => {
    const out = itemFieldsSchema.parse(validItem);
    expect(out.name).toBe("Navy tee");
    expect(out.subcategory).toBeNull();
    expect(out.material).toBeNull();
  });

  it("allows unknown attributes to stay null instead of forcing a guess", () => {
    const out = itemFieldsSchema.parse({ ...validItem, primaryColour: null, pattern: null, style: null, warmthLevel: null });
    expect(out.primaryColour).toBeNull();
    expect(out.style).toBeNull();
  });

  it.each([
    ["empty name", { name: "   " }],
    ["unknown category", { category: "capes" }],
    ["bad colour", { primaryColour: "ultraviolet" }],
    ["warmth out of range", { warmthLevel: 9 }],
    ["fractional warmth", { warmthLevel: 2.5 }],
    ["too many secondary colours", { secondaryColours: ["red", "blue", "green", "black", "white"] }],
    ["unknown occasion", { occasions: ["heist"] }],
  ])("rejects %s", (_label, override) => {
    expect(itemFieldsSchema.safeParse({ ...validItem, ...override }).success).toBe(false);
  });
});

describe("createItemSchema", () => {
  it("requires an image path", () => {
    expect(createItemSchema.safeParse({ ...validItem, aiAnalysed: false }).success).toBe(false);
    expect(createItemSchema.safeParse({ ...validItem, aiAnalysed: false, imagePath: "u/x.jpg" }).success).toBe(true);
  });
});

describe("parseWardrobeQuery", () => {
  it("returns safe defaults for empty input", () => {
    expect(parseWardrobeQuery({})).toEqual({ q: "", category: null, colour: null, status: null, favouritesOnly: false, sort: "newest", page: 1 });
  });

  it("accepts valid filters", () => {
    const q = parseWardrobeQuery({ q: " tee ", category: "jeans", colour: "blue", status: "DIRTY", favourites: "1", sort: "name", page: "3" });
    expect(q).toEqual({ q: "tee", category: "jeans", colour: "blue", status: "DIRTY", favouritesOnly: true, sort: "name", page: 3 });
  });

  it("drops unknown or hostile values rather than passing them to the database", () => {
    const q = parseWardrobeQuery({ category: "x;drop table", colour: "nope", status: "clean", sort: "random()", page: "-5" });
    expect(q.category).toBeNull();
    expect(q.colour).toBeNull();
    expect(q.status).toBeNull();
    expect(q.sort).toBe("newest");
    expect(q.page).toBe(1);
  });

  it("uses the first value when a parameter is repeated and caps search length", () => {
    expect(parseWardrobeQuery({ category: ["jeans", "shirts"] }).category).toBe("jeans");
    expect(parseWardrobeQuery({ q: "a".repeat(500) }).q).toHaveLength(80);
  });
});

describe("escapeLike", () => {
  it("escapes LIKE wildcards and backslashes", () => {
    expect(escapeLike("100%_cotton\\")).toBe("100\\%\\_cotton\\\\");
  });
});

describe("categories", () => {
  it("covers every category in the spec and has unique values", () => {
    expect(CATEGORIES).toHaveLength(23);
    expect(new Set(CATEGORIES.map((c) => c.value)).size).toBe(CATEGORIES.length);
  });

  it("maps categories to outfit groups", () => {
    expect(categoryGroup("jeans")).toBe("bottom");
    expect(categoryGroup("sneakers")).toBe("footwear");
    expect(categoryGroup("dresses")).toBe("fullbody");
    expect(categoryGroup("traditional")).toBe("traditional");
    expect(categoryGroup("not-a-category")).toBe("other");
  });

  it("labels and validates", () => {
    expect(categoryLabel("polo-shirts")).toBe("Polo shirts");
    expect(isCategory("shirts")).toBe(true);
    expect(isCategory("capes")).toBe(false);
  });
});

import { optionalIntFromSelect, optionalStringFromSelect } from "@/lib/validation/wardrobe";

describe("select value converters (regression: null default became 0)", () => {
  it("treats null, undefined and empty string as 'not set', never 0", () => {
    for (const v of [null, undefined, ""]) {
      expect(optionalIntFromSelect(v)).toBeNull();
      expect(optionalStringFromSelect(v)).toBeNull();
    }
  });

  it("converts real values", () => {
    expect(optionalIntFromSelect("3")).toBe(3);
    expect(optionalIntFromSelect(4)).toBe(4);
    expect(optionalIntFromSelect("abc")).toBeNull();
    expect(optionalStringFromSelect("navy")).toBe("navy");
  });

  it("produces a value the schema accepts for an unset warmth", () => {
    const parsed = itemFieldsSchema.safeParse({ ...validItem, warmthLevel: optionalIntFromSelect(null) });
    expect(parsed.success).toBe(true);
  });
});
