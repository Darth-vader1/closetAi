#!/usr/bin/env npx tsx
/**
 * scripts/backfill-image-paths.ts
 *
 * Verifies that every existing wardrobe item's image_path still exists in
 * Supabase Storage and marks its image_processing_status accordingly.
 *
 * Because the current image-delivery strategy uses Supabase's on-the-fly
 * transform endpoint (/render/image/sign/…) there is nothing to "generate" —
 * the CDN creates and caches resized variants on the first request.  This
 * script therefore performs a lighter-weight audit:
 *
 *   1. Page through every wardrobe_items row (batches of BATCH_SIZE).
 *   2. For each batch, ask Storage whether each file is reachable (signed URL).
 *   3. Write back image_processing_status = 'done'  → file exists and is accessible.
 *                                         = 'failed' → file not found or signing error.
 *   4. Print a summary.
 *
 * The script is IDEMPOTENT and RESUMABLE:
 *   - Items already marked 'done' are skipped (--force flag overrides this).
 *   - Items marked 'failed' are retried every run (transient storage errors can
 *     be corrected by re-uploading the photo through the normal app flow).
 *   - The script never deletes data or modifies storage.
 *
 * USAGE
 *   npx tsx scripts/backfill-image-paths.ts
 *   npx tsx scripts/backfill-image-paths.ts --force   # re-check all items
 *   npx tsx scripts/backfill-image-paths.ts --dry-run # report without writing
 *
 * PREREQUISITES
 *   - NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set
 *     (copy .env.example → .env.local and fill in values, or set in environment).
 *   - The migration 20261013000004_image_metadata.sql must have been applied.
 *   - Run `npx tsx` from the project root.
 *
 * The script uses the service-role client so it can read all users' items.
 * Never commit SUPABASE_SERVICE_ROLE_KEY to source control.
 */

import { createClient } from "@supabase/supabase-js";
import { resolve } from "path";
import { readFileSync } from "fs";

// ---------------------------------------------------------------------------
// Load .env.local manually (no dotenv dependency required).
// Parses KEY=VALUE lines, ignoring comments and blank lines.
// ---------------------------------------------------------------------------
function loadEnvFile(filePath: string) {
  try {
    const content = readFileSync(filePath, "utf-8");
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
    // File not found is fine — env vars may already be set in the shell.
  }
}
loadEnvFile(resolve(process.cwd(), ".env.local"));

// ─── Config ──────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = "wardrobe";
const BATCH_SIZE = 50;        // items per DB page
const CONCURRENCY = 6;        // parallel Storage calls per batch
const SIGNED_URL_TTL = 60;    // 1 minute — just enough to verify existence

const args = process.argv.slice(2);
const FORCE = args.includes("--force");
const DRY_RUN = args.includes("--dry-run");

// ─── Types ───────────────────────────────────────────────────────────────────

type ProcessingStatus = "pending" | "done" | "failed" | "skipped";

interface ItemRow {
  id: string;
  user_id: string;
  image_path: string;
  image_processing_status: ProcessingStatus | null;
}

// ─── Concurrency limiter ─────────────────────────────────────────────────────

function createLimiter(limit: number) {
  let active = 0;
  const queue: Array<() => void> = [];
  const release = () => { active--; queue.shift()?.(); };
  return async function run<T>(job: () => Promise<T>): Promise<T> {
    if (active >= limit) await new Promise<void>((res) => queue.push(res));
    active++;
    try { return await job(); } finally { release(); }
  };
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error(
      "❌  Missing environment variables.\n" +
      "    Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY\n" +
      "    (copy .env.example → .env.local and fill in real values).",
    );
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(`\n🔍  ClosetAI image backfill audit`);
  console.log(`    Supabase: ${SUPABASE_URL}`);
  console.log(`    Batch size: ${BATCH_SIZE}  Concurrency: ${CONCURRENCY}`);
  console.log(`    Force re-check: ${FORCE}   Dry-run: ${DRY_RUN}\n`);

  let offset = 0;
  let totalChecked = 0;
  let totalDone = 0;
  let totalFailed = 0;
  let totalSkipped = 0;

  const limiter = createLimiter(CONCURRENCY);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    // 1. Fetch a batch of items that need checking.
    let query = supabase
      .from("wardrobe_items")
      .select("id, user_id, image_path, image_processing_status")
      .order("created_at", { ascending: true })
      .range(offset, offset + BATCH_SIZE - 1);

    if (!FORCE) {
      // Skip items already confirmed good.
      query = query.neq("image_processing_status", "done");
    }

    const { data, error } = await query;
    if (error) {
      console.error("❌  DB query failed:", error.message);
      process.exit(1);
    }

    const rows = (data ?? []) as ItemRow[];
    if (rows.length === 0) break;

    console.log(`  Batch offset=${offset}: checking ${rows.length} items…`);

    // 2. Sign URLs in parallel (bounded concurrency) to verify file existence.
    const results = await Promise.all(
      rows.map((row) =>
        limiter(async (): Promise<{ id: string; status: ProcessingStatus }> => {
          const { data: signed, error: signErr } = await supabase.storage
            .from(BUCKET)
            .createSignedUrl(row.image_path, SIGNED_URL_TTL);

          if (signErr || !signed?.signedUrl) {
            console.warn(`    ⚠  ${row.id}  image_path="${row.image_path}"  → FAILED (${signErr?.message ?? "no URL returned"})`);
            return { id: row.id, status: "failed" };
          }

          // Optionally verify the URL is actually reachable (HEAD request).
          // This adds latency but catches cases where the file was deleted
          // after the signed URL was issued (rare but possible).
          try {
            const res = await fetch(signed.signedUrl, { method: "HEAD", signal: AbortSignal.timeout(8000) });
            if (!res.ok) {
              console.warn(`    ⚠  ${row.id}  HTTP ${res.status} → FAILED`);
              return { id: row.id, status: "failed" };
            }
          } catch (fetchErr) {
            console.warn(`    ⚠  ${row.id}  HEAD failed → FAILED (${fetchErr instanceof Error ? fetchErr.message : fetchErr})`);
            return { id: row.id, status: "failed" };
          }

          return { id: row.id, status: "done" };
        }),
      ),
    );

    totalChecked += results.length;
    const doneIds = results.filter((r) => r.status === "done").map((r) => r.id);
    const failedIds = results.filter((r) => r.status === "failed").map((r) => r.id);

    totalDone += doneIds.length;
    totalFailed += failedIds.length;

    // 3. Write back status unless dry-run.
    if (!DRY_RUN) {
      if (doneIds.length > 0) {
        const { error: upErr } = await supabase
          .from("wardrobe_items")
          .update({ image_processing_status: "done" })
          .in("id", doneIds);
        if (upErr) console.error("    ❌  Failed to update done status:", upErr.message);
      }

      if (failedIds.length > 0) {
        const { error: upErr } = await supabase
          .from("wardrobe_items")
          .update({ image_processing_status: "failed" })
          .in("id", failedIds);
        if (upErr) console.error("    ❌  Failed to update failed status:", upErr.message);
      }
    } else {
      console.log(`    [dry-run] would mark ${doneIds.length} done, ${failedIds.length} failed`);
    }

    offset += BATCH_SIZE;

    // If the batch was smaller than BATCH_SIZE we've reached the end.
    if (rows.length < BATCH_SIZE) break;
  }

  // ─── Summary ───────────────────────────────────────────────────────────────
  console.log(`\n${"─".repeat(52)}`);
  console.log(`  Items checked : ${totalChecked}`);
  console.log(`  ✅ Accessible  : ${totalDone}`);
  console.log(`  ❌ Failed      : ${totalFailed}`);
  console.log(`  ⏭  Skipped     : ${totalSkipped}`);
  console.log(`${"─".repeat(52)}\n`);

  if (totalFailed > 0) {
    console.log(
      "  Some images could not be verified.  The affected garments will show\n" +
      '  a "photo unavailable" placeholder until the user re-uploads a photo\n' +
      "  through the normal Add Clothes flow.\n",
    );
    console.log(
      "  To list failed items:\n" +
      "    SELECT id, name, image_path FROM public.wardrobe_items\n" +
      "    WHERE image_processing_status = 'failed';\n",
    );
  }

  if (totalFailed > 0 && !DRY_RUN) process.exit(2); // non-zero so CI can detect issues
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
