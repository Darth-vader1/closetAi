# WhatsApp Production Safety Implementation

This directory implements production-safe WhatsApp delivery for ClosetAI with phone verification and approved template messages.

## Architecture

### Core Components

1. **`service.ts`** - Main WhatsApp service
   - Sends regular messages (within 24h window)
   - Sends template messages (outside 24h window)
   - Tracks message timestamps for window detection
   - Refuses simulation in production environment

2. **`templates.ts`** - Template message handling
   - Template payload building for Meta API
   - Meta error parsing (24h window, rate limits, etc.)
   - 24h window detection logic
   - Template parameter validation

3. **`verification.ts`** - Phone ownership verification
   - Secure code generation (cryptographically random)
   - SHA-256 hashing with server-side pepper
   - Rate limiting (5 attempts/hour, max 3 active codes)
   - Attempt tracking (5 failed attempts = lockout)

4. **`/api/webhook/whatsapp/route.ts`** - Webhook handler
   - Verifies `X-Hub-Signature-256` signatures
   - Handles incoming verification codes
   - Processes STOP/START opt-out commands
   - Message deduplication

## Security Model

### Phone Verification

**Why verify?**
- Prevents accidental spam to wrong numbers
- Complies with Meta WhatsApp policies
- Proves user owns the phone number they entered

**How it works:**
1. User enables WhatsApp in settings and enters their phone number
2. User requests verification code via UI
3. System generates 6-digit code: `CLOSET-XXXXXX`
4. Code is hashed with SHA-256(pepper + code) - **never stored plaintext**
5. Code sent via Meta-approved template message
6. User texts code back to business number OR enters in UI
7. System verifies hash and marks phone as verified

**Security features:**
- Cryptographically random code generation (`crypto.randomInt`)
- SHA-256 hashing with server-side pepper (32+ char secret)
- Constant-time comparison (prevents timing attacks)
- Rate limiting: 5 generation attempts per hour
- Max 3 active (unexpired) codes per user
- Attempt limiting: 5 verification attempts per code
- 15-minute expiry per code
- Automatic lockout after rate limit exceeded (1 hour)

### Production Safety

**Refuses simulation in production:**
```typescript
if (process.env.NODE_ENV === 'production' && !hasWhatsAppCredentials) {
  throw new Error('PRODUCTION_SAFETY: WhatsApp credentials not configured');
}
```

This prevents silent failures where:
- Developer thinks messages are being sent
- Users don't receive notifications
- No error is surfaced to admins

**All production messages require:**
- Valid WhatsApp credentials configured
- User phone number verified
- Either within 24h window OR using approved template

## Meta WhatsApp API Integration

### 24-Hour Messaging Window

WhatsApp has a **24-hour customer care window** policy:

- **Within 24h of user's last message:** Can send rich free-form messages with images, videos, files
- **Outside 24h window:** Can ONLY send pre-approved template messages

Our implementation:
1. Tracks `last_whatsapp_message_at` in profiles table
2. Updates timestamp whenever we send a message
3. Webhook updates timestamp when user messages us
4. Cron jobs check window status before sending
5. Auto-switches to templates when outside window

### Template Messages

Templates must be **pre-approved by Meta** (24-48 hour review process).

**Registered templates:**

1. **`phone_verification`** (Category: Authentication)
   - Parameters: `{{1}}` = verification code
   - Used for: Phone ownership verification
   - Works outside 24h window

2. **`daily_outfit_suggestion`** (Category: Marketing)
   - Parameters: `{{1}}` = user name, `{{2}}` = weather description
   - Used for: Daily stylist notifications
   - Fallback when outside 24h window

3. **`weekly_laundry_reminder`** (Category: Marketing)
   - Parameters: `{{1}}` = user name, `{{2}}` = item count
   - Used for: Weekly laundry digests
   - Fallback when outside 24h window

### Error Handling

Meta API errors are parsed and categorized:

| Error Code | Meaning | Retryable? | Action |
|------------|---------|------------|--------|
| 131047 | Outside 24h window | Yes | Switch to template |
| 132001 | Template not found | No | Check template name |
| 132000 | Template not approved | No | Wait for Meta approval |
| 131026 | Invalid recipient | No | Ask user to check number |
| 130429/80007 | Rate limit | Yes | Backoff and retry |

## Database Schema

### Profiles Table (additions)

```sql
ALTER TABLE profiles ADD COLUMN
  whatsapp_phone_verified BOOLEAN DEFAULT FALSE,
  whatsapp_phone_verified_at TIMESTAMPTZ,
  whatsapp_verification_attempts INTEGER DEFAULT 0,
  whatsapp_verification_locked_until TIMESTAMPTZ,
  last_whatsapp_message_at TIMESTAMPTZ;
```

### WhatsApp Verifications Table

```sql
CREATE TABLE whatsapp_verifications (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  code_hash TEXT NOT NULL,
  code_prefix TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  verified_at TIMESTAMPTZ,
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 5,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Key points:**
- `code_hash`: SHA-256(pepper + code), never plaintext
- `code_prefix`: "CLOSET" for user-friendly display
- `attempts`: Failed verification attempts (max 5)
- `verified_at`: NULL until successfully verified

### Webhook Message Deduplication

```sql
CREATE TABLE whatsapp_webhook_messages (
  id UUID PRIMARY KEY,
  whatsapp_message_id TEXT UNIQUE NOT NULL,
  from_number TEXT NOT NULL,
  received_at TIMESTAMPTZ DEFAULT NOW()
);
```

Prevents duplicate webhook processing (Meta may send same webhook multiple times).

## Environment Variables

Required for production:

```bash
# Meta WhatsApp Cloud API credentials
WHATSAPP_ACCESS_TOKEN=         # System user token (permanent)
WHATSAPP_PHONE_NUMBER_ID=      # Business phone number ID
WHATSAPP_VERIFY_TOKEN=         # Webhook verification token
WHATSAPP_APP_SECRET=           # For webhook signature verification

# Verification security (CRITICAL - never expose)
WHATSAPP_VERIFICATION_PEPPER=  # 32+ char random secret for hashing
                               # Generate: openssl rand -hex 32
```

## Usage Examples

### Starting Phone Verification

```typescript
import { startPhoneVerification } from '@/app/(app)/settings/whatsapp-actions';

const result = await startPhoneVerification();
if (result.success) {
  console.log(`Code sent! Expires in ${result.expiresInMinutes} minutes`);
} else {
  console.error(result.error, result.errorCode);
}
```

### Verifying Submitted Code

```typescript
import { verifyPhoneCode } from '@/app/(app)/settings/whatsapp-actions';

const result = await verifyPhoneCode('CLOSET-123456');
if (result.success) {
  console.log('Phone verified!');
} else {
  console.error(result.error, result.errorCode);
}
```

### Sending Messages (with automatic window detection)

```typescript
import { sendWhatsAppMessage, sendTemplateMessage } from '@/lib/whatsapp/service';
import { isWithin24HourWindow, WHATSAPP_TEMPLATES } from '@/lib/whatsapp/templates';

// Check if within 24h window
const within24h = isWithin24HourWindow(user.last_whatsapp_message_at);

if (within24h) {
  // Can send rich message with images
  await sendWhatsAppMessage({
    to: user.whatsapp_phone,
    message: 'Your daily outfit is ready!',
    imageUrls: [outfitImageUrl],
    userId: user.id,
  });
} else {
  // Must use approved template
  await sendTemplateMessage(
    user.whatsapp_phone,
    WHATSAPP_TEMPLATES.DAILY_OUTFIT,
    {
      userName: user.display_name,
      weatherDescription: 'sunny, 75°F',
    }
  );
}
```

## Testing

### Unit Tests

```bash
# Run verification tests
npm test verification.test.ts

# Run template tests
npm test templates.test.ts
```

Tests cover:
- Code generation entropy
- Hash consistency and collision resistance
- Constant-time comparison
- Template payload building
- Meta error parsing
- 24h window detection
- Parameter validation

### Manual Testing Checklist

**Phone Verification Flow:**
- [ ] Enable WhatsApp in settings
- [ ] Request verification code
- [ ] Receive template message with code
- [ ] Submit code via UI - should succeed
- [ ] Try wrong code - should fail with attempt count
- [ ] Try same code twice - should fail "already used"
- [ ] Exhaust 5 attempts - should lock for 1 hour
- [ ] Text code to business number - should verify automatically

**Webhook Testing:**
- [ ] Send "STOP" → should disable WhatsApp
- [ ] Send "START" → should re-enable WhatsApp
- [ ] Text verification code → should auto-verify
- [ ] Random text → should log but not crash

**Cron Testing:**
- [ ] Daily outfit within 24h → receives rich message with images
- [ ] Daily outfit outside 24h → receives template message
- [ ] Weekly laundry (always outside window) → receives template
- [ ] Unverified user → does not receive messages

**Production Safety:**
- [ ] Deploy without WhatsApp credentials → should throw error (not simulate)
- [ ] Attempt simulation in production → should fail immediately

### Security Testing

**Verification Code Security:**
- [ ] Codes are 6 digits (100,000 - 999,999)
- [ ] Codes are cryptographically random (no patterns)
- [ ] Codes expire after 15 minutes
- [ ] Plaintext codes never logged or stored
- [ ] Hash includes server-side pepper (not guessable)
- [ ] Rate limits prevent brute force (5 attempts/hour)
- [ ] Constant-time comparison prevents timing attacks

**Webhook Security:**
- [ ] Signature verification with `X-Hub-Signature-256`
- [ ] Invalid signature rejected with 401
- [ ] Message deduplication prevents replay attacks
- [ ] No PII (phone numbers, message content) logged

## Monitoring & Logs

### Structured Logging

All logs use structured format (never log PII):

```typescript
// Good - structured, no PII
logger.info('whatsapp.phone_verified', { userId: 'uuid' });

// Bad - contains phone number
logger.info('Phone verified: +234801234567'); // DON'T DO THIS
```

### Key Metrics to Monitor

1. **Verification success rate**: % of codes successfully verified
2. **Verification abandonment**: Codes generated but never used
3. **Template send failures**: Outside 24h window but template errors
4. **Rate limit hits**: Users hitting attempt limits
5. **Webhook failures**: Invalid signatures or errors

### Alerts to Set Up

- Template approval rejected by Meta
- High rate of verification failures
- Webhook signature failures spike
- Production simulation attempt detected

## Troubleshooting

### "Outside 24h window" errors

**Cause:** User hasn't messaged in >24 hours, can't send free-form messages

**Solution:**
1. Check templates are approved in Meta Business Manager
2. Verify template names match exactly in code
3. System should auto-fallback to templates

### Verification codes not arriving

**Cause:** Template not approved or WhatsApp credentials invalid

**Solution:**
1. Check Meta Business Manager → Message Templates
2. Ensure `phone_verification` template is APPROVED
3. Verify `WHATSAPP_ACCESS_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID`
4. Check Meta API error logs

### "Rate limited" errors

**Cause:** User exceeded attempt limits or Meta rate limits

**Solution:**
- User rate limit: Wait 1 hour, try again
- Meta rate limit: Check messaging limits in Meta dashboard
- Consider upgrading WhatsApp Business tier

### Webhook not receiving messages

**Cause:** Webhook not configured or signature verification failing

**Solution:**
1. Configure webhook in Meta App Dashboard
2. Ensure `WHATSAPP_VERIFY_TOKEN` matches Meta config
3. Verify `WHATSAPP_APP_SECRET` is correct
4. Check webhook endpoint is publicly accessible
5. Review webhook logs for signature errors

## Migration Guide

### From simulation to production:

1. **Set up Meta WhatsApp Business Account**
   - Create Meta Business Account
   - Add WhatsApp Business API
   - Get System User permanent token

2. **Configure templates in Meta Business Manager**
   - Create 3 templates (verification, daily, weekly)
   - Submit for approval
   - Wait 24-48 hours for approval

3. **Set environment variables**
   ```bash
   WHATSAPP_ACCESS_TOKEN=xxx
   WHATSAPP_PHONE_NUMBER_ID=xxx
   WHATSAPP_VERIFY_TOKEN=xxx
   WHATSAPP_APP_SECRET=xxx
   WHATSAPP_VERIFICATION_PEPPER=$(openssl rand -hex 32)
   ```

4. **Configure webhook**
   - Point to: `https://yourdomain.com/api/webhook/whatsapp`
   - Use `WHATSAPP_VERIFY_TOKEN` for verification
   - Subscribe to `messages` field

5. **Run migrations**
   ```bash
   supabase db push
   ```

6. **Test verification flow**
   - Enable WhatsApp in a test account
   - Request verification code
   - Verify code received and validates

7. **Test cron jobs**
   - Trigger daily outfit cron manually
   - Verify template messages sent for unverified users
   - Verify rich messages sent for verified users

8. **Monitor for 7 days**
   - Check verification success rate
   - Monitor template send errors
   - Review webhook logs
   - Ensure no production simulation errors

## References

- [Meta WhatsApp Cloud API Docs](https://developers.facebook.com/docs/whatsapp/cloud-api)
- [WhatsApp Message Templates](https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-message-templates)
- [24-Hour Window Policy](https://developers.facebook.com/docs/whatsapp/pricing#opening-a-conversation)
- [Webhook Setup](https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks)
- [Error Codes Reference](https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes)
