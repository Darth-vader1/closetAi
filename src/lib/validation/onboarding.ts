import { z } from "zod";
import { COLOUR_OPTIONS, OCCASION_VALUES, STYLE_VALUES } from "@/lib/profile/options";
import { isValidTimeZone } from "@/lib/scheduling/timezone";

/** "HH:MM" 24-hour clock. Postgres `time` accepts this directly. */
const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time like 07:30.");

export const onboardingSchema = z.object({
  displayName: z.string().trim().min(1, "Tell us what to call you.").max(80),
  preferredStyles: z.array(z.enum(STYLE_VALUES)).default([]),
  favouriteColours: z.array(z.enum(COLOUR_OPTIONS)).max(8, "Pick up to 8 colours."),
  commonOccasions: z
    .array(z.string())
    .max(10)
    .refine((all) => all.every((o) => OCCASION_VALUES.includes(o)), "Unknown occasion."),
  location: z.string().trim().max(120).optional().transform((v) => (v ? v : null)),
  timezone: z.string().refine(isValidTimeZone, "Choose a valid timezone."),
  dailyEnabled: z.boolean(),
  dailyTime: timeOfDay,
  weeklyEnabled: z.boolean(),
  weeklyDay: z.number().int().min(0).max(6),
  weeklyTime: timeOfDay,
});

export type OnboardingInput = z.input<typeof onboardingSchema>;
export type OnboardingData = z.output<typeof onboardingSchema>;
