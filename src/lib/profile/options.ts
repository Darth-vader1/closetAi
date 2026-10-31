export const STYLE_OPTIONS = [
  { value: "casual", label: "Casual" },
  { value: "smart_casual", label: "Smart casual" },
  { value: "formal", label: "Formal" },
  { value: "minimalist", label: "Minimalist" },
  { value: "streetwear", label: "Streetwear" },
  { value: "sporty", label: "Sporty" },
  { value: "business_casual", label: "Business casual" },
  { value: "traditional", label: "Traditional" },
  { value: "other", label: "Other" },
] as const;

export type StyleValue = (typeof STYLE_OPTIONS)[number]["value"];
export const STYLE_VALUES = STYLE_OPTIONS.map((s) => s.value) as [StyleValue, ...StyleValue[]];

export const COLOUR_OPTIONS = [
  "black", "white", "grey", "ash", "navy", "blue", "green", "olive", "brown", "beige", "cream",
  "red", "burgundy", "pink", "orange", "yellow", "purple",
] as const;

export const OCCASION_OPTIONS = [
  { value: "everyday", label: "Everyday" },
  { value: "school", label: "School or campus" },
  { value: "work", label: "Work" },
  { value: "formal_event", label: "Formal event" },
  { value: "party", label: "Party or night out" },
  { value: "worship", label: "Worship" },
  { value: "traditional_event", label: "Traditional event" },
  { value: "sport", label: "Sport or gym" },
  { value: "travel", label: "Travel" },
  { value: "date", label: "Date" },
] as const;

export const OCCASION_VALUES = OCCASION_OPTIONS.map((o) => o.value) as string[];

export const BODY_BUILD_OPTIONS = [
  { value: "tailored", label: "Classic Fit" },
  { value: "hourglass", label: "Hourglass" },
  { value: "pear", label: "Pear / Triangle" },
  { value: "apple", label: "Apple / Round" },
  { value: "rectangle", label: "Rectangle / Straight" },
  { value: "inverted_triangle", label: "Inverted Triangle" },
  { value: "athletic", label: "Athletic" },
  { value: "curvy", label: "Curvy / Full" },
  { value: "tall_slender", label: "Tall / Runway" },
] as const;

export type BodyBuildValue = (typeof BODY_BUILD_OPTIONS)[number]["value"];
export const BODY_BUILD_VALUES = BODY_BUILD_OPTIONS.map((b) => b.value) as [BodyBuildValue, ...BodyBuildValue[]];

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
