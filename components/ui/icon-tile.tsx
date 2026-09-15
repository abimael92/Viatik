import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Structured micro-container for navigational and feature icons.
 *
 * Theme-aware 1px hairline border with a subtle neutral fill so icons never
 * float as raw elements. Static icons inherit `text-muted-foreground`; pass a
 * brand tint (e.g. `text-viatik-blue`, or a magenta glow for active states)
 * via `className` for contextual tinting.
 */
function IconTile({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-lg",
        "border border-black/5 bg-black/5 text-muted-foreground",
        "data-[theme=dark]:border-white/10 data-[theme=dark]:bg-white/5",
        className
      )}
      {...props}
    />
  );
}

export { IconTile };
