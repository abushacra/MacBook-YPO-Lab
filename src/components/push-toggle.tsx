"use client";

import { useCallback, useEffect, useState } from "react";

import { Spinner } from "@/components/submit-button";

type State = "checking" | "unsupported" | "needs-install" | "off" | "on" | "blocked";

/**
 * The VAPID public key travels as base64url and has to reach the browser as
 * bytes. An ArrayBuffer is returned rather than a Uint8Array because the typed
 * array is generic over its backing buffer and no longer satisfies BufferSource.
 */
function toApplicationServerKey(base64: string): ArrayBuffer {
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const binary = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));

  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return buffer;
}

/** iPhones only allow push once the app is opened from the home screen. */
function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  return /iPad|iPhone|iPod/.test(window.navigator.userAgent);
}

export function PushToggle() {
  const [state, setState] = useState<State>("checking");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setState(isIos() && !isStandalone() ? "needs-install" : "unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setState("blocked");
      return;
    }

    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    setState(subscription ? "on" : "off");
  }, []);

  /*
   * Reading the current push state means asking the browser — an external
   * system, answered asynchronously — so an effect is the right tool and the
   * resulting setState is the point, not an accident.
   */
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing with the Push API on mount
    void refresh();
  }, [refresh]);

  async function enable() {
    setBusy(true);
    setError(null);
    try {
      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "off");
        return;
      }

      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!key) {
        setError("Alerts are not configured on the server yet.");
        return;
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: toApplicationServerKey(key),
      });

      const response = await fetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });

      if (!response.ok) {
        await subscription.unsubscribe();
        setError("Could not turn on alerts. Try again.");
        return;
      }

      setState("on");
    } catch {
      setError("Could not turn on alerts on this device.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setError(null);
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await fetch("/api/push", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
      }
      setState("off");
    } catch {
      setError("Could not turn alerts off.");
    } finally {
      setBusy(false);
    }
  }

  if (state === "checking" || state === "unsupported") return null;

  if (state === "needs-install") {
    return (
      <p className="card px-4 py-3 text-sm text-muted">
        To get alerts on this iPhone, tap Share then{" "}
        <span className="font-semibold text-ink">Add to Home Screen</span>, and open the
        app from that icon.
      </p>
    );
  }

  if (state === "blocked") {
    return (
      <p className="card px-4 py-3 text-sm text-muted">
        Alerts are blocked for this app in your phone&apos;s settings. Allow
        notifications there to switch them on.
      </p>
    );
  }

  return (
    <div className="card flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold">
          {state === "on" ? "Alerts are on for this device" : "Alerts are off"}
        </p>
        <p className="text-xs text-muted">
          {error ?? "Get a notification when a shift or receipt is saved."}
        </p>
      </div>
      <button
        type="button"
        onClick={state === "on" ? disable : enable}
        disabled={busy}
        className={state === "on" ? "btn-secondary min-h-10 px-3 text-sm" : "btn-primary min-h-10 px-3 text-sm"}
      >
        {busy ? <Spinner /> : state === "on" ? "Turn off" : "Turn on"}
      </button>
    </div>
  );
}
