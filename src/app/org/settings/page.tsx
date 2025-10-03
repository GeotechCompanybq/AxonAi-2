"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MondayConnect } from "@/components/settings/monday-connect";
import { IconSpinner } from "@/components/icons";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentOrgId } from "@/hooks/use-current-org-id";

type Integrations = {
  monday?: { accessToken?: string };
  jira?: { accessToken?: string; refreshToken?: string };
};

export default function OrgSettingsPage() {
  const { user } = useAuth();
  const { orgId } = useCurrentOrgId();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [integrations, setIntegrations] = useState<Integrations>({});
  const [error, setError] = useState<string | null>(null);

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
      } catch (e: any) {
        if (!ignore) setError(e.message || "Failed to load integrations");
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
      const idToken = await (
        await import("firebase/auth")
      ).getIdToken((await import("@/lib/firebase")).auth.currentUser!);
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
    } catch (e: any) {
      setError(e.message || "Failed to save integrations");
    } finally {
      setSaving(false);
    }
  }, [integrations, orgId, user]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Organization Integrations</CardTitle>
          <CardDescription>
            Connect Monday.com and Jira at the organization level. Team tasks
            will be fetched for analytics.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <IconSpinner className="h-4 w-4" /> Loading integrations...
            </div>
          ) : (
            <>
              <div className="space-y-4">
                <div>
                  <Label>Monday.com</Label>
                  <div className="mt-2">
                    <MondayConnect returnTo="/org/settings" />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="jira-access">Jira Access Token</Label>
                    <Input
                      id="jira-access"
                      type="password"
                      placeholder="Enter Jira access token"
                      value={integrations.jira?.accessToken || ""}
                      onChange={(e) =>
                        setIntegrations((prev) => ({
                          ...prev,
                          jira: {
                            ...(prev.jira || {}),
                            accessToken: e.target.value,
                          },
                        }))
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="jira-refresh">
                      Jira Refresh Token (optional)
                    </Label>
                    <Input
                      id="jira-refresh"
                      type="password"
                      placeholder="Enter Jira refresh token"
                      value={integrations.jira?.refreshToken || ""}
                      onChange={(e) =>
                        setIntegrations((prev) => ({
                          ...prev,
                          jira: {
                            ...(prev.jira || {}),
                            refreshToken: e.target.value,
                          },
                        }))
                      }
                    />
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  These credentials are stored in your org document and used to
                  pull team tasks.
                </div>
                <Button onClick={save} disabled={saving || !orgId || !user}>
                  {saving ? (
                    <>
                      <IconSpinner className="h-4 w-4" /> Saving...
                    </>
                  ) : (
                    "Save"
                  )}
                </Button>
              </div>
              {error && <div className="text-sm text-red-500">{error}</div>}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
