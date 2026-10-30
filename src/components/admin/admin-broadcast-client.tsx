"use client";

import { useState } from "react";
import { Send, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function AdminBroadcastClient() {
  const [subject, setSubject] = useState("What's new in ClosetAI: Flatlay Studio, Live Stylist Chat & Smart Calendar ✨");
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
      // Direct call to send single test preview
      const res = await fetch("/api/admin/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "test", testEmail, subject }),
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
    if (!confirm("Are you sure you want to broadcast this announcement email to ALL registered users?")) {
      return;
    }

    setIsSending(true);
    setStatusMessage(null);
    try {
      const res = await fetch("/api/admin/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "broadcast", subject }),
      });
      const data = await res.json();
      if (res.ok) {
        setStatusMessage(`🎉 Broadcast complete! Sent to ${data.sentCount} registered users.`);
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
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted">Email Subject</label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-xs text-foreground focus:border-accent focus:outline-hidden"
          />
        </div>

        {statusMessage && (
          <div className="rounded-xl border border-accent/30 bg-accent-soft/40 p-3 text-xs text-foreground flex items-center gap-2">
            <Sparkles className="size-4 text-accent shrink-0" />
            <span>{statusMessage}</span>
          </div>
        )}

        {/* Test Email Section */}
        <div className="p-4 rounded-2xl border border-border/80 bg-surface-muted/40 space-y-3">
          <h4 className="text-xs font-medium text-foreground">1. Send a Test Preview</h4>
          <p className="text-[11px] text-muted">
            Send the complete HTML layout to your own email address to inspect font sizes, cards, and mobile display.
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
        <div className="pt-2 flex items-center justify-between border-t border-border">
          <div>
            <h4 className="text-xs font-medium text-foreground">2. Broadcast to All Members</h4>
            <p className="text-[11px] text-muted">Dispatches in batches with rate-limiting protection.</p>
          </div>
          <Button
            type="button"
            variant="primary"
            size="sm"
            loading={isSending}
            onClick={handleBroadcastAll}
            className="gap-2 text-xs"
          >
            <Send className="size-3.5" />
            <span>Broadcast Email</span>
          </Button>
        </div>
      </Card>
    </div>
  );
}
