"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  User,
  Bell,
  Shirt,
  MapPin,
  Clock,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Send,
  Download,
  Trash2,
  ShieldAlert,
  MessageSquare,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { Chip, toggleValue } from "@/components/ui/chip";
import { WhatsAppVerification } from "@/components/settings/whatsapp-verification";
import { ClosetIdCard } from "@/components/connect/closet-id-card";
import { STYLE_OPTIONS, OCCASION_OPTIONS, WEEKDAYS } from "@/lib/profile/options";
import { GENDER_OPTIONS } from "@/lib/validation/settings";
import {
  updateProfileSettingsAction,
  updateEmailPreferencesAction,
  sendTestEmailAction,
  sendTestWhatsAppAction,
  deleteAccountAction,
} from "@/app/(app)/settings/actions";

interface SettingsClientProps {
  userEmail: string;
  connectTag: string;
  initialProfile: {
    displayName: string;
    gender: string;
    preferredStyle: string[];
    commonOccasions: string[];
    location: string;
    timezone: string;
    rewearWornItems: boolean;
  };
  initialPreferences: {
    dailyEnabled: boolean;
    dailyTime: string;
    weeklyLaundryEnabled: boolean;
    weeklyLaundryDay: string;
    whatsappPhone?: string;
    whatsappDailyEnabled?: boolean;
    remindEmptyWardrobe?: boolean;
    whatsappVerified?: boolean;
  };
}

export function SettingsClient({
  userEmail,
  connectTag,
  initialProfile,
  initialPreferences,
}: SettingsClientProps) {
  const router = useRouter();
  // Profile State
  const [displayName, setDisplayName] = useState(initialProfile.displayName);
  const [gender, setGender] = useState(initialProfile.gender || "unisex");
  const [selectedStyles, setSelectedStyles] = useState<string[]>(initialProfile.preferredStyle);
  const [selectedOccasions, setSelectedOccasions] = useState<string[]>(initialProfile.commonOccasions);
  const [location, setLocation] = useState(initialProfile.location);
  const [rewearWornItems, setRewearWornItems] = useState(initialProfile.rewearWornItems);

  // Email & WhatsApp Preferences State
  const [dailyEnabled, setDailyEnabled] = useState(initialPreferences.dailyEnabled);
  const [dailyTime, setDailyTime] = useState(initialPreferences.dailyTime);
  const [weeklyLaundryEnabled, setWeeklyLaundryEnabled] = useState(initialPreferences.weeklyLaundryEnabled);
  const [weeklyLaundryDay, setWeeklyLaundryDay] = useState(initialPreferences.weeklyLaundryDay);
  const [whatsappPhone, setWhatsappPhone] = useState(initialPreferences.whatsappPhone || "");
  const [whatsappDailyEnabled, setWhatsappDailyEnabled] = useState(initialPreferences.whatsappDailyEnabled ?? false);
  const [remindEmptyWardrobe, setRemindEmptyWardrobe] = useState(initialPreferences.remindEmptyWardrobe ?? true);
  // The number as last SAVED on the server; verification always applies to this one.
  const [savedWhatsappPhone, setSavedWhatsappPhone] = useState(initialPreferences.whatsappPhone || "");
  const phoneDigits = (value: string) => value.replace(/\D/g, "");
  const whatsappNeedsSave = !savedWhatsappPhone || phoneDigits(whatsappPhone) !== phoneDigits(savedWhatsappPhone);

  // UI Feedback
  const [profilePending, startProfileTransition] = useTransition();
  const [emailPending, startEmailTransition] = useTransition();
  const [testPending, setTestPending] = useState<"daily" | "laundry" | null>(null);
  const [testWhatsAppPending, setTestWhatsAppPending] = useState(false);

  const [profileMessage, setProfileMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [emailMessage, setEmailMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    setProfileMessage(null);

    startProfileTransition(async () => {
      const res = await updateProfileSettingsAction({
        displayName,
        gender,
        preferredStyle: selectedStyles,
        commonOccasions: selectedOccasions,
        location: location || null,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        rewearWornItems,
      });

      if (res.ok) {
        setProfileMessage({ type: "success", text: res.message || "Profile updated!" });
      } else {
        setProfileMessage({ type: "error", text: res.error });
      }
    });
  };

  const handleSaveEmail = (e: React.FormEvent) => {
    e.preventDefault();
    setEmailMessage(null);

    startEmailTransition(async () => {
      const res = await updateEmailPreferencesAction({
        dailyEnabled,
        dailyTime,
        weeklyLaundryEnabled,
        weeklyLaundryDay,
        whatsappPhone,
        whatsappDailyEnabled,
        remindEmptyWardrobe,
      });

      if (res.ok) {
        setSavedWhatsappPhone(whatsappPhone);
        setEmailMessage({ type: "success", text: res.message || "Notification preferences saved!" });
        router.refresh();
      } else {
        setEmailMessage({ type: "error", text: res.error });
      }
    });
  };

  const handleSendTest = async (type: "daily" | "laundry") => {
    setTestPending(type);
    setEmailMessage(null);
    try {
      const res = await sendTestEmailAction(type);
      if (res.ok) {
        setEmailMessage({ type: "success", text: res.message || "Test email dispatched!" });
      } else {
        setEmailMessage({ type: "error", text: res.error });
      }
    } catch {
      setEmailMessage({ type: "error", text: "Delivery error while dispatching test email." });
    } finally {
      setTestPending(null);
    }
  };

  const handleSendWhatsAppTest = async () => {
    if (!whatsappPhone.trim()) {
      setEmailMessage({ type: "error", text: "Please enter your WhatsApp phone number first." });
      return;
    }
    setTestWhatsAppPending(true);
    setEmailMessage(null);
    try {
      const res = await sendTestWhatsAppAction(whatsappPhone);
      if (res.ok) {
        setEmailMessage({ type: "success", text: res.message || "Test WhatsApp message dispatched!" });
      } else {
        setEmailMessage({ type: "error", text: res.error });
      }
    } catch {
      setEmailMessage({ type: "error", text: "Delivery error while dispatching WhatsApp test." });
    } finally {
      setTestWhatsAppPending(false);
    }
  };

  return (
    <div className="space-y-10 max-w-4xl pb-16">
      {/* 1. Profile & Styling Persona */}
      <Card className="p-6 md:p-8 border-border bg-surface shadow-2xs space-y-6">
        <div className="flex items-center gap-3 border-b border-border pb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent">
            <User className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-serif text-xl font-medium tracking-tight text-foreground">
              Personal Styling Profile
            </h2>
            <p className="text-xs text-muted">
              Shapes how AI stylists recommend looks and curates model photoshoots.
            </p>
          </div>
        </div>

        <form onSubmit={handleSaveProfile} className="space-y-6">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field id="displayName" label="Display Name">
              <Input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
                required
              />
            </Field>

            <Field id="email" label="Account Email" hint="Your login and primary notification address.">
              <Input id="email" value={userEmail} disabled className="bg-surface-muted/60 text-muted" />
            </Field>
          </div>

          {/* Closet ID */}
          <div className="rounded-xl border border-border/80 bg-surface-muted/20 p-5 space-y-2">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Your Closet ID</h3>
                <p className="text-xs text-muted mt-0.5">
                  A unique identifier for your account. Share it with friends so they can find the right you when starting a conversation.
                </p>
              </div>
            </div>
            <ClosetIdCard closetId={connectTag} />
          </div>

          {/* Gender Expression */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground block">
              Styling & Model Gender Preference
            </label>
            <p className="text-xs text-muted mb-3">
              Guides whether AI photoshoot generation and lookbook recommendations focus on menswear, womenswear, or unisex silhouettes.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {GENDER_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setGender(opt.value)}
                  className={`p-3.5 rounded-xl border text-left text-xs font-medium transition-all ${
                    gender === opt.value
                      ? "border-accent bg-accent-soft/50 text-accent font-semibold ring-2 ring-accent/20"
                      : "border-border bg-surface-muted/30 text-foreground hover:bg-surface-muted"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Location for Weather */}
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              id="location"
              label="Default City / Location"
              hint="Used by the daily stylist to pull local weather (e.g. 'London', 'New York', 'Lagos')."
            >
              <div className="relative">
                <MapPin className="h-4 w-4 absolute left-3.5 top-3.5 text-muted pointer-events-none" />
                <Input
                  id="location"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. Paris, France"
                  className="pl-10"
                />
              </div>
            </Field>

            <Field
              id="timezone"
              label="Local Timezone"
              hint="Determines when your morning outfit emails are dispatched."
            >
              <div className="relative">
                <Clock className="h-4 w-4 absolute left-3.5 top-3.5 text-muted pointer-events-none" />
                <Input
                  id="timezone"
                  value={Intl.DateTimeFormat().resolvedOptions().timeZone}
                  disabled
                  className="pl-10 bg-surface-muted/60 text-muted"
                />
              </div>
            </Field>
          </div>

          {/* Style Aesthetics */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground block">
              Preferred Style Aesthetics (Pick up to 6)
            </label>
            <div className="flex flex-wrap gap-2 pt-1">
              {STYLE_OPTIONS.map((s) => (
                <Chip
                  key={s.value}
                  selected={selectedStyles.includes(s.value)}
                  onToggle={() => setSelectedStyles((prev) => toggleValue(prev, s.value))}
                >
                  {s.label}
                </Chip>
              ))}
            </div>
          </div>

          {/* Frequent Occasions */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground block">
              Common Occasions
            </label>
            <div className="flex flex-wrap gap-2 pt-1">
              {OCCASION_OPTIONS.map((o) => (
                <Chip
                  key={o.value}
                  selected={selectedOccasions.includes(o.value)}
                  onToggle={() => setSelectedOccasions((prev) => toggleValue(prev, o.value))}
                >
                  {o.label}
                </Chip>
              ))}
            </div>
          </div>

          {/* Rewear Preference */}
          <div className="rounded-xl border border-border/80 bg-surface-muted/30 p-4 flex items-start gap-3">
            <Shirt className="h-5 w-5 text-accent shrink-0 mt-0.5" />
            <div className="space-y-1 flex-1">
              <label htmlFor="rewear" className="text-sm font-medium text-foreground cursor-pointer block">
                Allow Re-wearing Worn Clothes Before Washing
              </label>
              <p className="text-xs text-muted">
                Items worn once remain eligible for outfit recommendations with a 24-hour breathing rest. If turned off, all worn items must be marked clean before being suggested again.
              </p>
            </div>
            <input
              type="checkbox"
              id="rewear"
              checked={rewearWornItems}
              onChange={(e) => setRewearWornItems(e.target.checked)}
              className="h-4 w-4 rounded border-border-strong text-accent focus:ring-accent mt-1"
            />
          </div>

          {profileMessage && (
            <div
              className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                profileMessage.type === "success"
                  ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                  : "bg-danger-soft text-danger border border-danger/30"
              }`}
            >
              {profileMessage.type === "success" ? (
                <CheckCircle2 className="h-4 w-4 shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 shrink-0" />
              )}
              <span>{profileMessage.text}</span>
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button type="submit" loading={profilePending} variant="primary" className="rounded-xl">
              Save Styling Profile
            </Button>
          </div>
        </form>
      </Card>

      {/* 2. Automated Notifications & Reminders */}
      <Card className="p-6 md:p-8 border-border bg-surface shadow-2xs space-y-6">
        <div className="flex items-center gap-3 border-b border-border pb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent">
            <Bell className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-serif text-xl font-medium tracking-tight text-foreground">
              Automated Notification Schedules
            </h2>
            <p className="text-xs text-muted">
              Get weather-aware outfit inspiration and proactive laundry reminders delivered via Email and WhatsApp.
            </p>
          </div>
        </div>

        <form onSubmit={handleSaveEmail} className="space-y-6">
          {/* Daily Morning Outfit */}
          <div className="rounded-xl border border-border/80 bg-surface-muted/20 p-5 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <Sparkles className="h-5 w-5 text-accent shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    Daily Morning Stylist Recommendation
                  </h3>
                  <p className="text-xs text-muted">
                    Receive your curated daily outfit with weather context and styling tips before your day begins.
                  </p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={dailyEnabled}
                onChange={(e) => setDailyEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-border-strong text-accent focus:ring-accent mt-0.5"
              />
            </div>

            {dailyEnabled && (
              <div className="pt-2 flex flex-col sm:flex-row sm:items-center gap-3 border-t border-border/60">
                <label className="text-xs font-medium text-foreground whitespace-nowrap">
                  Delivery Time (Local):
                </label>
                <Input
                  type="time"
                  value={dailyTime}
                  onChange={(e) => setDailyTime(e.target.value)}
                  className="max-w-[140px] text-xs h-9 min-h-0"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  loading={testPending === "daily"}
                  onClick={() => handleSendTest("daily")}
                  className="gap-1.5 text-xs rounded-lg"
                >
                  <Send className="h-3 w-3" />
                  Send Test Preview
                </Button>
              </div>
            )}
          </div>

          {/* Weekly Laundry Digest */}
          <div className="rounded-xl border border-border/80 bg-surface-muted/20 p-5 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <Shirt className="h-5 w-5 text-accent shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    Weekly Laundry Digest & Wash Station Alert
                  </h3>
                  <p className="text-xs text-muted">
                    Summarizes clothes ready to be washed, clean inventory counts, and laundry status ahead of the week.
                  </p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={weeklyLaundryEnabled}
                onChange={(e) => setWeeklyLaundryEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-border-strong text-accent focus:ring-accent mt-0.5"
              />
            </div>

            {weeklyLaundryEnabled && (
              <div className="pt-2 flex flex-col sm:flex-row sm:items-center gap-3 border-t border-border/60">
                <label className="text-xs font-medium text-foreground whitespace-nowrap">
                  Preferred Day:
                </label>
                <Select
                  value={weeklyLaundryDay}
                  onChange={(e) => setWeeklyLaundryDay(e.target.value)}
                  className="max-w-[160px] text-xs h-9 min-h-0"
                >
                  {WEEKDAYS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  loading={testPending === "laundry"}
                  onClick={() => handleSendTest("laundry")}
                  className="gap-1.5 text-xs rounded-lg"
                >
                  <Send className="h-3 w-3" />
                  Send Test Preview
                </Button>
              </div>
            )}
          </div>

          {/* WhatsApp Direct Morning Alerts */}
          <div className="rounded-xl border border-border/80 bg-surface-muted/20 p-5 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <MessageSquare className="h-5 w-5 text-accent shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    WhatsApp Daily Morning Outfit
                  </h3>
                  <p className="text-xs text-muted">
                    Receive your curated daily look with styling advice, weather context, and actual garment photos sent to your phone.
                  </p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={whatsappDailyEnabled}
                onChange={(e) => setWhatsappDailyEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-border-strong text-accent focus:ring-accent mt-0.5"
              />
            </div>

            {whatsappDailyEnabled && (
              <div className="pt-2 flex flex-col sm:flex-row sm:items-center gap-3 border-t border-border/60">
                <label className="text-xs font-medium text-foreground whitespace-nowrap">
                  WhatsApp Number:
                </label>
                <div className="flex-1 max-w-xs">
                  <Input
                    type="tel"
                    value={whatsappPhone}
                    onChange={(e) => setWhatsappPhone(e.target.value)}
                    placeholder="+234 801 234 5678"
                    className="text-xs h-9 min-h-0 bg-surface"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  loading={testWhatsAppPending}
                  onClick={handleSendWhatsAppTest}
                  className="gap-1.5 text-xs rounded-lg"
                >
                  <Send className="h-3 w-3" />
                  Send Test Preview
                </Button>
              </div>
            )}
            {whatsappDailyEnabled && whatsappPhone.trim() && (
              <WhatsAppVerification
                verified={Boolean(initialPreferences.whatsappVerified)}
                needsSave={whatsappNeedsSave}
              />
            )}
            <p className="text-[11px] text-muted">
              Enter with international country code (e.g. <span className="font-mono text-foreground">+234</span> for Nigeria, <span className="font-mono text-foreground">+44</span> for UK, <span className="font-mono text-foreground">+1</span> for US).
            </p>
          </div>

          {/* Empty Wardrobe Onboarding Reminder */}
          <div className="rounded-xl border border-border/80 bg-surface-muted/20 p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <Shirt className="h-5 w-5 text-accent shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    Empty Wardrobe Reminder
                  </h3>
                  <p className="text-xs text-muted mt-0.5">
                    Receive a friendly afternoon nudge on days when your wardrobe is empty. Stops automatically once you add your first item. Only sent during your first 30 days.
                  </p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={remindEmptyWardrobe}
                onChange={(e) => setRemindEmptyWardrobe(e.target.checked)}
                className="h-4 w-4 rounded border-border-strong text-accent focus:ring-accent mt-0.5"
                aria-label="Enable empty wardrobe reminder emails"
              />
            </div>
          </div>

          {emailMessage && (
            <div
              className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                emailMessage.type === "success"
                  ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                  : "bg-danger-soft text-danger border border-danger/30"
              }`}
            >
              {emailMessage.type === "success" ? (
                <CheckCircle2 className="h-4 w-4 shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 shrink-0" />
              )}
              <span>{emailMessage.text}</span>
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button type="submit" loading={emailPending} variant="primary" className="rounded-xl">
              Save Notification Schedules
            </Button>
          </div>
        </form>
      </Card>

      {/* Data Privacy & Danger Zone */}
      <Card className="p-6 md:p-8 border-border bg-surface shadow-2xs space-y-6">
        <div className="border-b border-border pb-4">
          <div className="flex items-center gap-2 text-foreground font-serif text-xl font-medium">
            <ShieldAlert className="h-5 w-5 text-accent" />
            <span>Data Privacy & Account Controls</span>
          </div>
          <p className="text-xs text-muted mt-1">
            Download your digital wardrobe records or manage your account.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
          {/* Export Data */}
          <div className="rounded-xl border border-border bg-surface-muted/60 p-5 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Download className="h-4 w-4 text-accent" />
              <span>Export Wardrobe Data</span>
            </div>
            <p className="text-xs text-muted leading-relaxed">
              Download a complete JSON export of all your garments, outfits, wear logs, and style settings.
            </p>
            <div className="pt-1">
              <a
                href="/api/account/export"
                download
                className="inline-flex items-center gap-2 rounded-xl border border-border-strong bg-surface hover:bg-surface-muted text-foreground px-4 py-2 text-xs font-medium transition-colors shadow-2xs"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Download My Data (JSON)</span>
              </a>
            </div>
          </div>

          {/* Delete Account */}
          <div className="rounded-xl border border-danger/30 bg-danger-soft/30 p-5 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-danger">
              <Trash2 className="h-4 w-4" />
              <span>Delete Account & Wardrobe</span>
            </div>
            <p className="text-xs text-muted leading-relaxed">
              Permanently wipe your wardrobe items, photos, saved outfits, and account profile. This action cannot be undone.
            </p>
            <div className="pt-1">
              <button
                type="button"
                onClick={() => {
                  if (confirm("Are you absolutely sure you want to permanently delete your ClosetAI account and all your wardrobe items? This cannot be undone.")) {
                    deleteAccountAction().then((res) => {
                      if (res.ok) {
                        router.push("/login");
                      } else {
                        alert(res.error || "Could not delete account.");
                      }
                    });
                  }
                }}
                className="inline-flex items-center gap-2 rounded-xl border border-danger/40 bg-danger text-white hover:bg-danger/90 px-4 py-2 text-xs font-medium transition-colors shadow-2xs"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Delete My Account Permanently</span>
              </button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
