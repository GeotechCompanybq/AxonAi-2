import { NextRequest, NextResponse } from "next/server";
import {
  getUidFromRequest,
  loadMicrosoftTokensForUser,
  persistMicrosoftTokensForUser,
  refreshMicrosoftTokens,
  setMicrosoftAuthCookies,
  type MicrosoftTokenSet,
} from "@/lib/microsoft";

function defaultRange(): { start: string; end: string } {
  const start = new Date();
  const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
}

function isExpired({ tokens }: { tokens: MicrosoftTokenSet }): boolean {
  if (!tokens.expiresAt) return false;
  return Date.now() >= tokens.expiresAt - 30_000;
}

async function fetchCalendarView({
  accessToken,
  start,
  end,
  timezone,
}: {
  accessToken: string;
  start: string;
  end: string;
  timezone?: string;
}) {
  const url = new URL("https://graph.microsoft.com/v1.0/me/calendarView");
  url.searchParams.set("startDateTime", start);
  url.searchParams.set("endDateTime", end);

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Prefer: `outlook.timezone="${timezone || "UTC"}"`,
    },
    cache: "no-store",
  });
  const json = await res.json();
  return { res, json };
}

export async function GET(req: NextRequest) {
  try {
    const uid = (await getUidFromRequest({ req })) || undefined;
    const { start, end } = (() => {
      const qpStart = req.nextUrl.searchParams.get("start") || undefined;
      const qpEnd = req.nextUrl.searchParams.get("end") || undefined;
      if (qpStart && qpEnd) return { start: qpStart, end: qpEnd };
      return defaultRange();
    })();
    const timezone = req.nextUrl.searchParams.get("tz") || "UTC";

    let tokens = await loadMicrosoftTokensForUser({ req, uid });
    if (!tokens?.accessToken) {
      return NextResponse.json(
        { error: "Not connected to Microsoft" },
        { status: 400 }
      );
    }

    // Refresh proactively if expired and we have refresh token
    if (uid && isExpired({ tokens }) && tokens.refreshToken) {
      try {
        const refreshed = await refreshMicrosoftTokens({
          refreshToken: tokens.refreshToken,
        });
        tokens = refreshed;
        await persistMicrosoftTokensForUser({ uid, tokens: refreshed });
        await setMicrosoftAuthCookies({ tokens: refreshed });
      } catch {
        // fallthrough; we'll attempt the call and handle 401 below
      }
    }

    let { res, json } = await fetchCalendarView({
      accessToken: tokens.accessToken,
      start,
      end,
      timezone,
    });

    // If token is invalid, try refresh once (when possible)
    if (!res.ok && res.status === 401 && uid && tokens.refreshToken) {
      const refreshed = await refreshMicrosoftTokens({
        refreshToken: tokens.refreshToken,
      });
      await persistMicrosoftTokensForUser({ uid, tokens: refreshed });
      await setMicrosoftAuthCookies({ tokens: refreshed });
      const retry = await fetchCalendarView({
        accessToken: refreshed.accessToken,
        start,
        end,
        timezone,
      });
      res = retry.res;
      json = retry.json;
    }

    if (!res.ok) {
      const message =
        (json as any)?.error?.message ||
        (json as any)?.error_description ||
        "Failed to fetch calendar";
      return NextResponse.json({ error: message }, { status: res.status });
    }

    const events = Array.isArray((json as any)?.value) ? (json as any).value : [];
    const simplified = events.map((e: any) => ({
      id: e?.id,
      subject: e?.subject || null,
      start: e?.start || null,
      end: e?.end || null,
      isAllDay: Boolean(e?.isAllDay),
      isOnlineMeeting: Boolean(e?.isOnlineMeeting),
      onlineMeetingUrl: e?.onlineMeeting?.joinUrl || e?.onlineMeetingUrl || null,
      location: e?.location?.displayName || null,
      organizer: e?.organizer?.emailAddress?.address || null,
      attendeesCount: Array.isArray(e?.attendees) ? e.attendees.length : 0,
    }));

    return NextResponse.json({
      range: { start, end, timezone },
      events: simplified,
      count: simplified.length,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to fetch calendar";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}


