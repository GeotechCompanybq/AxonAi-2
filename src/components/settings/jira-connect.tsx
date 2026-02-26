"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import type { Task, TaskStatus } from "@/types";
import { saveTasksToLocalStorage } from "@/lib/task-storage";
import { IntegrationCard } from "@/components/settings/integration-card";

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
    <IntegrationCard
      logoSrc="/Intergrations/jira-software.png"
      logoAlt="Jira"
      title="Jira"
      description="Connect to pull Jira issues and turn them into an AI-powered plan."
      isConnected={connected}
      providerName="Jira"
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
        label: isLoading ? "Generating..." : "Pull & Plan",
        onClick: pullAndPlan,
        disabled: isLoading,
        loading: isLoading,
      }}
      statusText={status}
    />
  );
}
