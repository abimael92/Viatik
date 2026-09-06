/**
 * Zero-layout-shift loading skeleton for the home dashboard. Mirrors the final
 * structure (hero, two-column readiness/timeline, quick-action strip) so the
 * page doesn't jump when live data arrives.
 */
export function HomeSkeleton() {
  return (
    <div className="space-y-6" aria-hidden data-testid="home-skeleton">
      <div className="h-48 animate-pulse rounded-[1.75rem] border bg-muted sm:h-56" />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="h-72 animate-pulse rounded-2xl border bg-muted" />
        <div className="h-72 animate-pulse rounded-2xl border bg-muted" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-2xl border bg-muted" />
        ))}
      </div>
    </div>
  );
}
