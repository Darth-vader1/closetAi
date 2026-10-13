import { getAppUrl } from "@/lib/env";

export interface DailyOutfitEmailProps {
  displayName: string;
  outfitName: string;
  occasion: string;
  styleDescription: string;
  explanation: string;
  stylingTip: string;
  items: Array<{
    name: string;
    category: string;
    colour?: string | null;
  }>;
  weatherSummary?: string | null;
  unsubscribeToken?: string;
}

export function renderDailyOutfitHtml({
  displayName,
  outfitName,
  occasion,
  styleDescription,
  explanation,
  stylingTip,
  items,
  weatherSummary,
  unsubscribeToken,
}: DailyOutfitEmailProps): string {
  const appUrl = getAppUrl();
  const calendarUrl = `${appUrl}/calendar`;
  const stylistUrl = `${appUrl}/stylist`;
  const settingsUrl = `${appUrl}/settings`;
  const unsubscribeUrl = unsubscribeToken
    ? `${appUrl}/api/email/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}&type=daily`
    : settingsUrl;

  const itemsHtml = items
    .map(
      (item) => `
      <tr style="border-bottom: 1px solid #e7e5e4;">
        <td style="padding: 12px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
          <strong style="color: #1c1917; font-size: 14px;">${escapeHtml(item.name)}</strong>
          <div style="color: #78716c; font-size: 12px; margin-top: 2px;">
            ${escapeHtml(item.category)}${item.colour ? ` · ${escapeHtml(item.colour)}` : ""}
          </div>
        </td>
      </tr>
    `,
    )
    .join("");

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Look for Today: ${escapeHtml(outfitName)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #fafaf9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1c1917; line-height: 1.5;">
  <div style="max-width: 580px; margin: 40px auto; background-color: #ffffff; border: 1px solid #e7e5e4; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.03);">
    
    <!-- Header -->
    <div style="background-color: #1c1917; padding: 32px 36px; text-align: left;">
      <span style="display: inline-block; font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: #d6d3d1; margin-bottom: 8px;">CLOSET·AI DAILY STYLIST</span>
      <h1 style="margin: 0; font-family: Georgia, serif; font-size: 26px; font-weight: normal; color: #f5f5f4;">Good morning, ${escapeHtml(displayName)}</h1>
      ${weatherSummary ? `<p style="margin: 8px 0 0 0; font-size: 13px; color: #a8a29e;">🌤️ ${escapeHtml(weatherSummary)}</p>` : ""}
    </div>

    <!-- Body -->
    <div style="padding: 36px;">
      <div style="display: inline-block; padding: 4px 12px; background-color: #f5f5f4; border-radius: 20px; font-size: 12px; font-weight: 600; color: #57534e; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px;">
        ${escapeHtml(occasion || "Today's Recommended Look")}
      </div>
      <h2 style="margin: 0 0 10px 0; font-family: Georgia, serif; font-size: 24px; font-weight: normal; color: #1c1917;">
        ${escapeHtml(outfitName)}
      </h2>
      <p style="margin: 0 0 24px 0; font-size: 14px; color: #78716c; line-height: 1.6;">
        ${escapeHtml(styleDescription)}
      </p>

      <!-- Outfit Pieces Table -->
      <div style="background-color: #fafaf9; border: 1px solid #e7e5e4; border-radius: 12px; padding: 18px 24px; margin-bottom: 24px;">
        <h3 style="margin: 0 0 10px 0; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #78716c;">
          Selected from your wardrobe
        </h3>
        <table style="width: 100%; border-collapse: collapse;">
          ${itemsHtml}
        </table>
      </div>

      <!-- Stylist Explanation & Tip -->
      <div style="margin-bottom: 28px; padding-left: 16px; border-left: 3px solid #1c1917;">
        <p style="margin: 0 0 8px 0; font-size: 14px; color: #44403c; line-height: 1.6;">
          <strong>Stylist rationale:</strong> ${escapeHtml(explanation)}
        </p>
        <p style="margin: 0; font-size: 13px; color: #78716c; font-style: italic;">
          💡 <strong>Pro Tip:</strong> ${escapeHtml(stylingTip)}
        </p>
      </div>

      <!-- Primary Action -->
      <div style="text-align: center; margin: 32px 0 16px 0;">
        <a href="${calendarUrl}" style="display: inline-block; background-color: #1c1917; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 30px; font-size: 14px; font-weight: 500; letter-spacing: 0.5px;">
          View in Outfit Calendar →
        </a>
      </div>
      <div style="text-align: center;">
        <a href="${stylistUrl}" style="color: #78716c; font-size: 12px; text-decoration: underline;">
          Want to explore other options? Open 3D Stylist
        </a>
      </div>
    </div>

    <!-- Footer -->
    <div style="background-color: #f5f5f4; border-top: 1px solid #e7e5e4; padding: 24px 36px; text-align: center; font-size: 12px; color: #a8a29e;">
      <p style="margin: 0 0 8px 0;">You're receiving this daily morning brief based on your ClosetAI schedule settings.</p>
      <p style="margin: 0;">
        <a href="${settingsUrl}" style="color: #78716c; text-decoration: underline;">Manage Preferences</a>
        &nbsp;·&nbsp;
        <a href="${unsubscribeUrl}" style="color: #78716c; text-decoration: underline;">Unsubscribe</a>
      </p>
    </div>

  </div>
</body>
</html>
  `;
}

export interface WeeklyLaundryEmailProps {
  displayName: string;
  cleanCount: number;
  wornCount: number;
  dirtyCount: number;
  inLaundryCount: number;
  urgentItems: Array<{
    name: string;
    category: string;
    wearCount: number;
  }>;
  unsubscribeToken?: string;
}

export function renderWeeklyLaundryHtml({
  displayName,
  cleanCount,
  wornCount,
  dirtyCount,
  inLaundryCount,
  urgentItems,
  unsubscribeToken,
}: WeeklyLaundryEmailProps): string {
  const appUrl = getAppUrl();
  const laundryUrl = `${appUrl}/laundry`;
  const settingsUrl = `${appUrl}/settings`;
  const unsubscribeUrl = unsubscribeToken
    ? `${appUrl}/api/email/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}&type=weekly`
    : settingsUrl;

  const totalAttention = dirtyCount + inLaundryCount;

  const itemsHtml = urgentItems
    .map(
      (item) => `
      <tr style="border-bottom: 1px solid #e7e5e4;">
        <td style="padding: 10px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
          <strong style="color: #1c1917; font-size: 13px;">${escapeHtml(item.name)}</strong>
          <span style="color: #78716c; font-size: 12px;"> (${escapeHtml(item.category)})</span>
        </td>
        <td style="padding: 10px 0; text-align: right; color: #b45309; font-size: 12px; font-weight: 500;">
          ${item.wearCount} ${item.wearCount === 1 ? "wear" : "wears"}
        </td>
      </tr>
    `,
    )
    .join("");

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Weekly Laundry Digest · ClosetAI</title>
</head>
<body style="margin: 0; padding: 0; background-color: #fafaf9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1c1917; line-height: 1.5;">
  <div style="max-width: 580px; margin: 40px auto; background-color: #ffffff; border: 1px solid #e7e5e4; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.03);">
    
    <!-- Header -->
    <div style="background-color: #1c1917; padding: 32px 36px; text-align: left;">
      <span style="display: inline-block; font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: #d6d3d1; margin-bottom: 8px;">CLOSET·AI LAUNDRY BRIEF</span>
      <h1 style="margin: 0; font-family: Georgia, serif; font-size: 26px; font-weight: normal; color: #f5f5f4;">Weekly Laundry Digest</h1>
      <p style="margin: 8px 0 0 0; font-size: 13px; color: #a8a29e;">Hi ${escapeHtml(displayName)}, here is the status of your wardrobe for the week ahead.</p>
    </div>

    <!-- Body -->
    <div style="padding: 36px;">
      
      <!-- Stats Grid -->
      <table style="width: 100%; border-collapse: separate; border-spacing: 12px 0; margin-bottom: 28px;">
        <tr>
          <td style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 16px; text-align: center; width: 33%;">
            <div style="font-size: 26px; font-weight: 600; color: #15803d; font-family: Georgia, serif;">${cleanCount}</div>
            <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #166534; margin-top: 4px;">Clean & Ready</div>
          </td>
          <td style="background-color: #fefce8; border: 1px solid #fef08a; border-radius: 12px; padding: 16px; text-align: center; width: 33%;">
            <div style="font-size: 26px; font-weight: 600; color: #a16207; font-family: Georgia, serif;">${wornCount}</div>
            <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #854d0e; margin-top: 4px;">Worn (Wearable)</div>
          </td>
          <td style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 12px; padding: 16px; text-align: center; width: 33%;">
            <div style="font-size: 26px; font-weight: 600; color: #b91c1c; font-family: Georgia, serif;">${totalAttention}</div>
            <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #991b1b; margin-top: 4px;">Needs Wash</div>
          </td>
        </tr>
      </table>

      ${
        urgentItems.length > 0
          ? `
        <div style="background-color: #fafaf9; border: 1px solid #e7e5e4; border-radius: 12px; padding: 20px 24px; margin-bottom: 28px;">
          <h3 style="margin: 0 0 12px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #78716c;">
            Clothes waiting to be washed (${urgentItems.length})
          </h3>
          <table style="width: 100%; border-collapse: collapse;">
            ${itemsHtml}
          </table>
        </div>
      `
          : `
        <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 28px;">
          <p style="margin: 0; font-size: 14px; color: #166534; font-weight: 500;">
            ✨ Great news! You have no garments overdue for laundry.
          </p>
        </div>
      `
      }

      <!-- Action -->
      <div style="text-align: center; margin: 28px 0 10px 0;">
        <a href="${laundryUrl}" style="display: inline-block; background-color: #1c1917; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 30px; font-size: 14px; font-weight: 500;">
          Open Laundry Station →
        </a>
      </div>

    </div>

    <!-- Footer -->
    <div style="background-color: #f5f5f4; border-top: 1px solid #e7e5e4; padding: 24px 36px; text-align: center; font-size: 12px; color: #a8a29e;">
      <p style="margin: 0 0 8px 0;">Sent weekly to help keep your wardrobe rotating smoothly.</p>
      <p style="margin: 0;">
        <a href="${settingsUrl}" style="color: #78716c; text-decoration: underline;">Change notification schedule</a>
        &nbsp;·&nbsp;
        <a href="${unsubscribeUrl}" style="color: #78716c; text-decoration: underline;">Unsubscribe</a>
      </p>
    </div>

  </div>
</body>
</html>
  `;
}

export interface AuthEmailProps {
  type: "signup" | "recovery";
  displayName?: string;
  actionUrl: string;
  otpCode?: string;
}

export function renderAuthEmailHtml({
  type,
  displayName,
  actionUrl,
  otpCode,
}: AuthEmailProps): string {
  const isSignup = type === "signup";
  const badge = isSignup ? "CLOSET·AI ACCOUNT VERIFICATION" : "CLOSET·AI PASSWORD RESET";
  const heading = isSignup
    ? `Welcome to ClosetAI${displayName ? `, ${escapeHtml(displayName)}` : ""}`
    : "Reset your ClosetAI password";
  const bodyText = isSignup
    ? "Confirm your email address below to activate your digital wardrobe, 3D AI Stylist, and automated outfit briefings."
    : "We received a request to reset the password for your ClosetAI account. Click the button below to choose a new password.";
  const ctaLabel = isSignup ? "Verify Email Address →" : "Reset Password →";
  const footerNote = isSignup
    ? "If you didn't create a ClosetAI account, you can safely ignore this email."
    : "If you didn't request a password reset, you can safely ignore this email — your password will remain unchanged.";

  const otpSection = otpCode
    ? `
      <div style="margin: 28px 0; padding: 18px 20px; background-color: #fafaf9; border: 1px dashed #d6d3d1; border-radius: 12px; text-align: center;">
        <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; color: #78716c; margin-bottom: 8px;">
          Or enter this verification code in ClosetAI
        </div>
        <div style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 26px; font-weight: 700; letter-spacing: 6px; color: #1c1917;">
          ${escapeHtml(otpCode)}
        </div>
      </div>
    `
    : "";

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(heading)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #fafaf9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1c1917; line-height: 1.5;">
  <div style="max-width: 560px; margin: 40px auto; background-color: #ffffff; border: 1px solid #e7e5e4; border-radius: 16px; overflow: hidden;">
    <div style="background-color: #1c1917; padding: 32px 36px; text-align: left;">
      <span style="display: inline-block; font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: #d6d3d1; margin-bottom: 8px;">${badge}</span>
      <h1 style="margin: 0; font-family: Georgia, serif; font-size: 25px; font-weight: normal; color: #f5f5f4;">${heading}</h1>
    </div>
    <div style="padding: 36px;">
      <p style="margin: 0 0 28px 0; font-size: 15px; color: #44403c; line-height: 1.6;">
        ${bodyText}
      </p>
      <div style="text-align: center; margin: 32px 0;">
        <a href="${escapeHtml(actionUrl)}" style="display: inline-block; background-color: #1c1917; color: #ffffff; text-decoration: none; padding: 14px 30px; border-radius: 30px; font-size: 14px; font-weight: 500; letter-spacing: 0.4px;">
          ${ctaLabel}
        </a>
      </div>
      ${otpSection}
      <p style="margin: 24px 0 0 0; font-size: 12px; color: #78716c; word-break: break-all;">
        Or copy and paste this link into your browser:<br>
        <a href="${escapeHtml(actionUrl)}" style="color: #57534e;">${escapeHtml(actionUrl)}</a>
      </p>
    </div>
    <div style="background-color: #f5f5f4; border-top: 1px solid #e7e5e4; padding: 20px 36px; text-align: center; font-size: 12px; color: #78716c;">
      <p style="margin: 0;">${footerNote}</p>
    </div>
  </div>
</body>
</html>
  `;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

