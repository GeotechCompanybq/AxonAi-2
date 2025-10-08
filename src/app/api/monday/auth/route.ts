import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const clientId = process.env.MONDAY_CLIENT_ID;
  const computedRedirectUri = new URL(
    "/api/monday/callback",
    req.nextUrl.origin
  ).toString();
  const redirectUri = process.env.MONDAY_REDIRECT_URI || computedRedirectUri;
  const scope = process.env.MONDAY_SCOPES || "me:read boards:read users:read";
  const uid = req.nextUrl.searchParams.get("uid") || undefined;
  const returnTo = req.nextUrl.searchParams.get("returnTo") || undefined;
  const stateParts = [
    uid ? `uid:${uid}` : null,
    returnTo ? `ret:${returnTo}` : null,
  ].filter(Boolean);
  const state =
    stateParts.length > 0 ? stateParts.join("|") : "monday_oauth_state";
  if (!clientId) {
    return NextResponse.json(
      { error: "Missing MONDAY_CLIENT_ID" },
      { status: 500 }
    );
  }
  const url = new URL("https://auth.monday.com/oauth2/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  url.searchParams.set("scope", scope);
  const res = NextResponse.redirect(url.toString());
  // Stash uid for callback fallback in case provider drops state
  if (uid) {
    try {
      res.cookies.set("monday_uid", uid, {
        httpOnly: true,
        sameSite: "lax",
        secure: true,
        path: "/",
        maxAge: 60 * 10, // 10 minutes
      });
    } catch {}
  }
  return res;
}
