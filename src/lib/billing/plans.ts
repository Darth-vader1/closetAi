/**
 * Centralized Plan & Entitlement Configuration for ClosetAI
 *
 * Defines the launch limits for Free and Premium tiers, pricing structures,
 * and feature capabilities. All client components and backend services read from here.
 */

export const PAYSTACK_PUBLIC_KEY = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY || "";
export const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || "";

export const STRIPE_PUBLIC_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "";
export const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";

export const ALLOWED_PAID_PLAN_IDS = ["monthly", "annual"] as const;
export type AllowedPaidPlanId = (typeof ALLOWED_PAID_PLAN_IDS)[number];

export function isAllowedPlanId(planId: unknown): planId is AllowedPaidPlanId {
  return typeof planId === "string" && (planId === "monthly" || planId === "annual");
}

export type PlanId = "free" | "monthly" | "annual";

export type UsageFeatureKey =
  | "wardrobe_items"
  | "outfit_recommendations"
  | "saved_outfits"
  | "flatlay_designs"
  | "beautify_processing";

export type AccessFeatureKey =
  | "advanced_styling"
  | "closetai_connect"
  | "advanced_insights";

export interface PlanLimits {
  wardrobe_items: number | null; // null = unlimited
  outfit_recommendations: {
    limit: number | null;
    window: "week" | "month";
  };
  saved_outfits: number | null;
  flatlay_designs: number | null;
  beautify_processing: {
    limit: number | null;
    window: "month";
  };
  advanced_styling: boolean;
  closetai_connect: "basic" | "full";
  advanced_insights: boolean;
}

export interface PricingPlan {
  id: PlanId;
  name: string;
  tagline: string;
  description: string;
  badge?: string;
  priceNGN: number;
  priceUSD: number;
  formattedNGN: string;
  formattedUSD: string;
  period: "free" | "monthly" | "annual";
  features: string[];
  limits: PlanLimits;
  paystackPlanCode?: string;
  stripePriceId?: string;
}

export const FREE_PLAN_LIMITS: PlanLimits = {
  wardrobe_items: 30,
  outfit_recommendations: {
    limit: 5,
    window: "week",
  },
  saved_outfits: 10,
  flatlay_designs: 3,
  beautify_processing: {
    limit: 2,
    window: "month",
  },
  advanced_styling: false,
  closetai_connect: "basic",
  advanced_insights: false,
};

export const PREMIUM_PLAN_LIMITS: PlanLimits = {
  wardrobe_items: null, // Unlimited
  outfit_recommendations: {
    limit: 100,
    window: "month",
  },
  saved_outfits: null, // Unlimited
  flatlay_designs: null, // Unlimited
  beautify_processing: {
    limit: 30,
    window: "month",
  },
  advanced_styling: true,
  closetai_connect: "full",
  advanced_insights: true,
};

export const PRICING_PLANS: Record<PlanId, PricingPlan> = {
  free: {
    id: "free",
    name: "ClosetAI Free",
    tagline: "Essential Digital Wardrobe",
    description: "Build your digital wardrobe and discover smarter ways to style yourself.",
    priceNGN: 0,
    priceUSD: 0,
    formattedNGN: "Free",
    formattedUSD: "Free",
    period: "free",
    features: [
      "Up to 30 digital wardrobe items",
      "5 AI outfit recommendations per week",
      "10 saved outfits in Outfit Studio",
      "3 saved Flatlay Studio composition designs",
      "2 Garment Beautify & background cuts / month",
      "Basic style preferences & outfit explanations",
      "Basic ClosetAI Connect access",
      "Honest 7-stage laundry tracking",
      "Basic wardrobe insights",
    ],
    limits: FREE_PLAN_LIMITS,
  },
  monthly: {
    id: "monthly",
    name: "ClosetAI Premium",
    tagline: "Complete Styling Experience",
    description: "Unlock your complete personal styling experience.",
    badge: "Most Popular",
    priceNGN: 999,
    priceUSD: 4.99,
    formattedNGN: "₦999",
    formattedUSD: "$4.99",
    period: "monthly",
    features: [
      "Unlimited digital wardrobe items",
      "100 AI outfit recommendations per month",
      "Unlimited saved outfits in Outfit Studio",
      "Unlimited Flatlay Studio composition designs",
      "30 Garment Beautify & background cuts / month",
      "Advanced personalized styling & deep explanations",
      "Full ClosetAI Connect social sharing & messaging",
      "Comprehensive wardrobe & cost-per-wear analytics",
      "Priority access to new AI features",
    ],
    limits: PREMIUM_PLAN_LIMITS,
    paystackPlanCode: process.env.PAYSTACK_PLAN_CODE_MONTHLY || "",
    stripePriceId: process.env.STRIPE_PRICE_ID_MONTHLY || "",
  },
  annual: {
    id: "annual",
    name: "ClosetAI Premium (Annual)",
    tagline: "2 Months Free",
    description: "Unlock your complete personal styling experience with 2 months free.",
    badge: "Save 17%",
    priceNGN: 9990,
    priceUSD: 49.99,
    formattedNGN: "₦9,990",
    formattedUSD: "$49.99",
    period: "annual",
    features: [
      "Everything in Premium Monthly",
      "2 Full Months Free (Save 17%)",
      "Priority AI Generation Queue",
      "Early Access to Experimental Style Models",
      "Annual VIP Style Forecast Report",
    ],
    limits: PREMIUM_PLAN_LIMITS,
    paystackPlanCode: process.env.PAYSTACK_PLAN_CODE_ANNUAL || "",
    stripePriceId: process.env.STRIPE_PRICE_ID_ANNUAL || "",
  },
};

export function getPlanDefinition(planId: string | null | undefined): PricingPlan {
  if (planId === "annual") return PRICING_PLANS.annual;
  if (planId === "monthly" || planId === "premium") return PRICING_PLANS.monthly;
  return PRICING_PLANS.free;
}

export function getPlanLimits(planId: string | null | undefined): PlanLimits {
  return getPlanDefinition(planId).limits;
}
