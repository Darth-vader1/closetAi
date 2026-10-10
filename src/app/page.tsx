import { DailyAndLaundry, Faq, Features, FinalCta, Hero, HowItWorks, SiteFooter, SiteHeader } from "@/components/marketing/sections";

export default function LandingPage() {
  return (
    <>
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
