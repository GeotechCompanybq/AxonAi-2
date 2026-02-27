"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { IntegrationCard } from "@/components/settings/integration-card";

type LoomTranscript = {
  id: string;
  title: string;
  createdAt: string;
};

export function LoomConnect({ returnTo }: { returnTo?: string }) {
  const { user } = useAuth();
  const [connected, setConnected] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [transcripts, setTranscripts] = useState<LoomTranscript[] | null>(null);

  useEffect(() => {
    let ignore = false;
    (async () => {
      if (!user?.uid) {
        setConnected(false);
        return;
      }
      try {
        const url = new URL("/api/loom/status", window.location.origin);
        url.searchParams.set("uid", user.uid);
        const res = await fetch(url.toString(), { cache: "no-store" });
        const json = await res.json();
        if (!ignore) {
          setConnected(Boolean(json?.connected));
          if (json?.message) setStatus(String(json.message));
        }
      } catch {
        if (!ignore) setConnected(false);
      }
    })();
    return () => {
      ignore = true;
    };
  }, [user?.uid]);

  const connect = useCallback(async () => {
    if (!user?.uid) return;
    setIsLoading(true);
    setStatus(null);
    try {
      const res = await fetch("/api/loom/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: user.uid, returnTo }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to mark Loom connected");
      setConnected(true);
      if (json?.message) setStatus(String(json.message));
    } catch (e) {
      setStatus(
        e instanceof Error ? e.message : "Failed to enable Loom integration"
      );
    } finally {
      setIsLoading(false);
    }
  }, [user?.uid, returnTo]);

  const disconnect = useCallback(async () => {
    if (!user?.uid) return;
    setIsLoading(true);
    setStatus(null);
    try {
      const res = await fetch("/api/loom/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: user.uid }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to disconnect Loom");
      setConnected(false);
      setTranscripts(null);
      if (json?.message) {
        setStatus(String(json.message));
      } else {
        setStatus("Loom integration disabled for this workspace user.");
      }
    } catch (e) {
      setStatus(
        e instanceof Error ? e.message : "Failed to disconnect Loom integration"
      );
    } finally {
      setIsLoading(false);
    }
  }, [user?.uid]);

  const pullTranscripts = useCallback(async () => {
    if (!user?.uid) return;
    setIsLoading(true);
    setStatus(null);
    setTranscripts(null);
    try {
      const url = new URL("/api/loom/transcripts", window.location.origin);
      url.searchParams.set("uid", user.uid);
      const res = await fetch(url.toString(), { cache: "no-store" });
      const json = await res.json();
      if (!res.ok)
        throw new Error(json?.error || "Failed to fetch Loom transcripts");
      const items: LoomTranscript[] = Array.isArray(json?.transcripts)
        ? json.transcripts
        : [];
      setTranscripts(items);
      if (items.length > 0) {
        setStatus(`Fetched ${items.length} Loom meeting transcripts.`);
      } else if (json?.message) {
        setStatus(String(json.message));
      } else {
        setStatus("No Loom transcripts available yet.");
      }
    } catch (e) {
      setStatus(
        e instanceof Error ? e.message : "Failed to fetch Loom transcripts"
      );
    } finally {
      setIsLoading(false);
    }
  }, [user?.uid]);

  const configure = useCallback(() => {
    try {
      const url = new URL("/org/settings", window.location.origin);
      url.searchParams.set("source", "loom");
      if (returnTo) url.searchParams.set("returnTo", returnTo);
      window.location.href = url.toString();
    } catch {
      window.location.href = "/org/settings";
    }
  }, [returnTo]);

  const viewSyncLogs = useCallback(() => {
    try {
      const url = new URL("/sync-logs", window.location.origin);
      url.searchParams.set("source", "loom");
      if (user?.uid) url.searchParams.set("uid", user.uid);
      window.location.href = url.toString();
    } catch {
      window.location.href = "/sync-logs";
    }
  }, [user?.uid]);

  return (
    <IntegrationCard
      logoSrc="/Intergrations/loom.png"
      logoAlt="Loom"
      title="Loom Meetings"
      description="Keep Loom meeting transcripts alongside your plans and analytics."
      isConnected={connected}
      providerName="Loom"
      primaryAction={
        connected
          ? {
              label: "Disconnect",
              onClick: disconnect,
              variant: "outline",
              size: "sm",
              className:
                "border-destructive/40 text-destructive hover:bg-destructive/5",
            }
          : {
              label: "Connect",
              onClick: connect,
              variant: "outline",
              size: "sm",
            }
      }
      secondaryAction={{
        label: "Configure",
        onClick: configure,
        variant: "ghost",
        size: "sm",
      }}
      tertiaryAction={{
        label: isLoading ? "Fetching..." : "Pull Transcripts",
        onClick: pullTranscripts,
        disabled: isLoading || !user?.uid,
        loading: isLoading,
        size: "sm",
      }}
      statusText={status}
      metaRight={
        connected ? (
          <button
            type="button"
            className="text-xs font-medium text-primary hover:underline"
            onClick={viewSyncLogs}
          >
            View Sync Logs
          </button>
        ) : null
      }
    >
      {transcripts && transcripts.length > 0 ? (
        <div className="space-y-1">
          {transcripts.slice(0, 4).map((t) => (
            <div
              key={t.id}
              className="flex items-center justify-between gap-3"
            >
              <div className="truncate">{t.title || "Untitled meeting"}</div>
              <div className="shrink-0 text-[11px] text-muted-foreground">
                {new Date(t.createdAt).toLocaleDateString()}
              </div>
            </div>
          ))}
          {transcripts.length > 4 && (
            <div className="text-xs text-muted-foreground">
              …and {transcripts.length - 4} more
            </div>
          )}
        </div>
      ) : null}
    </IntegrationCard>
  );
}

