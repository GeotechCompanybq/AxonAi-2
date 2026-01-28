import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getDb, getCollectionNames } from "@/lib/mongo";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import crypto from "crypto";

export type MicrosoftTokenSet = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number; // epoch ms
  tokenType?: string;
  scope?: string;
  updatedAt?: number;
};

function looksLikeGuid(value: string): boolean {
  // Azure "Secret ID" is typically a GUID. "Secret Value" is usually a long random string.
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value.trim()
  );
}

// PKCE helper functions
function generateCodeVerifier(): string {
  return crypto
    .randomBytes(32)
    .toString("base64url");
}

function generateCodeChallenge(verifier: string): string {
  return crypto
    .createHash("sha256")
    .update(verifier)
    .digest("base64url");
}

export function getMicrosoftClientSecret(): string {
  const raw = (process.env.MICROSOFT_CLIENT_SECRET || "").trim();
  if (!raw) {
    throw new Error("Missing MICROSOFT_CLIENT_SECRET");
  }
  if (looksLikeGuid(raw)) {
    throw new Error(
      [
        "Invalid Microsoft client secret: MICROSOFT_CLIENT_SECRET looks like an Entra 'Secret ID' (GUID).",
        "You must use the secret *Value* (shown once when you create the secret), not the Secret ID.",
      ].join(" ")
    );
  }
  return raw;
}

export function getMicrosoftTenantId(): string {
  return (process.env.MICROSOFT_TENANT_ID || "common").trim() || "common";
}

export function getMicrosoftScopes(): string {
  // Minimum required for calendar reads + refresh
  return (
    process.env.MICROSOFT_SCOPES ||
    "openid profile email offline_access User.Read Calendars.Read"
  );
}

export function getMicrosoftRedirectUri({ req }: { req: NextRequest }): string {
  const computed = new URL("/api/microsoft/callback", req.nextUrl.origin).toString();
  return process.env.MICROSOFT_REDIRECT_URI || computed;
}

export function buildMicrosoftAuthorizeUrl({
  req,
  state,
}: {
  req: NextRequest;
  state: string;
}): { url: string; codeVerifier: string } {
  const clientId = process.env.MICROSOFT_CLIENT_ID || "";
  const tenant = getMicrosoftTenantId();
  const redirectUri = getMicrosoftRedirectUri({ req });
  const scope = getMicrosoftScopes();

  // Generate PKCE parameters
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);

  const url = new URL(
    `https://login.microsoftonline.com/${encodeURIComponent(
      tenant
    )}/oauth2/v2.0/authorize`
  );
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("scope", scope);
  url.searchParams.set("state", state);
  // Force prompt on first connect so we reliably get a refresh token
  url.searchParams.set("prompt", "consent");
  // Add PKCE parameters
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");

  return { url: url.toString(), codeVerifier };
}

export async function exchangeMicrosoftCodeForTokens({
  req,
  code,
  codeVerifier,
}: {
  req: NextRequest;
  code: string;
  codeVerifier: string;
}): Promise<MicrosoftTokenSet> {
  const tenant = getMicrosoftTenantId();
  const clientId = process.env.MICROSOFT_CLIENT_ID!;
  const clientSecret = getMicrosoftClientSecret();
  const redirectUri = getMicrosoftRedirectUri({ req });

  const params = new URLSearchParams();
  params.set("client_id", clientId);
  params.set("client_secret", clientSecret);
  params.set("code", code);
  params.set("redirect_uri", redirectUri);
  params.set("grant_type", "authorization_code");
  // Add PKCE code_verifier
  params.set("code_verifier", codeVerifier);

  const tokenRes = await fetch(
    `https://login.microsoftonline.com/${encodeURIComponent(
      tenant
    )}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    }
  );

  const tokenJson = await tokenRes.json();
  if (!tokenRes.ok) {
    const message =
      (tokenJson as any)?.error_description ||
      (tokenJson as any)?.error ||
      "Microsoft token exchange failed";
    throw new Error(message);
  }

  const expiresIn = Number((tokenJson as any)?.expires_in || 3600);
  const expiresAt = Date.now() + Math.max(0, expiresIn - 30) * 1000; // small safety window

  return {
    accessToken: String((tokenJson as any)?.access_token || ""),
    refreshToken: (tokenJson as any)?.refresh_token
      ? String((tokenJson as any)?.refresh_token)
      : undefined,
    expiresAt,
    tokenType: (tokenJson as any)?.token_type
      ? String((tokenJson as any)?.token_type)
      : "Bearer",
    scope: (tokenJson as any)?.scope ? String((tokenJson as any)?.scope) : undefined,
    updatedAt: Date.now(),
  };
}

export async function refreshMicrosoftTokens({
  refreshToken,
}: {
  refreshToken: string;
}): Promise<MicrosoftTokenSet> {
  const tenant = getMicrosoftTenantId();
  const clientId = process.env.MICROSOFT_CLIENT_ID!;
  const clientSecret = getMicrosoftClientSecret();
  const scope = getMicrosoftScopes();

  const params = new URLSearchParams();
  params.set("client_id", clientId);
  params.set("client_secret", clientSecret);
  params.set("refresh_token", refreshToken);
  params.set("grant_type", "refresh_token");
  params.set("scope", scope);

  const tokenRes = await fetch(
    `https://login.microsoftonline.com/${encodeURIComponent(
      tenant
    )}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    }
  );

  const tokenJson = await tokenRes.json();
  if (!tokenRes.ok) {
    const message =
      (tokenJson as any)?.error_description ||
      (tokenJson as any)?.error ||
      "Microsoft token refresh failed";
    throw new Error(message);
  }

  const expiresIn = Number((tokenJson as any)?.expires_in || 3600);
  const expiresAt = Date.now() + Math.max(0, expiresIn - 30) * 1000;

  return {
    accessToken: String((tokenJson as any)?.access_token || ""),
    refreshToken: (tokenJson as any)?.refresh_token
      ? String((tokenJson as any)?.refresh_token)
      : refreshToken,
    expiresAt,
    tokenType: (tokenJson as any)?.token_type
      ? String((tokenJson as any)?.token_type)
      : "Bearer",
    scope: (tokenJson as any)?.scope ? String((tokenJson as any)?.scope) : undefined,
    updatedAt: Date.now(),
  };
}

export async function getUidFromRequest({
  req,
}: {
  req: NextRequest;
}): Promise<string | null> {
  const qp = req.nextUrl.searchParams.get("uid");
  if (qp) return qp;

  const authHeader = req.headers.get("authorization") || "";
  const match = authHeader.match(/^Bearer (.+)$/i);
  if (!match) return null;

  try {
    const adminAuth = getAdminAuth();
    if (!adminAuth) return null;
    const decoded = await adminAuth.verifyIdToken(match[1]);
    return decoded.uid;
  } catch {
    return null;
  }
}

export async function loadMicrosoftTokensForUser({
  req,
  uid,
}: {
  req: NextRequest;
  uid?: string;
}): Promise<MicrosoftTokenSet | null> {
  const cookieStore = await cookies();
  const cookieToken = cookieStore.get("microsoft_token")?.value || undefined;
  const cookieRefresh =
    cookieStore.get("microsoft_refresh_token")?.value || undefined;
  const cookieExpiresAtRaw =
    cookieStore.get("microsoft_expires_at")?.value || undefined;
  const cookieExpiresAt = cookieExpiresAtRaw ? Number(cookieExpiresAtRaw) : undefined;

  if (cookieToken) {
    return {
      accessToken: cookieToken,
      refreshToken: cookieRefresh,
      expiresAt: Number.isFinite(cookieExpiresAt as number)
        ? (cookieExpiresAt as number)
        : undefined,
      updatedAt: Date.now(),
    };
  }

  if (!uid) return null;

  // Mongo first
  try {
    const db = await getDb();
    const { users } = getCollectionNames();
    const doc = await db.collection(users).findOne({ uid });
    const ms = (doc as any)?.microsoft as any;
    if (ms?.accessToken) {
      return {
        accessToken: String(ms.accessToken),
        refreshToken: ms.refreshToken ? String(ms.refreshToken) : undefined,
        expiresAt: ms.expiresAt ? Number(ms.expiresAt) : undefined,
        tokenType: ms.tokenType ? String(ms.tokenType) : undefined,
        scope: ms.scope ? String(ms.scope) : undefined,
        updatedAt: ms.updatedAt ? Number(ms.updatedAt) : Date.now(),
      };
    }
  } catch {}

  // Firestore fallback
  try {
    const adminDb = getAdminDb();
    if (!adminDb) return null;
    const snap = await adminDb.collection("users").doc(uid).get();
    const ms = snap.get("microsoft") as any;
    if (ms?.accessToken) {
      return {
        accessToken: String(ms.accessToken),
        refreshToken: ms.refreshToken ? String(ms.refreshToken) : undefined,
        expiresAt: ms.expiresAt ? Number(ms.expiresAt) : undefined,
        tokenType: ms.tokenType ? String(ms.tokenType) : undefined,
        scope: ms.scope ? String(ms.scope) : undefined,
        updatedAt: ms.updatedAt ? Number(ms.updatedAt) : Date.now(),
      };
    }
  } catch {}

  return null;
}

export async function persistMicrosoftTokensForUser({
  uid,
  tokens,
}: {
  uid: string;
  tokens: MicrosoftTokenSet;
}): Promise<void> {
  // Mongo
  try {
    const db = await getDb();
    const { users } = getCollectionNames();
    await db.collection(users).updateOne(
      { uid },
      {
        $set: {
          uid,
          microsoft: {
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken || null,
            expiresAt: tokens.expiresAt || null,
            tokenType: tokens.tokenType || "Bearer",
            scope: tokens.scope || null,
            updatedAt: tokens.updatedAt || Date.now(),
          },
        },
      },
      { upsert: true }
    );
  } catch (err) {
    console.error("Failed to persist Microsoft tokens in Mongo", err);
  }

  // Firestore (best-effort)
  try {
    const { adminDb } = await import("@/lib/firebase-admin");
    await adminDb.collection("users").doc(uid).set(
      {
        microsoft: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken || null,
          expiresAt: tokens.expiresAt || null,
          tokenType: tokens.tokenType || "Bearer",
          scope: tokens.scope || null,
          updatedAt: tokens.updatedAt || Date.now(),
        },
      },
      { merge: true }
    );
  } catch {}
}

export async function setMicrosoftAuthCookies({
  tokens,
}: {
  tokens: MicrosoftTokenSet;
}): Promise<void> {
  const cookieStore = await cookies();
  const secureCookie = process.env.NODE_ENV === "production";
  cookieStore.set("microsoft_token", tokens.accessToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookie,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  if (tokens.refreshToken) {
    cookieStore.set("microsoft_refresh_token", tokens.refreshToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: secureCookie,
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  if (tokens.expiresAt) {
    cookieStore.set("microsoft_expires_at", String(tokens.expiresAt), {
      httpOnly: true,
      sameSite: "lax",
      secure: secureCookie,
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }
}


