import { NextResponse, type NextRequest } from "next/server";

import { recoveryRequestRedirect } from "@/lib/auth/password-recovery";
import { isProtectedPath, loginPath } from "@/lib/auth/safe-next";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  const handoff = recoveryRequestRedirect(request.nextUrl);
  if (handoff) return NextResponse.redirect(new URL(handoff, request.nextUrl.origin));
  const { response, authenticated } = await updateSession(request);
  if (authenticated === false && isProtectedPath(request.nextUrl.pathname)) {
    const { pathname, search } = request.nextUrl;
    const redirect = NextResponse.redirect(new URL(loginPath(`${pathname}${search}`), request.nextUrl.origin));
    // Carry any cleared or refreshed auth cookies onto the redirect.
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    return redirect;
  }
  return response;
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
