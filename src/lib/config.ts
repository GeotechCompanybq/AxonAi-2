const FALLBACK_APP_URL =
  process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://axonai.bqitech.com";

export const appConfig = {
  appUrl: process.env.APP_URL?.trim() || FALLBACK_APP_URL,
  harvestRedirectPath: "/api/harvest/callback",
  jiraRedirectPath: "/api/jira/callback",
  mondayRedirectPath: "/api/monday/callback",
  mondayScopes: "me:read boards:read users:read",
  mondayReadUpdates:
    /^(1|true|yes)$/i.test(
      process.env.MONDAY_READ_UPDATES || ""
    ) || false,
} as const;

