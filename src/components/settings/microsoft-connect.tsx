"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { IconSpinner } from "@/components/icons";
import { useAuth } from "@/hooks/use-auth";

type CalendarEvent = {
  id: string;
  subject: string | null;
  start: any;
  end: any;
  isAllDay: boolean;
  isOnlineMeeting: boolean;
  onlineMeetingUrl: string | null;
  location: string | null;
};

export function MicrosoftConnect({ returnTo }: { returnTo?: string }) {
  const { user } = useAuth();
  const [connected, setConnected] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [events, setEvents] = useState<CalendarEvent[] | null>(null);

  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const url = new URL("/api/microsoft/status", window.location.origin);
        if (user?.uid) url.searchParams.set("uid", user.uid);
        const res = await fetch(url.toString(), { cache: "no-store" });
        const json = await res.json();
        if (!ignore) setConnected(Boolean(json?.connected));
      } catch {
        if (!ignore) setConnected(false);
      }
    })();
    return () => {
      ignore = true;
    };
  }, [user?.uid]);

  const connect = useCallback(() => {
    const url = new URL("/api/microsoft/auth", window.location.origin);
    if (user?.uid) url.searchParams.set("uid", user.uid);
    if (returnTo) url.searchParams.set("returnTo", returnTo);
    window.location.href = url.toString();
  }, [user?.uid, returnTo]);

  const pullCalendar = useCallback(async () => {
    if (!user?.uid) return;
    setIsLoading(true);
    setStatus(null);
    setEvents(null);
    try {
      const url = new URL("/api/microsoft/calendar", window.location.origin);
      url.searchParams.set("uid", user.uid);
      // default API range is next 7 days; keep client simple
      const res = await fetch(url.toString(), { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to fetch calendar");
      const items: CalendarEvent[] = Array.isArray(json?.events)
        ? json.events
        : [];
      setEvents(items);
      setStatus(
        `Fetched ${items.length} events from Microsoft Calendar (Teams meetings included).`
      );
    } catch (e: any) {
      setStatus(e?.message || "Failed to fetch calendar");
    } finally {
      setIsLoading(false);
    }
  }, [user?.uid]);

  return (
    <Card>
      <CardContent className="py-6 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img 
              src="/Intergrations/microsoft.png" 
              alt="Microsoft" 
              className="h-8 w-auto object-contain"
            />
            <div>
              <div className="text-sm font-medium">Microsoft / Teams Calendar</div>
              <div className="text-xs text-muted-foreground">
                Connect to pull your calendar events (Teams meetings are included)
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={connect} variant="outline">
              {connected ? "Reconnect" : "Connect"}
            </Button>
            <Button onClick={pullCalendar} disabled={isLoading || !user?.uid}>
              {isLoading ? (
                <>
                  <IconSpinner className="h-4 w-4" /> Fetching...
                </>
              ) : (
                "Pull Calendar"
              )}
            </Button>
          </div>
        </div>

        {connected && (
          <div className="text-xs">
            <span className="text-emerald-600">Connected</span> to Microsoft
          </div>
        )}

        {status && <div className="text-xs text-muted-foreground">{status}</div>}

        {events && events.length > 0 && (
          <div className="text-xs text-muted-foreground space-y-1">
            {events.slice(0, 5).map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-3">
                <div className="truncate">{e.subject || "Untitled"}</div>
                {e.isOnlineMeeting && e.onlineMeetingUrl ? (
                  <a
                    className="shrink-0 underline"
                    href={e.onlineMeetingUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Join
                  </a>
                ) : null}
              </div>
            ))}
            {events.length > 5 && <div>…and {events.length - 5} more</div>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}


