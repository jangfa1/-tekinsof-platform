import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";

// Sections of the (app) route group. Unknown paths fall through to Next's 404 instead of /login;
// every (app) page is still guarded by requireActor() in its layout.
const privateSections = [
  "/leads",
  "/oportunidades",
  "/cotizaciones",
  "/empresas",
  "/contactos",
  "/catalogo",
  "/landings",
  "/configuracion",
];

function isPrivate(pathname: string): boolean {
  return privateSections.some(
    (section) => pathname === section || pathname.startsWith(`${section}/`),
  );
}

// Optimistic redirect only: it checks that a session cookie exists. Real authorization happens in
// requireActor()/authorize() from src/lib/actor.ts.
export function proxy(request: NextRequest) {
  const hasSession = Boolean(getSessionCookie(request));
  const { pathname } = request.nextUrl;
  if (pathname === "/") {
    return NextResponse.redirect(new URL(hasSession ? "/leads" : "/login", request.url));
  }
  if (!hasSession && isPrivate(pathname)) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", pathname);
    return NextResponse.redirect(login);
  }
  // The (app) layout reads this to deny a route before streaming starts, so the 404 status is real.
  const forwarded = new Headers(request.headers);
  forwarded.set("x-pathname", pathname);
  return NextResponse.next({ request: { headers: forwarded } });
}

export const config = { matcher: ["/((?!api|login|_next|favicon.ico).*)"] };
