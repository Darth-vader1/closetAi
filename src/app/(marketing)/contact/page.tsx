import type { Metadata } from "next";
import { LegalPage } from "@/components/marketing/legal-page";

export const metadata: Metadata = { title: "Contact" };

export default function ContactPage() {
  const email = process.env.NEXT_PUBLIC_CONTACT_EMAIL;
  return (
    <LegalPage title="Contact" updated="9 October 2026">
      {email ? (
        <p>
          Questions, feedback or account requests: <a className="text-accent underline underline-offset-4" href={`mailto:${email}`}>{email}</a>
        </p>
      ) : (
        <p>
          No contact address has been configured yet. The site owner can set <code>NEXT_PUBLIC_CONTACT_EMAIL</code> to show one here.
        </p>
      )}
    </LegalPage>
  );
}
