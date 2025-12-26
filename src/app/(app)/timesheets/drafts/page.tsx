"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";

export default function TimesheetDraftsPage() {
  const [drafts, setDrafts] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [showPendingOnly, setShowPendingOnly] = useState(false);

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

  useEffect(() => {
    const uid = readFirebaseAuthUid();
    if (!uid) {
      setIsLoading(false);
      setDrafts([]);
      return;
    }
    (async () => {
      try {
        const url = new URL("/api/timesheets/drafts", window.location.origin);
        url.searchParams.set("uid", uid);
        const res = await fetch(url.toString(), { cache: "no-store" });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || "Failed to load drafts");
        setDrafts(Array.isArray(json?.drafts) ? json.drafts : []);
      } catch (e: any) {
        setDrafts([]);
        setError(e?.message || "Failed to load drafts");
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    let list = drafts;
    if (from) list = list.filter((d) => String(d.spent_date) >= from);
    if (to) list = list.filter((d) => String(d.spent_date) <= to);
    if (showPendingOnly) list = list.filter((d) => (Number(d.hours) || 0) > 0);
    return list;
  }, [drafts, from, to, showPendingOnly]);

  async function approveDraft(d: any) {
    try {
      setError(null);
      const uid = readFirebaseAuthUid();
      const res = await fetch("/api/harvest/timesheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spent_date: d.spent_date,
          hours: d.hours,
          notes: d.notes,
        }),
      });
      if (!res.ok) throw new Error("Failed to create timesheet");
      if (uid) {
        const delUrl = new URL(
          `/api/timesheets/drafts/${encodeURIComponent(String(d.id))}`,
          window.location.origin
        );
        delUrl.searchParams.set("uid", uid);
        await fetch(delUrl.toString(), { method: "DELETE" });
      }
      setDrafts((prev) => prev.filter((x) => String(x?.id) !== String(d?.id)));
    } catch (e: any) {
      setError(e?.message || "Approval failed");
    }
  }

  async function deleteDraft(d: any) {
    try {
      setError(null);
      const uid = readFirebaseAuthUid();
      if (!uid) throw new Error("Not authenticated");
      const delUrl = new URL(
        `/api/timesheets/drafts/${encodeURIComponent(String(d.id))}`,
        window.location.origin
      );
      delUrl.searchParams.set("uid", uid);
      const res = await fetch(delUrl.toString(), { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json().catch(() => ({} as any));
        throw new Error(json?.error || "Delete failed");
      }
      setDrafts((prev) => prev.filter((x) => String(x?.id) !== String(d?.id)));
    } catch (e: any) {
      setError(e?.message || "Delete failed");
    }
  }

  return (
    <div className="container mx-auto py-8 space-y-6">
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="text-3xl font-bold">Timesheet Drafts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
            <Input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={showPendingOnly}
                onCheckedChange={(v: any) => setShowPendingOnly(Boolean(v))}
              />
              <span>Show pending only</span>
            </label>
            <div className="text-sm text-muted-foreground justify-self-end">
              {isLoading
                ? "Loading drafts…"
                : `${filtered.length} draft${filtered.length === 1 ? "" : "s"}`}
            </div>
          </div>

          {error && <div className="text-sm text-red-600">{error}</div>}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map((d) => (
              <div
                key={d.id}
                className="border rounded p-3 text-sm flex items-center justify-between gap-2"
              >
                <div className="truncate">
                  <div className="font-medium">
                    {d.spent_date} · {(Number(d.hours) || 0).toFixed(2)}h
                  </div>
                  <div className="text-muted-foreground truncate max-w-[280px]">
                    {d.notes}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button size="sm" onClick={() => approveDraft(d)}>
                    Approve
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => deleteDraft(d)}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ))}
            {!isLoading && filtered.length === 0 && (
              <div className="text-sm text-muted-foreground">
                No drafts found for filters.
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
