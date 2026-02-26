"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { IntegrationCard } from "@/components/settings/integration-card";

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

  const configure = useCallback(() => {
    try {
      const url = new URL("/org/settings", window.location.origin);
      url.searchParams.set("source", "microsoft");
      window.location.href = url.toString();
    } catch {
      window.location.href = "/org/settings";
    }
  }, []);

  return (
    <IntegrationCard
      logoSrc="/Intergrations/microsoft.png"
      logoAlt="Microsoft"
      title="Microsoft / Teams Calendar"
      description="Connect to pull your calendar events. Teams meetings are included."
      isConnected={connected}
      providerName="Microsoft"
      primaryAction={{
        label: connected ? "Reconnect" : "Connect",
        onClick: connect,
        variant: "outline",
      }}
      secondaryAction={{
        label: "Configure",
        onClick: configure,
        variant: "ghost",
      }}
      tertiaryAction={{
        label: isLoading ? "Fetching..." : "Pull Calendar",
        onClick: pullCalendar,
        disabled: isLoading || !user?.uid,
        loading: isLoading,
      }}
      statusText={status}
    >
      {events && events.length > 0 ? (
        <div className="space-y-1">
          {events.slice(0, 5).map((event) => (
            <div
              key={event.id}
              className="flex items-center justify-between gap-3"
            >
              <div className="truncate">
                {event.subject || "Untitled"}
              </div>
              {event.isOnlineMeeting && event.onlineMeetingUrl ? (
                <a
                  className="shrink-0 text-xs underline"
                  href={event.onlineMeetingUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Join
                </a>
              ) : null}
            </div>
          ))}
          {events.length > 5 && (
            <div>…and {events.length - 5} more</div>
          )}
        </div>
      ) : null}
    </IntegrationCard>
  );
}
