import type { Metadata } from "next";
import { LegalPage } from "@/components/marketing/legal-page";

export const metadata: Metadata = { title: "Privacy policy" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy" updated="12 October 2026">
      <p>ClosetAI helps you manage your wardrobe and get outfit ideas. This page explains what we store and who processes it.</p>

      <h2>What we store</h2>
      <ul>
        <li>Your account: email address and a securely hashed password.</li>
        <li>Your profile: display name, style and colour preferences, occasions, optional location, timezone, and email/WhatsApp notification settings.</li>
        <li>Your wardrobe: the photos you upload and the details you save about each garment, its laundry status, and when it was worn or washed.</li>
        <li>Your outfits, plans, ratings, wear history, and generated studio lookbook photos.</li>
        <li>Delivery records: when a daily or weekly notification was sent, and whether it succeeded.</li>
      </ul>

      <h2>Who processes it</h2>
      <ul>
        <li>Supabase hosts the database, sign-in, and private photo storage.</li>
        <li>Resend delivers emails, and Meta WhatsApp Cloud API delivers WhatsApp messages, only if you opt in.</li>
        <li>
          Configured AI providers (Groq, Mistral, and Google Gemini) receive a clothing photo when you use AI photo analysis, or your garment names, colours, materials, and optional model appearance settings (gender, skin tone, and body build) when you use the AI Stylist, Travel Packing Assistant, or Studio Lookbook Photo Generator. Lookbook photos depict AI-generated fashion models styled with descriptions of your garments. If AI isn&apos;t configured, nothing is sent.
        </li>
        <li>Vercel hosts the application.</li>
      </ul>

      <h2>Your photos</h2>
      <p>Photos are stored in a private bucket. They are shown to you through temporary signed links, and notifications that include photos use temporary links that expire.</p>

      <h2>Notifications</h2>
      <p>Daily and weekly emails and WhatsApp messages are off by default. You can turn each off anytime in your settings or with the unsubscribe link in any email.</p>

      <h2>Your choices</h2>
      <p>You can edit or delete any garment or outfit, export your wardrobe data as JSON, or permanently delete your account, login, and all stored photos directly from the Settings page.</p>
    </LegalPage>
  );
}
