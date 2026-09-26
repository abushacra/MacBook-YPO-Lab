import "server-only";

import webpush from "web-push";

import { db } from "@/lib/supabase";

/**
 * Web push alerts for oversight staff.
 *
 * Sending is always best effort: a dead subscription or a missing key must
 * never stop an engineer's shift from saving, so every failure here is
 * swallowed and the save carries on.
 */

let vapidReady: boolean | null = null;

function configureVapid(): boolean {
  if (vapidReady !== null) return vapidReady;

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;

  if (!publicKey || !privateKey || !subject) {
    vapidReady = false;
    return false;
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidReady = true;
  return true;
}

type Alert = {
  title: string;
  body: string;
  /** Where tapping the notification lands. */
  url: string;
  /** Who caused this — they are not told about their own action. */
  actorId: string;
  /** The chief this work belongs to, if any. */
  chiefId?: string | null;
};

/**
 * Alerts every active admin, plus the one chief the work belongs to. Other
 * chiefs are deliberately left out: a chief should hear about their own team,
 * not everyone else's.
 */
export async function alertOversight({ title, body, url, actorId, chiefId }: Alert): Promise<void> {
  try {
    if (!configureVapid()) return;

    const { data: admins } = await db()
      .from("technicians")
      .select("id")
      .eq("active", true)
      .eq("is_admin", true);

    const recipients = new Set((admins ?? []).map((row) => row.id));
    if (chiefId) recipients.add(chiefId);
    recipients.delete(actorId);
    if (recipients.size === 0) return;

    const { data: subscriptions } = await db()
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .in("technician_id", [...recipients]);

    if (!subscriptions || subscriptions.length === 0) return;

    const payload = JSON.stringify({ title, body, url });
    const stale: string[] = [];

    await Promise.all(
      subscriptions.map(async (subscription) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: { p256dh: subscription.p256dh, auth: subscription.auth },
            },
            payload,
          );
        } catch (error) {
          // 404/410 mean the browser threw the subscription away — so do we.
          const statusCode = (error as { statusCode?: number }).statusCode;
          if (statusCode === 404 || statusCode === 410) stale.push(subscription.id);
        }
      }),
    );

    if (stale.length > 0) {
      await db().from("push_subscriptions").delete().in("id", stale);
    }
  } catch {
    // Never let an alert failure surface as a failed save.
  }
}
