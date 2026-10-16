"use client";

const PUSH_ENABLED_STORAGE_KEY = "closetai:push_notifications_enabled";
const PUSH_PROMPT_DISMISSED_KEY = "closetai:push_prompt_dismissed";

export type PushPermissionState = "unsupported" | "default" | "granted" | "denied";

export function getPushPermissionState(): PushPermissionState {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  return Notification.permission;
}

export function isPushPreferenceEnabled(): boolean {
  if (typeof window === "undefined") return false;
  const raw = window.localStorage.getItem(PUSH_ENABLED_STORAGE_KEY);
  // Default to true once browser permission is granted unless user explicitly turned it off
  if (raw === null) {
    return getPushPermissionState() === "granted";
  }
  return raw === "true";
}

export function setPushPreferenceEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PUSH_ENABLED_STORAGE_KEY, enabled ? "true" : "false");
  window.dispatchEvent(new CustomEvent("closetai:push-pref-changed"));
}

export function isPushPromptDismissed(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(PUSH_PROMPT_DISMISSED_KEY) === "true";
}

export function dismissPushPrompt(): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PUSH_PROMPT_DISMISSED_KEY, "true");
}

export async function registerPushServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }
  try {
    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    return reg;
  } catch {
    return null;
  }
}

export async function requestPushNotificationPermission(): Promise<PushPermissionState> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }

  await registerPushServiceWorker();
  const result = await Notification.requestPermission();
  if (result === "granted") {
    setPushPreferenceEnabled(true);
  }
  return result;
}

export async function showBrowserPushNotification(opts: {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  force?: boolean;
}): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return false;
  }
  if (Notification.permission !== "granted") {
    return false;
  }
  if (!opts.force && !isPushPreferenceEnabled()) {
    return false;
  }

  const title = opts.title;
  const body = opts.body;
  const url = opts.url ?? "/connect";
  const tag = opts.tag ?? `closetai-${Date.now()}`;

  try {
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.getRegistration("/");
      if (reg && "showNotification" in reg) {
        await reg.showNotification(title, {
          body,
          icon: "/icon-192.png",
          badge: "/icon-192.png",
          tag,
          data: { url },
        });
        return true;
      }
    }
  } catch {
    // Fall back to Notification constructor below
  }

  try {
    const n = new Notification(title, {
      body,
      icon: "/icon-192.png",
      tag,
    });
    n.onclick = () => {
      window.focus();
      window.location.href = url;
      n.close();
    };
    return true;
  } catch {
    return false;
  }
}
