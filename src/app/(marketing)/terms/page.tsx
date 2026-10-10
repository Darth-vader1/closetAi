import type { Metadata } from "next";
import { LegalPage } from "@/components/marketing/legal-page";

export const metadata: Metadata = { title: "Terms of use" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of use" updated="9 October 2026">
      <p>By creating an account you agree to these terms.</p>

      <h2>Using ClosetAI</h2>
      <ul>
        <li>You&apos;re responsible for your account and for keeping your password secure.</li>
        <li>Only upload images you have the right to use, and only photos of clothing and accessories.</li>
        <li>Don&apos;t try to access other people&apos;s data or interfere with the service.</li>
      </ul>

      <h2>Suggestions</h2>
      <p>Outfit suggestions and AI-generated details are aids, not guarantees. Colour and style matching is a heuristic and taste is personal. Check suggested details before you save them, and use your own judgement.</p>

      <h2>Availability</h2>
      <p>This is an early product. Features may change, and the service may be unavailable from time to time.</p>

      <h2>Ending your account</h2>
      <p>You can stop using ClosetAI at any time. We may suspend accounts that misuse the service.</p>
    </LegalPage>
  );
}
