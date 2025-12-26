"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";

type TimesheetMismatchDoc = {
  uid: string;
  from: string;
  to: string;
  status: string;
  mismatchCount: number;
  mismatches: any[];
  updatedAt: string;
};

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

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function TimesheetMismatchesPage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [doc, setDoc] = useState<TimesheetMismatchDoc | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showActionableOnly, setShowActionableOnly] = useState(true);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    const end = todayIso();
    const start = new Date();
    start.setDate(new Date().getDate() - 6);
    setFrom(start.toISOString().slice(0, 10));
    setTo(end);
  }, []);

  async function loadExisting() {
    try {
      setIsLoading(true);
      setError(null);
      const uid = readFirebaseAuthUid();
      if (!uid) throw new Error("Not authenticated");
      const url = new URL("/api/timesheets/mismatches", window.location.origin);
      url.searchParams.set("uid", uid);
      if (from && to) {
        url.searchParams.set("from", from);
        url.searchParams.set("to", to);
      }
      const res = await fetch(url.toString(), { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to load mismatches");
      setDoc(json?.doc || null);
    } catch (e: any) {
      setDoc(null);
      setError(e?.message || "Failed to load mismatches");
    } finally {
      setIsLoading(false);
    }
  }

  async function runCheck() {
    try {
      setIsLoading(true);
      setError(null);
      const uid = readFirebaseAuthUid();
      if (!uid) throw new Error("Not authenticated");
      const res = await fetch("/api/timesheets/mismatches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid, from, to, dryRun: false }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to compute mismatches");
      await loadExisting();
    } catch (e: any) {
      setError(e?.message || "Failed to compute mismatches");
    } finally {
      setIsLoading(false);
    }
  }

  async function approveMismatchIds(ids: string[]) {
    try {
      setApplying(true);
      setError(null);
      const uid = readFirebaseAuthUid();
      if (!uid) throw new Error("Not authenticated");
      if (!from || !to) throw new Error("Pick a date range");
      const res = await fetch("/api/timesheets/mismatches/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid, from, to, mismatchIds: ids }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to apply");
      await loadExisting();
      const okCount = Array.isArray(json?.results)
        ? json.results.filter((r: any) => r?.applied).length
        : 0;
      setError(null);
    } catch (e: any) {
      setError(e?.message || "Failed to apply");
    } finally {
      setApplying(false);
    }
  }

  async function approveAllActionable() {
    try {
      setApplying(true);
      setError(null);
      const uid = readFirebaseAuthUid();
      if (!uid) throw new Error("Not authenticated");
      if (!from || !to) throw new Error("Pick a date range");
      const res = await fetch("/api/timesheets/mismatches/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid, from, to, applyAll: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to apply");
      await loadExisting();
    } catch (e: any) {
      setError(e?.message || "Failed to apply");
    } finally {
      setApplying(false);
    }
  }

  const mismatches = useMemo(() => {
    const list = Array.isArray(doc?.mismatches) ? doc!.mismatches : [];
    if (!showActionableOnly) return list;
    return list.filter((m: any) => Array.isArray(m?.suggestedActions) && m.suggestedActions.length > 0);
  }, [doc, showActionableOnly]);

  useEffect(() => {
    if (from && to) void loadExisting();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  return (
    <div className="container mx-auto py-8 space-y-6">
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="text-3xl font-bold">Timesheet Mismatches</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            <Button onClick={runCheck} disabled={isLoading || !from || !to}>
              {isLoading ? "Checking…" : "Run check"}
            </Button>
            <label className="flex items-center gap-2 text-sm justify-self-end">
              <Checkbox
                checked={showActionableOnly}
                onCheckedChange={(v: any) => setShowActionableOnly(Boolean(v))}
              />
              <span>Show actionable only</span>
            </label>
          </div>

          <div className="flex items-center justify-between gap-2">
            <div className="text-xs text-muted-foreground">
              Primary is the source of truth → approvals apply fixes to Grayquarter.
            </div>
            <Button
              variant="outline"
              onClick={approveAllActionable}
              disabled={applying || mismatches.length === 0}
            >
              {applying ? "Applying…" : "Approve all"}
            </Button>
          </div>

          {error && <div className="text-sm text-red-600">{error}</div>}

          <div className="text-sm text-muted-foreground">
            {doc
              ? `${doc.mismatchCount || 0} mismatch${(doc.mismatchCount || 0) === 1 ? "" : "es"} (last updated ${String(
                  doc.updatedAt || ""
                ).replace("T", " ").slice(0, 19)})`
              : "No mismatch report stored for this range yet."}
          </div>

          <div className="overflow-auto border rounded-md">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/40">
                  <th className="text-left p-2">Date</th>
                  <th className="text-left p-2">Project</th>
                  <th className="text-left p-2">Reason</th>
                  <th className="text-right p-2">Primary</th>
                  <th className="text-right p-2">Secondary</th>
                  <th className="text-left p-2">Suggested fix</th>
                </tr>
              </thead>
              <tbody>
                {mismatches.length === 0 && (
                  <tr>
                    <td className="p-3 text-muted-foreground" colSpan={6}>
                      {isLoading ? "Loading…" : "No mismatches found (or none actionable)."}
                    </td>
                  </tr>
                )}
                {mismatches.slice(0, 500).map((m: any) => {
                  const pHours = m?.primaryEntry?.hours != null ? Number(m.primaryEntry.hours).toFixed(2) : "-";
                  const aHours = m?.altEntry?.hours != null ? Number(m.altEntry.hours).toFixed(2) : "-";
                  const proj = m?.projectPrimary || m?.projectAlt || "-";
                  const actions = Array.isArray(m?.suggestedActions) ? m.suggestedActions : [];
                  const actionText =
                    actions.length === 0
                      ? "Review"
                      : actions[0]?.kind === "create_entry"
                        ? "Create missing entry"
                        : "Update hours/notes";
                  const canApprove = actions.length > 0 && (m?.status || "pending") !== "applied";
                  return (
                    <tr key={m.id} className="border-t">
                      <td className="p-2 whitespace-nowrap">{m.spent_date}</td>
                      <td className="p-2">{proj}</td>
                      <td className="p-2">{m.reason}</td>
                      <td className="p-2 text-right">{pHours}</td>
                      <td className="p-2 text-right">{aHours}</td>
                      <td className="p-2 flex items-center justify-between gap-2">
                        <span>{actionText}</span>
                        <Button
                          size="sm"
                          onClick={() => approveMismatchIds([String(m.id)])}
                          disabled={!canApprove || applying}
                        >
                          {m?.status === "applied" ? "Applied" : applying ? "…" : "Approve"}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="text-xs text-muted-foreground">
            This page is the “approval gate”: it lists billable-only mismatches and the system’s suggested fixes.
            Next step: add Approve buttons to apply the fixes automatically.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}


