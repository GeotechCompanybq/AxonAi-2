"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { IconSpinner } from "@/components/icons";
import { useAuth } from "@/hooks/use-auth";

export function HarvestConnect({ returnTo }: { returnTo?: string }) {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const url = new URL("/api/harvest/status", window.location.origin);
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
    const url = new URL("/api/harvest/auth", window.location.origin);
    if (user?.uid) url.searchParams.set("uid", user.uid);
    if (returnTo) url.searchParams.set("returnTo", returnTo);
    window.location.href = url.toString();
  }, [user, returnTo]);

  const pullTimesheets = useCallback(async () => {
    setIsLoading(true);
    setStatus(null);
    try {
      const today = new Date();
      const start = new Date(today);
      start.setDate(today.getDate() - 7);
      const from = start.toISOString().slice(0, 10);
      const to = today.toISOString().slice(0, 10);
      const url = new URL("/api/harvest/timesheets", window.location.origin);
      url.searchParams.set("from", from);
      url.searchParams.set("to", to);
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
      setStatus(`Fetched ${count} recent time entries from Harvest.`);
    } catch (e: any) {
      setStatus(e?.message || "Failed to fetch Harvest time entries");
    } finally {
      setIsLoading(false);
    }
  }, []);

  return (
    <Card>
      <CardContent className="py-6 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">Harvest</div>
            <div className="text-xs text-muted-foreground">
              Connect to pull timesheets
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={connect} variant="outline">
              {connected ? "Reconnect" : "Connect"}
            </Button>
            <Button onClick={pullTimesheets} disabled={isLoading}>
              {isLoading ? (
                <>
                  <IconSpinner className="h-4 w-4" /> Fetching...
                </>
              ) : (
                "Pull Timesheets"
              )}
            </Button>
          </div>
        </div>
        {connected && (
          <div className="text-xs">
            <span className="text-emerald-600">Connected</span> to Harvest
          </div>
        )}
        {status && (
          <div className="text-xs text-muted-foreground">{status}</div>
        )}
      </CardContent>
    </Card>
  );
}
