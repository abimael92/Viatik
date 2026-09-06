"use server";

import { SignJWT, jwtVerify } from "jose";

import { env } from "@/env.mjs";
import { logger } from "@/lib/observability/logger";
import { createClient } from "@/lib/supabase/server-client";

/**
 * Short-lived, signed payload that powers the in-person QR auto-accept flow.
 * A JWT (HS256) encoding the owner's profile id + Viatik ID, valid for 5
 * minutes. When scanned, `processScannedConnectionToken` verifies the
 * signature and creates an immediately-`accepted` mutual connection, bypassing
 * the request inbox.
 */

const QR_TOKEN_PREFIX = "viatik-scan:";
const QR_TOKEN_TTL_SECONDS = 5 * 60;

type SignedTokenPayload = {
  sub: string; // profile_id of the code owner
  viatikId?: string;
  iat: number;
  exp: number;
};

function signingKey(): Uint8Array {
  if (!env.QR_SIGNING_SECRET) {
    throw new Error("QR_SIGNING_SECRET is not configured.");
  }
  return new TextEncoder().encode(env.QR_SIGNING_SECRET);
}

export type ConnectionQrPayload =
  | { success: true; token: string; qrValue: string; viatikId: string | null; expiresAt: string }
  | { success: false; error: string };

export async function getConnectionQrPayload(): Promise<ConnectionQrPayload> {
  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return { success: false, error: "Sign in again before sharing your code." };

    const { data: profile } = await supabase
      .from("profiles")
      .select("viatik_id")
      .eq("id", auth.user.id)
      .maybeSingle();
    const viatikId: string | null = profile?.viatik_id ?? null;

    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({ viatikId })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(auth.user.id)
      .setIssuedAt(now)
      .setExpirationTime(now + QR_TOKEN_TTL_SECONDS)
      .sign(signingKey());

    return {
      success: true,
      token,
      qrValue: `${QR_TOKEN_PREFIX}${token}`,
      viatikId,
      expiresAt: new Date((now + QR_TOKEN_TTL_SECONDS) * 1000).toISOString(),
    };
  } catch (error) {
    logger.error("Unable to generate QR connection payload", error instanceof Error ? error : new Error(String(error)));
    return { success: false, error: "We couldn't prepare your scan code right now." };
  }
}

export type ScanConnectionResult =
  | {
      success: true;
      profileId: string;
      connectionId: string;
      viatikId: string | null;
      displayName: string;
      avatarUrl: string | null;
      avatarSeed: string | null;
    }
  | { success: false; error: string };

async function parseToken(value: string): Promise<SignedTokenPayload | null> {
  try {
    const token = value.trim().startsWith(QR_TOKEN_PREFIX)
      ? value.trim().slice(QR_TOKEN_PREFIX.length)
      : value.trim();
    const { payload } = await jwtVerify(token, signingKey(), { algorithms: ["HS256"] });
    return payload as SignedTokenPayload;
  } catch {
    return null;
  }
}

export async function processScannedConnectionToken(value: string): Promise<ScanConnectionResult> {
  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return { success: false, error: "Sign in again before linking." };

    const payload = await parseToken(value);
    if (!payload?.sub) return { success: false, error: "This code is invalid or has expired. Ask them to refresh it." };
    if (payload.sub === auth.user.id) return { success: false, error: "That's your own code." };
    if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) {
      return { success: false, error: "This code has expired. Ask them to refresh it." };
    }

    const { data, error } = await supabase.rpc("accept_connection_from_qr", {
      p_recipient_id: payload.sub,
    });
    if (error) {
      logger.warn("Unable to accept connection from QR code", { code: error.code });
      if (error.code === "42704" || /not found/i.test(error.message)) {
        return { success: false, error: "No Viatik account was found for that code." };
      }
      return { success: false, error: "We couldn't connect you right now." };
    }

    const connection = (data as { connection?: Record<string, unknown> } | null)?.connection ?? null;
    const recipientSnap = (connection?.recipient_snapshot ?? {}) as Record<string, unknown>;
    return {
      success: true,
      profileId: payload.sub,
      connectionId: String(connection?.id ?? ""),
      viatikId: (recipientSnap.viatik_id ?? payload.viatikId ?? null) as string | null,
      displayName: String(recipientSnap.display_name ?? "Viatik user"),
      avatarUrl: (recipientSnap.avatar_url ?? null) as string | null,
      avatarSeed: (recipientSnap.avatar_seed ?? null) as string | null,
    };
  } catch (error) {
    logger.error("Unexpected QR scan processing error", error instanceof Error ? error : new Error(String(error)));
    return { success: false, error: "We couldn't connect you right now." };
  }
}
