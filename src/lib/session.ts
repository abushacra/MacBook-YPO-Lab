import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

import { env } from "@/lib/env";

const COOKIE_NAME = "kapa_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // Engineers stay signed in on their phone for a month.

export type SessionPayload = {
  /** technicians.id */
  sub: string;
  name: string;
  isAdmin: boolean;
  /** Expiry, seconds since epoch. */
  exp: number;
};

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function sign(data: string): string {
  return createHmac("sha256", env.sessionSecret).update(data).digest("base64url");
}

function encode(payload: SessionPayload): string {
  const body = base64url(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}

function decode(token: string): SessionPayload | null {
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;

  const expected = Buffer.from(sign(body));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as SessionPayload;
    if (typeof payload.sub !== "string" || typeof payload.exp !== "number") return null;
    if (payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function readSession(): Promise<SessionPayload | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  return token ? decode(token) : null;
}

/** Only callable from a Server Action or Route Handler. */
export async function startSession(technician: {
  id: string;
  name: string;
  is_admin: boolean;
}): Promise<void> {
  const payload: SessionPayload = {
    sub: technician.id,
    name: technician.name,
    isAdmin: technician.is_admin,
    exp: Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS,
  };

  (await cookies()).set(COOKIE_NAME, encode(payload), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function endSession(): Promise<void> {
  (await cookies()).delete(COOKIE_NAME);
}
