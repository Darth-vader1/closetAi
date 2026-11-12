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
        <li>
          Background-removal providers (Remove.bg, ClearBackdrop, PhotoRoom, and ClipDrop) process garment photos when you choose Product Studio background removal or image enhancement (Clean Cutout, AI Enhance, or Catalog Flat-Lay).
        </li>
        <li>Vercel hosts the application.</li>
      </ul>

      <h2>Image enhancement (background removal &amp; AI Enhance)</h2>
      <p>
        When you use Product Studio to create a Clean Cutout or run AI Enhance on a garment photo, the selected photo is sent for neural background removal to the configured providers in this order, stopping at the first one that returns a usable cutout: <strong>Remove.bg</strong>, <strong>ClearBackdrop</strong>, <strong>PhotoRoom</strong>, and <strong>ClipDrop</strong>. If none of them succeeds, the cutout is made in your browser and the photo is not sent to any further background-removal provider. When AI Enhance is selected, the photo is also sent to a configured AI provider (Google Gemini, Groq, or Mistral) to calibrate lighting and wrinkle reduction. Your original uploaded photo is always preserved in your private storage bucket so you can restore it at any time.
      </p>

      <h2>Your photos</h2>
      <p>Photos are stored in a private bucket. They are shown to you through temporary signed links, and notifications that include photos use temporary links that expire.</p>

      <h2>Notifications</h2>
      <p>Daily and weekly emails and WhatsApp messages are off by default. You can turn each off anytime in your settings or with the unsubscribe link in any email.</p>

      <h2>Your choices</h2>
      <p>You can edit or delete any garment or outfit, export your wardrobe data as JSON, or permanently delete your account, login, and all stored photos directly from the Settings page.</p>
    </LegalPage>
  );
}
