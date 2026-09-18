"use client";

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
  ShieldCheck,
  Sparkles,
  Users,
  Zap,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { LanguageSwitcher } from "@/components/app-shell/language-switcher";
import { Button } from "@/components/ui/button";
import { IconTile } from "@/components/ui/icon-tile";
import { useI18n } from "@/lib/i18n/i18n-provider";

const features = [
  {
    icon: Users,
    titleKey: "common.featurePlanTitle",
    textKey: "common.featurePlanText",
  },
  {
    icon: CloudOff,
    titleKey: "common.featureOfflineTitle",
    textKey: "common.featureOfflineText",
  },
  {
    icon: Receipt,
    titleKey: "common.featureExpensesTitle",
    textKey: "common.featureExpensesText",
  },
  {
    icon: Camera,
    titleKey: "common.featureMemoriesTitle",
    textKey: "common.featureMemoriesText",
  },
  {
    icon: Sparkles,
    titleKey: "common.featureScoutTitle",
    textKey: "common.featureScoutText",
  },
  {
    icon: ShieldCheck,
    titleKey: "common.featureDocumentsTitle",
    textKey: "common.featureDocumentsText",
  },
];

export default function Home() {
  const { t } = useI18n();
  return (
    <main className="min-h-dvh bg-background">
      <LandingHeader />
      <HeroSection />

      <section id="features" className="border-y bg-muted/40 py-24">
        <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-12">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-viatik-magenta">
              {t("common.landingEverything")}
            </p>
            <h2 className="mt-3 text-4xl font-bold tracking-tight">
              {t("common.landingLessCoordination")}
            </h2>
          </div>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {features.map(({ icon: Icon, titleKey, textKey }) => (
              <article key={titleKey} className="rounded-2xl border bg-card p-6">
                <IconTile className="size-11 rounded-xl">
                  <Icon className="size-5" />
                </IconTile>
                <h3 className="mt-5 text-lg font-semibold">{t(titleKey as "common.featurePlanTitle")}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{t(textKey as "common.featurePlanText")}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="mx-auto max-w-7xl px-5 py-24 sm:px-8 lg:px-12">
        <div className="grid gap-10 lg:grid-cols-[.7fr_1fr]">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-viatik-magenta">
              {t("common.howItWorks")}
            </p>
            <h2 className="mt-3 text-4xl font-bold tracking-tight">
              {t("common.howItWorksTitle")}
            </h2>
          </div>
          <ol className="grid gap-5 sm:grid-cols-2">
            {["common.createTrip", "common.inviteTravelers", "common.buildPlan", "common.takeAnywhere"].map(
              (item, index) => (
                <li key={item} className="flex gap-4 rounded-2xl border p-5">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary font-semibold text-primary-foreground">
                    {index + 1}
                  </span>
                  <span className="pt-1.5 font-semibold">{t(item as "common.createTrip")}</span>
                </li>
              )
            )}
          </ol>
        </div>
      </section>

      <section className="glow-magenta mx-5 mb-8 rounded-[2rem] bg-surface-dark px-6 py-16 text-center text-white sm:mx-8 lg:mx-auto lg:max-w-7xl">
        <h2 className="text-3xl font-bold sm:text-4xl">
          {t("common.ctaTitle")}
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-white/70">
          {t("common.ctaText")}
        </p>
        <Button asChild size="lg" variant="primary" className="mt-8">
          <Link href="/register">
            {t("common.createFirstTrip")} <ArrowRight />
          </Link>
        </Button>
      </section>

      <footer className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-12">
        <p>© {new Date().getFullYear()} Viatik. {t("common.footerPlan")}</p>
        <div className="flex gap-5">
          <Link href="/login" className="hover:text-foreground">
            Sign in
          </Link>
          <Link href="/register" className="hover:text-foreground">
            {t("auth.createAnAccount")}
          </Link>
        </div>
      </footer>
    </main>
  );
}

function LandingHeader() {
  const { t } = useI18n();
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
        <nav className="flex items-center gap-2.5 sm:gap-3" aria-label={t("common.primaryNavigation")}>
          <LanguageSwitcher />
          <Button
            asChild
            size="sm"
            variant="outline"
            className="hidden border-primary/40 bg-transparent text-foreground shadow-sm hover:border-primary/70 hover:bg-primary/10 sm:inline-flex"
          >
            <Link href="#features">{t("common.landingFeatures")}</Link>
          </Button>
          <Button asChild size="sm" variant="primary">
            <Link href="/login" className="group">
              {t("auth.signIn")}
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
  const { t } = useI18n();
  return (
    <section className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_24%,color-mix(in_oklch,var(--primary)_12%,transparent),transparent_34%),radial-gradient(circle_at_88%_52%,color-mix(in_oklch,var(--secondary)_10%,transparent),transparent_32%)]" />
      <div className="relative mx-auto grid max-w-7xl items-center gap-16 px-5 py-20 sm:px-8 sm:py-24 lg:grid-cols-[.92fr_1.08fr] lg:px-12 lg:py-32">
        <div className="max-w-2xl">
          <p className="mb-5 text-sm font-semibold uppercase tracking-[0.2em] text-viatik-magenta">
            {t("common.travelBetter")}
          </p>
          <h1 className="text-5xl font-bold leading-[1.02] tracking-tighter sm:text-6xl lg:text-7xl">
            {t("common.heroTitle")}
          </h1>
          <p className="mt-7 max-w-xl text-lg leading-8 text-muted-foreground sm:text-xl">
            {t("common.heroText")}
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button
              asChild
              size="lg"
              variant="primary"
              className="h-12 px-6 text-base shadow-lg shadow-viatik-red/25"
            >
              <Link href="/register">
                {t("common.startPlanning")} <ArrowRight />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="h-12 border-2 border-viatik-magenta/40 bg-transparent px-6 text-base text-foreground shadow-sm hover:border-viatik-magenta/70 hover:bg-viatik-magenta/10"
            >
              <Link href="#how-it-works">{t("common.seeHow")}</Link>
            </Button>
          </div>
        </div>

        <ProductPreview />
      </div>
    </section>
  );
}

function ProductPreview() {
  const { t } = useI18n();
  return (
    <div className="relative mx-auto w-full max-w-2xl lg:mx-0">
      <div className="absolute -inset-10 -z-10 rounded-[3rem] bg-primary/10 blur-3xl" />
      <div className="overflow-hidden rounded-[1.75rem] border border-border/60 bg-card/95 shadow-2xl shadow-primary/10 backdrop-blur-sm">
        <div className="flex flex-col gap-4 border-b border-border/60 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <p className="text-xs font-semibold text-muted-foreground">{t("common.tripDatesPreview")}</p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight">{t("common.lisbonFriends")}</h2>
          </div>
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-success/25 bg-success/10 px-3 py-1.5 text-xs font-semibold text-success">
            <Zap className="size-3.5" aria-hidden="true" />
            <span>{t("common.offlineReady")}</span>
            <span className="size-1 rounded-full bg-success" aria-hidden="true" />
            <span>{t("common.syncedLabel")}</span>
          </div>
        </div>

        <div className="grid gap-4 p-4 sm:grid-cols-[1.45fr_.8fr] sm:p-5">
          <section className="rounded-2xl border border-border/60 bg-background/65 p-4" aria-labelledby="preview-day">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-primary">{t("common.dayTwo")}</p>
                <h3 id="preview-day" className="mt-1 font-semibold">{t("common.todayLisbon")}</h3>
              </div>
              <span className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">
                <CalendarDays className="size-5" />
              </span>
            </div>

            <div className="relative mt-5 space-y-3 before:absolute before:bottom-5 before:left-4.25 before:top-5 before:w-px before:bg-border">
              <PreviewActivity
                icon={<MapPinned className="size-5" />}
                time="10:00"
                title={t("common.exploreAlfama")}
                detail={t("common.miradouro")}
                active
              />
              <PreviewActivity
                icon={<Clock3 className="size-5" />}
                time="13:30"
                title={t("common.lunchPrado")}
                detail={t("common.reservedTravelers")}
              />
              <PreviewActivity
                icon={<CheckCircle2 className="size-5" />}
                time="19:00"
                title={t("common.sunsetSailing")}
                detail={t("common.ticketsOffline")}
              />
            </div>
          </section>

          <div className="grid gap-4">
            <section className="rounded-2xl border border-border/60 bg-background/65 p-4" aria-label={t("common.tripBudget")}>
              <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                <Receipt className="size-5" />
                {t("common.groupBudget")}
              </div>
              <p className="mt-4 text-2xl font-semibold tracking-tight">$428</p>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full w-[62%] rounded-full bg-primary" />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{t("common.plannedPercent")}</p>
            </section>

            <section className="rounded-2xl border border-border/60 bg-background/65 p-4" aria-label={t("common.travelCrew")}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground">{t("common.travelCrew")}</span>
                <Users className="size-5 text-muted-foreground" />
              </div>
              <div className="mt-4 flex -space-x-2">
                {["AM", "JR", "SK", "+1"].map((name) => (
                  <span
                    key={name}
                    className="grid size-9 place-items-center rounded-full border-2 border-card bg-muted text-xs font-semibold"
                  >
                    {name}
                  </span>
                ))}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">{t("common.travelersPlanning")}</p>
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
        <p className="text-xs font-semibold text-muted-foreground">{time}</p>
        <h4 className="truncate text-sm font-semibold">{title}</h4>
        <p className="truncate text-xs text-muted-foreground">{detail}</p>
      </div>
    </article>
  );
}
