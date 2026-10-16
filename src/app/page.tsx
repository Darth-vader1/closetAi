import { DailyAndLaundry, Faq, Features, FinalCta, Hero, HowItWorks, SiteFooter, SiteHeader } from "@/components/marketing/sections";

const WEB_APP_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "ClosetAI",
  url: "https://closet-ai-official.vercel.app",
  applicationCategory: "LifestyleApplication",
  operatingSystem: "Web, iOS, Android",
  description:
    "Digital wardrobe and personal AI stylist. Catalogue clothes, track laundry status, plan travel or campus capsules, and get outfit ideas built only from ready-to-wear pieces.",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
  featureList: [
    "Digital wardrobe catalogue with optional AI garment tagging",
    "Honest 7-stage laundry status tracking",
    "Daily outfit ideas built strictly from clean clothes you own",
    "Smart packing planner for trips, school semesters, and events",
    "ClosetAI Connect for sharing outfits and collaborating with friends",
  ],
};

const FAQ_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "Do I have to use AI?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "No. AI tagging and AI-assisted styling are optional. You can enter every detail by hand, and outfit suggestions work from rules even when AI is switched off.",
      },
    },
    {
      "@type": "Question",
      name: "Who can see my photos?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Only you. Photos are stored in a private bucket and shown through short-lived links. Emails that include photos use temporary links too.",
      },
    },
    {
      "@type": "Question",
      name: "Will you email me without asking?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "No. Daily and weekly emails are off by default, and you can turn either one off at any time.",
      },
    },
    {
      "@type": "Question",
      name: "What if I don't own many clothes yet?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "ClosetAI will say so and tell you what's missing, for example shoes, instead of inventing garments. It only ever combines what you've added.",
      },
    },
    {
      "@type": "Question",
      name: "Does it work on my phone?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. The layout is built for phones, tablets and desktops, and uploads work with your phone's camera.",
      },
    },
  ],
};

export default function LandingPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(WEB_APP_JSON_LD) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSON_LD) }}
      />
      <SiteHeader />
      <main id="main">
        <Hero />
        <Features />
        <DailyAndLaundry />
        <HowItWorks />
        <Faq />
        <FinalCta />
      </main>
      <SiteFooter />
    </>
  );
}
