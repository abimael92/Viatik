"use server";

import { cookies } from "next/headers";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type GenerateRegistrationOptionsOpts,
  type GenerateAuthenticationOptionsOpts,
  type VerifiedRegistrationResponse,
  type RegistrationResponseJSON,
  type AuthenticationResponseJSON,
} from "@simplewebauthn/server";

import { env } from "@/env.mjs";
import { getServiceClient } from "@/lib/supabase/service-client";

const rpID = env.NEXT_PUBLIC_WEBAUTHN_RP_ID;
const rpName = env.NEXT_PUBLIC_WEBAUTHN_RP_NAME;
const origin = env.NEXT_PUBLIC_WEBAUTHN_ORIGIN;

const CHALLENGE_COOKIE = "viatik_webauthn_challenge";
const MAX_AGE = 5 * 60; // 5 minutes

async function setChallenge(challenge: string) {
  const cookieStore = await cookies();
  cookieStore.set(CHALLENGE_COOKIE, challenge, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

async function getChallenge(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(CHALLENGE_COOKIE)?.value;
}

async function clearChallenge() {
  const cookieStore = await cookies();
  cookieStore.delete(CHALLENGE_COOKIE);
}

export type WebAuthnRegistrationOptions = Awaited<
  ReturnType<typeof generateRegistrationOptions>
>;
export type WebAuthnAuthenticationOptions = Awaited<
  ReturnType<typeof generateAuthenticationOptions>
>;

export async function createRegistrationOptions(
  userId: string,
  userName: string
): Promise<WebAuthnRegistrationOptions> {
  const options: GenerateRegistrationOptionsOpts = {
    rpName,
    rpID,
    userID: new TextEncoder().encode(userId),
    userName,
    attestationType: "none",
    authenticatorSelection: {
      residentKey: "required",
      userVerification: "preferred",
    },
  };

  const result = await generateRegistrationOptions(options);
  await setChallenge(result.challenge);
  return result;
}

export interface StoredPasskey {
  credentialId: string;
  publicKey: Uint8Array;
  counter: number;
  userId: string;
}

async function getStoredPasskey(
  credentialId: string
): Promise<StoredPasskey | undefined> {
  const { data, error } = await getServiceClient()
    .from("webauthn_credentials")
    .select("*")
    .eq("credential_id", credentialId)
    .single();

  if (error || !data) return undefined;
  return {
    credentialId: data.credential_id as string,
    publicKey: Buffer.from(data.public_key as string, "base64"),
    counter: Number(data.counter),
    userId: data.user_id as string,
  };
}

export async function finishRegistration(
  userId: string,
  attestation: Record<string, unknown>
): Promise<VerifiedRegistrationResponse> {
  const expectedChallenge = await getChallenge();
  if (!expectedChallenge) throw new Error("WebAuthn challenge expired");

  const response = attestation as unknown as RegistrationResponseJSON;

  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: false,
  });

  await clearChallenge();

  if (verification.verified && verification.registrationInfo) {
    const { credential, credentialDeviceType, credentialBackedUp } =
      verification.registrationInfo;
    await getServiceClient().from("webauthn_credentials").upsert(
      {
        user_id: userId,
        credential_id: credential.id,
        public_key: Buffer.from(credential.publicKey).toString("base64"),
        counter: credential.counter,
        device_type: credentialDeviceType,
        backed_up: credentialBackedUp,
        transports: credential.transports,
      },
      { onConflict: "credential_id" }
    );
  }

  return verification;
}

export async function createAuthenticationOptions(
  userName: string
): Promise<WebAuthnAuthenticationOptions & { userName: string }> {
  const options: GenerateAuthenticationOptionsOpts = {
    rpID,
    allowCredentials: [],
    userVerification: "preferred",
  };

  const result = await generateAuthenticationOptions(options);
  await setChallenge(result.challenge);
  return { ...result, userName };
}

export async function finishAuthentication(
  assertion: Record<string, unknown>
): Promise<{ verified: boolean; userId: string | null }> {
  const expectedChallenge = await getChallenge();
  if (!expectedChallenge) throw new Error("WebAuthn challenge expired");

  const response = assertion as unknown as AuthenticationResponseJSON;
  const rawId = response.rawId;
  if (!rawId) throw new Error("Credential identifier missing");

  const passkey = await getStoredPasskey(rawId);
  if (!passkey) throw new Error("Credential not found");

  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: false,
    credential: {
      id: passkey.credentialId,
      publicKey: new Uint8Array(Buffer.from(passkey.publicKey)),
      counter: passkey.counter,
      transports: [],
    },
  });

  await clearChallenge();

  if (verification.verified && verification.authenticationInfo) {
    await getServiceClient()
      .from("webauthn_credentials")
      .update({ counter: verification.authenticationInfo.newCounter })
      .eq("credential_id", passkey.credentialId);
    return { verified: true, userId: passkey.userId };
  }

  return { verified: false, userId: null };
}
