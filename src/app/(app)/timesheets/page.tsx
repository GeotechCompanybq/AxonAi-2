"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, Lock, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { useEffect, useState } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { db } from "@/lib/firebase";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function TimesheetsPage() {
  const [entries, setEntries] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | number | null>(null);
  const [editingId, setEditingId] = useState<string | number | null>(null);
  const [editNotes, setEditNotes] = useState<string>("");
  const [editHours, setEditHours] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [autoFixing, setAutoFixing] = useState(false);
  const [drafts, setDrafts] = useState<any[] | null>(null);
  function readFirebaseAuthUid(): string | undefined {
    try {
      // Prefer global first
      const globalUid = (window as any)?.__AXON_UID__;
      if (globalUid) return String(globalUid);
      // Fallback: scan localStorage for Firebase auth user entry
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
  const [range, setRange] = useState<
    "day" | "week" | "month" | "all" | "custom"
  >("all");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

  const computeRange = () => {
    if (range === "all") return { all: true } as const;
    if (range === "custom" && from && to) return { from, to } as const;
    const today = new Date();
    if (range === "day") {
      const d = today.toISOString().slice(0, 10);
      return { from: d, to: d } as const;
    }
    if (range === "week") {
      const end = new Date(today);
      const start = new Date(today);
      start.setDate(today.getDate() - 6);
      return {
        from: start.toISOString().slice(0, 10),
        to: end.toISOString().slice(0, 10),
      } as const;
    }
    if (range === "month") {
      const end = new Date(today);
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      return {
        from: start.toISOString().slice(0, 10),
        to: end.toISOString().slice(0, 10),
      } as const;
    }
    return { all: true } as const;
  };

  // Live subscribe to user's local draft timesheets if uid is present on window
  useEffect(() => {
    const uid = readFirebaseAuthUid();
    if (!uid) return;
    const col = collection(db as any, "users", uid, "timesheetDrafts");
    const q = query(col, orderBy("spent_date", "asc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const arr: any[] = [];
        snap.forEach((d) => arr.push({ id: d.id, ...d.data() }));
        setDrafts(arr);
      },
      () => setDrafts([])
    );
    return () => unsub();
  }, []);

  const fetchEntries = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const url = new URL("/api/harvest/timesheets", window.location.origin);
      const uid = readFirebaseAuthUid();
      const r = computeRange();
      if ("all" in r && r.all) {
        url.searchParams.set("all", "1");
      } else {
        if ("from" in r && r.from) url.searchParams.set("from", r.from);
        if ("to" in r && r.to) url.searchParams.set("to", r.to);
      }
      url.searchParams.set("per_page", "100");
      if (uid) url.searchParams.set("uid", String(uid));
      // Defer Firestore sync: fetch fast, then let server sync in background when explicitly requested
      url.searchParams.set("sync", "0");
      const res = await fetch(url.toString(), { cache: "no-store" });
      const json = await res.json();
      if (!res.ok)
        throw new Error(json?.error || "Failed to fetch time entries");
      const list = Array.isArray(json?.timeEntries) ? json.timeEntries : [];
      setEntries(list);
      // Auto-fix any non-quarter-hour entries in background
      void autoFixNonQuarter(list);

      // Kick off background sync (non-blocking)
      try {
        const syncUrl = new URL(url.toString());
        syncUrl.searchParams.set("sync", "1");
        void fetch(syncUrl.toString());
      } catch {}
    } catch (e: any) {
      setError(e?.message || "Failed to load time entries");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchEntries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  const totalHours = entries.reduce(
    (sum: number, e: any) => sum + (Number(e.hours) || 0),
    0
  );

  function formatHoursHM(value: any): string {
    const n = Number(value);
    if (!Number.isFinite(n)) return String(value ?? "");
    const hours = Math.floor(n);
    const minutes = Math.round((n - hours) * 60);
    const mm = String(minutes).padStart(2, "0");
    return `${hours}:${mm}`;
  }

  function isQuarterHour(n: number): boolean {
    return Math.abs(n * 4 - Math.round(n * 4)) < 1e-6;
  }

  function snapToQuarterHour(n: number): number {
    return Math.round(n * 4) / 4;
  }

  function formatQuarterHM(n: number): string {
    const snapped = snapToQuarterHour(n);
    const h = Math.floor(snapped);
    const m = Math.round((snapped - h) * 60);
    const mm = String(m).padStart(2, "0");
    return `${h}:${mm}`;
  }

  async function autoFixNonQuarter(list: any[]) {
    try {
      const offenders = (list || []).filter((e: any) => {
        const h = Number(e?.hours);
        return Number.isFinite(h) && !isQuarterHour(h);
      });
      if (offenders.length === 0) return;
      setAutoFixing(true);
      for (const e of offenders) {
        const target = snapToQuarterHour(Number(e.hours));
        try {
          const uid = readFirebaseAuthUid();
          const url = new URL(
            `/api/harvest/timesheets/${e.id}`,
            window.location.origin
          );
          if (uid) url.searchParams.set("uid", uid);
          const res = await fetch(url.toString(), {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ hours: target }),
          });
          if (!res.ok) continue; // skip silently on failure
          const updated = await res.json();
          setEntries((prev) =>
            prev.map((row: any) =>
              row.id === e.id ? { ...row, ...updated } : row
            )
          );
        } catch {}
      }
    } finally {
      setAutoFixing(false);
    }
  }

  async function handleDelete(id: string | number) {
    const target = entries.find((row: any) => row?.id === id);
    if (target?.is_locked) {
      setError(
        target?.locked_reason ||
          "This entry is locked and cannot be deleted for this period."
      );
      return;
    }
    const confirmed = window.confirm("Delete this time entry?");
    if (!confirmed) return;
    setDeletingId(id);
    setError(null);
    try {
      const uid = readFirebaseAuthUid();
      const url = new URL(
        `/api/harvest/timesheets/${id}`,
        window.location.origin
      );
      if (uid) url.searchParams.set("uid", uid);
      const res = await fetch(url.toString(), { method: "DELETE" });
      if (!res.ok) {
        let message = "Delete failed";
        try {
          const json = await res.json();
          message = json?.error || message;
        } catch {}
        throw new Error(message);
      }
      setEntries((prev) => prev.filter((e: any) => e.id !== id));
    } catch (e: any) {
      setError(e?.message || "Failed to delete time entry");
    } finally {
      setDeletingId(null);
    }
  }

  function openEditModal(entry: any) {
    if (entry?.is_locked) {
      setError(
        entry?.locked_reason ||
          "This entry is locked and cannot be edited for this period."
      );
      return;
    }
    setEditingId(entry.id);
    setEditNotes(entry.notes || "");
    if (entry?.hours != null && !Number.isNaN(Number(entry.hours))) {
      const n = Number(entry.hours);
      setEditHours(formatQuarterHM(n));
    } else {
      setEditHours("");
    }
  }

  function closeEditModal() {
    setEditingId(null);
    setEditNotes("");
    setEditHours("");
    setSaving(false);
  }

  async function handleSaveNotes() {
    if (!editingId) return;
    setSaving(true);
    setError(null);
    try {
      const payload: any = { notes: editNotes };

      function parseHoursInput(value: string): number | null {
        if (!value) return null;
        const raw = value.trim();
        const normalized = raw.replace(/,/g, ".");
        // H:MM (e.g., 1:30)
        const hm = normalized.match(/^\s*(\d+)\s*:\s*(\d{1,2})\s*$/);
        if (hm) {
          const h = Number(hm[1]);
          const m = Number(hm[2]);
          if (!Number.isFinite(h) || !Number.isFinite(m) || m >= 60)
            return null;
          return Math.round((h + m / 60) * 100) / 100;
        }
        // Xm or minutes
        const mins = normalized.match(/^\s*(\d+)\s*(?:m|min|minutes?)\s*$/i);
        if (mins) {
          const m = Number(mins[1]);
          if (!Number.isFinite(m)) return null;
          return Math.round((m / 60) * 100) / 100;
        }
        // Decimal hours
        const dec = Number(normalized);
        if (Number.isFinite(dec)) return Math.round(dec * 100) / 100;
        return null;
      }

      const parsed = parseHoursInput(editHours);
      if (editHours !== "") {
        if (parsed == null)
          throw new Error(
            "Invalid hours format. Use 1.5 or 1:30 in 15‑minute increments."
          );
        // Enforce 15-minute increments (0.25h)
        const snapped = Math.round(parsed * 4) / 4;
        const isQuarterStep = Math.abs(parsed - snapped) < 1e-6;
        if (!isQuarterStep)
          throw new Error("Hours must be 0:15, 0:30, 0:45, 1:00, etc.");
        payload.hours = snapped;
      }
      const uid = readFirebaseAuthUid();
      const url = new URL(
        `/api/harvest/timesheets/${editingId}`,
        window.location.origin
      );
      if (uid) url.searchParams.set("uid", uid);
      const res = await fetch(url.toString(), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        let message = "Update failed";
        try {
          const json = await res.json();
          message = json?.error || message;
        } catch {}
        throw new Error(message);
      }
      const json = await res.json();
      setEntries((prev) =>
        prev.map((e: any) => (e.id === editingId ? { ...e, ...json } : e))
      );
      closeEditModal();
    } catch (e: any) {
      setError(e?.message || "Failed to update time entry");
      setSaving(false);
    }
  }

  async function handleOptimizeNotes() {
    if (!editNotes?.trim()) return;
    setOptimizing(true);
    setError(null);
    try {
      const prompt = [
        "Rewrite the following timesheet note in a concise, professional tone suitable for client-facing records.",
        "- Keep it factual and specific.",
        "- Avoid greetings/salutations and filler.",
        "- Prefer first-person past tense and ≤ 25 words when possible.",
        "- Preserve key details (project, task, deliverable, timeframe).",
        "- Respond with ONLY the rewritten note text. No prefixes or quotes.",
        "\nOriginal note:\n\n" + editNotes,
      ].join("\n");
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: prompt }] }),
      });
      if (!res.ok) {
        let message = "Optimize failed";
        try {
          const json = await res.json();
          message = json?.error || message;
        } catch {}
        throw new Error(message);
      }
      // Be resilient to different response shapes: {reply}, {response}, string, or nested {output}
      const rawText = await res.text();
      let parsed: any;
      try {
        parsed = JSON.parse(rawText);
      } catch {
        parsed = rawText;
      }

      function extractText(d: any): string | null {
        if (!d) return null;
        if (typeof d === "string") return d;
        if (typeof d.reply === "string") return d.reply;
        if (typeof d.response === "string") return d.response;
        if (d.output) return extractText(d.output);
        return null;
      }
      const text = extractText(parsed)?.trim();
      if (text) {
        const cleaned = text
          // Remove leading explanatory prefixes like "Rewrote timesheet note:"
          .replace(
            /^(?:rewrote(?:\s+timesheet\s+note)?|rewritten(?:\s+timesheet\s+note)?|updated\s+note|optimized\s+note|note|timesheet\s+note|professional\s+rewrite|rephrased)\s*:\s*/i,
            ""
          )
          // Strip wrapping quotes
          .replace(/^["'`“”]+/, "")
          .replace(/["'`“”]+$/, "")
          .trim();
        if (cleaned) setEditNotes(cleaned);
      }
    } catch (e: any) {
      setError(e?.message || "Failed to optimize note");
    } finally {
      setOptimizing(false);
    }
  }

  return (
    <div className="container mx-auto py-8 space-y-6">
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="text-3xl font-bold">Timesheets</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3">
            <Tabs value={range} onValueChange={(v: any) => setRange(v)}>
              <TabsList className="flex flex-wrap gap-2">
                <TabsTrigger className="flex-1 sm:flex-none" value="day">
                  Day
                </TabsTrigger>
                <TabsTrigger className="flex-1 sm:flex-none" value="week">
                  Week
                </TabsTrigger>
                <TabsTrigger className="flex-1 sm:flex-none" value="month">
                  Month
                </TabsTrigger>
                <TabsTrigger className="flex-1 sm:flex-none" value="all">
                  All
                </TabsTrigger>
                <TabsTrigger className="flex-1 sm:flex-none" value="custom">
                  Custom
                </TabsTrigger>
              </TabsList>
            </Tabs>
            {range === "custom" && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
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
                <Button
                  onClick={fetchEntries}
                  disabled={isLoading || !from || !to}
                  className="w-full sm:w-auto"
                >
                  Apply
                </Button>
              </div>
            )}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
              <Button
                onClick={fetchEntries}
                disabled={isLoading}
                className="w-full sm:w-auto"
              >
                {isLoading ? "Refreshing..." : "Refresh"}
              </Button>
              <div className="text-sm text-muted-foreground">
                {entries.length} entries · {totalHours.toFixed(2)} hours
                {autoFixing && <span className="ml-2">(Auto-fixing…)</span>}
              </div>
            </div>
          </div>
          {error && <div className="text-sm text-red-600">{error}</div>}
          {/* Drafts panel */}
          {Array.isArray(drafts) && drafts.length > 0 && (
            <div className="border rounded-md p-3 space-y-2 bg-muted/30">
              <div className="text-sm font-medium">
                Pending draft timesheets
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {drafts.map((d) => (
                  <div
                    key={d.id}
                    className="border rounded p-2 text-sm flex items-center justify-between gap-2"
                  >
                    <div className="truncate">
                      <div className="font-medium">
                        {d.spent_date} · {Number(d.hours).toFixed(2)}h
                      </div>
                      <div className="text-muted-foreground truncate max-w-[280px]">
                        {d.notes}
                      </div>
                    </div>
                    <div className="shrink-0">
                      <Button
                        size="sm"
                        onClick={async () => {
                          try {
                            const res = await fetch("/api/harvest/timesheets", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                spent_date: d.spent_date,
                                hours: d.hours,
                                notes: d.notes,
                              }),
                            });
                            if (!res.ok) throw new Error("Create failed");
                          } catch (e: any) {
                            setError(
                              e?.message || "Failed to create timesheet"
                            );
                          }
                        }}
                      >
                        Approve
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* Mobile card list */}
          <div className="grid grid-cols-1 gap-3 md:hidden">
            {entries.length === 0 && (
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
                <div className="flex justify-end">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        size="icon"
                        aria-label="Actions"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuItem
                        onClick={() => openEditModal(e)}
                        disabled={isLoading || e.is_locked}
                        className="flex items-center gap-2"
                      >
                        <Pencil className="h-4 w-4" /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handleDelete(e.id)}
                        disabled={
                          deletingId === e.id || isLoading || e.is_locked
                        }
                        className="flex items-center gap-2 text-red-600 focus:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
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
                  <th className="text-right p-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {entries.length === 0 && (
                  <tr>
                    <td className="p-3 text-muted-foreground" colSpan={6}>
                      No entries found.
                    </td>
                  </tr>
                )}
                {entries.map((e: any) => (
                  <tr key={e.id} className="border-t">
                    <td className="p-2">{e.spent_date}</td>
                    <td className="p-2">
                      <div className="flex items-center gap-2">
                        <span>{e.project?.name || "-"}</span>
                        {e.is_locked && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Lock
                                  className="h-5 w-5 md:h-6 md:w-6 text-amber-500 cursor-help"
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
                    </td>
                    <td className="p-2">{e.task?.name || "-"}</td>
                    <td className="p-2 text-right">{formatHoursHM(e.hours)}</td>
                    <td className="p-2">{e.notes || ""}</td>
                    <td className="p-2 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="outline"
                            size="icon"
                            aria-label="Actions"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem
                            onClick={() => openEditModal(e)}
                            disabled={isLoading || e.is_locked}
                            className="flex items-center gap-2"
                          >
                            <Pencil className="h-4 w-4" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleDelete(e.id)}
                            disabled={
                              deletingId === e.id || isLoading || e.is_locked
                            }
                            className="flex items-center gap-2 text-red-600 focus:text-red-600"
                          >
                            <Trash2 className="h-4 w-4" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Dialog
            open={editingId != null}
            onOpenChange={(o) => !o && closeEditModal()}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit Notes</DialogTitle>
              </DialogHeader>
              <div className="space-y-2">
                <div className="grid gap-2">
                  <label className="text-sm font-medium">Hours</label>
                  <Input
                    type="text"
                    inputMode="decimal"
                    pattern="[0-9:.,mM ]+"
                    value={editHours}
                    onChange={(e) => setEditHours(e.target.value)}
                    placeholder="e.g. 1:00 or 1.5"
                  />
                </div>
                <Textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Enter notes..."
                  rows={6}
                />
              </div>
              <DialogFooter>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    title="AI Optimize"
                    aria-label="AI Optimize"
                    onClick={handleOptimizeNotes}
                    disabled={optimizing || saving || !editNotes?.trim()}
                  >
                    {optimizing ? (
                      <Sparkles className="h-4 w-4 text-violet-400 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4 text-violet-400 animate-pulse" />
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={closeEditModal}
                    disabled={saving || optimizing}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSaveNotes}
                    disabled={saving || optimizing || editNotes == null}
                  >
                    {saving ? "Saving..." : "Save"}
                  </Button>
                </div>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    </div>
  );
}
