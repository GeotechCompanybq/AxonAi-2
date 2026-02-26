"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { IconSpinner } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentOrgId } from "@/hooks/use-current-org-id";

type IntegrationSummaryMode = "personal" | "org";

type ProviderStatus = {
  connected: boolean;
  extra?: string | null;
};

type PersonalStatus = {
  monday: ProviderStatus;
  jira: ProviderStatus;
  harvest: ProviderStatus;
  microsoft: ProviderStatus;
};

type OrgStatus = {
  monday: ProviderStatus;
  jira: ProviderStatus & { orgSyncLabel: string };
  harvest: ProviderStatus & { orgSyncLabel: string };
};

type IntegrationSummaryProps = {
  mode: IntegrationSummaryMode;
};

export function IntegrationSummary({ mode }: IntegrationSummaryProps) {
  const { user } = useAuth();
  const { orgId } = useCurrentOrgId();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [personal, setPersonal] = useState<PersonalStatus | null>(null);
  const [org, setOrg] = useState<OrgStatus | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadPersonal() {
      if (!user?.uid) return;
      setLoading(true);
      setError(null);
      try {
        const uid = user.uid;
        const [mondayRes, jiraRes, harvestRes, msRes] = await Promise.all([
          fetch(`/api/monday/status?uid=${encodeURIComponent(uid)}`, {
            cache: "no-store",
          }),
          fetch(`/api/jira/status?uid=${encodeURIComponent(uid)}`, {
            cache: "no-store",
          }),
          fetch(`/api/harvest/status?uid=${encodeURIComponent(uid)}`, {
            cache: "no-store",
          }),
          fetch(`/api/microsoft/status?uid=${encodeURIComponent(uid)}`, {
            cache: "no-store",
          }),
        ]);

        const [mondayJson, jiraJson, harvestJson, msJson] = await Promise.all([
          mondayRes.json(),
          jiraRes.json(),
          harvestRes.json(),
          msRes.json(),
        ]);

        if (cancelled) return;

        setPersonal({
          monday: { connected: Boolean(mondayJson?.connected) },
          jira: { connected: Boolean(jiraJson?.connected) },
          harvest: { connected: Boolean(harvestJson?.connected) },
          microsoft: { connected: Boolean(msJson?.connected) },
        });
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message || "Failed to load integration status");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    async function loadOrg() {
      if (!user?.uid || !orgId) return;
      setLoading(true);
      setError(null);
      try {
        const uid = user.uid;
        const [mondayRes, jiraRes, harvestRes, msRes, orgRes] = await Promise.all([
          fetch(`/api/monday/status?uid=${encodeURIComponent(uid)}`, {
            cache: "no-store",
          }),
          fetch(`/api/jira/status?uid=${encodeURIComponent(uid)}`, {
            cache: "no-store",
          }),
          fetch(`/api/harvest/status?uid=${encodeURIComponent(uid)}`, {
            cache: "no-store",
          }),
          fetch(`/api/microsoft/status?uid=${encodeURIComponent(uid)}`, {
            cache: "no-store",
          }),
          fetch(`/api/orgs/${encodeURIComponent(orgId)}/integrations`, {
            cache: "no-store",
          }),
        ]);

        const [mondayJson, jiraJson, harvestJson, msJson, orgJson] =
          await Promise.all([
            mondayRes.json(),
            jiraRes.json(),
            harvestRes.json(),
            msRes.json(),
            orgRes.json(),
          ]);

        if (!orgRes.ok) {
          throw new Error(orgJson?.error || "Failed to load org integrations");
        }

        if (cancelled) return;

        const integrations = orgJson?.integrations || {};
        const jiraSync = Boolean(integrations?.jira?.syncAllUsers);
        const harvestSync = Boolean(integrations?.harvest?.syncAllUsersTimesheets);

        setOrg({
          monday: {
            connected: Boolean(mondayJson?.connected),
            extra: integrations?.monday?.accessToken
              ? "Org workspace configured"
              : null,
          },
          jira: {
            connected: Boolean(jiraJson?.connected),
            orgSyncLabel: jiraSync ? "Org-wide sync enabled" : "Per-user sync only",
          },
          harvest: {
            connected: Boolean(harvestJson?.connected),
            orgSyncLabel: harvestSync
              ? "Org-wide timesheet sync enabled"
              : "Per-user sync only",
          },
        });
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message || "Failed to load organization integrations");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    if (mode === "personal") {
      loadPersonal();
    } else {
      loadOrg();
    }

    return () => {
      cancelled = true;
    };
  }, [mode, user?.uid, orgId]);

  if (!user) return null;

  const renderStatusChip = (connected: boolean) => (
    <span
      className={
        connected ? "text-emerald-500" : "text-muted-foreground text-[11px]"
      }
    >
      {connected ? "Connected" : "Not connected"}
    </span>
  );

  if (mode === "personal") {
    if (!personal && !loading && !error) return null;
    return (
      <Card className="border-border/50 bg-card/70">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center justify-between">
            <span>My Integrations</span>
            <Button asChild size="sm" variant="outline">
              <Link href="/settings">Open Settings</Link>
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-2">
          {loading && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <IconSpinner className="h-3 w-3" /> Checking connections...
            </div>
          )}
          {error && (
            <div className="text-xs text-red-500">
              {error}
            </div>
          )}
          {personal && !loading && !error && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-xs">
              <div className="rounded-lg border border-border/60 bg-background/50 px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium">Monday.com</span>
                  {renderStatusChip(personal.monday.connected)}
                </div>
              </div>
              <div className="rounded-lg border border-border/60 bg-background/50 px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium">Jira</span>
                  {renderStatusChip(personal.jira.connected)}
                </div>
              </div>
              <div className="rounded-lg border border-border/60 bg-background/50 px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium">Harvest</span>
                  {renderStatusChip(personal.harvest.connected)}
                </div>
              </div>
              <div className="rounded-lg border border-border/60 bg-background/50 px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium">Microsoft</span>
                  {renderStatusChip(personal.microsoft.connected)}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  // Org mode
  if (!orgId) return null;

  return (
    <Card className="border-border/50 bg-card/70">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center justify-between">
          <span>Organization Integrations</span>
          <Button asChild size="sm" variant="outline">
            <Link href={`/org/settings?orgId=${encodeURIComponent(orgId)}`}>
              Org Settings
            </Link>
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-2">
        {loading && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <IconSpinner className="h-3 w-3" /> Checking org integrations...
          </div>
        )}
        {error && (
          <div className="text-xs text-red-500">
            {error}
          </div>
        )}
        {org && !loading && !error && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-xs">
            <div className="rounded-lg border border-border/60 bg-background/50 px-3 py-2 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-medium">Monday.com</span>
                {renderStatusChip(org.monday.connected)}
              </div>
              {org.monday.extra && (
                <div className="text-[11px] text-muted-foreground">
                  {org.monday.extra}
                </div>
              )}
            </div>
            <div className="rounded-lg border border-border/60 bg-background/50 px-3 py-2 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-medium">Jira</span>
                {renderStatusChip(org.jira.connected)}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {org.jira.orgSyncLabel}
              </div>
            </div>
            <div className="rounded-lg border border-border/60 bg-background/50 px-3 py-2 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-medium">Harvest</span>
                {renderStatusChip(org.harvest.connected)}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {org.harvest.orgSyncLabel}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
