# ClosetAI

A digital wardrobe and personal stylist. Users photograph their clothes, track laundry status, and get outfit ideas built only from garments that are ready to wear.

**Stack:** Next.js (App Router) · React · TypeScript (strict) · Tailwind CSS 4 · Supabase (Postgres, Auth, Storage, RLS) · Resend · Vercel

## Status

| Phase | Scope | State |
| --- | --- | --- |
| 1 | Foundation: auth, onboarding, app shell, schema + RLS, design system | **Done** |
| 2 | Wardrobe: uploads, AI tagging, laundry dashboard | Not started |
| 3 | Outfit engine and Outfit Studio | Not started |
| 4 | AI Stylist and calendar | Not started |
| 5 | Daily/weekly emails and cron | Not started |
| 6 | Final verification and deployment docs | Not started |

Wardrobe, Laundry, Studio, Stylist, Calendar and Settings pages currently say which phase they belong to. They contain no fake data.

## Local setup

Requires Node 22+.

```bash
npm install
cp .env.example .env.local   # then fill in the Supabase values
npm run dev                  # http://localhost:3000
```

Without Supabase variables the public pages still render, and protected pages show a configuration notice.

### 1. Create a Supabase project

1. Create a project at <https://supabase.com/dashboard>.
2. **Project Settings → API**: copy the project URL into `NEXT_PUBLIC_SUPABASE_URL` and the publishable key into `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
3. Never put the service-role key in any `NEXT_PUBLIC_*` variable.

### 2. Apply the database migrations

Migrations in `supabase/migrations/` run in filename order and recreate the whole schema from a clean database.

With the [Supabase CLI](https://supabase.com/docs/guides/cli):

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

Or paste the three files, in order, into **SQL Editor** in the dashboard:

1. `20261009000001_schema.sql` – tables, enums, constraints, indexes, signup trigger
2. `20261009000002_rls_and_functions.sql` – Row Level Security and `change_item_status()`
3. `20261009000003_storage.sql` – private `wardrobe` bucket and storage policies

### 3. Configure Auth redirects

**Authentication → URL Configuration**

- Site URL: your `NEXT_PUBLIC_APP_URL`
- Redirect URLs: add `http://localhost:3000/auth/callback` and `https://<your-domain>/auth/callback`

Email verification and password reset links return to `/auth/callback` (PKCE). If you customise the email templates to use the token-hash flow, link to `/auth/confirm?token_hash={{ .TokenHash }}&type=signup&next=/onboarding` instead; both routes are implemented.

Keep **Confirm email** enabled so new accounts must verify their address.

## Commands

```bash
npm run dev         # development server
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
npm test            # vitest (includes migration + RLS tests on embedded Postgres)
npm run build       # production build
```

## Architecture notes

- **Session handling.** `src/proxy.ts` (Next 16's replacement for middleware) refreshes the Supabase session and redirects signed-out visitors. That's a convenience only. Real authorization is `requireUser()` in each page/action plus Postgres RLS.
- **Ownership is enforced in the database.** Every table has RLS, and link tables use composite foreign keys `(id, user_id)` so an outfit can never contain another user's garment, even through a bug.
- **One eligibility rule.** `src/lib/wardrobe/status.ts` is the only place that decides whether a garment can be recommended: CLEAN yes, WORN only if the user allows re-wearing, everything else no.
- **Laundry writes go through `change_item_status()`.** It records an audit event and updates `last_washed_at` only when the user confirms a wash.
- **Planned ≠ worn.** `outfit_plans` records intent. `outfit_history` records only outfits the user confirmed wearing.
- **Email idempotency.** `email_logs` has a unique key on `(user_id, kind, period_key)`, so a repeated job run can't create a second send for the same period.
- **Cache Components is off** (see `next.config.ts`): nearly every page is per-user and reads the session, so there is no useful static shell to cache.
- **Service-role client** (`src/lib/supabase/admin.ts`) is `server-only` and reserved for cron jobs.

## Security checklist (Phase 1)

- Secrets only in `.env.local`; `.env*` is git-ignored except `.env.example`.
- `?next=` redirects are restricted to local paths (`src/lib/security/redirect.ts`).
- Auth errors are translated to safe messages; password-reset requests never reveal whether an email has an account.
- Security headers set in `next.config.ts`.
- Private storage bucket with per-user folder policies.

## Known limitations

- `npm audit` reports high-severity advisories in `braces`, reached only through the ESLint toolchain (dev-time, not shipped). Left as is rather than downgrading `eslint-config-next`.
- Google Fonts are not used; fonts are self-hosted via `@fontsource-variable/*` so builds work offline.
- Email verification, password reset and the live Supabase connection have not been exercised against a real project from this environment. See the Phase 1 report.
