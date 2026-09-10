"use client";

import * as React from "react";
import { CheckCircle2, Info, TriangleAlert, X } from "lucide-react";

import { cn } from "@/lib/utils";

type ToastVariant = "success" | "info" | "error";

interface Toast {
  id: string;
  title?: string;
  description?: string;
  variant: ToastVariant;
}

interface ToastInput {
  title?: string;
  description?: string;
  variant?: ToastVariant;
}

const ToastContext = React.createContext<{
  toasts: Toast[];
  toast: (input: ToastInput) => void;
  dismiss: (id: string) => void;
}>({ toasts: [], toast: () => {}, dismiss: () => {} });

export function useToast() {
  return React.useContext(ToastContext);
}

const VARIANT_STYLE: Record<ToastVariant, { icon: typeof Info; iconCls: string }> = {
  success: { icon: CheckCircle2, iconCls: "text-success" },
  info: { icon: Info, iconCls: "text-primary" },
  error: { icon: TriangleAlert, iconCls: "text-destructive" },
};

const TOAST_DURATION = 4000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);

  const dismiss = React.useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const toast = React.useCallback(
    (input: ToastInput) => {
      const id = Math.random().toString(36).slice(2);
      setToasts((current) => [...current, { id, variant: "info", ...input }]);
      window.setTimeout(() => dismiss(id), TOAST_DURATION);
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={{ toasts, toast, dismiss }}>{children}</ToastContext.Provider>
  );
}

export function Toaster() {
  const { toasts, dismiss } = useToast();

  return (
    <div
      aria-live="polite"
      aria-label="Notifications"
      className="pointer-events-none fixed inset-x-0 top-4 z-[100] flex flex-col items-center gap-2 px-4 sm:items-end sm:pr-6"
    >
      {toasts.map(({ id, title, description, variant }) => {
        const { icon: Icon, iconCls } = VARIANT_STYLE[variant];
        return (
          <div
            key={id}
            role="status"
            className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border bg-card p-4 shadow-lg backdrop-blur"
          >
            <span className={cn("mt-0.5 grid size-6 shrink-0 place-items-center", iconCls)}>
              <Icon className="size-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              {title && <p className="text-sm font-semibold">{title}</p>}
              {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
            </div>
            <button
              type="button"
              onClick={() => dismiss(id)}
              aria-label="Dismiss notification"
              className="shrink-0 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        );
      })}
    </div>
  );
}
