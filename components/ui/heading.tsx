import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Reusable heading primitive.
 *
 * The optical character-spacing (tracking-tight), weight variants, and font
 * smoothing follow the Apple/Linear design guidance ingested from
 * `.design/tokens/linear.md` — display type carries measured negative tracking
 * and a tight line-height, rendered with antialiased smoothing.
 */
const headingVariants = cva(
  "scroll-m-20 antialiased text-balance tracking-tight",
  {
    variants: {
      level: {
        1: "text-4xl font-bold leading-tight tracking-tighter",
        2: "text-3xl font-bold leading-snug tracking-tight",
        3: "text-2xl font-semibold leading-snug tracking-tight",
        4: "text-xl font-semibold leading-snug tracking-tight",
        5: "text-lg font-semibold leading-snug tracking-tight",
        6: "text-base font-semibold leading-snug tracking-tight",
      },
      weight: {
        normal: "font-normal",
        semibold: "font-semibold",
        bold: "font-bold",
      },
    },
    defaultVariants: {
      level: 1,
    },
  }
);

export interface HeadingProps
  extends React.HTMLAttributes<HTMLHeadingElement>,
    VariantProps<typeof headingVariants> {
  /** Semantic heading level; also drives the type scale. */
  level?: 1 | 2 | 3 | 4 | 5 | 6;
}

function Heading({ level = 1, weight, className, ...props }: HeadingProps) {
  const Comp = (`h${level}` as const) as React.ElementType;
  return (
    <Comp
      className={cn(headingVariants({ level, weight, className }))}
      {...props}
    />
  );
}

export { Heading, headingVariants };
