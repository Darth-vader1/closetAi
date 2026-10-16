import { z } from "zod";
import { OCCASION_VALUES, STYLE_VALUES } from "@/lib/profile/options";

export const GENDER_OPTIONS = [
  { value: "menswear", label: "Menswear / Male" },
  { value: "womenswear", label: "Womenswear / Female" },
  { value: "unisex", label: "Unisex / Androgynous" },
] as const;

export type GenderValue = (typeof GENDER_OPTIONS)[number]["value"];

export const updateProfileSchema = z.object({
  displayName: z.string().trim().min(1, "Name cannot be empty.").max(80),
  gender: z.enum(["menswear", "womenswear", "unisex"]).default("unisex"),
  preferredStyle: z.array(z.enum(STYLE_VALUES)).max(6).default([]),
  commonOccasions: z.array(z.enum(OCCASION_VALUES as [string, ...string[]])).max(10).default([]),
  location: z.string().trim().max(100).nullable().default(null),
  timezone: z.string().trim().default("UTC"),
  rewearWornItems: z.boolean().default(true),
  discoverable: z.boolean().default(false),
});

export const updateEmailPreferencesSchema = z.object({
  dailyEnabled: z.boolean().default(true),
  dailyTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Invalid time format (HH:MM)").default("07:00"),
  weeklyLaundryEnabled: z.boolean().default(true),
  weeklyLaundryDay: z.enum([
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ]).default("Sunday"),
  whatsappPhone: z.string().trim().max(30).optional().default(""),
  whatsappDailyEnabled: z.boolean().default(false),
  remindEmptyWardrobe: z.boolean().default(true),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type UpdateEmailPreferencesInput = z.infer<typeof updateEmailPreferencesSchema>;
