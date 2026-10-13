-- Migration: Add Care Types for Non-Washable Items
-- Description: Supports accessories and footwear that don't need traditional washing

-- ============================================================================
-- PART 1: Add care_type column to wardrobe_items
-- ============================================================================

-- Add care_type enum-like column with constraint
ALTER TABLE wardrobe_items
ADD COLUMN IF NOT EXISTS care_type TEXT NOT NULL DEFAULT 'WASHABLE'
CHECK (care_type IN ('WASHABLE', 'WIPE_CLEAN', 'NO_WASH'));

CREATE INDEX IF NOT EXISTS idx_wardrobe_items_care_type 
ON wardrobe_items(care_type);

COMMENT ON COLUMN wardrobe_items.care_type IS 'How the item should be cared for: WASHABLE (normal laundry), WIPE_CLEAN (spot clean, e.g. shoes), NO_WASH (never needs washing, e.g. watches, belts)';

-- ============================================================================
-- PART 2: Backfill existing items based on category group
-- ============================================================================

-- Footwear items → WIPE_CLEAN (shoes, sneakers, boots, sandals)
UPDATE wardrobe_items
SET care_type = 'WIPE_CLEAN'
WHERE category IN ('shoes', 'sneakers', 'boots', 'sandals');

-- Accessory items → NO_WASH (belts, watches, bags, hats, accessories)
UPDATE wardrobe_items
SET care_type = 'NO_WASH'
WHERE category IN ('belts', 'watches', 'bags', 'hats', 'accessories');

-- All others remain WASHABLE (default)

-- ============================================================================
-- PART 3: Update wear_outfit to handle non-washable items
-- ============================================================================

-- Drop and recreate the wear_outfit function with care_type logic
DROP FUNCTION IF EXISTS public.wear_outfit(uuid, date, uuid);

CREATE OR REPLACE FUNCTION public.wear_outfit(
  p_outfit_id UUID,
  p_worn_on DATE DEFAULT CURRENT_DATE,
  p_plan_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := (SELECT auth.uid());
  v_worn_on DATE := COALESCE(p_worn_on, CURRENT_DATE);
  v_rewear_allowed BOOLEAN := TRUE;
  v_item_count INTEGER := 0;
  v_unready_count INTEGER := 0;
  v_history_id UUID;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING errcode = '28000';
  END IF;

  IF v_worn_on < (CURRENT_DATE - 30) OR v_worn_on > (CURRENT_DATE + 1) THEN
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
  ) THEN
    RAISE EXCEPTION 'Outfit already marked as worn on this date' USING errcode = '23505';
  END IF;

  SELECT COALESCE(p.rewear_worn_items, TRUE)
  INTO v_rewear_allowed
  FROM profiles p
  WHERE p.id = v_uid;

  SELECT COUNT(*),
         COUNT(*) FILTER (
           WHERE wi.status <> 'CLEAN'::laundry_status
             AND NOT (v_rewear_allowed AND wi.status = 'WORN'::laundry_status)
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

  -- Record outfit wear in history
  INSERT INTO outfit_history (user_id, outfit_id, plan_id, worn_on, worn_at)
  VALUES (v_uid, p_outfit_id, p_plan_id, v_worn_on, v_now)
  RETURNING id INTO v_history_id;

  -- Record which items were worn
  INSERT INTO outfit_history_items (history_id, item_id, user_id)
  SELECT v_history_id, oi.item_id, v_uid
  FROM outfit_items oi
  WHERE oi.outfit_id = p_outfit_id
    AND oi.user_id = v_uid;

  -- Create laundry events ONLY for washable items that change status
  -- Non-washable items (NO_WASH, WIPE_CLEAN) stay CLEAN
  INSERT INTO laundry_events (user_id, item_id, from_status, to_status, confirmed_washed)
  SELECT v_uid, wi.id, wi.status, 'WORN'::laundry_status, FALSE
  FROM wardrobe_items wi
  JOIN outfit_items oi
    ON oi.item_id = wi.id AND oi.user_id = wi.user_id
  WHERE oi.outfit_id = p_outfit_id
    AND wi.user_id = v_uid
    AND wi.care_type = 'WASHABLE';  -- Only washable items change status

  -- Update items:
  -- - WASHABLE items: status → WORN
  -- - WIPE_CLEAN/NO_WASH items: status stays CLEAN
  -- - All items: increment wear_count and update last_worn_at
  UPDATE wardrobe_items wi
  SET 
    status = CASE 
      WHEN wi.care_type = 'WASHABLE' THEN 'WORN'::laundry_status
      ELSE wi.status  -- Keep current status (should be CLEAN)
    END,
    wear_count = wi.wear_count + 1,
    last_worn_at = v_now
  FROM outfit_items oi
  WHERE oi.outfit_id = p_outfit_id
    AND oi.user_id = v_uid
    AND wi.id = oi.item_id
    AND wi.user_id = v_uid;

  -- Mark plan as worn if provided
  IF p_plan_id IS NOT NULL THEN
    UPDATE outfit_plans
    SET status = 'WORN'::plan_status,
        worn_at = v_now
    WHERE id = p_plan_id
      AND user_id = v_uid;
  ELSE
    -- Or mark any plan for this outfit and date
    UPDATE outfit_plans
    SET status = 'WORN'::plan_status,
        worn_at = v_now
    WHERE user_id = v_uid
      AND outfit_id = p_outfit_id
      AND planned_for = v_worn_on;
  END IF;

  RETURN v_history_id;
END;
$$;

REVOKE ALL ON FUNCTION public.wear_outfit(UUID, DATE, UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.wear_outfit(UUID, DATE, UUID) TO authenticated;

COMMENT ON FUNCTION public.wear_outfit IS 'Atomically records wearing an outfit. Washable items move to WORN status; non-washable items (shoes, accessories) stay CLEAN but increment wear count.';

-- ============================================================================
-- PART 4: Add validation to prevent invalid status changes on non-washable items
-- ============================================================================

-- Function to validate status changes for non-washable items
CREATE OR REPLACE FUNCTION validate_care_type_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Prevent setting non-washable items to wash cycle statuses
  IF NEW.care_type IN ('NO_WASH', 'WIPE_CLEAN') THEN
    IF NEW.status IN ('DIRTY', 'IN_LAUNDRY', 'WASHING', 'DRYING') THEN
      RAISE EXCEPTION 'Cannot set % items to % status', NEW.care_type, NEW.status
        USING errcode = '23514';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Apply trigger to wardrobe_items
DROP TRIGGER IF EXISTS trg_validate_care_type_status ON wardrobe_items;
CREATE TRIGGER trg_validate_care_type_status
  BEFORE INSERT OR UPDATE OF status, care_type ON wardrobe_items
  FOR EACH ROW
  EXECUTE FUNCTION validate_care_type_status_change();

COMMENT ON FUNCTION validate_care_type_status_change IS 'Prevents non-washable items from being set to wash cycle statuses';

-- ============================================================================
-- PART 5: Add helper function to check if item needs washing
-- ============================================================================

CREATE OR REPLACE FUNCTION item_needs_washing(p_item_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    wi.care_type = 'WASHABLE' 
    AND wi.status IN ('WORN', 'DIRTY')
  FROM wardrobe_items wi
  WHERE wi.id = p_item_id;
$$;

GRANT EXECUTE ON FUNCTION item_needs_washing TO authenticated;

COMMENT ON FUNCTION item_needs_washing IS 'Returns true if an item needs washing (is washable and in WORN/DIRTY status)';
