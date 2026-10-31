#!/usr/bin/env npx tsx
/**
 * scripts/audit-self-granted-profiles.ts
 *
 * Runs the repair query to find any profiles that have elevated roles (role <> 'user')
 * or active/trialing subscriptions without a matching authoritative subscription record,
 * which may have been created during the exposure window.
 */

import { resolve } from "path";
import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

function loadEnv() {
  const envPath = resolve(process.cwd(), ".env.local");
  try {
    const content = readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  } catch {
    // ignore missing file
  }
}

loadEnv();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false },
});

async function runAudit() {
  console.log("=== Auditing Profiles for Self-Granted Roles & Subscriptions ===");

  // 1. Check all profiles with role <> 'user'
  const { data: nonUserRoles, error: roleError } = await supabase
    .from("profiles")
    .select("id, display_name, role, created_at, subscription_status, subscription_plan")
    .neq("role", "user");

  if (roleError) {
    console.error("Error querying profiles for non-user roles:", roleError.message);
  } else {
    console.log(`\nProfiles with role <> 'user' (total: ${nonUserRoles?.length ?? 0}):`);
    if (nonUserRoles && nonUserRoles.length > 0) {
      console.table(nonUserRoles);
    } else {
      console.log("None found (all profiles have role='user').");
    }
  }

  // 2. Check profiles with active or trialing subscription_status
  const { data: activeSubs, error: subError } = await supabase
    .from("profiles")
    .select("id, display_name, role, subscription_status, subscription_plan, subscription_provider, customer_id")
    .in("subscription_status", ["active", "trialing"]);

  if (subError) {
    console.error("Error querying profiles for active subscription_status:", subError.message);
  } else {
    console.log(`\nProfiles with subscription_status in ('active', 'trialing') (total: ${activeSubs?.length ?? 0}):`);
    if (activeSubs && activeSubs.length > 0) {
      console.table(activeSubs);

      // Verify each against subscriptions or user_subscriptions table
      for (const p of activeSubs) {
        const { data: subRecord } = await supabase
          .from("subscriptions")
          .select("id, status, provider, plan_code")
          .eq("user_id", p.id)
          .maybeSingle();

        const { data: userSubRecord } = await supabase
          .from("user_subscriptions")
          .select("id, status, provider, plan_id")
          .eq("user_id", p.id)
          .maybeSingle();

        if (!subRecord && !userSubRecord) {
          console.warn(`[WARNING] Profile ${p.id} (${p.display_name}) has active subscription_status but NO valid subscriptions or user_subscriptions row!`);
        } else {
          console.log(`[OK] Profile ${p.id} verified with valid subscription record.`);
        }
      }
    } else {
      console.log("None found with active/trialing status.");
    }
  }

  console.log("\n=== Audit Complete ===");
}

runAudit().catch(console.error);
