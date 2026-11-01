"use client";

import { useState } from "react";
import { Eye, Send, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_ANNOUNCEMENT_FEATURES,
  DEFAULT_ANNOUNCEMENT_SUPER_SUBJECT,
} from "@/lib/email/templates";

export function AdminBroadcastClient() {
  const [subject, setSubject] = useState(DEFAULT_ANNOUNCEMENT_SUPER_SUBJECT);
  const [heading, setHeading] = useState("What's new in ClosetAI ✨");
  const [intro, setIntro] = useState(
    "We've shipped a wave of upgrades to make styling, organizing, and sharing your digital wardrobe smarter and more personal than ever. Here is everything waiting inside your closet today:",
  );
  const [confirmedOnly, setConfirmedOnly] = useState(true);
  const [showPreview, setShowPreview] = useState(true);
  const [testEmail, setTestEmail] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  const handleSendTest = async () => {
    if (!testEmail || !testEmail.includes("@")) {
      setStatusMessage("Please enter a valid email for the test preview.");
      return;
    }

    setIsSending(true);
    setStatusMessage(null);
    try {
      const res = await fetch("/api/admin/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "test", testEmail, subject, heading, intro }),
      });
      const data = await res.json();
      if (res.ok) {
        setStatusMessage(`✅ Test email delivered to ${testEmail}! Check your inbox.`);
      } else {
        setStatusMessage(`❌ Error: ${data.error || "Failed to send preview."}`);
      }
    } catch {
      setStatusMessage("❌ Network error sending test email.");
    } finally {
      setIsSending(false);
    }
  };

  const handleBroadcastAll = async () => {
    const audienceLabel = confirmedOnly
      ? "all verified ClosetAI members"
      : "ALL registered accounts (including unverified emails)";
    if (!confirm(`Are you sure you want to broadcast this announcement email to ${audienceLabel}?`)) {
      return;
    }

    setIsSending(true);
    setStatusMessage(null);
    try {
      const res = await fetch("/api/admin/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "broadcast",
          subject,
          heading,
          intro,
          confirmedOnly,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        const extra = [
          data.failedCount ? `${data.failedCount} failed` : null,
          data.skippedCount ? `${data.skippedCount} unverified skipped` : null,
        ]
          .filter(Boolean)
          .join(" · ");
        setStatusMessage(
          `🎉 Broadcast complete! Delivered to ${data.sentCount} members${extra ? ` (${extra})` : ""}.`,
        );
      } else {
        setStatusMessage(`❌ Broadcast failed: ${data.error}`);
      }
    } catch {
      setStatusMessage("❌ Network error triggering broadcast.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <Card className="p-6 bg-surface border-border space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted">
              Email Subject
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-xs text-foreground focus:border-accent focus:outline-hidden"
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted">
              Header Title
            </label>
            <input
              type="text"
              value={heading}
              onChange={(e) => setHeading(e.target.value)}
              className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-xs text-foreground focus:border-accent focus:outline-hidden"
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted">
              Intro Paragraph
            </label>
            <textarea
              rows={2}
              value={intro}
              onChange={(e) => setIntro(e.target.value)}
              className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-xs text-foreground focus:border-accent focus:outline-hidden"
            />
          </div>
        </div>

        {statusMessage && (
          <div className="rounded-xl border border-accent/30 bg-accent-soft/40 p-3 text-xs text-foreground flex items-center gap-2">
            <Sparkles className="size-4 text-accent shrink-0" />
            <span>{statusMessage}</span>
          </div>
        )}

        {/* Included Feature Blocks Preview */}
        <div className="rounded-2xl border border-border/80 bg-background p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Eye className="size-4 text-accent" aria-hidden />
              <h4 className="text-xs font-semibold text-foreground">
                Included Feature Cards ({DEFAULT_ANNOUNCEMENT_FEATURES.length} highlights)
              </h4>
            </div>
            <button
              type="button"
              onClick={() => setShowPreview((v) => !v)}
              className="text-[11px] font-semibold text-accent hover:underline cursor-pointer"
            >
              {showPreview ? "Hide preview" : "Show preview"}
            </button>
          </div>

          {showPreview && (
            <div className="grid gap-2.5 sm:grid-cols-2 pt-1">
              {DEFAULT_ANNOUNCEMENT_FEATURES.map((f) => (
                <div
                  key={f.title}
                  className="rounded-xl border border-border bg-surface p-3 space-y-1"
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm" aria-hidden>
                      {f.icon}
                    </span>
                    {f.badge && (
                      <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
                        {f.badge}
                      </span>
                    )}
                    <span className="text-xs font-semibold text-foreground truncate">
                      {f.title}
                    </span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-muted line-clamp-3">
                    {f.description}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Test Email Section */}
        <div className="p-4 rounded-2xl border border-border/80 bg-surface-muted/40 space-y-3">
          <h4 className="text-xs font-medium text-foreground">1. Send a Test Preview</h4>
          <p className="text-[11px] text-muted">
            Send the complete HTML layout to your own email address first to inspect font sizes, deep links, and mobile display.
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="Enter your email (e.g. you@gmail.com)"
              className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground focus:border-accent focus:outline-hidden"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              loading={isSending}
              onClick={handleSendTest}
              className="text-xs px-4"
            >
              Send Test Preview
            </Button>
          </div>
        </div>

        {/* Live Broadcast Section */}
        <div className="pt-3 space-y-3 border-t border-border">
          <label className="flex items-center gap-2.5 text-xs text-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={confirmedOnly}
              onChange={(e) => setConfirmedOnly(e.target.checked)}
              className="size-4 accent-[var(--accent)]"
            />
            <span>
              Send only to <strong>verified email addresses</strong>{" "}
              <span className="text-muted">(Recommended to protect sender reputation)</span>
            </span>
          </label>

          <div className="flex items-center justify-between gap-4">
            <div>
              <h4 className="text-xs font-medium text-foreground">2. Broadcast to Members</h4>
              <p className="text-[11px] text-muted">
                Dispatches personalized HTML emails in rate-limited batches with unsubscribe links.
              </p>
            </div>
            <Button
              type="button"
              variant="primary"
              size="sm"
              loading={isSending}
              onClick={handleBroadcastAll}
              className="gap-2 text-xs shrink-0"
            >
              <Send className="size-3.5" />
              <span>Broadcast Email</span>
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
