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
| `WHATSAPP_VERIFICATION_PEPPER` | Secret pepper for hashing verification codes (32+ chars, never expose) | Generate with: `openssl rand -hex 32` |

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

---

## 8. WhatsApp Production Safety & Phone Verification

### A. Phone Verification Requirements
ClosetAI requires users to **verify ownership of their WhatsApp number** before production messages are delivered. This prevents accidental spam and ensures compliance with Meta policies.

**How verification works:**
1. User enables WhatsApp notifications and enters their phone number in Settings.
2. User clicks "Send Verification Code" — a 6-digit code in format `CLOSET-XXXXXX` is generated.
3. Code is sent via Meta-approved **template message** (works outside 24h window).
4. User texts the code back to your WhatsApp Business number OR enters it in the Settings UI.
5. System verifies code via SHA-256 hash (with server-side pepper) and marks phone as verified.

**Security features:**
- Codes hashed with `WHATSAPP_VERIFICATION_PEPPER` (never stored plaintext)
- Rate limits: 5 code generation attempts per hour, max 3 active codes
- Attempt limits: 5 verification attempts per code before lockout
- 15-minute expiry per code
- Webhook deduplication prevents replay attacks

### B. Template Message Configuration
WhatsApp requires **pre-approved template messages** for messages sent outside the 24-hour customer care window.

**Required templates to register in Meta Business Manager:**

1. **`phone_verification`** (Category: Authentication)
   ```
   Your ClosetAI verification code is: {{1}}
   
   Valid for 15 minutes. Reply with this code to verify your phone number.
   ```

2. **`daily_outfit_suggestion`** (Category: Marketing)
   ```
   Good morning {{1}}! 👋
   
   Today's weather: {{2}}
   
   Check your daily outfit suggestion in the ClosetAI app.
   ```

3. **`weekly_laundry_reminder`** (Category: Marketing)
   ```
   Hi {{1}}! 🧺
   
   You have {{2}} items waiting for laundry this week.
   
   Open the ClosetAI app to manage your laundry schedule.
   ```

**Note:** Template approval can take 24-48 hours. Test in Meta's development environment first.

### C. 24-Hour Messaging Window
- **Within 24h of user's last message:** Can send rich free-form messages with images
- **Outside 24h window:** Must use pre-approved templates only
- System automatically tracks `last_whatsapp_message_at` for each user
- Cron jobs detect window status and choose appropriate message type

### D. Webhook Configuration
Set up the webhook endpoint in Meta App Dashboard:

1. **Callback URL:** `https://your-domain.com/api/webhook/whatsapp`
2. **Verify Token:** Your `WHATSAPP_VERIFY_TOKEN` value
3. **Subscribe to:** `messages` field
4. **Signature Verification:** Uses `WHATSAPP_APP_SECRET` for `X-Hub-Signature-256` validation

**Webhook handles:**
- Incoming verification codes (users text code to business number)
- STOP/START opt-out commands
- Message status updates (delivered, read)
- Automatic message deduplication (via `whatsapp_webhook_messages` table)

### E. Production Safety Checks
The system **refuses simulation mode in production**:
```typescript
// If WhatsApp credentials not configured in production:
throw new Error('PRODUCTION_SAFETY: WhatsApp credentials not configured');
```

This prevents silent failures where messages appear to send but don't actually reach users.

---

## 9. Database Cleanup Tasks

Add these periodic cleanup tasks to your Supabase cron or external scheduler:

```sql
-- Clean up expired verification codes (run daily)
SELECT cleanup_expired_verifications();

-- Clean up old webhook messages (run weekly)
SELECT cleanup_old_webhook_messages();
```

These functions are defined in the migrations and help keep the database lean.

---

## WhatsApp: security and go-live notes

- **Required env vars (the webhook fails closed without them):** `WHATSAPP_APP_SECRET` (POSTs return 500 if unset; unsigned or badly signed requests get 401) and `WHATSAPP_VERIFY_TOKEN` (GET returns 500 if unset; there is no default token). Also `WHATSAPP_VERIFICATION_PEPPER` (32+ chars) and `SUPABASE_SERVICE_ROLE_KEY` (the webhook, cron and verification all use the service-role client).
- **Approved templates (Utility category, exact names):** `phone_verification` (one body variable: the code), `daily_outfit_suggestion` (two: name, weather), `weekly_laundry_reminder` (two: name, count). Until approved, sends outside the 24-hour window fail.
- **24-hour window:** it starts when the USER last messaged your business number (`whatsapp_last_inbound_at`, set by the webhook), not when you last sent something.
- **Re-verification:** migration `20261014000001` resets every existing "verified" number, because the earlier check could be bypassed. Users verify again once in Settings.
- **Verification flow:** Settings -> save number -> "Verify this number" -> a code arrives on WhatsApp -> type it in Settings or reply to the message with it. Codes expire in 15 minutes; 5 starts per user per hour and 3 per number per day.
- **STOP / START:** STOP records the number in `whatsapp_optouts` and turns off WhatsApp preferences; we never message an opted-out number. START clears it and re-enables a verified number.
- **Tests:** `npm test` now runs `tests/**` and `src/**` tests, including `tests/db/whatsapp-security.test.ts` (verification attacks against the real migrations).
