"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { IconSpinner } from "@/components/icons";
import { useAuth } from "@/hooks/use-auth";
import type { Task, TaskStatus } from "@/types";
import { saveTasksToLocalStorage } from "@/lib/task-storage";

export function MondayConnect() {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [connected, setConnected] = useState<boolean | null>(null);

  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const res = await fetch("/api/monday/status", { cache: "no-store" });
        const json = await res.json();
        if (!ignore) setConnected(Boolean(json?.connected));
      } catch {
        if (!ignore) setConnected(false);
      }
    })();
    return () => {
      ignore = true;
    };
  }, []);

  const connect = useCallback(async () => {
    const url = new URL("/api/monday/auth", window.location.origin);
    if (user?.uid) url.searchParams.set("uid", user.uid);
    window.location.href = url.toString();
  }, [user]);

  const pullAndPlan = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    setStatus(null);
    try {
      const tasksRes = await fetch(`/api/monday/tasks`);
      const tasksJson = await tasksRes.json();
      if (!tasksRes.ok) throw new Error(tasksJson.error || "not_connected");
      // Normalize and persist tasks so Tasks page shows them
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
      const parseDueDate = (dateStr?: string): string | undefined => {
        if (!dateStr) return undefined;
        if (dateStr.includes(" - ")) {
          const [start, end] = dateStr
            .split(" - ")
            .map((p: string) => p.trim());
          const pick = end || start;
          if (pick && /^\d{4}-\d{2}-\d{2}$/.test(pick)) {
            return new Date(pick).toISOString();
          }
          return undefined;
        }
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
          return new Date(dateStr).toISOString();
        }
        return undefined;
      };
      const normalizedTasks: Task[] = (tasksJson.tasks || []).map(
        (t: any, idx: number) => ({
          id: `${Date.now()}-${idx}`,
          name: String(t.name || "Untitled"),
          description: t.description,
          dueDate: parseDueDate(t.dueDate),
          priority:
            t.priority === "high" || t.priority === "low"
              ? t.priority
              : "medium",
          status: normalizeStatus(t.status),
          category: t.category,
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
      // Also generate a focused plan for just today
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
        `Imported ${normalizedTasks.length} tasks. Day plan and analytics generated. Check your Tasks and Analytics pages.`
      );
    } catch (e: any) {
      setStatus(e.message || "Failed to fetch tasks or plan");
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  return (
    <Card>
      <CardContent className="py-6 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">Monday.com</div>
            <div className="text-xs text-muted-foreground">
              Connect to pull tasks and plan with AI
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={connect} variant="outline">
              {connected ? "Reconnect" : "Connect"}
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
            <span className="text-emerald-600">Connected</span> to Monday.com
          </div>
        )}
        {status && (
          <div className="text-xs text-muted-foreground">{status}</div>
        )}
      </CardContent>
    </Card>
  );
}
