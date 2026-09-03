import { ArrowRight, Camera, CloudOff, MapPinned, Receipt, Users } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { Button } from "@/components/ui/button";

const features = [
  { icon: Users, title: "Plan together", text: "Invite your travel crew and build one itinerary everyone can trust." },
  { icon: CloudOff, title: "Ready offline", text: "Keep plans close when the signal disappears. Changes sync when you reconnect." },
  { icon: Receipt, title: "Share expenses", text: "Record group costs and keep the money conversation simple." },
  { icon: Camera, title: "Keep the memories", text: "Save trip photos beside the places and moments that made them special." },
];

export default function Home() {
  return (
    <main className="min-h-dvh overflow-hidden bg-background">
      <header className="relative z-20 mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8 lg:px-12">
        <Link href="/" className="flex items-center gap-3 text-xl font-bold tracking-tight"><Image src="/viatik-logo.png" alt="" width={44} height={44} priority className="size-11 object-contain drop-shadow-md" />Viatik</Link>
        <nav className="flex items-center gap-2 sm:gap-4" aria-label="Primary navigation">
          <Link href="#features" className="hidden text-sm font-medium text-muted-foreground hover:text-foreground sm:block">Features</Link>
          <Button asChild variant="ghost"><Link href="/login">Sign in</Link></Button>
          <Button asChild><Link href="/register">Start planning</Link></Button>
        </nav>
      </header>

      <section className="relative mx-auto grid max-w-7xl items-center gap-14 px-5 pb-24 pt-14 sm:px-8 lg:grid-cols-[1fr_.95fr] lg:px-12 lg:pb-32 lg:pt-24">
        <div className="absolute -left-40 top-0 -z-0 size-[32rem] rounded-full bg-primary/10 blur-3xl" />
        <div className="relative z-10 max-w-2xl">
          <p className="mb-5 text-sm font-semibold uppercase tracking-[0.2em] text-primary">Travel better, together</p>
          <h1 className="text-5xl font-bold leading-[1.05] tracking-[-0.04em] sm:text-6xl lg:text-7xl">One shared plan for every unforgettable trip.</h1>
          <p className="mt-7 max-w-xl text-lg leading-8 text-muted-foreground sm:text-xl">Build itineraries, organize group expenses, and keep every traveler in sync—even when you’re offline.</p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" className="h-12 px-6 text-base"><Link href="/register">Start planning <ArrowRight /></Link></Button>
            <Button asChild size="lg" variant="outline" className="h-12 px-6 text-base"><Link href="#how-it-works">See how it works</Link></Button>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">Free to start. No password required.</p>
        </div>

        <div className="relative z-10 mx-auto w-full max-w-xl lg:mx-0">
          <div className="absolute -inset-8 rounded-[3rem] bg-gradient-to-br from-primary/25 via-secondary/15 to-accent/25 blur-2xl" />
          <div className="relative overflow-hidden rounded-[2rem] border bg-card p-4 shadow-2xl shadow-primary/10 sm:p-6">
            <div className="flex items-center justify-between border-b pb-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-primary">Upcoming trip</p><h2 className="mt-1 text-2xl font-bold">Lisbon with friends</h2></div><div className="flex -space-x-2">{["AM", "JR", "SK"].map((name) => <span key={name} className="grid size-9 place-items-center rounded-full border-2 border-card bg-muted text-xs font-semibold">{name}</span>)}</div></div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2"><article className="rounded-2xl bg-primary p-5 text-primary-foreground sm:row-span-2"><p className="text-xs font-semibold uppercase tracking-wider opacity-75">Day 2 · Alfama</p><MapPinned className="mt-8 size-9" /><h3 className="mt-3 text-xl font-semibold">Explore the old city</h3><p className="mt-2 text-sm opacity-80">Tram 28 · Miradouro · Dinner at 7:30</p></article><article className="rounded-2xl border bg-background p-4"><p className="text-sm font-semibold">Group expenses</p><p className="mt-3 text-3xl font-bold">€428</p><p className="mt-1 text-xs text-muted-foreground">Balanced across 4 travelers</p></article><article className="rounded-2xl border bg-background p-4"><p className="text-sm font-semibold">Everything is synced</p><p className="mt-3 flex items-center gap-2 text-sm text-success"><span className="size-2 rounded-full bg-success" />Ready for offline</p></article></div>
          </div>
        </div>
      </section>

      <section id="features" className="border-y bg-muted/40 py-24">
        <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-12"><div className="max-w-2xl"><p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">Everything in one place</p><h2 className="mt-3 text-4xl font-bold tracking-tight">Less coordination. More adventure.</h2></div><div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{features.map(({ icon: Icon, title, text }) => <article key={title} className="rounded-2xl border bg-card p-6"><span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary"><Icon /></span><h3 className="mt-5 text-lg font-semibold">{title}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p></article>)}</div></div>
      </section>

      <section id="how-it-works" className="mx-auto max-w-7xl px-5 py-24 sm:px-8 lg:px-12"><div className="grid gap-10 lg:grid-cols-[.7fr_1fr]"><div><p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">How it works</p><h2 className="mt-3 text-4xl font-bold tracking-tight">From group chat to takeoff in minutes.</h2></div><ol className="grid gap-5 sm:grid-cols-2">{["Create your trip", "Invite your travelers", "Build the plan together", "Take it anywhere"].map((item, index) => <li key={item} className="flex gap-4 rounded-2xl border p-5"><span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary font-semibold text-primary-foreground">{index + 1}</span><span className="pt-1.5 font-semibold">{item}</span></li>)}</ol></div></section>

      <section className="mx-5 mb-8 rounded-[2rem] bg-primary px-6 py-16 text-center text-primary-foreground sm:mx-8 lg:mx-auto lg:max-w-7xl"><h2 className="text-3xl font-bold sm:text-4xl">Your next trip deserves one shared plan.</h2><p className="mx-auto mt-4 max-w-xl text-primary-foreground/75">Bring the people, places, details, and memories together with Viatik.</p><Button asChild size="lg" variant="secondary" className="mt-8"><Link href="/register">Create your first trip <ArrowRight /></Link></Button></section>

      <footer className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-12"><p>© {new Date().getFullYear()} Viatik. Plan every detail together.</p><div className="flex gap-5"><Link href="/login" className="hover:text-foreground">Sign in</Link><Link href="/register" className="hover:text-foreground">Create account</Link></div></footer>
    </main>
  );
}
