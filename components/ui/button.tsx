import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold " +
    "transition-all duration-200 ease-out disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98] " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 " +
    "[&_svg]:pointer-events-none [&_svg]:size-5 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // primary is the Viatik signature CTA: the V-icon's magenta→coral-red
        // particle-tip gradient, reserved for primary CTAs and critical actions.
        primary:
          "bg-linear-to-r from-viatik-magenta to-viatik-red text-white " +
          "shadow-[0_1px_2px_rgba(244,63,94,0.25)] hover:opacity-90",
        default: "bg-primary text-primary-foreground hover:opacity-90",
        secondary: "border border-foreground/30 bg-primary/10 text-foreground hover:bg-primary/20",
        ai: "border-2 border-viatik-blue/40 bg-viatik-blue/10 text-foreground hover:bg-viatik-blue/20",
        destructive: "bg-destructive text-destructive-foreground hover:opacity-90",
        outline: "border border-input bg-transparent hover:bg-muted",
        ghost: "hover:bg-muted",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        // default & icon meet the 44px touch-target guideline.
        default: "h-11 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp className={cn(buttonVariants({ variant, size, className }))} {...props} />
  );
}

export { Button, buttonVariants };
