import "server-only";

export const PAYSTACK_PUBLIC_KEY = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY || "";
export const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || "";

export const STRIPE_PUBLIC_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "";
export const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";

export interface PricingPlan {
  id: string;
  name: string;
  description: string;
  badge?: string;
  priceNGN: number; // In Naira e.g. 999
  priceUSD: number; // In USD e.g. 4.99
  formattedNGN: string;
  formattedUSD: string;
  period: "monthly" | "annual";
  features: string[];
  paystackPlanCode?: string;
  stripePriceId?: string;
}

export const PRICING_PLANS: Record<string, PricingPlan> = {
  monthly: {
    id: "monthly",
    name: "ClosetAI Pro",
    description: "Unlimited AI styling, packing, flatlay compositions, and full wardrobe analytics.",
    badge: "Most Popular",
    priceNGN: 999,
    priceUSD: 4.99,
    formattedNGN: "₦999",
    formattedUSD: "$4.99",
    period: "monthly",
    features: [
      "Unlimited AI Stylist Chat & Daily Outfits",
      "Interactive Flatlay Studio & HD Lookbook Export",
      "Smart Trip Packing Planner & Weight Calculator",
      "Garment Background Removal & Crease Smoothing",
      "Smart Weather & Local Calendar Integration",
      "Direct Outfit Sharing with Friends in Connect",
    ],
    paystackPlanCode: process.env.PAYSTACK_PLAN_CODE_MONTHLY || "",
    stripePriceId: process.env.STRIPE_PRICE_ID_MONTHLY || "",
  },
  annual: {
    id: "annual",
    name: "ClosetAI Pro (Annual)",
    description: "Get a full year of ClosetAI with 2 months free.",
    badge: "Save 17%",
    priceNGN: 9990,
    priceUSD: 49.99,
    formattedNGN: "₦9,990",
    formattedUSD: "$49.99",
    period: "annual",
    features: [
      "Everything in Monthly",
      "2 Months Free (Save 17%)",
      "Priority AI Generation Queue",
      "Early Access to Experimental Style Models",
    ],
    paystackPlanCode: process.env.PAYSTACK_PLAN_CODE_ANNUAL || "",
    stripePriceId: process.env.STRIPE_PRICE_ID_ANNUAL || "",
  },
};
