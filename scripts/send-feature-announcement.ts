#!/usr/bin/env npx tsx
/**
 * scripts/send-feature-announcement.ts
 *
 * Broadcast script to send a beautifully styled product announcement email
 * to registered ClosetAI users about all recent features:
 *   - WhatsApp-Style Swipe Right to Reply (Closet Connect)
 *   - Smart Trip Packing Planner & Luggage Optimizer
 *   - AI Product Studio Garment Beautification (Crease flattening, background removal)
 *   - Universal Store & Clipboard Image Import (Ctrl+V)
 *   - Wigs & Headwear Taxonomy with Specialized Care Instructions
 *   - Morning Outfit Recommendations & Direct Links
 *
 * USAGE:
 *   # 1. Preview recipient list & render without sending:
 *   npx tsx scripts/send-feature-announcement.ts --dry-run
 *
 *   # 2. Send a test email to your own address first:
 *   npx tsx scripts/send-feature-announcement.ts --test=your-email@example.com
 *
 *   # 3. Broadcast to all registered users:
 *   npx tsx scripts/send-feature-announcement.ts --send
 *
 *   # Optional flags:
 *   --limit=10           Only send to the first 10 users (for small test batches)
 *   --delay=300          Delay in ms between sends (default 250ms = 4/sec)
 */

import { resolve } from "path";
import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

// ─── Load .env.local ──────────────────────────────────────────────────────────
function loadEnv() {
  const envPath = resolve(process.cwd(), ".env.local");
  try {
    const content = readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx < 1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
      if (key && !(key in process.env)) process.env[key] = val;
    }
  } catch {
    // If .env.local doesn't exist, fall back to process.env
  }
}

loadEnv();

// Import after env is loaded so service.ts and templates.ts pick up configuration
import { getResendClient, sendEmail } from "../src/lib/email/service";
import { renderFeatureAnnouncementHtml } from "../src/lib/email/templates";

// ─── Argument Parsing ────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");
const isSend = args.includes("--send");
const testArg = args.find((a) => a.startsWith("--test="));
const testEmail = testArg ? testArg.split("=")[1]?.trim() : null;
const limitArg = args.find((a) => a.startsWith("--limit="));
const limit = limitArg ? parseInt(limitArg.split("=")[1]!, 10) : Infinity;
const delayArg = args.find((a) => a.startsWith("--delay="));
const batchDelayMs = delayArg ? parseInt(delayArg.split("=")[1]!, 10) : 250;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log("\n=======================================================");
  console.log("       CLOSET·AI FEATURE ANNOUNCEMENT BROADCAST        ");
  console.log("=======================================================\n");

  const emailConfig = getResendClient();
  if (!emailConfig) {
    console.error("❌ Error: No email provider configured.");
    console.error("   Ensure RESEND_API_KEY, GMAIL_USER + GMAIL_APP_PASSWORD, or GMAIL OAuth is set in .env.local\n");
    process.exit(1);
  }

  console.log(`📡 Email Provider: [${emailConfig.provider.toUpperCase()}] from: ${emailConfig.from}`);

  // Test mode: Send only one email to the specified address
  if (testEmail) {
    console.log(`\n🧪 Test Mode: Sending preview email to ${testEmail} ...`);
    const html = renderFeatureAnnouncementHtml({
      displayName: "ClosetAI Tester",
    });
    const res = await sendEmail({
      to: testEmail,
      subject: "What's new in ClosetAI: Swipe to reply, Trip packing & AI Studio ✨",
      html,
    });

    if (res.success) {
      console.log(`✅ Test email delivered successfully! (ID: ${res.id})`);
      console.log("   Check your inbox to inspect formatting, layout, and mobile rendering.\n");
    } else {
      console.error(`❌ Test email failed: ${res.error}\n`);
    }
    return;
  }

  if (!isDryRun && !isSend) {
    console.log("ℹ️  No execution flag provided. Please specify one of:");
    console.log("   --dry-run               Preview eligible users without sending");
    console.log("   --test=your@email.com   Send a single test email to your inbox");
    console.log("   --send                  Broadcast to all registered users\n");
    return;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("❌ Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log("🔍 Fetching registered users from Supabase Auth & Profiles...");

  // 1. Fetch all registered users from auth.admin
  let allUsers: Array<{ id: string; email: string }> = [];
  let page = 1;
  const perPage = 200;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) {
      console.error("❌ Error listing users:", error.message);
      process.exit(1);
    }
    const batch = (data.users || [])
      .filter((u) => u.email && u.email.includes("@"))
      .map((u) => ({ id: u.id, email: u.email! }));

    allUsers.push(...batch);
    if (!data.users || data.users.length < perPage) break;
    page++;
  }

  // 2. Fetch profiles for display names
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name");
  const profileMap = new Map((profiles || []).map((p) => [p.id, p.display_name]));

  // 3. Fetch unsubscribe tokens from email_preferences
  const { data: prefs } = await supabase
    .from("email_preferences")
    .select("user_id, unsubscribe_token");
  const tokenMap = new Map((prefs || []).map((p) => [p.user_id, p.unsubscribe_token]));

  if (Number.isFinite(limit)) {
    allUsers = allUsers.slice(0, limit);
  }

  console.log(`👥 Found ${allUsers.length} registered user(s) with valid emails.\n`);

  if (isDryRun) {
    console.log("📋 [DRY-RUN] Recipient Preview (first 25 shown):");
    allUsers.slice(0, 25).forEach((u, i) => {
      const name = profileMap.get(u.id) || "Valued Member";
      console.log(`   ${i + 1}. ${u.email} (${name})`);
    });
    if (allUsers.length > 25) {
      console.log(`   ... and ${allUsers.length - 25} more.`);
    }
    console.log("\n💡 Ready to broadcast? Run with --send:");
    console.log("   npx tsx scripts/send-feature-announcement.ts --send\n");
    return;
  }

  // Live broadcast execution
  console.log(`🚀 Starting broadcast to ${allUsers.length} user(s)...`);
  let successCount = 0;
  let failureCount = 0;
  const startTime = Date.now();

  for (let i = 0; i < allUsers.length; i++) {
    const user = allUsers[i]!;
    const name = profileMap.get(user.id) || "Valued Member";
    const unsubscribeToken = tokenMap.get(user.id);

    const html = renderFeatureAnnouncementHtml({
      displayName: name,
      unsubscribeToken,
    });

    const res = await sendEmail({
      to: user.email,
      subject: "What's new in ClosetAI: Swipe to reply, Trip packing & AI Studio ✨",
      html,
    });

    if (res.success) {
      successCount++;
      console.log(`[${i + 1}/${allUsers.length}] ✅ Sent to ${user.email} (${name})`);
    } else {
      failureCount++;
      console.error(`[${i + 1}/${allUsers.length}] ❌ Failed for ${user.email}: ${res.error}`);
    }

    if (i < allUsers.length - 1 && batchDelayMs > 0) {
      await sleep(batchDelayMs);
    }
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log("\n=======================================================");
  console.log("                  BROADCAST COMPLETE                   ");
  console.log("=======================================================");
  console.log(`⏱️  Duration: ${durationSec}s`);
  console.log(`✅ Successfully sent: ${successCount}`);
  console.log(`❌ Failed:            ${failureCount}`);
  console.log(`📊 Total processed:    ${allUsers.length}\n`);
}

main().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
