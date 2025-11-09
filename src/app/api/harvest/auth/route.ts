import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const clientId = process.env.HARVEST_CLIENT_ID;
  const computedRedirectUri = new URL(
    "/api/harvest/callback",
    req.nextUrl.origin
  ).toString();
  const redirectUri = process.env.HARVEST_REDIRECT_URI || computedRedirectUri;
  const uid = req.nextUrl.searchParams.get("uid") || undefined;
  const returnTo = req.nextUrl.searchParams.get("returnTo") || undefined;
  // Optional connection slot, e.g. "alt" for comparison org
  const conn = req.nextUrl.searchParams.get("conn") || undefined;

  if (!clientId) {
    return NextResponse.json(
      { error: "Missing HARVEST_CLIENT_ID" },
      { status: 500 }
    );
  }

  // Harvest OAuth authorize endpoint
  // Docs typically at help.getharvest.com or support.getharvest.com
  const authUrl = new URL("https://id.getharvest.com/oauth2/authorize");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("redirect_uri", redirectUri);
  // Optional state for returning to a page and binding to a user
  const stateParts = [
    uid ? `uid:${uid}` : null,
    returnTo ? `ret:${returnTo}` : null,
    conn ? `conn:${conn}` : null,
  ].filter(Boolean) as string[];
  const state = stateParts.length > 0 ? stateParts.join("|") : "harvest_oauth";
  authUrl.searchParams.set("state", state);

  return NextResponse.redirect(authUrl.toString());
}
