-- Backfill historical ai_usage_events rows (sub_operation IS NULL) using
-- storage.objects upload timestamps/sizes, stylist_chat_messages, and feature rollout cutoffs.

-- 1. Pre-beautify / pre-multi-detect era (< 2026-10-18 UTC): /api/ai/analyse was the sole vision endpoint
UPDATE public.ai_usage_events
SET sub_operation = 'SINGLE_GARMENT_SCAN'
WHERE operation = 'ANALYSE_IMAGE'
  AND sub_operation IS NULL
  AND created_at < '2026-10-18T00:00:00Z';

-- 2. Historical STYLE_OUTFITS & CHAT sub-operations
UPDATE public.ai_usage_events
SET sub_operation = 'STYLIST_OUTFITS'
WHERE operation = 'STYLE_OUTFITS'
  AND sub_operation IS NULL;

UPDATE public.ai_usage_events AS e
SET sub_operation = CASE
  WHEN EXISTS (
    SELECT 1
    FROM public.stylist_chat_messages AS m
    WHERE m.user_id = e.user_id
      AND m.role = 'user'
      AND m.created_at BETWEEN e.created_at - interval '30 seconds'
                           AND e.created_at + interval '30 seconds'
  ) THEN 'STYLIST_CHAT'
  ELSE 'BRIEFING_PREVIEW'
END
WHERE e.operation = 'CHAT'
  AND e.sub_operation IS NULL;

-- 3 & 4. Correlate against storage.objects when full Supabase Storage columns (metadata, created_at) exist
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'storage'
      AND table_name = 'objects'
      AND column_name = 'metadata'
  ) AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'storage'
      AND table_name = 'objects'
      AND column_name = 'created_at'
  ) THEN
    -- 3. OOTD rollout window (>= 2026-11-01T12:50:00Z): distinguish full-frame OOTD uploads vs De-Body Flat-Lay extractions
    EXECUTE $sql$
      WITH closest_upload AS (
        SELECT
          e.id AS event_id,
          (
            SELECT coalesce((o.metadata->>'size')::bigint, 0)
            FROM storage.objects AS o
            WHERE o.bucket_id = 'wardrobe'
              AND split_part(o.name, '/', 1) = e.user_id::text
              AND o.created_at BETWEEN e.created_at - interval '6 seconds'
                                   AND e.created_at + interval '500 milliseconds'
            ORDER BY abs(extract(epoch FROM (e.created_at - o.created_at))) ASC
            LIMIT 1
          ) AS upload_bytes
        FROM public.ai_usage_events AS e
        WHERE e.operation = 'ANALYSE_IMAGE'
          AND e.sub_operation IS NULL
          AND e.created_at >= '2026-11-01T12:50:00Z'
      )
      UPDATE public.ai_usage_events AS e
      SET sub_operation = CASE
        WHEN cu.upload_bytes IS NOT NULL AND cu.upload_bytes >= 80000 THEN 'OOTD_EXTRACT'
        ELSE 'BEAUTIFY_FLATLAY'
      END
      FROM closest_upload AS cu
      WHERE e.id = cu.event_id
    $sql$;

    -- 4. Multi-detect & Product Studio era (2026-10-18 .. 2026-11-01T12:50:00Z)
    EXECUTE $sql$
      WITH window_events AS (
        SELECT
          e.id AS event_id,
          e.user_id,
          e.created_at,
          (
            SELECT coalesce((o.metadata->>'size')::bigint, 0)
            FROM storage.objects AS o
            WHERE o.bucket_id = 'wardrobe'
              AND split_part(o.name, '/', 1) = e.user_id::text
              AND o.created_at BETWEEN e.created_at - interval '6 seconds'
                                   AND e.created_at + interval '500 milliseconds'
            ORDER BY abs(extract(epoch FROM (e.created_at - o.created_at))) ASC
            LIMIT 1
          ) AS upload_bytes
        FROM public.ai_usage_events AS e
        WHERE e.operation = 'ANALYSE_IMAGE'
          AND e.sub_operation IS NULL
          AND e.created_at >= '2026-10-18T00:00:00Z'
          AND e.created_at < '2026-11-01T12:50:00Z'
      )
      UPDATE public.ai_usage_events AS e
      SET sub_operation = CASE
        WHEN we.upload_bytes IS NOT NULL AND we.upload_bytes >= 10000 THEN 'SINGLE_GARMENT_SCAN'
        ELSE 'BEAUTIFY_ENHANCE'
      END
      FROM window_events AS we
      WHERE e.id = we.event_id
    $sql$;
  END IF;
END $$;
