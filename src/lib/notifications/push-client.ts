"use client";

const PUSH_ENABLED_STORAGE_KEY = "closetai:push_notifications_enabled";
const PUSH_PROMPT_DISMISSED_KEY = "closetai:push_prompt_dismissed";

export type PushPermissionState =
  | "unsupported"
  | "ios-install-required"
  | "default"
  | "granted"
  | "denied";

export function isIOSNonStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent.toLowerCase();
  const isIOS =
    /iphone|ipad|ipod/.test(ua) ||
    (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);
  if (!isIOS) return false;

  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true;

  return !isStandalone;
}

export function getPushPermissionState(): PushPermissionState {
  if (typeof window === "undefined") {
    return "unsupported";
  }
  if (!("Notification" in window)) {
    if (isIOSNonStandalone()) {
      return "ios-install-required";
    }
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
  if (typeof window === "undefined") {
    return "unsupported";
  }
  if (!("Notification" in window)) {
    return isIOSNonStandalone() ? "ios-install-required" : "unsupported";
  }

  // IMPORTANT for mobile browsers (iOS Safari & Android Chrome):
  // Notification.requestPermission() MUST be called synchronously within the
  // user's tap gesture BEFORE any other async await, or mobile browsers will
  // drop the transient user-activation token and silently ignore the prompt.
  let result: NotificationPermission = "default";
  try {
    const permPromise = Notification.requestPermission();
    if (permPromise && typeof permPromise.then === "function") {
      result = await permPromise;
    }
  } catch {
    // Fallback for older callback-based implementations
    result = await new Promise<NotificationPermission>((resolve) => {
      Notification.requestPermission((perm) => resolve(perm));
    });
  }

  // Register/activate Service Worker after the gesture-sensitive permission prompt
  await registerPushServiceWorker();

  if (result === "granted") {
    setPushPreferenceEnabled(true);
  }
  return result;
}

async function getActiveServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }
  try {
    let reg = await navigator.serviceWorker.getRegistration("/");
    if (!reg) {
      reg = (await registerPushServiceWorker()) ?? undefined;
    }
    if (reg?.active) {
      return reg;
    }
    // Wait up to 3 seconds for navigator.serviceWorker.ready on first load
    const readyReg = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
    ]);
    return readyReg ?? reg ?? null;
  } catch {
    return null;
  }
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

  // 1. Always prefer ServiceWorkerRegistration.showNotification (required on Android & iOS PWA)
  try {
    const reg = await getActiveServiceWorkerRegistration();
    if (reg && "showNotification" in reg) {
      await reg.showNotification(title, {
        body,
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        tag,
        // renotify + vibrate ensure mobile devices chime/vibrate even if a previous
        // notification with the same conversation tag is still in the tray
        renotify: true,
        vibrate: [150, 75, 150],
        data: { url },
      } as NotificationOptions);
      return true;
    }
  } catch {
    // Fall back to Notification constructor on desktop if SW isn't active
  }

  // 2. Desktop fallback (note: Android Chrome forbids `new Notification()`)
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
