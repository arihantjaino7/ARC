import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

// The five tab sections plus their sub-pages. "/" is in here too: since V2 the
// home screen is the Home tab, and a signed-out visitor gets /welcome instead.
const PROTECTED_ROUTES = [
  "/",
  "/buddies",
  "/community",
  "/progress",
  "/goals",
  "/settings",
  "/reset-password",
];
const AUTH_ROUTES = ["/login", "/signup", "/forgot-password"];

// Segment-aware match: plain startsWith would let "/log" match "/login"
// (it's a string prefix of it), redirecting /login back to itself forever.
// It also keeps "/" from matching every path in the app.
function matchesRoute(pathname: string, route: string): boolean {
  if (route === "/") return pathname === "/";
  return pathname === route || pathname.startsWith(`${route}/`);
}

export async function proxy(request: NextRequest) {
  const { response, user } = await updateSession(request);
  const { pathname } = request.nextUrl;

  // /join/<token> and /community/join/<token> are public in the sense that
  // they're not one of the five tab sections, but accepting an invite needs
  // an account — send a signed-out visitor to sign up and come straight back
  // here afterwards (V2 Step 7; community invite links reuse the same
  // pattern). /community/join must be checked before the general
  // PROTECTED_ROUTES loop below, since it's a sub-path of the protected
  // "/community" route and would otherwise get the generic /login bounce
  // instead of this next-aware one.
  if (!user && (matchesRoute(pathname, "/join") || matchesRoute(pathname, "/community/join"))) {
    const url = request.nextUrl.clone();
    url.pathname = "/signup";
    url.search = `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }

  if (!user && PROTECTED_ROUTES.some((route) => matchesRoute(pathname, route))) {
    const url = request.nextUrl.clone();
    // The home tab has a real signed-out landing page; everything else just
    // needs a session, so it goes to the login form.
    url.pathname = pathname === "/" ? "/welcome" : "/login";
    return NextResponse.redirect(url);
  }

  if (user && AUTH_ROUTES.some((route) => matchesRoute(pathname, route))) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
