import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

import { EXPENSE_CATEGORIES } from "@/lib/constants";

/**
 * Reads a photographed or scanned receipt and returns the fields the receipt
 * form asks for.
 *
 * What comes back is a suggestion, never a saved record. The chief sees the
 * fields filled in and confirms them, because OCR on a crumpled gas-station
 * receipt is good but not perfect, and a wrong amount here would end up in a
 * QuickBooks expense import. Nothing on a receipt says which building the work
 * was for either, so the property stays a manual choice.
 */

/** Image types the model reads directly. HEIC is not one of them. */
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const PDF_TYPE = "application/pdf";

/*
 * Category is asked for as plain text listing the choices, not as a schema
 * enum: structured outputs do not enforce `enum`, so a value off the list would
 * fail the schema and lose the amount and date along with it. It is matched
 * against the real list below instead, and an unrecognised answer just means no
 * category.
 */
const CATEGORY_LIST = EXPENSE_CATEGORIES.join(", ");

function knownCategory(value: string | null): string | null {
  const match = EXPENSE_CATEGORIES.find(
    (category) => category.toLowerCase() === value?.trim().toLowerCase(),
  );
  return match ?? null;
}

const schema = z.object({
  merchant: z
    .string()
    .nullable()
    .describe('Store or vendor name as printed, e.g. "Home Depot". Null if not legible.'),
  date: z
    .string()
    .nullable()
    .describe("Transaction date printed on the receipt, as YYYY-MM-DD. Null if not legible."),
  amount: z
    .number()
    .nullable()
    .describe("Grand total paid, as a positive number. Null if not legible."),
  is_return: z
    .boolean()
    .describe("True only if this is a refund, return, credit or void rather than a purchase."),
  category: z
    .string()
    .nullable()
    .describe(
      `What was bought. Use exactly one of these words, copied verbatim: ${CATEGORY_LIST}. Null if nothing fits or the items are not legible.`,
    ),
  summary: z
    .string()
    .nullable()
    .describe("The main items bought, in at most eight words. Null if not legible."),
});

const PROMPT = `This is a credit card receipt a building engineer photographed for an expense log. Read it and fill in the fields.

- amount is the grand total actually paid, after tax and any discount — not a subtotal and not one line item. Report it as a positive number even for a refund.
- is_return is true only when the document is a refund, return, credit or void.
- date is the transaction date printed on the receipt. It is not today's date, and not a "valid until", due or warranty date.
- summary names the main items in at most eight words, with no trailing punctuation.
- Leave a field null when the receipt genuinely does not show it, or when it is too blurred or cut off to read. Do not guess, and do not infer a value from another field.`;

export type ScanFields = {
  merchant: string | null;
  date: string | null;
  amount: number | null;
  isReturn: boolean;
  category: string | null;
  summary: string | null;
};

export type ScanResult = { ok: true; fields: ScanFields } | { ok: false; reason: string };

/**
 * Whether the scanner is configured at all. Without an API key the form hides
 * the feature instead of offering a button that always fails.
 */
export function scanningAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

let client: Anthropic | null = null;

function anthropic(): Anthropic {
  if (!client) {
    // A chief is watching a spinner, so give up well before the SDK's own
    // ten-minute default and retry once rather than three times.
    client = new Anthropic({ timeout: 45_000, maxRetries: 1 });
  }
  return client;
}

function sourceBlock(bytes: Uint8Array, mediaType: string): Anthropic.ContentBlockParam | null {
  const data = Buffer.from(bytes).toString("base64");

  if (mediaType === PDF_TYPE) {
    return { type: "document", source: { type: "base64", media_type: PDF_TYPE, data } };
  }
  if (IMAGE_TYPES.includes(mediaType)) {
    return {
      type: "image",
      source: {
        type: "base64",
        media_type: mediaType as Anthropic.Base64ImageSource["media_type"],
        data,
      },
    };
  }
  return null;
}

/** A date the model read is only usable if it is a real, plausible calendar date. */
function usableDate(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return null;

  // A receipt pre-dating the company, or dated in the future, is a misread.
  const year = Number(value.slice(0, 4));
  const thisYear = new Date().getUTCFullYear();
  return year >= 2020 && year <= thisYear + 1 ? value : null;
}

function usableAmount(value: number | null): number | null {
  if (value === null || !Number.isFinite(value) || value === 0) return null;
  const amount = Math.round(Math.abs(value) * 100) / 100;
  return amount <= 1_000_000 ? amount : null;
}

function usableText(value: string | null, maxLength: number): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed.slice(0, maxLength);
}

export async function scanReceipt(bytes: Uint8Array, mediaType: string): Promise<ScanResult> {
  if (!scanningAvailable()) {
    return { ok: false, reason: "Receipt reading is not set up on this app yet." };
  }

  const block = sourceBlock(bytes, mediaType);
  if (!block) {
    return { ok: false, reason: "That file type can't be read. Use a JPG, PNG or PDF." };
  }

  let message;
  try {
    message = await anthropic().messages.parse({
      model: "claude-opus-5-5",
      // Headroom only: the answer is a handful of fields. Generous enough that
      // a long look at a blurred receipt cannot be cut off mid-JSON, and unused
      // room costs nothing.
      max_tokens: 8000,
      // Reading a receipt is not deep work, and the chief is waiting.
      output_config: { effort: "low", format: zodOutputFormat(schema) },
      messages: [{ role: "user", content: [block, { type: "text", text: PROMPT }] }],
    });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      return { ok: false, reason: "Receipt reading is not set up correctly. Tell an admin." };
    }
    if (error instanceof Anthropic.RateLimitError) {
      return { ok: false, reason: "Too many receipts at once. Wait a moment and try again." };
    }
    return { ok: false, reason: "Couldn't read that receipt. Fill the fields in by hand." };
  }

  const parsed = message.parsed_output;
  if (!parsed) {
    return { ok: false, reason: "Couldn't read that receipt. Fill the fields in by hand." };
  }

  return {
    ok: true,
    fields: {
      merchant: usableText(parsed.merchant, 120),
      date: usableDate(parsed.date),
      amount: usableAmount(parsed.amount),
      isReturn: parsed.is_return,
      category: knownCategory(parsed.category),
      summary: usableText(parsed.summary, 200),
    },
  };
}
