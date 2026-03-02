"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import type { Task, TaskStatus } from "@/types";
import { saveTasksToLocalStorage } from "@/lib/task-storage";
import { IntegrationCard } from "@/components/settings/integration-card";
import { useCurrentOrgId } from "@/hooks/use-current-org-id";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { IconSpinner } from "@/components/icons";

export function JiraConnect() {
  const { user } = useAuth();
  const { orgId } = useCurrentOrgId();

  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [connected, setConnected] = useState<boolean | null>(null);

  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [orgJiraConfig, setOrgJiraConfig] = useState<any | null>(null);
  const [orgLoading, setOrgLoading] = useState(false);
  const [orgSaving, setOrgSaving] = useState(false);
  const [orgError, setOrgError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const url = new URL("/api/jira/status", window.location.origin);
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

  useEffect(() => {
    if (!isConfigOpen || !orgId) return;
    let ignore = false;
    setOrgLoading(true);
    setOrgError(null);
    (async () => {
      try {
        const res = await fetch(`/api/orgs/${orgId}/integrations`, {
          cache: "no-store",
        });
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.error || "Failed to load Jira org settings");
        }
        if (!ignore) {
          setOrgJiraConfig(json.integrations?.jira || {});
        }
      } catch (e: any) {
        if (!ignore) {
          setOrgError(e?.message || "Failed to load Jira org settings");
        }
      } finally {
        if (!ignore) {
          setOrgLoading(false);
        }
      }
    })();
    return () => {
      ignore = true;
    };
  }, [isConfigOpen, orgId]);

  const connect = useCallback(async () => {
    const url = new URL("/api/jira/auth", window.location.origin);
    if (user?.uid) url.searchParams.set("uid", user.uid);
    window.location.href = url.toString();
  }, [user]);

  const pullAndPlan = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    setStatus(null);
    try {
      const url = new URL(`/api/jira/tasks`, window.location.origin);
      if (user?.uid) url.searchParams.set("uid", user.uid);
      const tasksRes = await fetch(url.toString());
      const tasksJson = await tasksRes.json();
      if (!tasksRes.ok) throw new Error(tasksJson.error || "not_connected");

      const normalizeStatus = (raw: string | undefined): TaskStatus => {
        const s = (raw || "").toLowerCase();
        if (s.includes("done") || s.includes("complete") || s === "closed")
          return "done";
        if (
          s.includes("stuck") ||
          s.includes("blocked") ||
          s.includes("waiting")
        )
          return "blocked";
        if (
          s.includes("work") ||
          s.includes("progress") ||
          s.includes("review") ||
          s.includes("await")
        )
          return "inprogress";
        if (
          s.includes("not started") ||
          s.includes("backlog") ||
          s.includes("todo")
        )
          return "todo";
        return "todo";
      };

      const normalizedTasks: Task[] = (tasksJson.tasks || []).map(
        (t: any, idx: number) => ({
          id: `jira-${Date.now()}-${idx}`,
          name: String(t.name || "Untitled Jira Task"),
          description: t.description,
          dueDate: t.dueDate ? new Date(t.dueDate).toISOString() : undefined,
          priority:
            t.priority === "high" || t.priority === "low"
              ? t.priority
              : "medium",
          status: normalizeStatus(t.status),
          category: t.category || "Jira",
        })
      );

      if (normalizedTasks.length > 0) {
        saveTasksToLocalStorage(normalizedTasks);
      }

      const today = new Date().toISOString().slice(0, 10);
      const aiRes = await fetch("/api/ai/plan-from-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tasks: normalizedTasks.map(({ id, ...rest }) => rest),
          currentDate: today,
        }),
      });
      const aiJson = await aiRes.json();
      if (!aiRes.ok) throw new Error(aiJson.error || "ai_failed");

      const dayPlanRes = await fetch("/api/ai/plan-for-day", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tasks: normalizedTasks.map(({ id, name, description }) => ({
            name,
            description,
          })),
          currentDate: today,
        }),
      });
      const dayPlanJson = await dayPlanRes.json();
      if (!dayPlanRes.ok)
        throw new Error(dayPlanJson.error || "day_plan_failed");

      setStatus(
        `Imported ${normalizedTasks.length} Jira tasks. Day plan and analytics generated. Check your Tasks and Analytics pages.`
      );
    } catch (e: any) {
      setStatus(e.message || "Failed to fetch Jira tasks or plan");
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  const disconnect = useCallback(async () => {
    if (!user?.uid) return;
    setIsLoading(true);
    setStatus(null);
    try {
      const url = new URL("/api/jira/disconnect", window.location.origin);
      url.searchParams.set("uid", user.uid);
      const res = await fetch(url.toString(), { method: "POST" });
      if (!res.ok) throw new Error("Failed to disconnect Jira");
      setConnected(false);
      setStatus("Disconnected from Jira. You can reconnect at any time.");
    } catch (e: any) {
      setStatus(e?.message || "Failed to disconnect Jira");
    } finally {
      setIsLoading(false);
    }
  }, [user?.uid]);

  const saveOrgConfig = useCallback(async () => {
    if (!orgId || !user) return;
    setOrgSaving(true);
    setOrgError(null);
    try {
      const [{ getIdToken }, { auth }] = await Promise.all([
        import("firebase/auth"),
        import("@/lib/firebase"),
      ]);
      const idToken = await getIdToken(auth.currentUser!);
      const res = await fetch(`/api/orgs/${orgId}/integrations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          jira: orgJiraConfig || {},
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to save Jira org settings");
      }
      setStatus("Updated Jira organization settings.");
    } catch (e: any) {
      setOrgError(e?.message || "Failed to save Jira org settings");
    } finally {
      setOrgSaving(false);
    }
  }, [orgId, orgJiraConfig, user]);

  const syncAllUsersEnabled = Boolean(orgJiraConfig?.syncAllUsers);

  return (
    <>
      <IntegrationCard
        logoSrc="/Intergrations/jira-software.png"
        logoAlt="Jira"
        title="Jira"
        description="Connect to pull Jira issues and turn them into an AI-powered plan."
        isConnected={connected}
        providerName="Jira"
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
          onClick: () => setIsConfigOpen(true),
          variant: "ghost",
          size: "sm",
        }}
        tertiaryAction={{
          label: isLoading ? "Generating..." : "Pull & Plan",
          onClick: pullAndPlan,
          disabled: isLoading,
          loading: isLoading,
          size: "sm",
        }}
        statusText={status}
      />

      <Dialog open={isConfigOpen} onOpenChange={setIsConfigOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Jira organization settings</DialogTitle>
            <DialogDescription>
              Enable org-wide Jira syncing so background jobs can pull tasks for
              every connected user in your organization. You can also refresh
              your Jira connection from here.
            </DialogDescription>
          </DialogHeader>

          {!orgId ? (
            <p className="text-sm text-muted-foreground">
              No organization is currently selected. Open the organization
              workspace to configure Jira-wide settings.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-md border px-3 py-2">
                <div>
                  <p className="text-sm font-medium">
                    Pull Jira tasks for all users
                  </p>
                  <p className="text-xs text-muted-foreground">
                    When enabled, background sync jobs will import Jira tasks
                    for every user in this org who has connected Jira.
                  </p>
                </div>
                <Switch
                  checked={syncAllUsersEnabled}
                  disabled={orgLoading}
                  onCheckedChange={(checked) =>
                    setOrgJiraConfig((prev: any) => ({
                      ...(prev || {}),
                      syncAllUsers: checked,
                    }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="org-jira-jql" className="text-sm font-medium">
                  Custom JQL (optional)
                </Label>
                <textarea
                  id="org-jira-jql"
                  className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  placeholder={'e.g. assignee in membersOf("BQI Support Staff") AND Status != Done AND Status != Cancelled AND Status != Closed ORDER BY workItemKey ASC'}
                  value={orgJiraConfig?.jql ?? ""}
                  onChange={(e) =>
                    setOrgJiraConfig((prev: any) => ({
                      ...(prev || {}),
                      jql: e.target.value.trim() || undefined,
                    }))
                  }
                  disabled={orgLoading}
                  rows={3}
                />
                <p className="text-xs text-muted-foreground">
                  When set, org sync uses this filter instead of per-user &quot;my open tasks&quot;. Tasks are assigned to org members by Jira assignee email.
                </p>
              </div>

              {orgError && (
                <p className="text-xs text-destructive">{orgError}</p>
              )}
            </div>
          )}

          <DialogFooter className="flex items-center justify-between gap-2">
            <div className="text-xs text-muted-foreground">
              Use reconnect if Jira permissions or site access have changed.
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={connect}
              >
                Reconnect Jira
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={saveOrgConfig}
                disabled={orgSaving || !orgId || orgLoading}
              >
                {orgSaving ? (
                  <>
                    <IconSpinner className="mr-2 h-4 w-4" />
                    Saving...
                  </>
                ) : (
                  "Save"
                )}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
