"use server";

import { cookies } from "next/headers";
import { createHmac, randomUUID } from "crypto";

import { env } from "@/env.mjs";

const COOKIE_NAME = "viatik_session";
const TOKEN_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function getSecret(): string {
  const secret = env.AUTH_SESSION_SECRET;
  if (!secret) {
    // Insecure dev fallback; the app will refuse to work in production
    // unless the secret is set, because it exposes session forgery.
    if (process.env.NODE_ENV === "production") {
      throw new Error("AUTH_SESSION_SECRET is required in production");
    }
    return "__dev_only_change_for_production__";
  }
  return secret;
}

export interface SessionToken {
  userId: string;
  issuedAt: number;
  sessionId: string;
}

function sign(value: string): string {
  return createHmac("sha256", getSecret()).update(value).digest("base64url");
}

export async function createSession(userId: string): Promise<void> {
  const cookieStore = await cookies();
  const issuedAt = Math.floor(Date.now() / 1000);
  const sessionId = randomUUID();
  const payload = JSON.stringify({ userId, issuedAt, sessionId });
  const encoded = Buffer.from(payload).toString("base64url");
  const signature = sign(encoded);
  const token = `${encoded}.${signature}`;

  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: TOKEN_MAX_AGE,
  });
}

export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export async function getSession(): Promise<SessionToken | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;

  const expected = sign(encoded);
  if (signature !== expected) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf-8")) as SessionToken;
    if (Date.now() / 1000 - payload.issuedAt > TOKEN_MAX_AGE) return null;
    return payload;
  } catch {
    return null;
  }
}
