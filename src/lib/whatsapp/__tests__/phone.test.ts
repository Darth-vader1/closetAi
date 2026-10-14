import { describe, expect, it } from "vitest";
import { digitsOnly, normaliseWhatsAppPhone } from "../phone";

describe("normaliseWhatsAppPhone", () => {
  it.each([
    ["+234 801 234 5678", "+2348012345678"],
    ["(234) 801-234-5678", "+2348012345678"],
    ["2348012345678", "+2348012345678"],
    ["+44 7911 123456", "+447911123456"],
  ])("normalises %s", (input, e164) => {
    expect(normaliseWhatsAppPhone(input)?.e164).toBe(e164);
  });

  it.each(["", "   ", "hello", "0801 234 5678", "+0123456789", "12345", "+1234567890123456", "<script>", "+234 801 234 5678 ext 4"])(
    "rejects %j",
    (input) => {
      expect(normaliseWhatsAppPhone(input)).toBeNull();
    },
  );

  it("returns digits matching Meta's `from` format", () => {
    expect(normaliseWhatsAppPhone("+234 801 234 5678")?.digits).toBe("2348012345678");
  });
});

describe("digitsOnly", () => {
  it("accepts plausible numbers and rejects junk", () => {
    expect(digitsOnly("+234 801 234 5678")).toBe("2348012345678");
    expect(digitsOnly("abc")).toBeNull();
    expect(digitsOnly(null)).toBeNull();
    expect(digitsOnly("123")).toBeNull();
  });
});
