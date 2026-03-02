"use client";

import * as React from "react";
import Link from "next/link";
import { addDays, format, formatDistanceToNow, parseISO } from "date-fns";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  ListTodo,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCurrentOrgId } from "@/hooks/use-current-org-id";
import type { Task } from "@/types";

const TODAY = format(new Date(), "yyyy-MM-dd");

function isOverdue(task: Task): boolean {
  if (task.status === "done") return false;
  const d = task.dueDate ? String(task.dueDate).slice(0, 10) : "";
  return d !== "" && d < TODAY;
}

function isDueSoon(task: Task, withinDays: number): boolean {
  if (task.status === "done") return false;
  const d = task.dueDate ? String(task.dueDate).slice(0, 10) : "";
  if (!d || d < TODAY) return false;
  const due = parseISO(d);
  const limit = addDays(new Date(), withinDays);
  return format(due, "yyyy-MM-dd") <= format(limit, "yyyy-MM-dd");
}

type TaskSummary = {
  openCount: number;
  overdueCount: number;
  dueSoonCount: number;
  doneCount: number;
  totalCount: number;
  overdueTasks: Task[];
  dueSoonTasks: Task[];
};

function computeSummary(tasks: Task[]): TaskSummary {
  const overdueTasks = tasks.filter(isOverdue);
  const dueSoonTasks = tasks.filter((t) => isDueSoon(t, 7));
  const doneTasks = tasks.filter((t) => t.status === "done");
  const openTasks = tasks.filter((t) => t.status !== "done");
  return {
    openCount: openTasks.length,
    overdueCount: overdueTasks.length,
    dueSoonCount: dueSoonTasks.length,
    doneCount: doneTasks.length,
    totalCount: tasks.length,
    overdueTasks: overdueTasks.slice(0, 10),
    dueSoonTasks: dueSoonTasks.slice(0, 10),
  };
}

function buildTasksUrl(orgId: string, params: Record<string, string>): string {
  const search = new URLSearchParams(params);
  return `/org/tasks?orgId=${encodeURIComponent(orgId)}&${search.toString()}`;
}

export function OrgTaskSummary() {
  const { orgId } = useCurrentOrgId();
  const [tasks, setTasks] = React.useState<Task[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    if (!orgId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    fetch(`/api/orgs/${encodeURIComponent(orgId)}/tasks`, { cache: "no-store" })
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return;
        if (json.error) {
          setError(json.error);
          setTasks([]);
        } else {
          setTasks(Array.isArray(json.tasks) ? json.tasks : []);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e?.message || "Failed to load org tasks");
          setTasks([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  if (!orgId) return null;
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-[88px] rounded-xl border border-border/50 bg-card/40 animate-pulse"
          />
        ))}
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
        {error}
      </div>
    );
  }

  const summary = computeSummary(tasks ?? []);

  return (
    <div className="space-y-6">
      {/* Interactive task summary: Open | Overdue | Due soon | Completed */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Link
          href={buildTasksUrl(orgId, { status: "todo" })}
          className="flex items-center gap-3 rounded-xl border border-border/50 bg-card/50 p-4 transition-colors hover:bg-muted/40 hover:border-primary/30 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/15">
            <ListTodo className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">
              Open tasks
            </p>
            <p className="text-xl font-semibold tabular-nums">
              {summary.openCount}
            </p>
          </div>
        </Link>
        <Link
          href={buildTasksUrl(orgId, { overdue: "1" })}
          className="flex items-center gap-3 rounded-xl border border-border/50 bg-card/50 p-4 transition-colors hover:bg-destructive/10 hover:border-destructive/40 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-destructive/15">
            <AlertCircle className="h-5 w-5 text-destructive" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">
              Overdue
            </p>
            <p className="text-xl font-semibold tabular-nums">
              {summary.overdueCount}
            </p>
          </div>
        </Link>
        <Link
          href={buildTasksUrl(orgId, { dueSoon: "1" })}
          className="flex items-center gap-3 rounded-xl border border-border/50 bg-card/50 p-4 transition-colors hover:bg-amber-500/10 hover:border-amber-500/40 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/15">
            <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">
              Due in 7 days
            </p>
            <p className="text-xl font-semibold tabular-nums">
              {summary.dueSoonCount}
            </p>
          </div>
        </Link>
        <Link
          href={buildTasksUrl(orgId, { status: "done" })}
          className="flex items-center gap-3 rounded-xl border border-border/50 bg-card/50 p-4 transition-colors hover:bg-emerald-500/10 hover:border-emerald-500/40 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">
              Completed
            </p>
            <p className="text-xl font-semibold tabular-nums">
              {summary.doneCount}
            </p>
          </div>
        </Link>
      </div>

      {/* Overdue & due soon task list */}
      {(summary.overdueTasks.length > 0 || summary.dueSoonTasks.length > 0) && (
        <div className="grid gap-4 md:grid-cols-2">
          {summary.overdueTasks.length > 0 && (
            <div className="rounded-xl border border-border/50 bg-card/50 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  Overdue ({summary.overdueTasks.length})
                </h3>
                <Button variant="ghost" size="sm" asChild>
                  <Link href={buildTasksUrl(orgId, { overdue: "1" })}>
                    View all
                  </Link>
                </Button>
              </div>
              <ul className="space-y-2">
                {summary.overdueTasks.slice(0, 5).map((t) => (
                  <li key={t.id}>
                    <Link
                      href={buildTasksUrl(orgId, {})}
                      className="block rounded-lg border border-transparent px-2 py-1.5 text-sm transition-colors hover:bg-muted/50 hover:border-border"
                    >
                      <span className="font-medium">{t.name}</span>
                      {t.dueDate && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          due {format(parseISO(t.dueDate.slice(0, 10)), "MMM d")} (
                          {formatDistanceToNow(
                            parseISO(t.dueDate.slice(0, 10)),
                            { addSuffix: true }
                          )}
                          )
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {summary.dueSoonTasks.length > 0 && (
            <div className="rounded-xl border border-border/50 bg-card/50 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-amber-600 dark:text-amber-400">
                  <Clock className="h-4 w-4" />
                  Due in 7 days ({summary.dueSoonTasks.length})
                </h3>
                <Button variant="ghost" size="sm" asChild>
                  <Link href={buildTasksUrl(orgId, { dueSoon: "1" })}>
                    View all
                  </Link>
                </Button>
              </div>
              <ul className="space-y-2">
                {summary.dueSoonTasks.slice(0, 5).map((t) => (
                  <li key={t.id}>
                    <Link
                      href={buildTasksUrl(orgId, {})}
                      className="block rounded-lg border border-transparent px-2 py-1.5 text-sm transition-colors hover:bg-muted/50 hover:border-border"
                    >
                      <span className="font-medium">{t.name}</span>
                      {t.dueDate && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          due{" "}
                          {format(parseISO(t.dueDate.slice(0, 10)), "MMM d")}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
