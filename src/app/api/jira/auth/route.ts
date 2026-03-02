import { NextRequest, NextResponse } from "next/server";
import { appConfig } from "@/lib/config";

export async function GET(req: NextRequest) {
  const clientId = process.env.JIRA_CLIENT_ID;
  const redirectUri = new URL(
    appConfig.jiraRedirectPath,
    req.nextUrl.origin
  ).toString();

  // Optional: capture user ID for token storage
  const uid = req.nextUrl.searchParams.get("uid") || undefined;

  // Atlassian OAuth 2.0 Authorization URL
  const authUrl = new URL("https://auth.atlassian.com/authorize");
  authUrl.searchParams.set("audience", "api.atlassian.com");
  authUrl.searchParams.set("client_id", clientId || "");

  // Precise scopes matching Jira API configuration
  const scopes = [
    "read:jira-work", // View issue data
    "read:jira-user", // View user profile information
    "read:me", // View active user profile
    "read:account", // View user profiles
    "offline_access", // Allow refresh token
  ];

  authUrl.searchParams.set("scope", scopes.join(" "));
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("prompt", "consent");

  // If user ID is provided, append as state for later reference
  if (uid) {
    authUrl.searchParams.set("state", `uid:${uid}`);
  }

  return NextResponse.redirect(authUrl.toString());
}
