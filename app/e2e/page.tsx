import { notFound } from "next/navigation";

import { E2EClient } from "@/app/e2e/e2e-client";

export default function E2EPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <E2EClient />;
}
