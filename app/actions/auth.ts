"use server";

import { headers } from "next/headers";

import { createClient } from "@/lib/supabase/server-client";
import { getServiceClient } from "@/lib/supabase/service-client";
import { logger } from "@/lib/observability/logger";

export type ActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string; retryAfter?: number };

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function authMessage(message: string, operation: "send" | "verify") {
  const value = message.toLowerCase();
  if (value.includes("rate") || value.includes("too many")) return "Too many attempts. Please wait a moment and try again.";
  if (value.includes("expired")) return "That code has expired. Request a new code and try again.";
  if (value.includes("invalid") || value.includes("token")) return "That code is incorrect. Check it and try again.";
  if (operation === "send") return "We couldn't send your code right now. Please try again shortly.";
  return "We couldn't verify that code. Please try again.";
}

export async function sendEmailOtp(
  email: string,
  shouldCreateUser = false,
  fullName?: string,
  phone?: string
): Promise<ActionResult<{ devTokenHash?: string }>> {
  const normalizedEmail = normalizeEmail(email);
  const normalizedName = fullName?.trim();
  if (!isValidEmail(normalizedEmail)) return { success: false, error: "Enter a valid email address." };
  if (shouldCreateUser && (!normalizedName || normalizedName.length < 2 || normalizedName.length > 60)) {
    return { success: false, error: "Enter a display name between 2 and 60 characters." };
  }
  if (shouldCreateUser && !phone?.trim()) return { success: false, error: "Enter a phone number." };

  // Development-only registration: skip sending an email entirely. Supabase's
  // built-in sender is rate-limited (~2/hour), which blocks repeated signups
  // during local dev. Create the user via the service-role admin API and return
  // the magic-link token so verification can continue without email quota.
  if (shouldCreateUser && process.env.NODE_ENV === "development") {
    // `normalizedName` is guaranteed defined here: the validation above only
    // passes when a non-empty, in-range name is present alongside `shouldCreateUser`.
    return createDevRegistration(normalizedEmail, normalizedName!, phone);
  }

  try {
    const supabase = await createClient();
    const requestHeaders = await headers();
    const origin = requestHeaders.get("origin");
    const emailRedirectTo = origin
      ? `${origin}/auth/confirm?next=${encodeURIComponent("/trips")}`
      : undefined;
    const { error } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        shouldCreateUser,
        emailRedirectTo,
        data: shouldCreateUser
          ? { full_name: normalizedName, phone: phone?.trim() ?? undefined, onboarding_required: false }
          : undefined,
      },
    });
    if (error) {
      logger.warn("Unable to send email OTP", { code: error.code });
      const errorMessage = error.message.toLowerCase();
      const hourlyEmailLimit =
        error.code === "over_email_send_rate_limit" ||
        errorMessage.includes("email rate limit") ||
        errorMessage.includes("hourly email");
      const shortRateLimit =
        !hourlyEmailLimit &&
        (error.code === "over_request_rate_limit" ||
          errorMessage.includes("rate") ||
          errorMessage.includes("too many"));
      const accountMissing =
        !shouldCreateUser &&
        (errorMessage.includes("signup") || errorMessage.includes("not found"));
      return {
        success: false,
        error: hourlyEmailLimit
          ? "Supabase's hourly email limit has been reached. Wait for the quota to reset or configure custom SMTP in Supabase."
          : shortRateLimit
            ? "Too many requests. Wait for the countdown, then try again."
            : accountMissing
              ? "No account was found for that email. Create an account to get started."
              : authMessage(error.message, "send"),
        retryAfter: hourlyEmailLimit ? 3600 : shortRateLimit ? 60 : undefined,
      };
    }
    return { success: true, data: {} };
  } catch (error) {
    logger.error("Unexpected email OTP error", error instanceof Error ? error : new Error(String(error)));
    return { success: false, error: "We couldn't send your code right now. Please try again shortly." };
  }
}

function isValidPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
}

function isValidDob(dob: string) {
  if (!dob) return false;
  const date = new Date(dob);
  return !Number.isNaN(date.getTime()) && date <= new Date();
}

function passwordMessage(error?: { code?: string; message?: string } | null) {
  const message = (error?.message ?? "").toLowerCase();
  if (message.includes("invalid login credentials") || message.includes("invalid credentials")) {
    return "Incorrect email or password.";
  }
  if (message.includes("user already registered") || message.includes("already registered")) {
    return "An account with that email already exists. Sign in instead.";
  }
  if (message.includes("password should be at least") || message.includes("password")) {
    return "Password must be at least 8 characters.";
  }
  if (message.includes("rate") || message.includes("too many")) {
    return "Too many attempts. Please wait a moment and try again.";
  }
  return "Something went wrong. Please try again.";
}

/**
 * Ensures a profile row exists for a user. Used at registration time so the
 * authenticated layout (which redirects to /onboarding when a full name is
 * missing) doesn't force new users through the traveler form. Only creates the
 * row if one doesn't already exist.
 */
type RegistrationExtras = {
  birthDate?: string;
  avatarUrl?: string;
  avatarSeed?: string;
  preferredCurrency?: string;
  preferredLanguage?: string;
  emergencyContactName?: string;
  emergencyContactRelationship?: string;
  emergencyContactPhone?: string;
};

async function ensureProfile(userId: string, fullName: string, phone?: string, extras?: RegistrationExtras) {
  if (!userId || !fullName.trim()) return;
  try {
    const serviceClient = getServiceClient();
    const { data: existing } = await serviceClient
      .from("profiles")
      .select("full_name")
      .eq("id", userId)
      .maybeSingle();
    if (existing?.full_name?.trim()) return;
    await serviceClient
      .from("profiles")
      .upsert(
        {
          id: userId,
          full_name: fullName.trim(),
          phone: phone?.trim() || null,
          birth_date: extras?.birthDate || null,
          avatar_url: extras?.avatarUrl?.trim() || null,
          avatar_seed: extras?.avatarSeed?.trim() || null,
          preferred_currency: extras?.preferredCurrency?.trim() || undefined,
          preferred_language: extras?.preferredLanguage?.trim() || null,
          emergency_contact_name: extras?.emergencyContactName?.trim() || null,
          emergency_contact_relationship: extras?.emergencyContactRelationship?.trim() || null,
          emergency_contact_phone: extras?.emergencyContactPhone?.trim() || null,
        },
        { onConflict: "id" }
      );
  } catch (error) {
    logger.warn("Unable to pre-create profile", { error: error instanceof Error ? error.message : String(error) });
  }
}

export async function loginWithPassword(
  email: string,
  password: string
): Promise<ActionResult<{ onboarded: boolean }>> {
  const normalizedEmail = normalizeEmail(email);
  if (!isValidEmail(normalizedEmail)) return { success: false, error: "Enter a valid email address." };
  if (!password) return { success: false, error: "Enter your password." };

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
    if (error || !data.user) {
      logger.warn("Unable to sign in with password", { code: error?.code });
      return { success: false, error: passwordMessage(error) };
    }
    const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", data.user.id).maybeSingle();
    return { success: true, data: { onboarded: Boolean(profile?.full_name?.trim()) } };
  } catch (error) {
    logger.error("Unexpected password login error", error instanceof Error ? error : new Error(String(error)));
    return { success: false, error: "We couldn't sign you in right now. Please try again." };
  }
}

export async function registerWithPassword(
  email: string,
  password: string,
  fullName: string,
  phone: string,
  birthDate: string,
  avatar?: File | null,
  avatarSeed?: string | null
): Promise<ActionResult<{ confirmRequired: boolean }>> {
  const normalizedEmail = normalizeEmail(email);
  const normalizedName = fullName.trim();
  if (!isValidEmail(normalizedEmail)) return { success: false, error: "Enter a valid email address." };
  if (normalizedName.length < 2 || normalizedName.length > 60) {
    return { success: false, error: "Enter a display name between 2 and 60 characters." };
  }
  if (!phone.trim()) return { success: false, error: "Enter a phone number." };
  if (!isValidPhone(phone)) return { success: false, error: "Enter a valid phone number." };
  if (!isValidDob(birthDate)) return { success: false, error: "Enter a valid date of birth." };
  if (!password || password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) {
    return { success: false, error: "Password must be at least 8 characters and include an uppercase letter, a lowercase letter, and a number." };
  }
  if (avatar && avatar.size > 2 * 1024 * 1024) return { success: false, error: "Choose an image smaller than 2 MB." };
  if (avatar && !["image/jpeg", "image/png", "image/webp"].includes(avatar.type)) return { success: false, error: "Choose a JPG, PNG, or WebP image." };

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        data: {
          full_name: normalizedName,
          phone: phone.trim(),
          birth_date: birthDate,
          onboarding_required: false,
        },
      },
    });
    if (error) {
      logger.warn("Unable to register with password", { code: error.code });
      return { success: false, error: passwordMessage(error) };
    }

    let avatarUrl: string | undefined;
    if (data.user?.id && avatar?.size) {
      const serviceClient = getServiceClient();
      const extension = avatar.type.split("/")[1].replace("jpeg", "jpg");
      const path = `${data.user.id}/avatar.${extension}`;
      const { error: uploadError } = await serviceClient.storage
        .from("avatars")
        .upload(path, avatar, { contentType: avatar.type, upsert: true });
      if (!uploadError) avatarUrl = serviceClient.storage.from("avatars").getPublicUrl(path).data.publicUrl;
      else logger.warn("Unable to upload registration avatar", { code: uploadError.name });
    }

    if (data.user?.id) {
      await ensureProfile(data.user.id, normalizedName, phone, {
        birthDate,
        avatarUrl,
        avatarSeed: avatarSeed ?? undefined,
      });
    }
    return { success: true, data: { confirmRequired: !data.session } };
  } catch (error) {
    logger.error("Unexpected password registration error", error instanceof Error ? error : new Error(String(error)));
    return { success: false, error: "We couldn't create your account right now. Please try again." };
  }
}

export async function verifyEmailOtp(email: string, token: string): Promise<ActionResult<{ userId: string; onboarded: boolean }>> {
  const normalizedEmail = normalizeEmail(email);
  if (!isValidEmail(normalizedEmail)) return { success: false, error: "Enter a valid email address." };
  // Development registrations verify with a magic-link token instead of an
  // 8-digit code (no email is sent, so no OTP exists). The token form is only
  // accepted outside of production.
  const isDevToken = process.env.NODE_ENV === "development" && !/^\d{8}$/.test(token);
  if (!isDevToken && !/^\d{8}$/.test(token)) return { success: false, error: "Enter the complete 8-digit code." };

  try {
    const supabase = await createClient();
    const { data, error } = isDevToken
      ? await supabase.auth.verifyOtp({ token_hash: token, type: "magiclink" })
      : await supabase.auth.verifyOtp({ email: normalizedEmail, token, type: "email" });
    if (error) {
      logger.warn("Unable to verify email OTP", { code: error.code });
      return { success: false, error: authMessage(error.message, "verify") };
    }
    if (!data.user) return { success: false, error: "We couldn't complete sign in. Please request a new code." };
    await ensureProfile(
      data.user.id,
      String(data.user.user_metadata?.full_name ?? "").trim(),
      String(data.user.user_metadata?.phone ?? "").trim()
    );
    const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", data.user.id).maybeSingle();
    return { success: true, data: { userId: data.user.id, onboarded: Boolean(profile?.full_name?.trim()) } };
  } catch (error) {
    logger.error("Unexpected email OTP verification error", error instanceof Error ? error : new Error(String(error)));
    return { success: false, error: "We couldn't verify that code. Please try again." };
  }
}

export async function developmentLogin(): Promise<ActionResult<{ onboarded: boolean }>> {
  if (process.env.NODE_ENV !== "development") return { success: false, error: "Development login is unavailable." };

  try {
    const email = "abimael1992g@gmail.com";
    const serviceClient = getServiceClient();
    const { data, error } = await serviceClient.auth.admin.generateLink({ type: "magiclink", email });
    if (error || !data.properties.hashed_token) return { success: false, error: "The development account could not be opened." };

    const supabase = await createClient();
    const { error: verifyError } = await supabase.auth.verifyOtp({
      token_hash: data.properties.hashed_token,
      type: "magiclink",
    });
    if (verifyError) return { success: false, error: "The development session could not be created." };
    const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", data.user.id).maybeSingle();
    return { success: true, data: { onboarded: Boolean(profile?.full_name?.trim()) } };
  } catch (error) {
    logger.error("Development login failed", error instanceof Error ? error : new Error(String(error)));
    return { success: false, error: "Development login failed." };
  }
}

/**
 * Development-only registration. Creates the user with the service-role admin
 * API and returns the magic-link token without sending any email, so repeated
 * signups during local development do not consume Supabase's email quota.
 * Never reachable outside `NODE_ENV === "development"`.
 */
async function createDevRegistration(
  email: string,
  fullName: string,
  phone?: string
): Promise<ActionResult<{ devTokenHash: string }>> {
  try {
    const serviceClient = getServiceClient();
    const { data, error } = await serviceClient.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { data: { full_name: fullName, phone: phone?.trim() ?? undefined, onboarding_required: false } },
    });
    if (error || !data.properties.hashed_token) {
      logger.warn("Dev registration link generation failed", { code: error?.code });
      return { success: false, error: "The development account could not be created. Please try again." };
    }
    return { success: true, data: { devTokenHash: data.properties.hashed_token } };
  } catch (error) {
    logger.error("Unexpected dev registration error", error instanceof Error ? error : new Error(String(error)));
    return { success: false, error: "We couldn't create your account right now. Please try again." };
  }
}

export async function sendPhoneOtp(phone: string): Promise<ActionResult> {
  try {
    logger.info("Sending phone OTP", { phone: phone.replace(/(\d{3})\d{6}(\d{4})/, "$1******$2") });
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithOtp({
      phone,
      options: { channel: "sms" },
    });
    if (error) {
      logger.error("Failed to send phone OTP", new Error(error.message), { phone: phone.replace(/(\d{3})\d{6}(\d{4})/, "$1******$2") });
      return { success: false, error: error.message };
    }
    logger.info("Phone OTP sent successfully");
    return { success: true, data: undefined };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Unexpected error sending phone OTP", error instanceof Error ? error : new Error(String(error)), {
      phone: phone.replace(/(\d{3})\d{6}(\d{4})/, "$1******$2"),
    });
    return { success: false, error: message };
  }
}

export async function verifyPhoneOtp(
  phone: string,
  token: string
): Promise<ActionResult<{ userId: string }>> {
  try {
    logger.info("Verifying phone OTP", { phone: phone.replace(/(\d{3})\d{6}(\d{4})/, "$1******$2") });
    const supabase = await createClient();
    const { data, error } = await supabase.auth.verifyOtp({
      phone,
      token,
      type: "sms",
    });
    if (error) {
      logger.error("Failed to verify phone OTP", new Error(error.message), {
        phone: phone.replace(/(\d{3})\d{6}(\d{4})/, "$1******$2"),
      });
      return { success: false, error: error.message };
    }
    const userId = data.user?.id;
    if (!userId) {
      logger.error("No user returned from OTP verification");
      return { success: false, error: "No user returned" };
    }
    logger.info("Phone OTP verified successfully", { userId });
    return { success: true, data: { userId } };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Unexpected error verifying phone OTP", error instanceof Error ? error : new Error(String(error)), {
      phone: phone.replace(/(\d{3})\d{6}(\d{4})/, "$1******$2"),
    });
    return { success: false, error: message };
  }
}

export async function updateProfile(fullName: string): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) return { success: false, error: "Authentication required" };
    const { error } = await supabase.from("profiles").update({ full_name: fullName.trim() || null }).eq("id", data.user.id);
    if (error) return { success: false, error: error.message };
    return { success: true, data: undefined };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Unable to update profile" };
  }
}

function onboardingMessage(error: { code?: string; message: string }) {
  const message = error.message.toLowerCase();
  if (error.code === "PGRST205" || error.code === "42P01" || message.includes("could not find the table") || message.includes("relation") && message.includes("does not exist")) {
    return "The profiles table is missing in Supabase. Apply the database migrations, then try again.";
  }
  if (error.code === "42501" || message.includes("row-level security")) {
    return "Supabase blocked the profile update. Apply the profile RLS policies, then try again.";
  }
  return "We couldn't save your profile right now. Please try again.";
}

export type ProfileDetails = {
  fullName: string;
  avatarUrl?: string | null;
  avatarSeed?: string | null;
  phone?: string;
  birthDate?: string;
  emergencyContactName?: string;
  emergencyContactRelationship?: string;
  emergencyContactPhone?: string;
  dietaryRestrictions?: string[];
  allergies?: string[];
  passportIssuingCountry?: string;
  passportExpiresOn?: string;
  preferredCurrency?: string;
  preferredLanguage?: string;
};

/** Replace the signed-in user's saved profile details (empty values are cleared). */
export async function updateProfileDetails(
  details: ProfileDetails,
  avatar?: File | null
): Promise<ActionResult> {
  const name = details.fullName.trim();
  if (name.length < 2 || name.length > 60) return { success: false, error: "Enter a name between 2 and 60 characters." };
  if (!details.phone?.trim()) return { success: false, error: "Enter a phone number." };
  if (!isValidPhone(details.phone)) return { success: false, error: "Enter a valid phone number." };
  if (!details.birthDate || !isValidDob(details.birthDate)) return { success: false, error: "Enter a valid date of birth." };
  if (avatar && avatar.size > 2 * 1024 * 1024) return { success: false, error: "Choose an image smaller than 2 MB." };
  if (avatar && !["image/jpeg", "image/png", "image/webp"].includes(avatar.type)) return { success: false, error: "Choose a JPG, PNG, or WebP image." };
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) return { success: false, error: "Authentication required" };

    let avatarUrl: string | undefined;
    if (avatar?.size) {
      const extension = avatar.type.split("/")[1].replace("jpeg", "jpg");
      const path = `${data.user.id}/avatar.${extension}`;
      const { error: uploadError } = await supabase.storage.from("avatars").upload(path, avatar, { contentType: avatar.type, upsert: true });
      if (uploadError) return { success: false, error: "We couldn't upload that photo. Try another image or remove it." };
      avatarUrl = supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
    }

    const update = {
      full_name: name,
      avatar_url: avatarUrl || details.avatarUrl?.trim() || null,
      avatar_seed: details.avatarSeed?.trim() || null,
      phone: details.phone?.trim() || null,
      birth_date: details.birthDate || null,
      emergency_contact_name: details.emergencyContactName?.trim() || null,
      emergency_contact_relationship: details.emergencyContactRelationship?.trim() || null,
      emergency_contact_phone: details.emergencyContactPhone?.trim() || null,
      dietary_restrictions: details.dietaryRestrictions ?? [],
      allergies: details.allergies ?? [],
      passport_issuing_country: details.passportIssuingCountry?.trim().toUpperCase() || null,
      passport_expires_on: details.passportExpiresOn || null,
      preferred_currency: details.preferredCurrency || undefined,
      preferred_language: details.preferredLanguage || undefined,
    };
    const { error } = await supabase.from("profiles").update(update).eq("id", data.user.id);
    if (error) return { success: false, error: error.message };
    return { success: true, data: undefined };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Unable to update profile" };
  }
}

export type OnboardingDetails = {
  avatarUrl?: string | null;
  avatarSeed?: string | null;
  phone?: string;
  birthDate?: string;
  emergencyContactName?: string;
  emergencyContactRelationship?: string;
  emergencyContactPhone?: string;
  dietaryRestrictions?: string[];
  allergies?: string[];
  passportIssuingCountry?: string;
  passportExpiresOn?: string;
  preferredCurrency?: string;
  preferredLanguage?: string;
};

export async function completeOnboarding(
  fullName: string,
  avatar?: File | null,
  details?: OnboardingDetails
): Promise<ActionResult> {
  const name = fullName.trim();
  if (name.length < 2 || name.length > 60) return { success: false, error: "Enter a name between 2 and 60 characters." };
  if (!details?.phone?.trim()) return { success: false, error: "Enter a phone number." };
  if (!isValidPhone(details.phone)) return { success: false, error: "Enter a valid phone number." };
  if (!details?.birthDate || !isValidDob(details.birthDate)) return { success: false, error: "Enter a valid date of birth." };
  if (avatar && avatar.size > 2 * 1024 * 1024) return { success: false, error: "Choose an image smaller than 2 MB." };
  if (avatar && !["image/jpeg", "image/png", "image/webp"].includes(avatar.type)) return { success: false, error: "Choose a JPG, PNG, or WebP image." };

  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) return { success: false, error: "Sign in again to finish setting up your profile." };

    let avatarUrl: string | undefined;
    if (avatar?.size) {
      const extension = avatar.type.split("/")[1].replace("jpeg", "jpg");
      const path = `${data.user.id}/avatar.${extension}`;
      const { error: uploadError } = await supabase.storage.from("avatars").upload(path, avatar, { contentType: avatar.type, upsert: true });
      if (uploadError) {
        logger.warn("Unable to upload onboarding avatar", { code: uploadError.name });
        return { success: false, error: "We couldn't upload that photo. Try another image or continue without one." };
      }
      avatarUrl = supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
    }

    const profile = {
      id: data.user.id,
      full_name: name,
      avatar_url: avatarUrl || details?.avatarUrl?.trim() || null,
      avatar_seed: details?.avatarSeed?.trim() || null,
      // Everything below is optional; empty values fall back to null/defaults.
      phone: details?.phone?.trim() || null,
      birth_date: details?.birthDate || null,
      emergency_contact_name: details?.emergencyContactName?.trim() || null,
      emergency_contact_relationship: details?.emergencyContactRelationship?.trim() || null,
      emergency_contact_phone: details?.emergencyContactPhone?.trim() || null,
      dietary_restrictions: details?.dietaryRestrictions ?? [],
      allergies: details?.allergies ?? [],
      passport_issuing_country: details?.passportIssuingCountry?.trim().toUpperCase() || null,
      passport_expires_on: details?.passportExpiresOn || null,
      preferred_currency: details?.preferredCurrency || undefined,
      preferred_language: details?.preferredLanguage || undefined,
    };
    const { error } = await supabase.from("profiles").upsert(profile, { onConflict: "id" });
    if (error) {
      logger.warn("Unable to complete onboarding", { code: error.code });
      return { success: false, error: onboardingMessage(error) };
    }
    const { error: metadataError } = await supabase.auth.updateUser({
      data: { ...data.user.user_metadata, full_name: name, onboarding_required: false },
    });
    if (metadataError) {
      logger.warn("Unable to mark onboarding complete", { code: metadataError.code });
      return { success: false, error: "Your profile was saved, but setup could not be finalized. Try continuing again." };
    }
    return { success: true, data: undefined };
  } catch (error) {
    logger.error("Unexpected onboarding error", error instanceof Error ? error : new Error(String(error)));
    return { success: false, error: "We couldn't save your profile right now. Please try again." };
  }
}

export async function logout(): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signOut();
    if (error) return { success: false, error: error.message };
    return { success: true, data: undefined };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Unable to sign out" };
  }
}
