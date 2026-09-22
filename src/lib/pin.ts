import "server-only";

import { type ScryptOptions, randomBytes, scrypt, timingSafeEqual } from "node:crypto";

// Hand-wrapped rather than promisify()'d: promisify collapses scrypt to its
// 3-argument overload, which drops the cost parameters.
function scryptAsync(
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, options, (error, derivedKey) =>
      error ? reject(error) : resolve(derivedKey),
    );
  });
}

const KEY_LENGTH = 32;
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 } as const;

export const PIN_LENGTH = 4;

export function isValidPinFormat(pin: string): boolean {
  return new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin);
}

/** Rejects PINs that are trivially guessable, e.g. 0000 or 1234. */
export function pinWeakness(pin: string): string | null {
  if (/^(\d)\1+$/.test(pin)) {
    return "Pick a PIN that isn't the same digit four times.";
  }
  const ascending = "0123456789";
  const descending = "9876543210";
  if (ascending.includes(pin) || descending.includes(pin)) {
    return "Pick a PIN that isn't four digits in a row.";
  }
  return null;
}

export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scryptAsync(pin, salt, KEY_LENGTH, SCRYPT_PARAMS);
  return `s1$${salt.toString("base64")}$${derived.toString("base64")}`;
}

export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  const [scheme, saltB64, hashB64] = stored.split("$");
  if (scheme !== "s1" || !saltB64 || !hashB64) return false;

  const expected = Buffer.from(hashB64, "base64");
  const derived = await scryptAsync(
    pin,
    Buffer.from(saltB64, "base64"),
    expected.length,
    SCRYPT_PARAMS,
  );

  return derived.length === expected.length && timingSafeEqual(derived, expected);
}
