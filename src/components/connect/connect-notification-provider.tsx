"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  BellOff,
  BellRing,
  CheckCircle2,
  MessageSquare,
  Send,
  Share2,
  Smartphone,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  dismissPushPrompt,
  getPushPermissionState,
  isPushPreferenceEnabled,
  isPushPromptDismissed,
  registerPushServiceWorker,
  requestPushNotificationPermission,
  setPushPreferenceEnabled,
  showBrowserPushNotification,
  type PushPermissionState,
} from "@/lib/notifications/push-client";
import { Button } from "@/components/ui/button";

interface ToastAlert {
  id: string;
  title: string;
  body: string;
  href: string;
}

interface ConnectNotificationContextValue {
  permission: PushPermissionState;
  enabled: boolean;
  enablePush: () => Promise<PushPermissionState>;
  togglePush: (next: boolean) => Promise<void>;
  sendTestPush: () => Promise<boolean>;
}

const ConnectNotificationContext = createContext<ConnectNotificationContextValue>({
  permission: "default",
  enabled: false,
  enablePush: async () => "default",
  togglePush: async () => {},
  sendTestPush: async () => false,
});

export function useConnectNotifications() {
  return useContext(ConnectNotificationContext);
}

function subscribePushStore(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("closetai:push-pref-changed", onStoreChange);
  window.addEventListener("focus", onStoreChange);
  return () => {
    window.removeEventListener("closetai:push-pref-changed", onStoreChange);
    window.removeEventListener("focus", onStoreChange);
  };
}

export function ConnectNotificationProvider({
  currentUserId,
  children,
}: {
  currentUserId: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [toast, setToast] = useState<ToastAlert | null>(null);

  const permission = useSyncExternalStore<PushPermissionState>(
    subscribePushStore,
    () => getPushPermissionState(),
    () => "default",
  );

  const enabled = useSyncExternalStore<boolean>(
    subscribePushStore,
    () => getPushPermissionState() === "granted" && isPushPreferenceEnabled(),
    () => false,
  );

  // Register Service Worker on mount so it is already active before user taps Enable
  useEffect(() => {
    registerPushServiceWorker().catch(() => {});
  }, []);

  const enablePush = useCallback(async () => {
    const res = await requestPushNotificationPermission();
    window.dispatchEvent(new CustomEvent("closetai:push-pref-changed"));
    if (res === "granted") {
      await showBrowserPushNotification({
        title: "ClosetAI Push Notifications Enabled",
        body: "You'll now receive instant alerts when friends message you or share their closet.",
        url: "/connect",
        tag: "closetai-push-welcome",
        force: true,
      });
    }
    return res;
  }, []);

  const togglePush = useCallback(async (next: boolean) => {
    if (next) {
      const currentPerm = getPushPermissionState();
      if (currentPerm !== "granted") {
        await requestPushNotificationPermission();
      } else {
        setPushPreferenceEnabled(true);
      }
    } else {
      setPushPreferenceEnabled(false);
    }
    window.dispatchEvent(new CustomEvent("closetai:push-pref-changed"));
  }, []);

  const sendTestPush = useCallback(async () => {
    let currentPerm = getPushPermissionState();
    if (currentPerm !== "granted") {
      currentPerm = await requestPushNotificationPermission();
      window.dispatchEvent(new CustomEvent("closetai:push-pref-changed"));
    }
    if (currentPerm !== "granted") return false;

    const ok = await showBrowserPushNotification({
      title: "ClosetAI Connect",
      body: "Push notifications are active! You'll be notified when new messages arrive.",
      url: "/connect",
      tag: `closetai-test-push-${Date.now()}`,
      force: true,
    });

    if (ok) {
      setToast({
        id: `test-${Date.now()}`,
        title: "ClosetAI Connect (Test Alert)",
        body: "Push notifications are active on this device!",
        href: "/connect",
      });
    }
    return ok;
  }, []);

  // Global Realtime listener for new incoming messages & wardrobe grants
  useEffect(() => {
    if (!currentUserId) return;
    const supabase = createClient();

    const resolveSenderLabel = async (senderId: string): Promise<string> => {
      try {
        const { data } = await supabase.rpc("connect_resolve_partner_profiles", {
          p_user_ids: [senderId],
        });
        const rows = (data ?? []) as Array<{
          id: string;
          display_name: string | null;
          closet_id: string | null;
        }>;
        const match = rows[0];
        if (match?.display_name) {
          return match.closet_id
            ? `${match.display_name} (${match.closet_id})`
            : match.display_name;
        }
        if (match?.closet_id) return match.closet_id;
      } catch {
        // Ignore RPC error
      }
      return "Someone on ClosetAI";
    };

    const channel = supabase
      .channel(`connect-push:${currentUserId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "connect_messages",
        },
        async (payload) => {
          const row = payload.new as {
            id: string;
            conversation_id: string;
            sender_id: string;
            body: string;
          };
          if (!row || row.sender_id === currentUserId) return;

          const convPath = `/connect/${row.conversation_id}`;
          const isViewingThisConv =
            pathname === convPath &&
            typeof document !== "undefined" &&
            document.visibilityState === "visible";

          if (isViewingThisConv) return;

          const senderLabel = await resolveSenderLabel(row.sender_id);
          const preview =
            row.body && row.body.length > 90
              ? `${row.body.slice(0, 87)}…`
              : row.body || "Sent you a message";

          // 1. OS / Browser Push Notification
          await showBrowserPushNotification({
            title: `New message from ${senderLabel}`,
            body: preview,
            url: convPath,
            tag: `connect-msg-${row.conversation_id}`,
          });

          // 2. In-app toast banner if user is browsing another tab/section of ClosetAI
          if (pathname !== convPath) {
            setToast({
              id: row.id,
              title: senderLabel,
              body: preview,
              href: convPath,
            });
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "connect_wardrobe_grants",
          filter: `grantee_id=eq.${currentUserId}`,
        },
        async (payload) => {
          const row = payload.new as {
            id: string;
            owner_id: string;
            scope: string;
          };
          if (!row || row.owner_id === currentUserId) return;

          const ownerLabel = await resolveSenderLabel(row.owner_id);
          const targetUrl = `/connect/shared/${row.id}`;
          const msg = `${ownerLabel} shared their wardrobe with you.`;

          await showBrowserPushNotification({
            title: "Wardrobe Access Granted",
            body: msg,
            url: targetUrl,
            tag: `connect-grant-${row.id}`,
          });

          setToast({
            id: row.id,
            title: "Wardrobe Access Granted",
            body: msg,
            href: targetUrl,
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId, pathname]);

  // Auto-dismiss in-app toast after 6 seconds
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 6000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  return (
    <ConnectNotificationContext.Provider
      value={{ permission, enabled, enablePush, togglePush, sendTestPush }}
    >
      {children}

      {/* Floating in-app notification toast */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed right-4 top-16 z-50 flex w-[calc(100vw-2rem)] max-w-sm items-start gap-3 rounded-2xl border border-border bg-surface p-3.5 shadow-lg lg:top-6"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
            <MessageSquare className="size-4" aria-hidden />
          </span>
          <Link
            href={toast.href}
            onClick={() => setToast(null)}
            className="min-w-0 flex-1"
          >
            <p className="truncate text-xs font-semibold text-foreground">
              {toast.title}
            </p>
            <p className="mt-0.5 line-clamp-2 text-xs text-muted">
              {toast.body}
            </p>
          </Link>
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Dismiss notification"
            className="rounded-lg p-1 text-muted hover:bg-surface-muted hover:text-foreground"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
      )}
    </ConnectNotificationContext.Provider>
  );
}

/**
 * Compact prompt banner shown on /connect when browser push notifications
 * have not yet been enabled.
 */
export function ConnectPushPrompt() {
  const { permission, enabled, enablePush } = useConnectNotifications();
  const [dismissed, setDismissed] = useState(() => isPushPromptDismissed());
  const [busy, setBusy] = useState(false);

  if (permission === "unsupported" || enabled || dismissed) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface px-4 py-3 shadow-2xs">
      <div className="flex items-center gap-3 min-w-0">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
          {permission === "ios-install-required" ? (
            <Smartphone className="size-4" aria-hidden />
          ) : (
            <BellRing className="size-4" aria-hidden />
          )}
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-foreground">
            {permission === "ios-install-required"
              ? "Add ClosetAI to Home Screen for iPhone push alerts"
              : permission === "denied"
                ? "Browser notifications are blocked"
                : "Turn on push notifications for Connect"}
          </p>
          <p className="text-[0.72rem] text-muted">
            {permission === "ios-install-required" ? (
              <span className="inline-flex flex-wrap items-center gap-1">
                On iOS, tap <Share2 className="inline size-3 text-accent" />{" "}
                <strong>Share &rarr; Add to Home Screen</strong>, then open ClosetAI from your Home Screen to enable push alerts.
              </span>
            ) : permission === "denied" ? (
              "Allow notifications for this site in your browser's address-bar settings to get message alerts."
            ) : (
              "Get notified immediately when someone sends you a message or shares an outfit."
            )}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {permission === "default" || permission === "granted" ? (
          <Button
            type="button"
            size="sm"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              await enablePush();
              setBusy(false);
            }}
            className="h-8 rounded-xl px-3 text-xs"
          >
            Enable Push
          </Button>
        ) : null}
        <button
          type="button"
          onClick={() => {
            dismissPushPrompt();
            setDismissed(true);
          }}
          aria-label="Dismiss notification prompt"
          className="rounded-lg p-1.5 text-muted hover:bg-surface-muted hover:text-foreground"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}

/**
 * Settings section for managing browser/device Push Notifications and sending a test alert.
 */
export function PushNotificationSettingsControl() {
  const { permission, enabled, togglePush, sendTestPush } = useConnectNotifications();
  const [testing, setTesting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleToggle = async (next: boolean) => {
    setFeedback(null);
    await togglePush(next);
    const afterPerm = getPushPermissionState();
    if (next && afterPerm === "ios-install-required") {
      setFeedback(
        "On iPhone/iPad, tap Share → Add to Home Screen first, then open ClosetAI from your Home Screen to enable push notifications.",
      );
    } else if (next && afterPerm === "denied") {
      setFeedback(
        "Notifications are blocked by your browser. Tap the lock/tune icon in your browser address bar to allow notifications.",
      );
    } else if (next && afterPerm === "granted") {
      setFeedback("Push notifications enabled on this device.");
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setFeedback(null);
    const ok = await sendTestPush();
    setTesting(false);
    if (ok) {
      setFeedback("Test push notification sent to your device!");
    } else if (getPushPermissionState() === "ios-install-required") {
      setFeedback(
        "On iPhone/iPad, tap Share → Add to Home Screen first, then open ClosetAI from your Home Screen to test push notifications.",
      );
    } else {
      setFeedback(
        "Could not send push notification. Make sure notifications are allowed in your browser/OS settings.",
      );
    }
  };

  return (
    <div className="rounded-xl border border-border/80 bg-surface-muted/20 p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          {enabled ? (
            <Bell className="h-5 w-5 text-accent shrink-0 mt-0.5" />
          ) : (
            <BellOff className="h-5 w-5 text-muted shrink-0 mt-0.5" />
          )}
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-foreground">
                Browser &amp; Mobile Push Notifications (Connect)
              </h3>
              <span
                className={`rounded-full px-2 py-0.5 text-[0.65rem] font-semibold ${
                  enabled
                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                    : permission === "denied"
                      ? "bg-danger-soft text-danger"
                      : permission === "ios-install-required"
                        ? "bg-accent-soft text-accent"
                        : "bg-surface-muted text-muted"
                }`}
              >
                {permission === "unsupported"
                  ? "Unsupported"
                  : permission === "ios-install-required"
                    ? "Install App Required (iOS)"
                    : enabled
                      ? "Active"
                      : permission === "denied"
                        ? "Blocked in Browser"
                        : "Off"}
              </span>
            </div>
            <p className="text-xs text-muted mt-0.5">
              Receive instant push alerts on this device when someone sends you a Connect message, conversation request, or shares their wardrobe.
            </p>
            {permission === "ios-install-required" && (
              <p className="mt-2 rounded-lg border border-accent/25 bg-accent-soft/40 px-3 py-2 text-[0.72rem] text-foreground">
                <strong>iPhone / iPad requirement:</strong> Apple only allows web push notifications when ClosetAI is installed on your Home Screen. Tap <strong>Share &rarr; Add to Home Screen</strong> in Safari, then open ClosetAI from your Home Screen icon.
              </p>
            )}
          </div>
        </div>

        <input
          type="checkbox"
          checked={enabled}
          disabled={permission === "unsupported" || permission === "ios-install-required"}
          onChange={(e) => handleToggle(e.target.checked)}
          aria-label="Enable browser push notifications"
          className="h-4 w-4 rounded border-border-strong text-accent focus:ring-accent mt-0.5 accent-accent"
        />
      </div>

      <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-border/60">
        <div className="flex flex-wrap items-center gap-2">
          {!enabled &&
            permission !== "unsupported" &&
            permission !== "ios-install-required" && (
              <Button
                type="button"
                size="sm"
                variant="primary"
                onClick={() => handleToggle(true)}
                className="gap-1.5 text-xs rounded-lg"
              >
                <BellRing className="h-3.5 w-3.5" />
                Enable Push Notifications
              </Button>
            )}
          {permission !== "unsupported" && permission !== "ios-install-required" && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              loading={testing}
              onClick={handleTest}
              className="gap-1.5 text-xs rounded-lg"
            >
              <Send className="h-3 w-3" />
              Send Test Notification
            </Button>
          )}
        </div>

        {feedback && (
          <p className="flex items-center gap-1.5 text-xs text-foreground">
            <CheckCircle2 className="h-3.5 w-3.5 text-accent shrink-0" />
            <span>{feedback}</span>
          </p>
        )}
      </div>
    </div>
  );
}
