"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { IconSpinner } from "@/components/icons";
import { useAuth } from "@/hooks/use-auth";
import type { Task, TaskStatus } from "@/types";
import { saveTasksToLocalStorage } from "@/lib/task-storage";

export function JiraConnect() {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [connected, setConnected] = useState<boolean | null>(null);

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

      // Reuse existing AI analysis to generate a weekly plan/usage
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

      // Generate a focused day plan
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

  const configure = useCallback(() => {
    try {
      const url = new URL("/org/settings", window.location.origin);
      url.searchParams.set("source", "jira");
      window.location.href = url.toString();
    } catch {
      window.location.href = "/org/settings";
    }
  }, []);

  return (
    <Card className="h-full rounded-2xl border border-white/10 bg-gradient-to-b from-slate-950/80 to-slate-900/40">
      <CardContent className="flex h-full flex-col justify-between space-y-4 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img 
              src="/Intergrations/jira-software.png" 
              alt="Jira" 
              className="h-8 w-auto object-contain"
            />
            <div>
              <div className="text-sm font-medium">Jira</div>
              <div className="text-xs text-muted-foreground">
                Connect to pull tasks and plan with AI
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={connect} variant="outline">
              {connected ? "Reconnect" : "Connect"}
            </Button>
            <Button onClick={configure} variant="ghost">
              Configure
            </Button>
            <Button onClick={pullAndPlan} disabled={isLoading}>
              {isLoading ? (
                <>
                  <IconSpinner className="h-4 w-4" /> Generating...
                </>
              ) : (
                "Pull & Plan"
              )}
            </Button>
          </div>
        </div>
        {connected && (
          <div className="text-xs">
            <span className="text-emerald-600">Connected</span> to Jira
          </div>
        )}
        {status && (
          <div className="text-xs text-muted-foreground">{status}</div>
        )}
      </CardContent>
    </Card>
  );
}
