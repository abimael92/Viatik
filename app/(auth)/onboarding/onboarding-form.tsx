"use client";

import Image from "next/image";
import { Camera, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { completeOnboarding } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function OnboardingForm({ email, next }: { email: string; next: string }) {
  const router = useRouter();
  const [avatar, setAvatar] = useState<File | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const preview = useMemo(() => {
    if (!avatar) return null;
    return URL.createObjectURL(avatar);
  }, [avatar]);

  return (
    <form className="space-y-6" onSubmit={(event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      setMessage(null);
      startTransition(async () => {
        const result = await completeOnboarding(String(data.get("fullName")), avatar);
        if (!result.success) return setMessage(result.error);
        router.replace(next);
        router.refresh();
      });
    }}>
      <div><p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">One last step</p><h1 className="mt-3 text-3xl font-bold tracking-tight">Make Viatik yours</h1><p className="mt-2 text-muted-foreground">Add the name your travel group will recognize. Your photo is optional.</p></div>
      <div className="flex items-center gap-4">
        <label htmlFor="avatar" className="group relative grid size-20 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-full border-2 border-dashed bg-muted text-muted-foreground hover:border-primary hover:text-primary">
          {preview ? <Image src={preview} alt="Avatar preview" fill unoptimized sizes="80px" className="object-cover" /> : <UserRound className="size-8" />}
          <span className="absolute inset-0 hidden place-items-center bg-black/45 text-white group-hover:grid"><Camera /></span>
        </label>
        <div><Label htmlFor="avatar" className="cursor-pointer font-medium">Add a profile photo</Label><p className="mt-1 text-xs text-muted-foreground">JPG, PNG, or WebP. Up to 2 MB.</p><Input id="avatar" name="avatar" type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => setAvatar(event.target.files?.[0] ?? null)} /></div>
      </div>
      <div className="space-y-2"><Label htmlFor="fullName">Display name</Label><Input id="fullName" name="fullName" autoComplete="name" minLength={2} maxLength={60} placeholder="Alex Morgan" required autoFocus /></div>
      <p className="text-sm text-muted-foreground">Signed in as {email}</p>
      {message && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{message}</p>}
      <Button type="submit" size="lg" className="w-full" disabled={pending}>{pending ? "Saving your profile…" : "Continue to Viatik"}</Button>
    </form>
  );
}
