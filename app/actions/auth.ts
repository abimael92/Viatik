"use server";

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

export async function sendEmailOtp(email: string, shouldCreateUser = false, fullName?: string): Promise<ActionResult> {
  const normalizedEmail = normalizeEmail(email);
  const normalizedName = fullName?.trim();
  if (!isValidEmail(normalizedEmail)) return { success: false, error: "Enter a valid email address." };
  if (shouldCreateUser && (!normalizedName || normalizedName.length < 2 || normalizedName.length > 60)) {
    return { success: false, error: "Enter a display name between 2 and 60 characters." };
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        shouldCreateUser,
        data: shouldCreateUser ? { full_name: normalizedName } : undefined,
      },
    });
    if (error) {
      logger.warn("Unable to send email OTP", { code: error.code });
      const rateLimited = error.message.toLowerCase().includes("rate") || error.message.toLowerCase().includes("too many");
      const accountMissing = !shouldCreateUser && (error.message.toLowerCase().includes("signup") || error.message.toLowerCase().includes("not found"));
      return {
        success: false,
        error: rateLimited
          ? "Too many attempts. Try again when the countdown ends. If it continues, the hourly email limit has been reached."
          : accountMissing
            ? "No account was found for that email. Create an account to get started."
            : authMessage(error.message, "send"),
        retryAfter: rateLimited ? 60 : undefined,
      };
    }
    return { success: true, data: undefined };
  } catch (error) {
    logger.error("Unexpected email OTP error", error instanceof Error ? error : new Error(String(error)));
    return { success: false, error: "We couldn't send your code right now. Please try again shortly." };
  }
}

export async function verifyEmailOtp(email: string, token: string): Promise<ActionResult<{ userId: string; onboarded: boolean }>> {
  const normalizedEmail = normalizeEmail(email);
  if (!isValidEmail(normalizedEmail)) return { success: false, error: "Enter a valid email address." };
  if (!/^\d{6}$/.test(token)) return { success: false, error: "Enter the complete 6-digit code." };

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.verifyOtp({ email: normalizedEmail, token, type: "email" });
    if (error) {
      logger.warn("Unable to verify email OTP", { code: error.code });
      return { success: false, error: authMessage(error.message, "verify") };
    }
    if (!data.user) return { success: false, error: "We couldn't complete sign in. Please request a new code." };
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
export async function updateProfileDetails(details: ProfileDetails): Promise<ActionResult> {
  const name = details.fullName.trim();
  if (name.length < 2 || name.length > 60) return { success: false, error: "Enter a name between 2 and 60 characters." };
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) return { success: false, error: "Authentication required" };
    const update = {
      full_name: name,
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

export async function setDiscoverability(discoverable: boolean): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) return { success: false, error: "Authentication required" };
    const { error } = await supabase
      .from("profiles")
      .update({ discoverable })
      .eq("id", data.user.id);
    if (error) return { success: false, error: error.message };
    return { success: true, data: undefined };
  } catch (error) {
    logger.error("Unexpected discoverability update error", error instanceof Error ? error : new Error(String(error)));
    return { success: false, error: "We couldn't update your discoverability right now." };
  }
}

export type OnboardingDetails = {
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
      avatar_url: avatarUrl ?? null,
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
