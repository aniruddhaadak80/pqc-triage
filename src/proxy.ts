import { NextResponse, type NextRequest } from "next/server";

const COOKIE = "pqc_sid";
const HEADER = "x-pqc-session";

/**
 * Assigns the anonymous owner cookie before anything else runs, and forwards the
 * id on an internal request header so a Server Component rendering on the very
 * first request already knows who owns the data. The cookie is HttpOnly, so a
 * script can neither read nor forge the owner scope.
 */
export function proxy(request: NextRequest) {
  const existing = request.cookies.get(COOKIE)?.value;
  if (existing && /^[0-9a-f]{32}$/.test(existing)) return NextResponse.next();

  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const sessionId = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

  const headersOut = new Headers(request.headers);
  headersOut.set(HEADER, sessionId);

  const response = NextResponse.next({ request: { headers: headersOut } });
  response.cookies.set({
    name: COOKIE,
    value: sessionId,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.VERCEL === "1",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.[a-zA-Z0-9]+$).*)"],
};