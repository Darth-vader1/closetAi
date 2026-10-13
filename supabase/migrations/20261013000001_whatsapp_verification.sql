
-- Migration: WhatsApp Phone Verification and Production Safety
-- Description: Adds phone verification system, template message tracking, and production safety controls

-- ============================================================================
-- PART 1: Add verification columns to email_preferences table
-- ============================================================================

-- Add missing WhatsApp columns to email_preferences if they don't exist
ALTER TABLE email_preferences
ADD COLUMN IF NOT EXISTS whatsapp_enabled BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS whatsapp_weekly_enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- Add phone verification status and template message tracking to email_preferences
ALTER TABLE email_preferences
ADD COLUMN IF NOT EXISTS whatsapp_phone_verified BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS whatsapp_phone_verified_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS whatsapp_verification_attempts INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS whatsapp_verification_locked_until TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS last_whatsapp_message_at TIMESTAMPTZ;

-- Index for verification status checks
CREATE INDEX IF NOT EXISTS idx_email_prefs_whatsapp_verified 
ON email_preferences(whatsapp_phone_verified) 
WHERE whatsapp_enabled = TRUE;

-- Index for rate limiting checks
CREATE INDEX IF NOT EXISTS idx_email_prefs_verification_locked 
ON email_preferences(whatsapp_verification_locked_until) 
WHERE whatsapp_verification_locked_until IS NOT NULL;

COMMENT ON COLUMN email_preferences.whatsapp_enabled IS 'Whether WhatsApp notifications are enabled for this user';
COMMENT ON COLUMN email_preferences.whatsapp_phone_verified IS 'Whether the user has verified ownership of their WhatsApp number';
COMMENT ON COLUMN email_preferences.whatsapp_phone_verified_at IS 'Timestamp when phone verification was completed';
COMMENT ON COLUMN email_preferences.whatsapp_verification_attempts IS 'Number of verification code generation attempts in current window';
COMMENT ON COLUMN email_preferences.whatsapp_verification_locked_until IS 'Timestamp until which verification is rate-limited';
COMMENT ON COLUMN email_preferences.last_whatsapp_message_at IS 'Last time we sent any WhatsApp message (for 24h window tracking)';

-- ============================================================================
-- PART 2: Create whatsapp_verifications table
-- ============================================================================

CREATE TABLE IF NOT EXISTS whatsapp_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  code_prefix TEXT NOT NULL, -- "CLOSET" for easy identification
  expires_at TIMESTAMPTZ NOT NULL,
  verified_at TIMESTAMPTZ,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Only one active verification per user
  CONSTRAINT chk_verification_expiry CHECK (expires_at > created_at),
  CONSTRAINT chk_verification_attempts CHECK (attempts >= 0 AND attempts <= max_attempts)
);

-- Indexes for verification lookups
CREATE INDEX IF NOT EXISTS idx_whatsapp_verifications_user_id 
ON whatsapp_verifications(user_id);

CREATE INDEX IF NOT EXISTS idx_whatsapp_verifications_active 
ON whatsapp_verifications(user_id, expires_at, verified_at) 
WHERE verified_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_whatsapp_verifications_cleanup 
ON whatsapp_verifications(expires_at) 
WHERE verified_at IS NULL;

COMMENT ON TABLE whatsapp_verifications IS 'Stores hashed verification codes for WhatsApp phone ownership verification';
COMMENT ON COLUMN whatsapp_verifications.code_hash IS 'SHA-256 hash of verification code with pepper (never store plaintext)';
COMMENT ON COLUMN whatsapp_verifications.code_prefix IS 'First part of code for user-friendly display (e.g., CLOSET)';
COMMENT ON COLUMN whatsapp_verifications.attempts IS 'Number of failed verification attempts';

-- ============================================================================
-- PART 3: Row Level Security (RLS)
-- ============================================================================

-- Enable RLS on whatsapp_verifications table
ALTER TABLE whatsapp_verifications ENABLE ROW LEVEL SECURITY;

-- Users can view only their own verification records
CREATE POLICY "Users can view own verifications"
ON whatsapp_verifications
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Service role can manage all verifications (for server-side operations)
CREATE POLICY "Service role full access to verifications"
ON whatsapp_verifications
FOR ALL
TO service_role
USING (TRUE)
WITH CHECK (TRUE);

-- Update profiles RLS to allow users to update their own verification status
-- (This assumes profiles already has RLS enabled with appropriate policies)

-- ============================================================================
-- PART 4: Security Definer Functions
-- ============================================================================

-- Function: Create a new verification code
-- Returns: verification_id for tracking
CREATE OR REPLACE FUNCTION create_whatsapp_verification(
  p_user_id UUID,
  p_code_hash TEXT,
  p_code_prefix TEXT,
  p_expires_at TIMESTAMPTZ
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_verification_id UUID;
  v_active_count INTEGER;
  v_locked_until TIMESTAMPTZ;
  v_attempt_count INTEGER;
BEGIN
  -- Check if user is rate-limited
  SELECT 
    whatsapp_verification_locked_until,
    whatsapp_verification_attempts
  INTO v_locked_until, v_attempt_count
  FROM email_preferences
  WHERE user_id = p_user_id;
  
  IF v_locked_until IS NOT NULL AND v_locked_until > NOW() THEN
    RAISE EXCEPTION 'RATE_LIMITED: Too many verification attempts. Try again later.';
  END IF;
  
  -- Check active verification count (max 3 per user)
  SELECT COUNT(*) INTO v_active_count
  FROM whatsapp_verifications
  WHERE user_id = p_user_id
    AND verified_at IS NULL
    AND expires_at > NOW();
    
  IF v_active_count >= 3 THEN
    RAISE EXCEPTION 'TOO_MANY_ACTIVE: Maximum 3 active verification codes reached';
  END IF;
  
  -- Insert new verification record
  INSERT INTO whatsapp_verifications (
    user_id,
    code_hash,
    code_prefix,
    expires_at
  ) VALUES (
    p_user_id,
    p_code_hash,
    p_code_prefix,
    p_expires_at
  )
  RETURNING id INTO v_verification_id;
  
  -- Update attempt counter and reset lock if expired
  UPDATE email_preferences
  SET 
    whatsapp_verification_attempts = CASE
      WHEN v_locked_until IS NULL OR v_locked_until <= NOW()
      THEN 1  -- Reset counter if lock expired
      ELSE whatsapp_verification_attempts + 1
    END,
    whatsapp_verification_locked_until = CASE
      WHEN (COALESCE(v_attempt_count, 0) + 1) >= 5
      THEN NOW() + INTERVAL '1 hour'  -- Lock for 1 hour after 5 attempts
      ELSE NULL
    END
  WHERE user_id = p_user_id;
  
  RETURN v_verification_id;
END;
$$;

COMMENT ON FUNCTION create_whatsapp_verification IS 'Creates a new verification code with rate limiting (5 starts per hour, max 3 active codes)';

-- Function: Verify a code and update profile
-- Returns: TRUE if valid, FALSE if invalid/expired
CREATE OR REPLACE FUNCTION verify_whatsapp_code(
  p_user_id UUID,
  p_code_hash TEXT
)
RETURNS TABLE (
  success BOOLEAN,
  message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_verification_id UUID;
  v_attempts INTEGER;
  v_max_attempts INTEGER;
  v_verified_at TIMESTAMPTZ;
BEGIN
  -- Find matching active verification
  SELECT 
    id,
    attempts,
    max_attempts,
    verified_at
  INTO 
    v_verification_id,
    v_attempts,
    v_max_attempts,
    v_verified_at
  FROM whatsapp_verifications
  WHERE user_id = p_user_id
    AND code_hash = p_code_hash
    AND expires_at > NOW()
  ORDER BY created_at DESC
  LIMIT 1;
  
  -- No matching verification found
  IF v_verification_id IS NULL THEN
    -- Try to find any active verification to increment attempts
    SELECT id, attempts, max_attempts
    INTO v_verification_id, v_attempts, v_max_attempts
    FROM whatsapp_verifications
    WHERE user_id = p_user_id
      AND verified_at IS NULL
      AND expires_at > NOW()
    ORDER BY created_at DESC
    LIMIT 1;
    
    IF v_verification_id IS NOT NULL THEN
      -- Increment failed attempts
      UPDATE whatsapp_verifications
      SET attempts = attempts + 1
      WHERE id = v_verification_id;
      
      IF v_attempts + 1 >= v_max_attempts THEN
        RETURN QUERY SELECT FALSE, 'LOCKED: Too many failed attempts. Request a new code.'::TEXT;
        RETURN;
      END IF;
    END IF;
    
    RETURN QUERY SELECT FALSE, 'INVALID: Code not found or expired'::TEXT;
    RETURN;
  END IF;
  
  -- Check if already verified
  IF v_verified_at IS NOT NULL THEN
    RETURN QUERY SELECT FALSE, 'ALREADY_VERIFIED: This code has already been used'::TEXT;
    RETURN;
  END IF;
  
  -- Check attempt limit
  IF v_attempts >= v_max_attempts THEN
    RETURN QUERY SELECT FALSE, 'LOCKED: Too many failed attempts. Request a new code.'::TEXT;
    RETURN;
  END IF;
  
  -- Success! Mark as verified
  UPDATE whatsapp_verifications
  SET verified_at = NOW()
  WHERE id = v_verification_id;
  
  -- Update email_preferences verification status
  UPDATE email_preferences
  SET 
    whatsapp_phone_verified = TRUE,
    whatsapp_phone_verified_at = NOW(),
    whatsapp_verification_attempts = 0,  -- Reset attempt counter
    whatsapp_verification_locked_until = NULL  -- Clear any lock
  WHERE user_id = p_user_id;
  
  RETURN QUERY SELECT TRUE, 'SUCCESS: Phone verified'::TEXT;
END;
$$;

COMMENT ON FUNCTION verify_whatsapp_code IS 'Verifies a hashed code and updates profile verification status with attempt tracking';

-- Function: Cleanup expired verifications
-- Should be called by a periodic job
CREATE OR REPLACE FUNCTION cleanup_expired_verifications()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  -- Delete unverified codes older than 24 hours
  DELETE FROM whatsapp_verifications
  WHERE verified_at IS NULL
    AND expires_at < NOW() - INTERVAL '24 hours';
  
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  
  RETURN v_deleted_count;
END;
$$;

COMMENT ON FUNCTION cleanup_expired_verifications IS 'Deletes expired verification codes older than 24 hours';

-- ============================================================================
-- PART 5: Grants
-- ============================================================================

-- Grant execute permissions on functions to authenticated users
GRANT EXECUTE ON FUNCTION create_whatsapp_verification TO authenticated;
GRANT EXECUTE ON FUNCTION verify_whatsapp_code TO authenticated;

-- Grant execute on cleanup function to service role only
GRANT EXECUTE ON FUNCTION cleanup_expired_verifications TO service_role;

-- ============================================================================
-- PART 6: Reset verification status for unverified users with notifications enabled
-- ============================================================================

-- Any existing users with WhatsApp enabled need to verify their phone
-- This ensures production safety by requiring verification for all users
UPDATE email_preferences
SET 
  whatsapp_phone_verified = FALSE,
  whatsapp_phone_verified_at = NULL
WHERE whatsapp_enabled = TRUE
  AND whatsapp_phone_verified IS NULL;

-- Add helpful comment
COMMENT ON TABLE email_preferences IS 'User notification preferences for email and WhatsApp. whatsapp_phone_verified required for production WhatsApp delivery.';
