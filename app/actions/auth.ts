"use server";

import { createClient } from "@/lib/supabase/server-client";
import {
  createRegistrationOptions,
  finishRegistration,
  createAuthenticationOptions,
  finishAuthentication,
} from "@/lib/auth/webauthn";
import { createSession } from "@/lib/auth/session";

export type ActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string };

export async function sendPhoneOtp(phone: string): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithOtp({
      phone,
      options: { channel: "sms" },
    });
    if (error) return { success: false, error: error.message };
    return { success: true, data: undefined };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}

export async function verifyPhoneOtp(
  phone: string,
  token: string
): Promise<ActionResult<{ userId: string }>> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.verifyOtp({
      phone,
      token,
      type: "sms",
    });
    if (error) return { success: false, error: error.message };
    const userId = data.user?.id;
    if (!userId) return { success: false, error: "No user returned" };
    return { success: true, data: { userId } };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}

export async function beginPasskeyRegistration(
  userId: string,
  userName: string
): Promise<ActionResult<Record<string, unknown>>> {
  try {
    const options = await createRegistrationOptions(userId, userName);
    return { success: true, data: options as unknown as Record<string, unknown> };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}

export async function finishPasskeyRegistration(
  userId: string,
  attestation: Record<string, unknown>
): Promise<ActionResult> {
  try {
    const verification = await finishRegistration(userId, attestation);
    if (!verification.verified) return { success: false, error: "Passkey verification failed" };
    return { success: true, data: undefined };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}

export async function beginPasskeyAuthentication(
  userName: string
): Promise<ActionResult<Record<string, unknown>>> {
  try {
    const options = await createAuthenticationOptions(userName);
    return { success: true, data: options as unknown as Record<string, unknown> };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}

export async function finishPasskeyAuthentication(
  assertion: Record<string, unknown>
): Promise<ActionResult<{ userId: string }>> {
  try {
    const { verified, userId } = await finishAuthentication(assertion);
    if (!verified || !userId) return { success: false, error: "Passkey authentication failed" };
    await createSession(userId);
    return { success: true, data: { userId } };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}
