"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { addDays, format, parseISO } from "date-fns";
import { useCurrentOrgId } from "@/hooks/use-current-org-id";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { IconSpinner } from "@/components/icons";
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

export default function OrgTasksPage() {
  const { orgId: storedOrgId } = useCurrentOrgId();
  const searchParams = useSearchParams();
  const orgIdFromQuery = searchParams?.get("orgId");
  const orgId = useMemo(
    () => orgIdFromQuery || storedOrgId,
    [orgIdFromQuery, storedOrgId]
  );
  const statusParam = searchParams?.get("status") ?? null;
  const overdueParam = searchParams?.get("overdue") === "1";
  const dueSoonParam = searchParams?.get("dueSoon") === "1";

  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function load() {
      if (!orgId) return;
      setError(null);
      setTasks(null);
      try {
        const res = await fetch(`/api/orgs/${encodeURIComponent(orgId)}/tasks`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to load tasks");
        if (isMounted) setTasks(json.tasks || []);
      } catch (e: any) {
        if (isMounted) setError(e.message || "Failed to load tasks");
      }
    }
    load();
    return () => {
      isMounted = false;
    };
  }, [orgId]);

  const filteredTasks = useMemo(() => {
    if (!tasks) return null;
    return tasks.filter((t) => {
      const matchStatus =
        !statusParam || t.status === statusParam;
      const matchOverdue = !overdueParam || isOverdue(t);
      const matchDueSoon = !dueSoonParam || isDueSoon(t, 7);
      return matchStatus && matchOverdue && matchDueSoon;
    });
  }, [tasks, statusParam, overdueParam, dueSoonParam]);

  const filterLabel = useMemo(() => {
    const parts: string[] = [];
    if (statusParam) parts.push(`status: ${statusParam}`);
    if (overdueParam) parts.push("overdue");
    if (dueSoonParam) parts.push("due in 7 days");
    return parts.length ? ` (${parts.join(", ")})` : "";
  }, [statusParam, overdueParam, dueSoonParam]);

  return (
    <div className="max-w-6xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>Organization Tasks{filterLabel}</CardTitle>
        </CardHeader>
        <CardContent>
          {!orgId && (
            <div className="text-sm text-muted-foreground">
              No organization selected.
            </div>
          )}
          {orgId && tasks === null && !error && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <IconSpinner className="h-4 w-4" /> Loading tasks...
            </div>
          )}
          {error && <div className="text-sm text-red-500">{error}</div>}
          {orgId && filteredTasks && filteredTasks.length === 0 && !error && (
            <div className="text-sm text-muted-foreground">
              No tasks found{filterLabel ? " for this filter" : ""}.
            </div>
          )}
          {orgId && filteredTasks && filteredTasks.length > 0 && !error && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Team</TableHead>
                  <TableHead>Due</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTasks.map((t: any) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">
                      {t.name || t.id}
                    </TableCell>
                    <TableCell>{t.status || "-"}</TableCell>
                    <TableCell>{t.priority || "-"}</TableCell>
                    <TableCell>{t.teamId || t.uid || "-"}</TableCell>
                    <TableCell>
                      {t.dueDate
                        ? new Date(t.dueDate).toLocaleDateString()
                        : "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}


