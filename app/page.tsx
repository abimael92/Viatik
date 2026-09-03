import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Camera,
  CheckCircle2,
  Clock3,
  CloudOff,
  MapPinned,
  Receipt,
  Users,
  Zap,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { Button } from "@/components/ui/button";

const features = [
  {
    icon: Users,
    title: "Plan together",
    text: "Invite your travel crew and build one itinerary everyone can trust.",
  },
  {
    icon: CloudOff,
    title: "Ready offline",
    text: "Keep plans close when the signal disappears. Changes sync when you reconnect.",
  },
  {
    icon: Receipt,
    title: "Share expenses",
    text: "Record group costs and keep the money conversation simple.",
  },
  {
    icon: Camera,
    title: "Keep the memories",
    text: "Save trip photos beside the places and moments that made them special.",
  },
];

export default function Home() {
  return (
    <main className="min-h-dvh bg-background">
      <LandingHeader />
      <HeroSection />

      <section id="features" className="border-y bg-muted/40 py-24">
        <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-12">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">
              Everything in one place
            </p>
            <h2 className="mt-3 text-4xl font-bold tracking-tight">
              Less coordination. More adventure.
            </h2>
          </div>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {features.map(({ icon: Icon, title, text }) => (
              <article key={title} className="rounded-2xl border bg-card p-6">
                <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Icon />
                </span>
                <h3 className="mt-5 text-lg font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="mx-auto max-w-7xl px-5 py-24 sm:px-8 lg:px-12">
        <div className="grid gap-10 lg:grid-cols-[.7fr_1fr]">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">
              How it works
            </p>
            <h2 className="mt-3 text-4xl font-bold tracking-tight">
              From group chat to takeoff in minutes.
            </h2>
          </div>
          <ol className="grid gap-5 sm:grid-cols-2">
            {["Create your trip", "Invite your travelers", "Build the plan together", "Take it anywhere"].map(
              (item, index) => (
                <li key={item} className="flex gap-4 rounded-2xl border p-5">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary font-semibold text-primary-foreground">
                    {index + 1}
                  </span>
                  <span className="pt-1.5 font-semibold">{item}</span>
                </li>
              )
            )}
          </ol>
        </div>
      </section>

      <section className="mx-5 mb-8 rounded-[2rem] bg-primary px-6 py-16 text-center text-primary-foreground sm:mx-8 lg:mx-auto lg:max-w-7xl">
        <h2 className="text-3xl font-bold sm:text-4xl">
          Your next trip deserves one shared plan.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-primary-foreground/75">
          Bring the people, places, details, and memories together with Viatik.
        </p>
        <Button asChild size="lg" variant="secondary" className="mt-8">
          <Link href="/register">
            Create your first trip <ArrowRight />
          </Link>
        </Button>
      </section>

      <footer className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-12">
        <p>© {new Date().getFullYear()} Viatik. Plan every detail together.</p>
        <div className="flex gap-5">
          <Link href="/login" className="hover:text-foreground">
            Sign in
          </Link>
          <Link href="/register" className="hover:text-foreground">
            Create account
          </Link>
        </div>
      </footer>
    </main>
  );
}

function LandingHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-border/40 bg-background/60 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8 lg:px-12">
        <Link href="/" className="flex items-center gap-2.5 text-lg font-semibold tracking-tight">
          <Image
            src="/viatik-logo.png"
            alt=""
            width={36}
            height={36}
            priority
            className="size-9 object-contain"
          />
          Viatik
        </Link>
        <nav className="flex items-center gap-2.5 sm:gap-3" aria-label="Primary navigation">
          <Button
            asChild
            size="sm"
            variant="outline"
            className="hidden border-primary/40 bg-transparent text-foreground shadow-sm hover:border-primary/70 hover:bg-primary/10 sm:inline-flex"
          >
            <Link href="#features">Features</Link>
          </Button>
          <Button
            asChild
            size="sm"
            className="bg-primary text-primary-foreground shadow-md shadow-primary/20 hover:bg-primary/90 hover:opacity-100"
          >
            <Link href="/login" className="group">
              Sign in
              <ArrowUpRight
                className="size-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </Link>
          </Button>
        </nav>
      </div>
    </header>
  );
}

function HeroSection() {
  return (
    <section className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_24%,color-mix(in_oklch,var(--primary)_12%,transparent),transparent_34%),radial-gradient(circle_at_88%_52%,color-mix(in_oklch,var(--secondary)_10%,transparent),transparent_32%)]" />
      <div className="relative mx-auto grid max-w-7xl items-center gap-16 px-5 py-20 sm:px-8 sm:py-24 lg:grid-cols-[.92fr_1.08fr] lg:px-12 lg:py-32">
        <div className="max-w-2xl">
          <p className="mb-5 text-sm font-semibold uppercase tracking-[0.2em] text-primary">
            Travel better, together
          </p>
          <h1 className="text-5xl font-bold leading-[1.02] tracking-tighter sm:text-6xl lg:text-7xl">
            One shared plan for every unforgettable trip.
          </h1>
          <p className="mt-7 max-w-xl text-lg leading-8 text-muted-foreground sm:text-xl">
            Build itineraries, organize group expenses, and keep every traveler in sync—even when
            you’re offline.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button
              asChild
              size="lg"
              className="h-12 border border-primary bg-primary px-6 text-base text-primary-foreground shadow-lg shadow-primary/25 hover:bg-primary/90 hover:opacity-100"
            >
              <Link href="/register">
                Start planning <ArrowRight />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="h-12 border-2 border-primary/40 bg-transparent px-6 text-base text-foreground shadow-sm hover:border-primary/70 hover:bg-primary/10"
            >
              <Link href="#how-it-works">See how it works</Link>
            </Button>
          </div>
        </div>

        <ProductPreview />
      </div>
    </section>
  );
}

function ProductPreview() {
  return (
    <div className="relative mx-auto w-full max-w-2xl lg:mx-0">
      <div className="absolute -inset-10 -z-10 rounded-[3rem] bg-primary/10 blur-3xl" />
      <div className="overflow-hidden rounded-[1.75rem] border border-border/60 bg-card/95 shadow-2xl shadow-primary/10 backdrop-blur-sm">
        <div className="flex flex-col gap-4 border-b border-border/60 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <p className="text-xs font-medium text-muted-foreground">May 18–24 · Portugal</p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight">Lisbon with friends</h2>
          </div>
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-success/25 bg-success/10 px-3 py-1.5 text-xs font-medium text-success">
            <Zap className="size-3.5" aria-hidden="true" />
            <span>Offline Ready</span>
            <span className="size-1 rounded-full bg-success" aria-hidden="true" />
            <span>Synced</span>
          </div>
        </div>

        <div className="grid gap-4 p-4 sm:grid-cols-[1.45fr_.8fr] sm:p-5">
          <section className="rounded-2xl border border-border/60 bg-background/65 p-4" aria-labelledby="preview-day">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-primary">Day 2 · Tuesday</p>
                <h3 id="preview-day" className="mt-1 font-semibold">Today in Lisbon</h3>
              </div>
              <span className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">
                <CalendarDays className="size-4" />
              </span>
            </div>

            <div className="relative mt-5 space-y-3 before:absolute before:bottom-5 before:left-4.25 before:top-5 before:w-px before:bg-border">
              <PreviewActivity
                icon={<MapPinned className="size-4" />}
                time="10:00"
                title="Explore Alfama"
                detail="Miradouro de Santa Luzia"
                active
              />
              <PreviewActivity
                icon={<Clock3 className="size-4" />}
                time="13:30"
                title="Lunch at Prado"
                detail="Reserved for 4 travelers"
              />
              <PreviewActivity
                icon={<CheckCircle2 className="size-4" />}
                time="19:00"
                title="Sunset sailing"
                detail="Tickets saved offline"
              />
            </div>
          </section>

          <div className="grid gap-4">
            <section className="rounded-2xl border border-border/60 bg-background/65 p-4" aria-label="Trip budget">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Receipt className="size-4" />
                Group budget
              </div>
              <p className="mt-4 text-2xl font-semibold tracking-tight">€428</p>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full w-[62%] rounded-full bg-primary" />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">62% of €690 planned</p>
            </section>

            <section className="rounded-2xl border border-border/60 bg-background/65 p-4" aria-label="Trip collaborators">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Travel crew</span>
                <Users className="size-4 text-muted-foreground" />
              </div>
              <div className="mt-4 flex -space-x-2">
                {["AM", "JR", "SK", "+1"].map((name) => (
                  <span
                    key={name}
                    className="grid size-9 place-items-center rounded-full border-2 border-card bg-muted text-[11px] font-semibold"
                  >
                    {name}
                  </span>
                ))}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">4 travelers planning together</p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

function PreviewActivity({
  icon,
  time,
  title,
  detail,
  active = false,
}: {
  icon: React.ReactNode;
  time: string;
  title: string;
  detail: string;
  active?: boolean;
}) {
  return (
    <article className="relative flex gap-3 rounded-xl border border-border/50 bg-card p-3 shadow-sm">
      <span
        className={`relative z-10 grid size-9 shrink-0 place-items-center rounded-lg ${
          active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
        }`}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-medium text-muted-foreground">{time}</p>
        <h4 className="truncate text-sm font-semibold">{title}</h4>
        <p className="truncate text-xs text-muted-foreground">{detail}</p>
      </div>
    </article>
  );
}
