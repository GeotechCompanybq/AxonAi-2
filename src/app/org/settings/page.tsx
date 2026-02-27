"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { MondayConnect } from "@/components/settings/monday-connect";
import { JiraConnect } from "@/components/settings/jira-connect";
import { HarvestConnect } from "@/components/settings/harvest-connect";
import { MicrosoftConnect } from "@/components/settings/microsoft-connect";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { IconSpinner } from "@/components/icons";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentOrgId } from "@/hooks/use-current-org-id";

type Integrations = {
  monday?: { accessToken?: string };
  jira?: {
    accessToken?: string;
    refreshToken?: string;
    syncAllUsers?: boolean;
  };
  harvest?: {
    syncAllUsersTimesheets?: boolean;
  };
};

export default function OrgSettingsPage() {
  const { user } = useAuth();
  const { orgId } = useCurrentOrgId();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [integrations, setIntegrations] = useState<Integrations>({});
  const [error, setError] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    (async () => {
      if (!orgId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/orgs/${orgId}/integrations`, {
          cache: "no-store",
        });
        const json = await res.json();
        if (!res.ok)
          throw new Error(json.error || "Failed to load integrations");
        if (!ignore) setIntegrations(json.integrations || {});
      } catch (e: unknown) {
        if (!ignore)
          setError(e instanceof Error ? e.message : "Failed to load integrations");
      } finally {
        if (!ignore) setLoading(false);
      }
    })();
    return () => {
      ignore = true;
    };
  }, [orgId]);

  const save = useCallback(async () => {
    if (!orgId || !user) return;
    setSaving(true);
    setError(null);
    try {
      const { getIdToken } = await import("firebase/auth");
      const { auth } = await import("@/lib/firebase");
      const idToken = await getIdToken(auth.currentUser!);
      const res = await fetch(`/api/orgs/${orgId}/integrations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify(integrations),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to save integrations");
    } catch (e: unknown) {
      setError(
        e instanceof Error ? e.message : "Failed to save integrations"
      );
    } finally {
      setSaving(false);
    }
  }, [integrations, orgId, user]);

  const runOrgSync = useCallback(async () => {
    if (!orgId || !user) return;
    setSyncing(true);
    setSyncMessage(null);
    setError(null);
    try {
      const { getIdToken } = await import("firebase/auth");
      const { auth } = await import("@/lib/firebase");
      const idToken = await getIdToken(auth.currentUser!);
      const res = await fetch(`/api/orgs/${orgId}/sync`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        // Only run Jira/Monday/Harvest sync; mismatches are handled by the scheduled job.
        body: JSON.stringify({ includeMismatch: false }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to run org-wide sync");
      }
      const processed = Number(json?.jira?.processed ?? 0);
      setSyncMessage(
        processed > 0
          ? `Org-wide Jira sync completed for ${processed} user${processed === 1 ? "" : "s"}.`
          : "Org-wide sync completed. No Jira users needed updates."
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Failed to run org-wide sync"
      );
    } finally {
      setSyncing(false);
    }
  }, [orgId, user]);

  const orgReturn = "/org/settings";

  return (
    <div className="container mx-auto py-8 space-y-8">
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="text-3xl font-bold">
            Organization Integrations
          </CardTitle>
          <CardDescription className="text-lg">
            Connect Monday.com, Jira, and Harvest at the organization level.
            Team tasks will be fetched for analytics.
          </CardDescription>
        </CardHeader>
      </Card>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <IconSpinner className="h-4 w-4" /> Loading integrations...
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <MicrosoftConnect returnTo={orgReturn} />
            <MondayConnect returnTo={orgReturn} />
            <JiraConnect />
            <HarvestConnect returnTo={orgReturn} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Org-wide sync</CardTitle>
              <CardDescription>
                Control how tasks and timesheets are pulled for the whole
                organization. Toggles affect background jobs and analytics for
                this organization.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between rounded-md border px-3 py-2">
                <div>
                  <p className="text-sm font-medium">
                    Pull Jira tasks for all users
                  </p>
                  <p className="text-xs text-muted-foreground">
                    When enabled, background sync jobs will import Jira tasks for
                    every connected user.
                  </p>
                </div>
                <Switch
                  checked={Boolean(integrations.jira?.syncAllUsers)}
                  onCheckedChange={(checked) =>
                    setIntegrations((prev) => ({
                      ...prev,
                      jira: {
                        ...(prev.jira ?? {}),
                        syncAllUsers: checked,
                      },
                    }))
                  }
                />
              </div>
              <div className="flex items-center justify-between rounded-md border px-3 py-2">
                <div>
                  <p className="text-sm font-medium">
                    Pull Harvest timesheets for all users
                  </p>
                  <p className="text-xs text-muted-foreground">
                    When enabled, background sync jobs will import timesheets for
                    all users who have connected Harvest.
                  </p>
                </div>
                <Switch
                  checked={Boolean(
                    integrations.harvest?.syncAllUsersTimesheets
                  )}
                  onCheckedChange={(checked) =>
                    setIntegrations((prev) => ({
                      ...prev,
                      harvest: {
                        ...(prev.harvest ?? {}),
                        syncAllUsersTimesheets: checked,
                      },
                    }))
                  }
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1">
                  {error && (
                    <span className="block text-sm text-red-500">{error}</span>
                  )}
                  {syncMessage && !error && (
                    <span className="block text-sm text-muted-foreground">
                      {syncMessage}
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={runOrgSync}
                    disabled={syncing || !orgId || !user}
                  >
                    {syncing ? (
                      <>
                        <IconSpinner className="h-4 w-4" /> Running sync...
                      </>
                    ) : (
                      "Run org-wide sync now"
                    )}
                  </Button>
                  <Button
                    onClick={save}
                    disabled={saving || !orgId || !user}
                  >
                    {saving ? (
                      <>
                        <IconSpinner className="h-4 w-4" /> Saving...
                      </>
                    ) : (
                      "Save"
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
