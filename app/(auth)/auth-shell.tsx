import { Cloud, Map, Users } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

export function AuthShell({ children, mode = "login" }: { children: React.ReactNode; mode?: "login" | "register" }) {
  return (
    <main className="relative min-h-dvh overflow-hidden bg-primary lg:grid lg:grid-cols-[1.08fr_.92fr]">
      <section className="relative flex min-h-[42dvh] flex-col justify-between overflow-hidden px-6 py-7 text-primary-foreground sm:px-10 lg:min-h-dvh lg:px-14 lg:py-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,.22),transparent_32%),radial-gradient(circle_at_80%_70%,rgba(34,211,238,.2),transparent_38%)]" />
        <Link href="/" className="relative flex items-center gap-3 text-xl font-bold tracking-tight">
          <Image src="/viatik-logo.png" alt="" width={44} height={44} priority className="size-11 object-contain drop-shadow-lg" />
          Viatik
        </Link>
        <div className="relative max-w-xl pb-24 lg:pb-0">
          <p className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-primary-foreground/70">{mode === "register" ? "Your next adventure starts here" : "Welcome back, traveler"}</p>
          <h2 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl">{mode === "register" ? "Turn the group chat into a trip everyone can follow." : "Your trips, people, and plans are waiting."}</h2>
          <div className="mt-8 hidden gap-6 text-sm text-primary-foreground/80 sm:flex">
            <span className="flex items-center gap-2"><Map className="size-5" />Shared itineraries</span>
            <span className="flex items-center gap-2"><Users className="size-5" />Built together</span>
            <span className="flex items-center gap-2"><Cloud className="size-5" />Ready offline</span>
          </div>
        </div>
      </section>
      <section className="relative -mt-16 flex min-h-[58dvh] items-start justify-center rounded-t-[2rem] bg-background px-5 py-9 shadow-2xl sm:px-8 lg:mt-0 lg:min-h-dvh lg:items-center lg:rounded-none lg:py-12">
        <div className="w-full max-w-md">{children}</div>
      </section>
    </main>
  );
}
