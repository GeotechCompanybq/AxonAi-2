import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const clientId = process.env.MONDAY_CLIENT_ID;
  const computedRedirectUri = new URL(
    "/api/monday/callback",
    req.nextUrl.origin
  ).toString();
  const redirectUri = process.env.MONDAY_REDIRECT_URI || computedRedirectUri;
  const scope = process.env.MONDAY_SCOPES || "me:read boards:read users:read";
  const state = "monday_oauth_state";
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
  return NextResponse.redirect(url.toString());
}
