# ClosetAI Production Deployment Guide

ClosetAI is built on Next.js 16 App Router, TypeScript, Tailwind CSS v4, Supabase (PostgreSQL, Auth, RLS, Storage), Mistral AI / Google Gemini, and Puter.js (Editorial On-Model AI Photoshoots).

---

## 1. Prerequisites & Services

1. **GitHub Repository**: Push this codebase to your GitHub organization or account.
2. **Vercel Account**: For deploying the Next.js frontend and serverless edge / node API routes.
3. **Supabase Project**: Production PostgreSQL database with row-level security (RLS) and storage buckets.
4. **Puter.js Account**: For generating high-fashion editorial on-model photoshoots (`PUTER_API_TOKEN`).
5. **Mistral AI Account**: For wardrobe analysis and AI stylist recommendations (`MISTRAL_API_KEY`).
6. **Resend Account**: For transactional emails and scheduled wardrobe digests (`RESEND_API_KEY`).

---

## 2. Environment Variables Checklist

Configure these environment variables in your **Vercel Project Settings > Environment Variables** (Production & Preview):

| Variable | Description | Example / Source |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | Public application URL | `https://closetai.app` or `https://your-app.vercel.app` |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase API endpoint | `https://xxxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public publishable (anon) key | Found in Supabase API settings |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret administrative key for crons & storage signing | Found in Supabase API settings |
| `AI_PROVIDER` | Primary AI provider for styling & classification | `mistral` or `gemini` |
| `MISTRAL_API_KEY` | Mistral AI API key (when `AI_PROVIDER=mistral`) | From console.mistral.ai |
| `AI_API_KEY` | Gemini API key (when `AI_PROVIDER=gemini`) | From Google AI Studio |
| `PUTER_API_TOKEN` | Puter API token for server-side AI model photoshoot generation | Puter Account Settings > API Token |
| `RESEND_API_KEY` | Resend API key for transactional emails | From resend.com/api-keys |
| `EMAIL_FROM` | Verified sender email address | `ClosetAI <stylist@yourdomain.com>` |
| `CRON_SECRET` | Secret token protecting background cron endpoints (16+ chars) | A secure random 32-character string |
| `WHATSAPP_ACCESS_TOKEN` | Meta WhatsApp Cloud API permanent/system token | Meta App Dashboard > WhatsApp |
| `WHATSAPP_PHONE_NUMBER_ID` | Meta WhatsApp Phone Number ID | Meta App Dashboard > WhatsApp |
| `WHATSAPP_VERIFY_TOKEN` | Webhook verification token | Meta App Dashboard > WhatsApp > Configuration |
| `WHATSAPP_APP_SECRET` | Meta App Secret for `X-Hub-Signature-256` verification | Meta App Settings > Basic > App secret |

---

## 3. Database & Storage Configuration (Supabase)

### A. Run Database Migrations
Apply the migrations in `supabase/migrations/` in chronological order (`supabase db push`) so all schema tables, functions, and RLS policies are created:
- `profiles` (user preferences, style tags, location, timezone, `rewear_worn_items`)
- `email_preferences` (`daily_enabled`, `daily_time`, `weekly_enabled`, `weekly_day`, `weekly_time`, `unsubscribe_token`, `whatsapp_phone`, `whatsapp_daily_enabled`)
- `wardrobe_items`
- `outfits` & `outfit_items`
- `outfit_plans`, `outfit_history`, & `outfit_history_items`
- `outfit_feedback` & `outfit_recommendations`
- `laundry_events`, `email_logs`, & `ai_usage_events`

### B. Storage Buckets
1. Ensure the `wardrobe` bucket exists and is set to **Private**.
2. RLS policies allow authenticated users to `INSERT`, `SELECT`, and `DELETE` objects inside their own folder:
   ```sql
   (bucket_id = 'wardrobe' AND (storage.foldername(name))[1] = auth.uid()::text)
   ```
3. Signed URLs are used across ClosetAI to securely display items and generated model photoshoots.

---

## 4. Deploying to Vercel

1. Import your GitHub repository into **[Vercel](https://vercel.com)**.
2. Select **Next.js** framework preset.
3. Paste all environment variables from Section 2.
4. Click **Deploy**.

---

## 5. Automated Cron Jobs (Vercel Cron)

ClosetAI features automated daily outfit suggestions and weekly laundry alerts. These are configured via [`vercel.json`](file:///c:/Users/HP/Documents/projects/closetai/vercel.json):

```json
{
  "crons": [
    {
      "path": "/api/cron/daily-outfit",
      "schedule": "0 7 * * *"
    },
    {
      "path": "/api/cron/weekly-laundry",
      "schedule": "0 18 * * 0"
    }
  ]
}
```

- Every request to `/api/cron/*` verifies the `Authorization: Bearer <CRON_SECRET>` header to ensure external users cannot trigger unauthorized jobs.

---

## 6. Email Setup (Resend)

1. Add and verify your domain in [Resend](https://resend.com/domains).
2. Set DNS records (SPF, DKIM, DMARC) at your DNS provider.
3. Update `EMAIL_FROM` in Vercel to use your verified domain (e.g. `ClosetAI <stylist@yourdomain.com>`).
4. Emails include a 1-click RFC-compliant unsubscribe link pointing to:
   `https://your-domain.com/api/email/unsubscribe?token=...`

---

## 7. Pinterest & Photoshoot Verification in Production

1. **Pinterest Integration**:
   - Zero API keys required: ClosetAI generates rich deep-links with Pinterest search parameters for instant lookbook inspiration.
   - Test by opening `/stylist` and toggling the **"Recreate from Pinterest"** tab.
2. **On-Model AI Photoshoot**:
   - Verify `PUTER_API_TOKEN` is set.
   - Server handles generation headlessly without prompting users to log in or create an account.
