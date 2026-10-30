import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const signedQrSchema = z
  .object({
    branch_id: z.number().int().positive(),
    timestamp: z.number().int().nonnegative(),
    signature: z.string().regex(/^[a-f0-9]{64}$/i),
  })
  .strict();

export type KioskQrPayload = z.infer<typeof signedQrSchema>;

export const KIOSK_QR_TTL_MS = 15_000;

function getSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET harus dikonfigurasi untuk QR kiosk.");
  }
  return secret;
}

function createSignature(branchId: number, timestamp: number) {
  return createHmac("sha256", getSecret())
    .update(`${branchId}.${timestamp}`)
    .digest("hex");
}

export function issueKioskQr(
  branchId: number,
  timestamp = Date.now(),
): KioskQrPayload {
  return {
    branch_id: branchId,
    timestamp,
    signature: createSignature(branchId, timestamp),
  };
}

export function verifyKioskQr(value: unknown) {
  const parsed = signedQrSchema.safeParse(value);
  if (!parsed.success) {
    return { valid: false as const, reason: "malformed" };
  }

  const payload = parsed.data;
  const expected = Buffer.from(
    createSignature(payload.branch_id, payload.timestamp),
    "hex",
  );
  const actual = Buffer.from(payload.signature, "hex");
  if (!timingSafeEqual(expected, actual)) {
    return { valid: false as const, reason: "invalid_signature" };
  }

  const age = Date.now() - payload.timestamp;
  if (age < 0 || age > KIOSK_QR_TTL_MS) {
    return { valid: false as const, reason: "expired" };
  }

  return { valid: true as const, payload };
}
