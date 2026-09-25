import { NextResponse, type NextRequest } from "next/server";

import { recoveryRequestRedirect } from "@/lib/auth/password-recovery";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  const handoff = recoveryRequestRedirect(request.nextUrl);
  if (handoff) return NextResponse.redirect(new URL(handoff, request.nextUrl.origin));
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (browser icons)
     * - public (public files)
     */
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|manifest.webmanifest|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
