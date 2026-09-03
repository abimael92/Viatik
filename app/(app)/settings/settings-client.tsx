"use client";

import { KeyRound, LogOut, Smartphone, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { logout, updateProfile } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deleteDatabase } from "@/lib/db/dexie";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";

export function SettingsClient({ userId, phone, fullName }: { userId: string; phone: string | null; fullName: string }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await updateProfile(String(data.get("fullName")));
      setMessage(result.success ? "Profile saved." : result.error);
      router.refresh();
    });
  }

  function addPasskey() {
    startTransition(async () => {
      setMessage(null);
      try {
        const supabase = getSupabaseBrowserClient();
        const { data, error } = await supabase.auth.registerPasskey();
        if (error) throw error;
        if (!data?.id) throw new Error("Passkey registration did not complete.");
        setMessage("Passkey added to your account.");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Passkey setup was cancelled.");
      }
    });
  }

  function signOut() {
    startTransition(async () => {
      const result = await logout();
      if (!result.success) {
        setMessage(result.error);
        return;
      }
      await deleteDatabase(userId);
      router.replace("/login");
      router.refresh();
    });
  }

  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm font-medium text-primary">Account</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">Settings</h1>
        <p className="mt-2 text-muted-foreground">Manage your profile, sign-in methods, and session.</p>
      </header>
      {message && <p role="status" className="rounded-lg border bg-card p-3 text-sm">{message}</p>}
      <section className="rounded-2xl border bg-card p-5 sm:p-7" aria-labelledby="profile-heading">
        <div className="flex gap-3">
          <UserRound className="size-5 text-primary" />
          <div>
            <h2 id="profile-heading" className="font-semibold">Profile</h2>
            <p className="text-sm text-muted-foreground">How you appear in shared trips.</p>
          </div>
        </div>
        <form onSubmit={saveProfile} className="mt-5 max-w-lg space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fullName">Full name</Label>
            <Input id="fullName" name="fullName" defaultValue={fullName} autoComplete="name" />
          </div>
          <Button type="submit" disabled={pending}>Save profile</Button>
        </form>
      </section>
      <section className="rounded-2xl border bg-card p-5 sm:p-7" aria-labelledby="security-heading">
        <div className="flex gap-3">
          <KeyRound className="size-5 text-primary" />
          <div>
            <h2 id="security-heading" className="font-semibold">Sign-in and security</h2>
            <p className="text-sm text-muted-foreground">Add a passkey to your verified Supabase account.</p>
          </div>
        </div>
        <div className="mt-5 divide-y rounded-xl border">
          <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
            <Smartphone className="size-5 text-muted-foreground" />
            <div className="flex-1">
              <p className="font-medium">SMS authentication</p>
              <p className="text-sm text-muted-foreground">{phone ?? "No phone number available"}</p>
            </div>
            <span className="text-xs font-medium text-success">Verified session</span>
          </div>
          <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
            <KeyRound className="size-5 text-muted-foreground" />
            <div className="flex-1">
              <p className="font-medium">Passkeys</p>
              <p className="text-sm text-muted-foreground">Use your device biometrics for a faster sign-in.</p>
            </div>
            <Button variant="outline" onClick={addPasskey} disabled={pending}>Add passkey</Button>
          </div>
        </div>
      </section>
      <section className="rounded-2xl border bg-card p-5 sm:p-7" aria-labelledby="session-heading">
        <h2 id="session-heading" className="font-semibold">Current session</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Signed in as {phone ?? userId}. Signing out removes offline trip data from this device.
        </p>
        <Button className="mt-5" variant="outline" onClick={signOut} disabled={pending}>
          <LogOut className="size-4" />Sign out
        </Button>
      </section>
    </div>
  );
}
