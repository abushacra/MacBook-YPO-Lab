import "server-only";

import { createClient } from "@supabase/supabase-js";

import { env } from "@/lib/env";
import type { Database } from "@/lib/database.types";

let client: ReturnType<typeof createClient<Database>> | null = null;

/**
 * Supabase client holding the project's secret key.
 *
 * Every table has RLS enabled with no policies, so this key is the only way
 * into the data. It must never reach the browser: this module is server-only
 * and nothing here is exported to a Client Component.
 */
export function db() {
  if (!client) {
    client = createClient<Database>(env.supabaseUrl, env.supabaseSecretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

export const PHOTO_BUCKET = "service-photos";
export const RECEIPT_BUCKET = "receipts";
export type Bucket = typeof PHOTO_BUCKET | typeof RECEIPT_BUCKET;

export function isBucket(value: string): value is Bucket {
  return value === PHOTO_BUCKET || value === RECEIPT_BUCKET;
}
