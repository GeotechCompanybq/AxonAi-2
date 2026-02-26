"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { IntegrationCard } from "@/components/settings/integration-card";

export function HarvestConnect({
  returnTo,
  conn,
  label,
}: {
  returnTo?: string;
  conn?: "primary" | "alt";
  label?: string;
}) {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const isAlt = (conn || "primary") !== "primary";

  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const url = new URL("/api/harvest/status", window.location.origin);
        if (user?.uid) url.searchParams.set("uid", user.uid);
        if (isAlt) url.searchParams.set("conn", "alt");
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
    const url = new URL("/api/harvest/auth", window.location.origin);
    if (user?.uid) url.searchParams.set("uid", user.uid);
    if (returnTo) url.searchParams.set("returnTo", returnTo);
    if (isAlt) url.searchParams.set("conn", "alt");
    window.location.href = url.toString();
  }, [user, returnTo, isAlt]);

  const pullTimesheets = useCallback(async () => {
    setIsLoading(true);
    setStatus(null);
    try {
      const url = new URL("/api/harvest/timesheets", window.location.origin);
      // Fetch all pages for a full import/confirmation
      url.searchParams.set("all", "1");
      url.searchParams.set("sync", "1");
      if (isAlt) url.searchParams.set("conn", "alt");
      // Ensure uid is provided even if cookies are absent by reading from auth context or localStorage fallback
      let uidParam: string | undefined = user?.uid || undefined;
      if (!uidParam) {
        try {
          for (let i = 0; i < window.localStorage.length; i++) {
            const key = window.localStorage.key(i) || "";
            if (key.startsWith("firebase:authUser")) {
              const raw = window.localStorage.getItem(key);
              if (!raw) continue;
              try {
                const obj = JSON.parse(raw);
                if (obj?.uid) {
                  uidParam = String(obj.uid);
                  break;
                }
              } catch {}
            }
          }
        } catch {}
      }
      if (uidParam) url.searchParams.set("uid", uidParam);
      const res = await fetch(url.toString());
      const json = await res.json();
      if (!res.ok)
        throw new Error(json?.error || "Failed to fetch time entries");
      const count = Array.isArray(json?.timeEntries)
        ? json.timeEntries.length
        : 0;
      setStatus(
        `Fetched ${count} time entries from Harvest${
          isAlt ? " (Comparison)" : ""
        }.`
      );
    } catch (e: any) {
      setStatus(e?.message || "Failed to fetch Harvest time entries");
    } finally {
      setIsLoading(false);
    }
  }, [isAlt, user?.uid]);

  const configure = useCallback(() => {
    try {
      const url = new URL("/org/settings", window.location.origin);
      url.searchParams.set("source", isAlt ? "harvest-alt" : "harvest");
      window.location.href = url.toString();
    } catch {
      window.location.href = "/org/settings";
    }
  }, [isAlt]);

  const providerTitle = label || (isAlt ? "Grayquarter Harvest" : "Harvest");

  return (
    <IntegrationCard
      logoSrc="/Intergrations/Harvest-New.png"
      logoAlt={providerTitle}
      title={providerTitle}
      description="Connect to pull detailed Harvest timesheets into Axon."
      isConnected={connected}
      providerName={providerTitle}
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
        label: isLoading ? "Fetching..." : "Pull Timesheets",
        onClick: pullTimesheets,
        disabled: isLoading,
        loading: isLoading,
      }}
      statusText={status}
    />
  );
}
