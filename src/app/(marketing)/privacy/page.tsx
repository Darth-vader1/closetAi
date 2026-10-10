import type { Metadata } from "next";
import { LegalPage } from "@/components/marketing/legal-page";

export const metadata: Metadata = { title: "Privacy policy" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy" updated="9 October 2026">
      <p>ClosetAI helps you manage your wardrobe and get outfit ideas. This page explains what we store and who processes it.</p>

      <h2>What we store</h2>
      <ul>
        <li>Your account: email address and a securely hashed password.</li>
        <li>Your profile: display name, style and colour preferences, occasions, optional location, timezone and email settings.</li>
        <li>Your wardrobe: the photos you upload and the details you save about each garment, its laundry status and when it was worn or washed.</li>
        <li>Your outfits, plans, ratings and wear history.</li>
        <li>Email delivery records: when a daily or weekly email was sent, and whether it succeeded.</li>
      </ul>

      <h2>Who processes it</h2>
      <ul>
        <li>Supabase hosts the database, sign-in and private photo storage.</li>
        <li>Resend delivers emails, only if you opt in.</li>
        <li>An AI provider receives a clothing photo, or a list of your available garments, only when you use AI analysis or the AI Stylist. If AI isn&apos;t configured, nothing is sent.</li>
        <li>Vercel hosts the application.</li>
      </ul>

      <h2>Your photos</h2>
      <p>Photos are stored in a private bucket. They are shown to you through temporary links, and emails that include photos use temporary links that expire.</p>

      <h2>Emails</h2>
      <p>Daily and weekly emails are off by default. You can turn each off in your settings or with the unsubscribe link in the email.</p>

      <h2>Your choices</h2>
      <p>You can edit or delete any garment or outfit. Deleting a garment also deletes its stored photo. To delete your account and its data, contact us using the details on the contact page.</p>
    </LegalPage>
  );
}
