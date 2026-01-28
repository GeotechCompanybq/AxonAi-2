import type { NextRequest } from "next/server";

export function isCronAuthorized(req: NextRequest): boolean {
  const secret = (process.env.CRON_SECRET || "").trim();
  if (!secret) {
    // If no secret configured, default deny (safer).
    return false;
  }

  // Allow either:
  // - Authorization: Bearer <CRON_SECRET>
  // - /api/...?secret=<CRON_SECRET>
  const auth = String(req.headers.get("authorization") || "");
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (m && m[1] && m[1].trim() === secret) return true;

  const qp = req.nextUrl.searchParams.get("secret");
  if (qp && qp.trim() === secret) return true;

  return false;
}






