"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
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

export default function OrgTasksPage() {
  const { orgId: storedOrgId } = useCurrentOrgId();
  const searchParams = useSearchParams();
  const orgIdFromQuery = searchParams?.get("orgId");
  const orgId = useMemo(
    () => orgIdFromQuery || storedOrgId,
    [orgIdFromQuery, storedOrgId]
  );

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

  return (
    <div className="max-w-6xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>All Organization Tasks</CardTitle>
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
          {orgId && tasks && tasks.length === 0 && !error && (
            <div className="text-sm text-muted-foreground">No tasks found.</div>
          )}
          {orgId && tasks && tasks.length > 0 && !error && (
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
                {tasks.map((t: any) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">
                      {t.name || t.id}
                    </TableCell>
                    <TableCell>{t.status || "-"}</TableCell>
                    <TableCell>{t.priority || "-"}</TableCell>
                    <TableCell>{t.teamId || "-"}</TableCell>
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


