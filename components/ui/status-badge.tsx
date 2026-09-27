import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function StatusBadge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-2 rounded-full bg-green-100 px-4 py-2 text-base font-semibold leading-none text-green-700 lg:px-3.5 lg:py-1.5 lg:text-sm xl:px-4 xl:py-2 xl:text-base",
        className,
      )}
    >
      {children}
    </span>
  );
}
