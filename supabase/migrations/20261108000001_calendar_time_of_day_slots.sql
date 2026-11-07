-- Migration: Multi-Slot Outfit Calendar (Morning, Afternoon, Evening) & Direct Wear Logging
-- Description: Allows planning and logging up to 3 outfits per day (MORNING, AFTERNOON, EVENING)
-- on outfit_plans and outfit_history, and updates wear_outfit RPC to support time_of_day slots.

-- ============================================================================
-- PART 1: Add time_of_day to outfit_plans and replace single-per-day unique constraint
-- ============================================================================

ALTER TABLE public.outfit_plans
ADD COLUMN IF NOT EXISTS time_of_day TEXT NOT NULL DEFAULT 'MORNING'
CHECK (time_of_day IN ('MORNING', 'AFTERNOON', 'EVENING'));

ALTER TABLE public.outfit_plans
DROP CONSTRAINT IF EXISTS outfit_plans_user_id_planned_for_key;

DROP INDEX IF EXISTS public.outfit_plans_user_date_slot_uniq;
CREATE UNIQUE INDEX outfit_plans_user_date_slot_uniq
ON public.outfit_plans (user_id, planned_for, time_of_day);

ALTER TABLE public.outfit_plans
DROP CONSTRAINT IF EXISTS outfit_plans_user_date_slot_key;
ALTER TABLE public.outfit_plans
ADD CONSTRAINT outfit_plans_user_date_slot_key
UNIQUE USING INDEX outfit_plans_user_date_slot_uniq;

-- ============================================================================
-- PART 2: Add time_of_day to outfit_history and scope unique index by slot
-- ============================================================================

ALTER TABLE public.outfit_history
ADD COLUMN IF NOT EXISTS time_of_day TEXT NOT NULL DEFAULT 'MORNING'
CHECK (time_of_day IN ('MORNING', 'AFTERNOON', 'EVENING'));

DROP INDEX IF EXISTS public.outfit_history_user_outfit_worn_on_uniq;
CREATE UNIQUE INDEX IF NOT EXISTS outfit_history_user_outfit_worn_slot_uniq
ON public.outfit_history (user_id, outfit_id, worn_on, time_of_day);

-- ============================================================================
-- PART 3: Upgrade wear_outfit RPC with p_time_of_day support and slot upsert
-- ============================================================================

DROP FUNCTION IF EXISTS public.wear_outfit(uuid, date, uuid);
DROP FUNCTION IF EXISTS public.wear_outfit(uuid, date, uuid, text);

CREATE OR REPLACE FUNCTION public.wear_outfit(
  p_outfit_id UUID,
  p_worn_on DATE DEFAULT CURRENT_DATE,
  p_plan_id UUID DEFAULT NULL,
  p_time_of_day TEXT DEFAULT 'MORNING'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := (SELECT auth.uid());
  v_worn_on DATE := COALESCE(p_worn_on, CURRENT_DATE);
  v_time_of_day TEXT := UPPER(TRIM(COALESCE(p_time_of_day, 'MORNING')));
  v_rewear_allowed BOOLEAN := TRUE;
  v_item_count INTEGER := 0;
  v_unready_count INTEGER := 0;
  v_history_id UUID;
  v_plan_id UUID := p_plan_id;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING errcode = '28000';
  END IF;

  IF v_time_of_day NOT IN ('MORNING', 'AFTERNOON', 'EVENING') THEN
    v_time_of_day := 'MORNING';
  END IF;

  IF v_worn_on < (CURRENT_DATE - 365) OR v_worn_on > (CURRENT_DATE + 7) THEN
    RAISE EXCEPTION 'worn_on date is out of allowed range' USING errcode = '22008';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM outfits WHERE id = p_outfit_id AND user_id = v_uid
  ) THEN
    RAISE EXCEPTION 'Outfit not found' USING errcode = 'P0002';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM outfit_history
    WHERE user_id = v_uid
      AND outfit_id = p_outfit_id
      AND worn_on = v_worn_on
      AND time_of_day = v_time_of_day
  ) THEN
    RAISE EXCEPTION 'Outfit already marked as worn on this date and time slot' USING errcode = '23505';
  END IF;

  SELECT COUNT(*),
         COUNT(*) FILTER (
           WHERE wi.status NOT IN ('CLEAN'::laundry_status, 'WORN'::laundry_status)
         )
  INTO v_item_count, v_unready_count
  FROM outfit_items oi
  JOIN wardrobe_items wi
    ON wi.id = oi.item_id AND wi.user_id = oi.user_id
  WHERE oi.outfit_id = p_outfit_id
    AND oi.user_id = v_uid;

  IF v_item_count = 0 THEN
    RAISE EXCEPTION 'Outfit has no items' USING errcode = '22023';
  END IF;

  IF v_unready_count > 0 THEN
    RAISE EXCEPTION 'One or more items in this outfit are not clean and ready to wear' USING errcode = '22023';
  END IF;

  -- Upsert or update the outfit_plans slot so directly-logged outfits appear on the Calendar
  IF v_plan_id IS NOT NULL THEN
    UPDATE outfit_plans
    SET outfit_id = p_outfit_id,
        status = 'WORN'::plan_status,
        time_of_day = v_time_of_day,
        worn_at = v_now
    WHERE id = v_plan_id
      AND user_id = v_uid;
  ELSE
    INSERT INTO outfit_plans (user_id, outfit_id, planned_for, time_of_day, status, worn_at)
    VALUES (v_uid, p_outfit_id, v_worn_on, v_time_of_day, 'WORN'::plan_status, v_now)
    ON CONFLICT (user_id, planned_for, time_of_day)
    DO UPDATE SET
      outfit_id = EXCLUDED.outfit_id,
      status = 'WORN'::plan_status,
      worn_at = v_now
    RETURNING id INTO v_plan_id;
  END IF;

  -- Record outfit wear in history
  INSERT INTO outfit_history (user_id, outfit_id, plan_id, worn_on, time_of_day, worn_at)
  VALUES (v_uid, p_outfit_id, v_plan_id, v_worn_on, v_time_of_day, v_now)
  RETURNING id INTO v_history_id;

  -- Record which items were worn
  INSERT INTO outfit_history_items (history_id, item_id, user_id)
  SELECT v_history_id, oi.item_id, v_uid
  FROM outfit_items oi
  WHERE oi.outfit_id = p_outfit_id
    AND oi.user_id = v_uid
  ON CONFLICT DO NOTHING;

  -- Create laundry events ONLY for washable items that change status
  INSERT INTO laundry_events (user_id, item_id, from_status, to_status, confirmed_washed)
  SELECT v_uid, wi.id, wi.status, 'WORN'::laundry_status, FALSE
  FROM wardrobe_items wi
  JOIN outfit_items oi
    ON oi.item_id = wi.id AND oi.user_id = wi.user_id
  WHERE oi.outfit_id = p_outfit_id
    AND wi.user_id = v_uid
    AND wi.care_type = 'WASHABLE';

  -- Update items: WASHABLE -> WORN, increment wear_count & last_worn_at
  UPDATE wardrobe_items wi
  SET
    status = CASE
      WHEN wi.care_type = 'WASHABLE' THEN 'WORN'::laundry_status
      ELSE wi.status
    END,
    wear_count = wi.wear_count + 1,
    last_worn_at = v_now
  FROM outfit_items oi
  WHERE oi.outfit_id = p_outfit_id
    AND oi.user_id = v_uid
    AND wi.id = oi.item_id
    AND wi.user_id = v_uid;

  RETURN v_history_id;
END;
$$;

REVOKE ALL ON FUNCTION public.wear_outfit(UUID, DATE, UUID, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.wear_outfit(UUID, DATE, UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION public.wear_outfit IS 'Atomically records wearing an outfit for a specific date and time_of_day slot (MORNING, AFTERNOON, EVENING), syncing outfit_plans and wardrobe item wear counts.';
