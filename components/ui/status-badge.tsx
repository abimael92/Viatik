import type { ReactNode } from "react";

export function StatusBadge({ children }: { children: ReactNode }) {
  return <span className="inline-flex items-center rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">{children}</span>;
}
