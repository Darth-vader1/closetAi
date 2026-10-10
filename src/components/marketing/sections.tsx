import Link from "next/link";
import { Camera, CalendarDays, Mail, ShieldCheck, Shirt, Sparkles, WashingMachine } from "lucide-react";
import { Logo } from "@/components/layout/logo";
import { WardrobePreview } from "@/components/marketing/preview";
import { Button } from "@/components/ui/button";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-8">
        <Logo />
        <nav aria-label="Primary" className="hidden items-center gap-8 text-sm font-medium text-muted md:flex">
          <a href="#features" className="hover:text-foreground">Features</a>
          <a href="#how-it-works" className="hover:text-foreground">How it works</a>
          <a href="#faq" className="hover:text-foreground">FAQ</a>
        </nav>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
            <Link href="/login">Sign in</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/signup">Get started</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

export function Hero() {
  return (
    <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-14 sm:px-8 lg:grid-cols-2 lg:py-24">
      <div>
        <p className="mb-4 text-sm font-medium uppercase tracking-wider text-accent">Your wardrobe, organised</p>
        <h1 className="text-balance text-5xl sm:text-6xl">Decide what to wear from clothes you already own.</h1>
        <p className="mt-6 max-w-xl text-lg text-muted">
          Photograph your clothes once. ClosetAI keeps track of what&apos;s clean and what isn&apos;t, then suggests outfits using only the pieces that are ready to wear.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button asChild size="lg">
            <Link href="/signup">Build my wardrobe</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <a href="#how-it-works">See how it works</a>
          </Button>
        </div>
      </div>
      <WardrobePreview />
    </section>
  );
}

const FEATURES = [
  { icon: Camera, title: "A wardrobe you can see", body: "Upload photos from your phone or computer. Optional AI tagging suggests a name, colour and category, and you confirm or correct every detail before it's saved." },
  { icon: WashingMachine, title: "Knows what's wearable", body: "Mark garments as worn, dirty, in the wash or drying. Anything not ready to wear is kept out of every suggestion." },
  { icon: Sparkles, title: "Outfits from what you own", body: "Combinations are built from your own clothes by rules for colour, occasion and style, and AI is used to refine them, never to invent pieces." },
  { icon: CalendarDays, title: "Plan the week", body: "Put outfits on a calendar. Planned and worn are tracked separately, so your history only reflects what you actually wore." },
  { icon: Mail, title: "Emails, only if you want them", body: "Opt in to a daily outfit email and a weekly laundry summary, at the times you choose in your own timezone." },
  { icon: ShieldCheck, title: "Your photos stay private", body: "Clothing photos are stored privately and only you can access them." },
] as const;

export function Features() {
  return (
    <section id="features" className="border-y border-border bg-surface py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-8">
        <h2 className="max-w-2xl text-4xl">Everything you need to stop standing in front of the wardrobe.</h2>
        <div className="mt-12 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div key={title}>
              <span className="grid size-11 place-items-center rounded-full bg-accent-soft text-accent">
                <Icon className="size-5" aria-hidden />
              </span>
              <h3 className="mt-4 text-xl">{title}</h3>
              <p className="mt-2 text-muted">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function DailyAndLaundry() {
  return (
    <section className="mx-auto grid max-w-6xl gap-6 px-4 py-16 sm:px-8 sm:py-24 lg:grid-cols-2">
      <div className="rounded-[1.75rem] border border-border bg-surface p-8">
        <Mail className="size-6 text-accent" aria-hidden />
        <h2 className="mt-4 text-3xl">Daily outfit ideas, in your inbox</h2>
        <p className="mt-3 text-muted">
          If you opt in, you&apos;ll get up to three outfits each morning at the time you pick. Each one uses photos of your own clothes that are clean and ready, and ideas you&apos;ve seen recently are avoided. If your wardrobe is too small for three good outfits, you&apos;ll get fewer rather than made-up ones.
        </p>
      </div>
      <div className="rounded-[1.75rem] border border-border bg-surface p-8">
        <WashingMachine className="size-6 text-accent" aria-hidden />
        <h2 className="mt-4 text-3xl">Laundry tracking that stays honest</h2>
        <p className="mt-3 text-muted">
          Seven clear statuses from clean to drying. A garment only goes back to clean when you confirm it, and a weekly summary lists what still needs washing so nothing gets stuck in the basket.
        </p>
      </div>
    </section>
  );
}

const STEPS = [
  { n: "1", title: "Add your clothes", body: "Take or upload a photo of each piece. Review the suggested details and save." },
  { n: "2", title: "Keep status current", body: "Flip items to dirty or washing as you go. It takes one tap." },
  { n: "3", title: "Get outfits", body: "Pick an occasion and see combinations built only from garments that are ready." },
] as const;

export function HowItWorks() {
  return (
    <section id="how-it-works" className="border-y border-border bg-surface-muted py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-8">
        <h2 className="text-4xl">How it works</h2>
        <ol className="mt-10 grid gap-8 md:grid-cols-3">
          {STEPS.map((s) => (
            <li key={s.n}>
              <span className="font-display text-5xl text-accent" aria-hidden>{s.n}</span>
              <h3 className="mt-2 text-xl">{s.title}</h3>
              <p className="mt-2 text-muted">{s.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

const FAQS = [
  { q: "Do I have to use AI?", a: "No. AI tagging and AI-assisted styling are optional. You can enter every detail by hand, and outfit suggestions work from rules even when AI is switched off." },
  { q: "Who can see my photos?", a: "Only you. Photos are stored in a private bucket and shown through short-lived links. Emails that include photos use temporary links too." },
  { q: "Will you email me without asking?", a: "No. Daily and weekly emails are off by default, and you can turn either one off at any time." },
  { q: "What if I don't own many clothes yet?", a: "ClosetAI will say so and tell you what's missing, for example shoes, instead of inventing garments. It only ever combines what you've added." },
  { q: "Does it work on my phone?", a: "Yes. The layout is built for phones, tablets and desktops, and uploads work with your phone's camera." },
  { q: "Does it know the weather?", a: "Not yet. Weather isn't used in suggestions today, and ClosetAI won't claim otherwise." },
] as const;

export function Faq() {
  return (
    <section id="faq" className="mx-auto max-w-3xl px-4 py-16 sm:px-8 sm:py-24">
      <h2 className="text-4xl">Questions</h2>
      <div className="mt-8 divide-y divide-border border-y border-border">
        {FAQS.map((f) => (
          <details key={f.q} className="group py-5">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 font-medium [&::-webkit-details-marker]:hidden">
              {f.q}
              <span className="text-xl text-accent transition-transform group-open:rotate-45" aria-hidden>+</span>
            </summary>
            <p className="mt-2 max-w-2xl text-muted">{f.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

export function FinalCta() {
  return (
    <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-8 sm:pb-24">
      <div className="rounded-[1.75rem] bg-foreground px-6 py-14 text-center text-background sm:px-12">
        <Shirt className="mx-auto size-7 text-accent-soft" aria-hidden />
        <h2 className="mx-auto mt-4 max-w-xl text-4xl">Start with three garments. See what it suggests.</h2>
        <Button asChild size="lg" className="mt-8">
          <Link href="/signup">Create your account</Link>
        </Button>
      </div>
    </section>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <Logo />
        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted">
          <Link href="/privacy" className="hover:text-foreground">Privacy policy</Link>
          <Link href="/terms" className="hover:text-foreground">Terms</Link>
          <Link href="/contact" className="hover:text-foreground">Contact</Link>
        </nav>
        <p className="text-sm text-muted">&copy; {new Date().getFullYear()} ClosetAI</p>
      </div>
    </footer>
  );
}
