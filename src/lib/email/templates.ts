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
    imageUrl?: string | null;
  }>;
  weatherSummary?: string | null;
  unsubscribeToken?: string;
  date?: string;
  outfitId?: string;
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
  date,
}: DailyOutfitEmailProps): string {
  const appUrl = getAppUrl();
  const targetDate = date || new Date().toISOString().slice(0, 10);
  const outfitUrl = `${appUrl}/calendar?date=${encodeURIComponent(targetDate)}`;
  const stylistUrl = `${appUrl}/stylist`;
  const settingsUrl = `${appUrl}/settings`;
  const unsubscribeUrl = unsubscribeToken
    ? `${appUrl}/api/email/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}&type=daily`
    : settingsUrl;

  const itemsHtml = items
    .map(
      (item) => `
      <tr style="border-bottom: 1px solid #e7e5e4;">
        <td style="padding: 10px 0; width: 56px; vertical-align: middle;">
          ${
            item.imageUrl
              ? `<img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.name)}" width="52" height="52" style="width: 52px; height: 52px; object-fit: cover; border-radius: 8px; border: 1px solid #e7e5e4; display: block;" />`
              : `<div style="width: 52px; height: 52px; border-radius: 8px; background-color: #f5f5f4; border: 1px solid #e7e5e4; text-align: center; line-height: 52px; font-size: 20px;">👔</div>`
          }
        </td>
        <td style="padding: 10px 0 10px 14px; vertical-align: middle; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
          <strong style="color: #1c1917; font-size: 14px; display: block;">${escapeHtml(item.name)}</strong>
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
        <a href="${outfitUrl}" style="display: inline-block; background-color: #1c1917; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 30px; font-size: 14px; font-weight: 500; letter-spacing: 0.5px;">
          View &amp; Wear Today's Outfit →
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


export interface EmptyWardrobeReminderProps {
  displayName: string;
  unsubscribeToken?: string;
}

export function renderEmptyWardrobeReminderHtml({
  displayName,
  unsubscribeToken,
}: EmptyWardrobeReminderProps): string {
  const appUrl = getAppUrl();
  const addClothesUrl = `${appUrl}/wardrobe/new`;
  const settingsUrl = `${appUrl}/settings`;
  const unsubscribeUrl = unsubscribeToken
    ? `${appUrl}/api/email/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}&type=empty_wardrobe`
    : settingsUrl;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your ClosetAI wardrobe is empty — let's fix that</title>
</head>
<body style="margin: 0; padding: 0; background-color: #fafaf9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1c1917; line-height: 1.5;">
  <div style="max-width: 540px; margin: 40px auto; background-color: #ffffff; border: 1px solid #e7e5e4; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.03);">

    <!-- Header -->
    <div style="background-color: #1c1917; padding: 32px 36px; text-align: left;">
      <span style="display: inline-block; font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: #d6d3d1; margin-bottom: 8px;">CLOSET·AI</span>
      <h1 style="margin: 0; font-family: Georgia, serif; font-size: 24px; font-weight: normal; color: #f5f5f4;">
        Hi ${escapeHtml(displayName)}, your wardrobe is empty 👗
      </h1>
    </div>

    <!-- Body -->
    <div style="padding: 36px;">
      <p style="margin: 0 0 18px 0; font-size: 15px; color: #44403c; line-height: 1.65;">
        ClosetAI is ready to help you decide what to wear every day — but first it needs to know what's in your wardrobe.
      </p>
      <p style="margin: 0 0 18px 0; font-size: 15px; color: #44403c; line-height: 1.65;">
        Adding a few items takes less than two minutes. Photograph each piece with your phone, and ClosetAI's AI will suggest the name, colour and category for you.
      </p>
      <p style="margin: 0 0 32px 0; font-size: 15px; color: #44403c; line-height: 1.65;">
        Once you have a handful of tops, bottoms and shoes saved, you'll start receiving personalised outfit ideas every morning.
      </p>

      <!-- CTA -->
      <div style="text-align: center; margin: 0 0 12px 0;">
        <a href="${addClothesUrl}"
           style="display: inline-block; background-color: #9a4a2f; color: #fffaf5; text-decoration: none; padding: 15px 32px; border-radius: 30px; font-size: 15px; font-weight: 500; letter-spacing: 0.3px;">
          Add your first item →
        </a>
      </div>
      <div style="text-align: center;">
        <a href="${settingsUrl}" style="color: #78716c; font-size: 12px; text-decoration: underline;">
          Manage notification preferences
        </a>
      </div>
    </div>

    <!-- Steps hint -->
    <div style="background-color: #faf7f2; border-top: 1px solid #e7e5e4; padding: 24px 36px;">
      <p style="margin: 0 0 12px 0; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; color: #78716c;">
        How it works
      </p>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 6px 12px 6px 0; font-size: 13px; color: #57534e; vertical-align: top; width: 24px;">1.</td>
          <td style="padding: 6px 0; font-size: 13px; color: #57534e;">Photograph or upload a photo of each garment.</td>
        </tr>
        <tr>
          <td style="padding: 6px 12px 6px 0; font-size: 13px; color: #57534e; vertical-align: top;">2.</td>
          <td style="padding: 6px 0; font-size: 13px; color: #57534e;">AI suggests the name, colour and category — you confirm.</td>
        </tr>
        <tr>
          <td style="padding: 6px 12px 6px 0; font-size: 13px; color: #57534e; vertical-align: top;">3.</td>
          <td style="padding: 6px 0; font-size: 13px; color: #57534e;">Receive daily outfit suggestions built only from clean items.</td>
        </tr>
      </table>
    </div>

    <!-- Footer -->
    <div style="background-color: #f5f5f4; border-top: 1px solid #e7e5e4; padding: 20px 36px; text-align: center; font-size: 12px; color: #a8a29e;">
      <p style="margin: 0 0 6px 0;">You're receiving this because your ClosetAI wardrobe is currently empty.</p>
      <p style="margin: 0;">
        <a href="${settingsUrl}" style="color: #78716c; text-decoration: underline;">Settings</a>
        &nbsp;·&nbsp;
        <a href="${unsubscribeUrl}" style="color: #78716c; text-decoration: underline;">Stop these reminders</a>
      </p>
    </div>

  </div>
</body>
</html>`;
}

// ─── Feature Announcement Email Template ──────────────────────────────────────

export interface FeatureAnnouncementItem {
  title: string;
  badge?: string;
  description: string;
  icon?: string;
}

export interface FeatureAnnouncementEmailProps {
  displayName?: string | null;
  heading?: string;
  intro?: string;
  features?: FeatureAnnouncementItem[];
  ctaUrl?: string;
  ctaText?: string;
  unsubscribeToken?: string;
}

export const DEFAULT_ANNOUNCEMENT_FEATURES: FeatureAnnouncementItem[] = [
  {
    icon: "🎨",
    badge: "New",
    title: "AI Outfit Flatlay Studio",
    description:
      "Compose magazine-worthy flatlay collage boards using your actual wardrobe pieces. Drag, rotate, resize, adjust layers, toggle drop shadows, and switch layout presets (Editorial, Minimal, Streetwear). Export high-res PNG lookbooks or save boards directly into your wardrobe outfits.",
  },
  {
    icon: "💬",
    badge: "Connect",
    title: "Interactive AI Stylist Chat",
    description:
      "Chat 1-on-1 with @ClosetAI Stylist anytime in Connect. Share individual garments or full outfits directly into the conversation, ask for styling advice, and get instant, interactive outfit cards assembled straight from your clean clothes.",
  },
  {
    icon: "🌤️",
    badge: "Smart Weather",
    title: "Automatic Background Location & Weather",
    description:
      "No more manual location updates. ClosetAI now automatically syncs your local weather in the background, matching fabric warmth, layers, and rain suitability to your current forecast the moment you open the app.",
  },
  {
    icon: "📅",
    badge: "Planning",
    title: "Outfit Calendar & Weekly Schedule",
    description:
      "Plan your looks for the week ahead with our enhanced calendar view. Track daily outfit rotations, browse scheduled pieces, and confirm worn outfits with a single click to keep your wear history and laundry accurate.",
  },
  {
    icon: "✨",
    badge: "AI Studio",
    title: "Garment Beautification & Auto Cutout",
    description:
      "Turn casual floor or hanger photos into crisp catalog cutouts. The Product Studio flattens fabric creases, removes cluttered backgrounds, corrects tilt, and isolates garments cleanly for pristine boards and wardrobe grids.",
  },
  {
    icon: "🧳",
    badge: "Travel",
    title: "Smart Trip Packing Planner",
    description:
      "Heading on a getaway or business trip? Enter your destination, dates, and activities, and ClosetAI will generate an optimized, weather-ready capsule wardrobe with luggage weight estimates so you never overpack.",
  },
];


export function renderFeatureAnnouncementHtml({
  displayName,
  heading = "What's new in ClosetAI ✨",
  intro = "We've been hard at work adding new capabilities to make styling, organizing, and planning your outfits more effortless than ever. Here's a look at what's new:",
  features = DEFAULT_ANNOUNCEMENT_FEATURES,
  ctaUrl,
  ctaText = "Explore your closet now →",
  unsubscribeToken,
}: FeatureAnnouncementEmailProps = {}): string {
  const appUrl = getAppUrl();
  const targetCtaUrl = ctaUrl || `${appUrl}/wardrobe`;
  const settingsUrl = `${appUrl}/settings`;
  const unsubscribeUrl = unsubscribeToken
    ? `${appUrl}/api/email/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}&type=announcement`
    : settingsUrl;

  const featuresHtml = features
    .map(
      (f) => `
      <div style="margin-bottom: 18px; padding: 18px 20px; background-color: #fafaf9; border: 1px solid #e7e5e4; border-radius: 12px;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="width: 36px; vertical-align: top; font-size: 24px; line-height: 1; padding-top: 2px;">
              ${f.icon || "✨"}
            </td>
            <td style="padding-left: 12px; vertical-align: top;">
              <div style="margin-bottom: 4px;">
                ${
                  f.badge
                    ? `<span style="display: inline-block; padding: 2px 8px; background-color: #f5f5f4; border: 1px solid #e7e5e4; border-radius: 12px; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.8px; color: #9a4a2f; margin-right: 6px;">${escapeHtml(f.badge)}</span>`
                    : ""
                }
                <strong style="color: #1c1917; font-size: 15px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                  ${escapeHtml(f.title)}
                </strong>
              </div>
              <p style="margin: 0; font-size: 13px; color: #57534e; line-height: 1.55;">
                ${escapeHtml(f.description)}
              </p>
            </td>
          </tr>
        </table>
      </div>
    `,
    )
    .join("");

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(heading)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #fafaf9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1c1917; line-height: 1.5;">
  <div style="max-width: 580px; margin: 40px auto; background-color: #ffffff; border: 1px solid #e7e5e4; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.03);">

    <!-- Header -->
    <div style="background-color: #1c1917; padding: 36px 36px 32px; text-align: left;">
      <span style="display: inline-block; font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: #d6d3d1; margin-bottom: 8px;">CLOSET·AI UPDATE</span>
      <h1 style="margin: 0; font-family: Georgia, serif; font-size: 26px; font-weight: normal; color: #f5f5f4;">
        ${escapeHtml(heading)}
      </h1>
      ${
        displayName
          ? `<p style="margin: 8px 0 0 0; font-size: 14px; color: #a8a29e;">Hello, ${escapeHtml(displayName)}</p>`
          : ""
      }
    </div>

    <!-- Body -->
    <div style="padding: 36px;">
      <p style="margin: 0 0 24px 0; font-size: 15px; color: #44403c; line-height: 1.65;">
        ${escapeHtml(intro)}
      </p>

      <!-- Feature Cards -->
      ${featuresHtml}

      <!-- Main CTA Button -->
      <div style="text-align: center; margin: 32px 0 16px;">
        <a href="${escapeHtml(targetCtaUrl)}"
           style="display: inline-block; background-color: #9a4a2f; color: #fffaf5; text-decoration: none; padding: 15px 36px; border-radius: 30px; font-size: 15px; font-weight: 500; letter-spacing: 0.3px;">
          ${escapeHtml(ctaText)}
        </a>
      </div>
    </div>

    <!-- Footer -->
    <div style="background-color: #f5f5f4; border-top: 1px solid #e7e5e4; padding: 22px 36px; text-align: center; font-size: 12px; color: #a8a29e;">
      <p style="margin: 0 0 6px 0;">You're receiving this product update as a registered member of ClosetAI.</p>
      <p style="margin: 0;">
        <a href="${settingsUrl}" style="color: #78716c; text-decoration: underline;">Account Settings</a>
        &nbsp;·&nbsp;
        <a href="${unsubscribeUrl}" style="color: #78716c; text-decoration: underline;">Unsubscribe from updates</a>
      </p>
    </div>

  </div>
</body>
</html>`;
}


export interface PremiumWelcomeEmailProps {
  displayName?: string | null;
  planId: "monthly" | "annual";
  amountFormatted: string;
  reference: string;
  provider: "paystack" | "stripe" | "manual";
  expiresAt?: string | null;
}

export function renderPremiumWelcomeHtml({
  displayName,
  planId,
  amountFormatted,
  reference,
  provider,
  expiresAt,
}: PremiumWelcomeEmailProps): string {
  const appUrl = getAppUrl();
  const dashboardUrl = `${appUrl}/dashboard?upgraded=true`;
  const subscriptionSettingsUrl = `${appUrl}/settings/subscription`;
  const renewalDate = expiresAt
    ? new Date(expiresAt).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "Active (Auto-renewing)";

  const greetingName = displayName ? `, ${escapeHtml(displayName)}` : "";

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to ClosetAI Premium</title>
</head>
<body style="margin: 0; padding: 0; background-color: #fafaf9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1c1917; line-height: 1.5;">
  <div style="max-width: 580px; margin: 40px auto; background-color: #ffffff; border: 1px solid #e7e5e4; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.03);">
    
    <!-- Luxury Obsidian Header -->
    <div style="background-color: #1c1917; padding: 36px 36px 32px 36px; text-align: left; border-bottom: 2px solid #d4af37;">
      <span style="display: inline-block; font-size: 11px; text-transform: uppercase; letter-spacing: 2.5px; color: #d4af37; margin-bottom: 8px; font-weight: 600;">✦ CLOSET·AI VIP ATELIER ACTIVATED ✦</span>
      <h1 style="margin: 0; font-family: Georgia, serif; font-size: 26px; font-weight: normal; color: #f5f5f4;">Welcome to Premium${greetingName}</h1>
      <p style="margin: 8px 0 0 0; font-size: 14px; color: #d6d3d1; line-height: 1.5;">Your payment was confirmed. Your haute couture AI stylist and high-capacity digital atelier are officially active.</p>
    </div>

    <!-- Main Content -->
    <div style="padding: 36px;">
      
      <!-- Receipt Card -->
      <table style="width: 100%; border-collapse: separate; border-spacing: 0; border: 1px solid #e7e5e4; border-radius: 12px; background-color: #fafaf9; margin-bottom: 28px; overflow: hidden;">
        <thead>
          <tr>
            <th colspan="2" style="background-color: #f5f5f4; padding: 12px 18px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 1.2px; color: #78716c; border-bottom: 1px solid #e7e5e4;">
              Payment & Subscription Receipt
            </th>
          </tr>
        </thead>
        <tbody>
          <tr style="border-bottom: 1px solid #e7e5e4;">
            <td style="padding: 12px 18px; font-size: 13px; color: #78716c; width: 130px; border-bottom: 1px solid #e7e5e4;">Plan</td>
            <td style="padding: 12px 18px; font-size: 14px; font-weight: 600; color: #1c1917; border-bottom: 1px solid #e7e5e4;">
              ClosetAI Premium (${planId === "annual" ? "Annual · 17% Saved" : "Monthly"})
            </td>
          </tr>
          <tr style="border-bottom: 1px solid #e7e5e4;">
            <td style="padding: 12px 18px; font-size: 13px; color: #78716c; border-bottom: 1px solid #e7e5e4;">Amount Paid</td>
            <td style="padding: 12px 18px; font-size: 14px; font-weight: 600; color: #9a4a2f; border-bottom: 1px solid #e7e5e4;">
              ${escapeHtml(amountFormatted)}
            </td>
          </tr>
          <tr style="border-bottom: 1px solid #e7e5e4;">
            <td style="padding: 12px 18px; font-size: 13px; color: #78716c; border-bottom: 1px solid #e7e5e4;">Payment Method</td>
            <td style="padding: 12px 18px; font-size: 13px; font-weight: 500; color: #44403c; border-bottom: 1px solid #e7e5e4; text-transform: uppercase;">
              ${escapeHtml(provider.toUpperCase())}
            </td>
          </tr>
          <tr style="border-bottom: 1px solid #e7e5e4;">
            <td style="padding: 12px 18px; font-size: 13px; color: #78716c; border-bottom: 1px solid #e7e5e4;">Reference</td>
            <td style="padding: 12px 18px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 12px; color: #57534e; border-bottom: 1px solid #e7e5e4;">
              ${escapeHtml(reference)}
            </td>
          </tr>
          <tr>
            <td style="padding: 12px 18px; font-size: 13px; color: #78716c;">Next Renewal</td>
            <td style="padding: 12px 18px; font-size: 13px; color: #44403c;">
              ${escapeHtml(renewalDate)}
            </td>
          </tr>
        </tbody>
      </table>

      <!-- VIP Unlocked Features -->
      <h3 style="font-family: Georgia, serif; font-size: 17px; font-weight: normal; color: #1c1917; margin: 0 0 14px 0;">
        What&apos;s Now Unlocked in Your Studio
      </h3>

      <div style="margin-bottom: 28px;">
        <div style="padding: 10px 0; border-bottom: 1px solid #f5f5f4;">
          <strong style="color: #1c1917; font-size: 14px;">👗 Unlimited Wardrobe Cataloguing</strong>
          <div style="color: #78716c; font-size: 12px; margin-top: 2px;">Add every shirt, pant, shoe, and accessory without item capacity limits.</div>
        </div>
        <div style="padding: 10px 0; border-bottom: 1px solid #f5f5f4;">
          <strong style="color: #1c1917; font-size: 14px;">✨ 100 AI Outfits per Month</strong>
          <div style="color: #78716c; font-size: 12px; margin-top: 2px;">Daily tailored recommendations powered by high-context Gemini styling.</div>
        </div>
        <div style="padding: 10px 0; border-bottom: 1px solid #f5f5f4;">
          <strong style="color: #1c1917; font-size: 14px;">📸 30 Studio Beautifications / Month</strong>
          <div style="color: #78716c; font-size: 12px; margin-top: 2px;">Automatic neural crease removal, shadow flattening, and catalog-quality polish.</div>
        </div>
        <div style="padding: 10px 0;">
          <strong style="color: #1c1917; font-size: 14px;">💬 Priority AI Stylist Chat & Smart Packing</strong>
          <div style="color: #78716c; font-size: 12px; margin-top: 2px;">Interactive multi-turn styling consultations and trip luggage packing builders.</div>
        </div>
      </div>

      <!-- Main Action Button -->
      <div style="text-align: center; margin: 32px 0 12px 0;">
        <a href="${escapeHtml(dashboardUrl)}" style="display: inline-block; background-color: #9a4a2f; color: #ffffff; text-decoration: none; padding: 15px 36px; border-radius: 30px; font-size: 14px; font-weight: 600; letter-spacing: 0.3px; box-shadow: 0 4px 10px rgba(154, 74, 47, 0.25);">
          Open Your Studio &rarr;
        </a>
      </div>
      <p style="text-align: center; font-size: 12px; color: #78716c; margin: 0;">
        Your elevated daily wardrobe journey starts right now.
      </p>
    </div>

    <!-- Footer -->
    <div style="background-color: #f5f5f4; border-top: 1px solid #e7e5e4; padding: 22px 36px; text-align: center; font-size: 12px; color: #78716c;">
      <p style="margin: 0 0 6px 0;">
        Manage your subscription, change payment methods, or cancel anytime in
        <a href="${escapeHtml(subscriptionSettingsUrl)}" style="color: #9a4a2f; text-decoration: underline;">Settings → Subscription</a>.
      </p>
      <p style="margin: 0; color: #a8a29e;">
        © ${new Date().getFullYear()} ClosetAI. All rights reserved.
      </p>
    </div>
  </div>
</body>
</html>
  `;
}


export interface OnboardingWelcomeEmailProps {
  displayName?: string | null;
  preferredStyles?: string[] | null;
}

export function renderOnboardingWelcomeHtml({
  displayName,
  preferredStyles,
}: OnboardingWelcomeEmailProps): string {
  const appUrl = getAppUrl();
  const wardrobeNewUr = `${appUrl}/wardrobe/new`;
  const stylistUrl = `${appUrl}/stylist`;
  const settingsUrl = `${appUrl}/settings`;

  const greetingName = displayName ? `, ${escapeHtml(displayName)}` : "";
  const stylesText = preferredStyles && preferredStyles.length > 0
    ? ` tailored to your <strong>${escapeHtml(preferredStyles.slice(0, 3).join(", "))}</strong> aesthetic`
    : "";

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to ClosetAI — Your Wardrobe Quickstart</title>
</head>
<body style="margin: 0; padding: 0; background-color: #fafaf9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1c1917; line-height: 1.5;">
  <div style="max-width: 580px; margin: 40px auto; background-color: #ffffff; border: 1px solid #e7e5e4; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.03);">
    
    <!-- Warm Editorial Header -->
    <div style="background-color: #1c1917; padding: 36px 36px 32px 36px; text-align: left;">
      <span style="display: inline-block; font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: #d6d3d1; margin-bottom: 8px;">CLOSET·AI DIGITAL WARDROBE</span>
      <h1 style="margin: 0; font-family: Georgia, serif; font-size: 26px; font-weight: normal; color: #f5f5f4;">Your Closet is Ready${greetingName}</h1>
      <p style="margin: 8px 0 0 0; font-size: 14px; color: #d6d3d1; line-height: 1.5;">You&apos;ve completed onboarding${stylesText}. Here is your 3-step quickstart to effortless everyday styling.</p>
    </div>

    <!-- Body -->
    <div style="padding: 36px;">
      
      <!-- 3 Steps -->
      <table style="width: 100%; border-collapse: separate; border-spacing: 0; margin-bottom: 28px;">
        <tbody>
          <tr>
            <td style="padding: 12px 14px 12px 0; vertical-align: top; width: 32px;">
              <div style="width: 28px; height: 28px; border-radius: 50%; background-color: #1c1917; color: #ffffff; text-align: center; line-height: 28px; font-size: 12px; font-weight: bold;">1</div>
            </td>
            <td style="padding: 12px 0; vertical-align: top;">
              <strong style="color: #1c1917; font-size: 15px; display: block;">Snap your first 5 essential garments</strong>
              <p style="margin: 4px 0 0 0; font-size: 13px; color: #57534e; line-height: 1.5;">
                Take quick photos of a favorite shirt, trousers, and shoes against a plain background or on a hanger. 5 items is all ClosetAI needs to start suggesting complete looks.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 12px 14px 12px 0; vertical-align: top;">
              <div style="width: 28px; height: 28px; border-radius: 50%; background-color: #1c1917; color: #ffffff; text-align: center; line-height: 28px; font-size: 12px; font-weight: bold;">2</div>
            </td>
            <td style="padding: 12px 0; vertical-align: top;">
              <strong style="color: #1c1917; font-size: 15px; display: block;">Let AI organize and beautify</strong>
              <p style="margin: 4px 0 0 0; font-size: 13px; color: #57534e; line-height: 1.5;">
                Our Product Studio neural engine automatically crops, straightens, removes background shadows, and tags your clothes by category, color, and season.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 12px 14px 12px 0; vertical-align: top;">
              <div style="width: 28px; height: 28px; border-radius: 50%; background-color: #1c1917; color: #ffffff; text-align: center; line-height: 28px; font-size: 12px; font-weight: bold;">3</div>
            </td>
            <td style="padding: 12px 0; vertical-align: top;">
              <strong style="color: #1c1917; font-size: 15px; display: block;">Ask your Stylist for tomorrow&apos;s look</strong>
              <p style="margin: 4px 0 0 0; font-size: 13px; color: #57534e; line-height: 1.5;">
                Tap &ldquo;Ask Stylist&rdquo; or check your Outfit Calendar to receive tailored recommendations based on local weather and your preferred aesthetic.
              </p>
            </td>
          </tr>
        </tbody>
      </table>

      <!-- Main CTA -->
      <div style="text-align: center; margin: 32px 0 16px 0;">
        <a href="${escapeHtml(wardrobeNewUr)}" style="display: inline-block; background-color: #1c1917; color: #ffffff; text-decoration: none; padding: 14px 34px; border-radius: 30px; font-size: 14px; font-weight: 500; letter-spacing: 0.3px;">
          Add Your First Clothes →
        </a>
      </div>

      <div style="text-align: center;">
        <a href="${escapeHtml(stylistUrl)}" style="font-size: 13px; color: #9a4a2f; text-decoration: none; font-weight: 500;">
          Or chat with your AI Stylist &rarr;
        </a>
      </div>
    </div>

    <!-- Footer -->
    <div style="background-color: #f5f5f4; border-top: 1px solid #e7e5e4; padding: 22px 36px; text-align: center; font-size: 12px; color: #78716c;">
      <p style="margin: 0 0 6px 0;">
        You can configure your daily outfit email time and laundry reminders anytime in
        <a href="${escapeHtml(settingsUrl)}" style="color: #57534e; text-decoration: underline;">Settings</a>.
      </p>
      <p style="margin: 0; color: #a8a29e;">
        © ${new Date().getFullYear()} ClosetAI. All rights reserved.
      </p>
    </div>
  </div>
</body>
</html>
  `;
}


export interface AdminNewUserAlertProps {
  email: string;
  displayName?: string | null;
  userId?: string | null;
  createdAt?: string | null;
}

export function renderAdminNewUserAlertHtml({
  email,
  displayName,
  userId,
  createdAt,
}: AdminNewUserAlertProps): string {
  const appUrl = getAppUrl();
  const adminUrl = `${appUrl}/admin/users`;
  const formattedDate = createdAt
    ? new Date(createdAt).toUTCString()
    : new Date().toUTCString();

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New User Registration: ${escapeHtml(displayName || email)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #fafaf9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1c1917; line-height: 1.5;">
  <div style="max-width: 580px; margin: 40px auto; background-color: #ffffff; border: 1px solid #e7e5e4; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.03);">
    
    <!-- Header -->
    <div style="background-color: #1c1917; padding: 32px 36px; text-align: left;">
      <span style="display: inline-block; font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: #d6d3d1; margin-bottom: 8px;">CLOSET·AI ADMIN NOTIFICATION</span>
      <h1 style="margin: 0; font-family: Georgia, serif; font-size: 26px; font-weight: normal; color: #f5f5f4;">New User Signed Up</h1>
      <p style="margin: 8px 0 0 0; font-size: 13px; color: #a8a29e;">A new member has joined ClosetAI.</p>
    </div>

    <!-- Body -->
    <div style="padding: 36px;">
      <p style="margin: 0 0 24px 0; font-size: 15px; color: #44403c; line-height: 1.6;">
        Here are the registration details for the new user:
      </p>

      <!-- User Details Card -->
      <table style="width: 100%; border-collapse: separate; border-spacing: 0; border: 1px solid #e7e5e4; border-radius: 12px; background-color: #fafaf9; margin-bottom: 28px; overflow: hidden;">
        <tbody>
          <tr style="border-bottom: 1px solid #e7e5e4;">
            <td style="padding: 14px 18px; font-size: 13px; font-weight: 600; color: #78716c; width: 120px; border-bottom: 1px solid #e7e5e4;">Name</td>
            <td style="padding: 14px 18px; font-size: 14px; font-weight: 500; color: #1c1917; border-bottom: 1px solid #e7e5e4;">
              ${escapeHtml(displayName || "Not specified")}
            </td>
          </tr>
          <tr style="border-bottom: 1px solid #e7e5e4;">
            <td style="padding: 14px 18px; font-size: 13px; font-weight: 600; color: #78716c; border-bottom: 1px solid #e7e5e4;">Email</td>
            <td style="padding: 14px 18px; font-size: 14px; font-weight: 500; color: #1c1917; border-bottom: 1px solid #e7e5e4;">
              <a href="mailto:${escapeHtml(email)}" style="color: #92400e; text-decoration: none;">${escapeHtml(email)}</a>
            </td>
          </tr>
          ${userId ? `
          <tr style="border-bottom: 1px solid #e7e5e4;">
            <td style="padding: 14px 18px; font-size: 13px; font-weight: 600; color: #78716c; border-bottom: 1px solid #e7e5e4;">User ID</td>
            <td style="padding: 14px 18px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 12px; color: #57534e; border-bottom: 1px solid #e7e5e4;">
              ${escapeHtml(userId)}
            </td>
          </tr>
          ` : ""}
          <tr style="border-bottom: 1px solid #e7e5e4;">
            <td style="padding: 14px 18px; font-size: 13px; font-weight: 600; color: #78716c; border-bottom: 1px solid #e7e5e4;">Plan</td>
            <td style="padding: 14px 18px; font-size: 13px; font-weight: 600; color: #047857; border-bottom: 1px solid #e7e5e4;">
              Free Tier (Freemium)
            </td>
          </tr>
          <tr>
            <td style="padding: 14px 18px; font-size: 13px; font-weight: 600; color: #78716c;">Timestamp</td>
            <td style="padding: 14px 18px; font-size: 13px; color: #57534e;">
              ${escapeHtml(formattedDate)}
            </td>
          </tr>
        </tbody>
      </table>

      <!-- CTA -->
      <div style="text-align: center; margin: 32px 0 16px 0;">
        <a href="${escapeHtml(adminUrl)}" style="display: inline-block; background-color: #1c1917; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 30px; font-size: 14px; font-weight: 500; letter-spacing: 0.3px;">
          View Users in Admin Dashboard →
        </a>
      </div>
      <p style="text-align: center; font-size: 12px; color: #78716c; margin: 0;">
        Manage roles, monitor feature usage, and view subscriber records.
      </p>
    </div>

    <!-- Footer -->
    <div style="background-color: #f5f5f4; border-top: 1px solid #e7e5e4; padding: 20px 36px; text-align: center; font-size: 12px; color: #78716c;">
      <p style="margin: 0;">
        You received this email because you are configured as an administrator for ClosetAI.
      </p>
    </div>
  </div>
</body>
</html>
  `;
}
