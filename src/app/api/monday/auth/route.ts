import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const clientId = process.env.MONDAY_CLIENT_ID;
  const redirectUri = process.env.MONDAY_REDIRECT_URI;
  const state = "monday_oauth_state";
  if (!clientId || !redirectUri) {
    return NextResponse.json(
      { error: "Missing MONDAY_CLIENT_ID or MONDAY_REDIRECT_URI" },
      { status: 500 }
    );
  }
  const url = new URL("https://auth.monday.com/oauth2/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  return NextResponse.redirect(url.toString());
}
