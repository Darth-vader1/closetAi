import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getSupabasePublicEnv, getSupabaseServiceEnv } from "@/lib/env";

/**
 * Service-role client. BYPASSES Row Level Security.
 *
 * Only for trusted, protected execution contexts: cron workflows that must act
 * across users (e.g. selecting who is due an email). Never import this from a
 * page, component, Server Action reachable by end users, or any client module.
 * Every query made with it must scope by an explicit user_id.
 */
export function createAdminClient() {
  const { NEXT_PUBLIC_SUPABASE_URL } = getSupabasePublicEnv();
  const { SUPABASE_SERVICE_ROLE_KEY } = getSupabaseServiceEnv();

  return createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
