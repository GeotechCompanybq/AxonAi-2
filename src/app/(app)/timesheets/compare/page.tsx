"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Lock } from "lucide-react";

export default function CompareTimesheetsPage() {
  const [entries, setEntries] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function readFirebaseAuthUid(): string | undefined {
    try {
      const globalUid = (window as any)?.__AXON_UID__;
      if (globalUid) return String(globalUid);
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i) || "";
        if (key.startsWith("firebase:authUser")) {
          const raw = window.localStorage.getItem(key);
          if (!raw) continue;
          try {
            const obj = JSON.parse(raw);
            if (obj?.uid) return String(obj.uid);
          } catch {}
        }
      }
    } catch {}
    return undefined;
  }

  function formatHoursHM(value: any): string {
    const n = Number(value);
    if (!Number.isFinite(n)) return String(value ?? "");
    const hours = Math.floor(n);
    const minutes = Math.round((n - hours) * 60);
    const mm = String(minutes).padStart(2, "0");
    return `${hours}:${mm}`;
  }

  const totalHours = useMemo(
    () => entries.reduce((s: number, e: any) => s + (Number(e?.hours) || 0), 0),
    [entries]
  );

  async function fetchAll() {
    setIsLoading(true);
    setError(null);
    try {
      const url = new URL("/api/harvest/timesheets", window.location.origin);
      url.searchParams.set("all", "1");
      url.searchParams.set("conn", "alt");
      const uid = readFirebaseAuthUid();
      if (uid) url.searchParams.set("uid", String(uid));
      const res = await fetch(url.toString(), { cache: "no-store" });
      const json = await res.json();
      if (!res.ok)
        throw new Error(json?.error || "Failed to fetch time entries");
      const list = Array.isArray(json?.timeEntries) ? json.timeEntries : [];
      setEntries(list);
    } catch (e: any) {
      setError(e?.message || "Failed to load comparison timesheets");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void fetchAll();
  }, []);

  return (
    <div className="container mx-auto py-8 space-y-6">
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="text-3xl font-bold">
            Comparison Timesheets
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm text-muted-foreground">
              {entries.length} entries · {totalHours.toFixed(2)} hours
            </div>
            <Button onClick={() => fetchAll()} disabled={isLoading}>
              {isLoading ? "Refreshing…" : "Refresh All"}
            </Button>
          </div>
          {error && <div className="text-sm text-red-600">{error}</div>}

          {/* Mobile list */}
          <div className="grid grid-cols-1 gap-3 md:hidden">
            {isLoading && entries.length === 0 && (
              <>
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="border rounded-md p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-4 w-16" />
                    </div>
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-full" />
                  </div>
                ))}
              </>
            )}
            {!isLoading && entries.length === 0 && (
              <div className="p-3 text-sm text-muted-foreground border rounded-md">
                No entries found.
              </div>
            )}
            {entries.map((e: any) => (
              <div key={e.id} className="border rounded-md p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="font-medium">{e.spent_date}</div>
                  <div className="text-sm font-semibold">
                    {formatHoursHM(e.hours)}
                  </div>
                </div>
                <div className="text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">
                      {e.project?.name || "-"}
                    </span>
                    {e.is_locked && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Lock
                              className="h-4 w-4 text-amber-500 cursor-help"
                              aria-label="Locked"
                            />
                          </TooltipTrigger>
                          <TooltipContent>
                            <div className="max-w-xs text-wrap">
                              {e.locked_reason ||
                                "This project's hours are locked for this period."}
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>
                  <div className="text-muted-foreground">
                    {e.task?.name || "-"}
                  </div>
                </div>
                {e.notes && (
                  <div className="text-sm whitespace-pre-wrap">{e.notes}</div>
                )}
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="overflow-auto border rounded-md hidden md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/40">
                  <th className="text-left p-2">Date</th>
                  <th className="text-left p-2">Project</th>
                  <th className="text-left p-2">Task</th>
                  <th className="text-right p-2">Hours</th>
                  <th className="text-left p-2">Notes</th>
                </tr>
              </thead>
              <tbody>
                {isLoading &&
                  entries.length === 0 &&
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="border-t">
                      <td className="p-2">
                        <Skeleton className="h-4 w-24" />
                      </td>
                      <td className="p-2">
                        <Skeleton className="h-4 w-40" />
                      </td>
                      <td className="p-2">
                        <Skeleton className="h-4 w-32" />
                      </td>
                      <td className="p-2 text-right">
                        <Skeleton className="h-4 w-14 ml-auto" />
                      </td>
                      <td className="p-2">
                        <Skeleton className="h-4 w-full" />
                      </td>
                    </tr>
                  ))}
                {!isLoading && entries.length === 0 && (
                  <tr>
                    <td className="p-3 text-muted-foreground" colSpan={5}>
                      No entries found.
                    </td>
                  </tr>
                )}
                {entries.map((e: any) => (
                  <tr key={e.id} className="border-t">
                    <td className="p-2">{e.spent_date}</td>
                    <td className="p-2">{e.project?.name || "-"}</td>
                    <td className="p-2">{e.task?.name || "-"}</td>
                    <td className="p-2 text-right">{formatHoursHM(e.hours)}</td>
                    <td className="p-2">{e.notes || ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
