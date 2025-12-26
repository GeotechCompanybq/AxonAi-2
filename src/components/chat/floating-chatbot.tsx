"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Send, Mic, Paperclip } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  getTasksFromLocalStorage,
  saveTasksToLocalStorage,
} from "@/lib/task-storage";
import type { Task } from "@/types";
import { db } from "@/lib/firebase";
import {
  collection,
  getDocs,
  orderBy,
  query,
  addDoc,
  setDoc,
  doc,
  serverTimestamp,
  limit,
} from "firebase/firestore";

type ChatMessage = { role: "assistant" | "user"; content: string };

export function FloatingChatBot() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [typing, setTyping] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [pendingCreate, setPendingCreate] = useState<
    | {
        active: true;
        step: "name" | "description" | "dueDate";
        task: { name?: string; description?: string; dueDate?: string };
      }
    | { active: false }
  >({ active: false });

  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([
        {
          role: "assistant",
          content:
            "Hi! I’m Axon. I can create schedules, analyze your week, and keep you focused.",
        },
      ]);
    }
  }, [open, messages.length]);

  // Read UID from window or localStorage
  const readUid = (): string | undefined => {
    try {
      const w: any = window as any;
      if (w?.__AXON_UID__) return String(w.__AXON_UID__);
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i) || "";
        if (key.startsWith("firebase:authUser")) {
          const raw = window.localStorage.getItem(key);
          if (!raw) continue;
          const obj = JSON.parse(raw);
          if (obj?.uid) return String(obj.uid);
        }
      }
    } catch {}
    return undefined;
  };

  // Ensure there is an active chat session for the user
  const ensureSession = async (): Promise<string | null> => {
    const uid = readUid();
    if (!uid) return null;
    if (sessionId) return sessionId;
    try {
      const col = collection(db as any, "users", uid, "chatSessions");
      const qy = query(col, orderBy("updatedAt", "desc"), limit(1));
      const snap = await getDocs(qy);
      if (!snap.empty) {
        const first = snap.docs[0];
        setSessionId(first.id);
        return first.id;
      }
      const ref = await addDoc(col, {
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        title: "Axon chat",
      });
      setSessionId(ref.id);
      return ref.id;
    } catch {
      return null;
    }
  };

  // Load previous messages when opening chat
  useEffect(() => {
    const load = async () => {
      if (!open) return;
      const uid = readUid();
      if (!uid) return;
      const sid = await ensureSession();
      if (!sid) return;
      try {
        const msgsCol = collection(
          db as any,
          "users",
          uid,
          "chatSessions",
          sid,
          "messages"
        );
        const snap = await getDocs(query(msgsCol, orderBy("createdAt", "asc")));
        const arr: ChatMessage[] = [];
        snap.forEach((d) => {
          const r = d.get("role");
          const c = d.get("content");
          if ((r === "assistant" || r === "user") && typeof c === "string") {
            arr.push({ role: r, content: c });
          }
        });
        if (arr.length > 0) setMessages(arr);
      } catch {}
    };
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const persistMessage = async (
    role: "assistant" | "user",
    content: string
  ) => {
    try {
      const uid = readUid();
      if (!uid) return;
      const sid = (await ensureSession()) as string | null;
      if (!sid) return;
      const msgsCol = collection(
        db as any,
        "users",
        uid,
        "chatSessions",
        sid,
        "messages"
      );
      await addDoc(msgsCol, {
        role,
        content,
        createdAt: serverTimestamp(),
      });
      await setDoc(
        doc(db as any, "users", uid, "chatSessions", sid),
        { updatedAt: serverTimestamp(), lastMessage: content.slice(0, 200) },
        { merge: true }
      );
    } catch {}
  };

  useEffect(() => {
    listRef.current?.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, typing]);

  const quickPrompts = [
    "Create my schedule",
    "What's due today?",
    "Analyze my week",
    "Suggest breaks",
  ];

  async function handleSend() {
    const trimmed = input.trim();
    if (!trimmed) return;
    setMessages((m) => [...m, { role: "user", content: trimmed }]);
    // Fire-and-forget persist of user message
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    persistMessage("user", trimmed);
    setInput("");
    setTyping(true);
    try {
      // Review drafted timesheets
      const wantsReviewDrafts =
        /\breview\b/i.test(trimmed) || /review\s+timesheets/i.test(trimmed);
      if (wantsReviewDrafts) {
        const uid =
          (window as any)?.__AXON_UID__ ||
          ((): string | undefined => {
            try {
              for (let i = 0; i < window.localStorage.length; i++) {
                const key = window.localStorage.key(i) || "";
                if (key.startsWith("firebase:authUser")) {
                  const raw = window.localStorage.getItem(key);
                  if (!raw) continue;
                  const obj = JSON.parse(raw);
                  if (obj?.uid) return String(obj.uid);
                }
              }
            } catch {}
            return undefined;
          })();
        if (!uid) {
          setMessages((m) => [
            ...m,
            { role: "assistant", content: "Please sign in to review drafts." },
          ]);
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          persistMessage("assistant", "Please sign in to review drafts.");
          setTyping(false);
          return;
        }
        try {
          const url = new URL("/api/timesheets/drafts", window.location.origin);
          url.searchParams.set("uid", uid);
          const res = await fetch(url.toString(), { cache: "no-store" });
          const json = await res.json();
          if (!res.ok)
            throw new Error(json?.error || "Failed to read drafted timesheets.");
          const drafts: any[] = Array.isArray(json?.drafts) ? json.drafts : [];
          if (drafts.length === 0) {
            setMessages((m) => [
              ...m,
              { role: "assistant", content: "No drafted timesheets found." },
            ]);
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            persistMessage("assistant", "No drafted timesheets found.");
            setTyping(false);
            return;
          }
          const byDate = new Map<string, { total: number; items: any[] }>();
          for (const d of drafts) {
            const date = String(d?.spent_date || "");
            if (!byDate.has(date)) byDate.set(date, { total: 0, items: [] });
            const rec = byDate.get(date)!;
            const h = Number(d?.hours || 0);
            rec.total += Number.isFinite(h) ? h : 0;
            rec.items.push(d);
          }
          const lines: string[] = [];
          lines.push(
            `You have ${drafts.length} drafted timesheet${
              drafts.length === 1 ? "" : "s"
            }.`
          );
          Array.from(byDate.entries())
            .sort((a, b) => a[0].localeCompare(b[0]))
            .forEach(([date, rec]) => {
              const sample = rec.items
                .slice(0, 3)
                .map((x) => String(x?.notes || x?.task || ""))
                .filter(Boolean)
                .join("; ");
              lines.push(
                `${date}: ${rec.total.toFixed(2)}h` +
                  (sample ? ` — ${sample}` : "")
              );
            });
          lines.push("You can approve drafts on the Timesheets page.");
          setMessages((m) => [
            ...m,
            { role: "assistant", content: lines.join("\n") },
          ]);
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          persistMessage("assistant", lines.join("\n"));
          setTyping(false);
          return;
        } catch {
          setMessages((m) => [
            ...m,
            {
              role: "assistant",
              content: "Failed to read drafted timesheets.",
            },
          ]);
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          persistMessage("assistant", "Failed to read drafted timesheets.");
          setTyping(false);
          return;
        }
      }

      // Analysis intents: timesheets and tasks (robust to "analysis" and plurals)
      const textLc = trimmed.toLowerCase();
      const analysisTerms = [
        "analyze",
        "analyse",
        "analysis",
        "summary",
        "summarize",
        "report",
        "insight",
        "breakdown",
        "review",
      ];
      const timesheetTerms = [
        "timesheet",
        "timesheets",
        "time sheet",
        "time sheets",
        "hours",
        "work hours",
        "work time",
        "logged time",
        "harvest",
        "week",
      ];
      const taskTerms = [
        "task",
        "tasks",
        "todo",
        "todos",
        "to-do",
        "to-dos",
        "work items",
      ];
      const hasAnalysis = analysisTerms.some((t) => textLc.includes(t));
      const wantsAnalyzeTimesheets =
        hasAnalysis && timesheetTerms.some((t) => textLc.includes(t));
      const wantsAnalyzeTasks =
        (hasAnalysis && taskTerms.some((t) => textLc.includes(t))) ||
        /(what'?s\s+due|due\s+today|overdue)/i.test(trimmed);
      if (wantsAnalyzeTimesheets || wantsAnalyzeTasks) {
        const uid =
          (window as any)?.__AXON_UID__ ||
          ((): string | undefined => {
            try {
              for (let i = 0; i < window.localStorage.length; i++) {
                const key = window.localStorage.key(i) || "";
                if (key.startsWith("firebase:authUser")) {
                  const raw = window.localStorage.getItem(key);
                  if (!raw) continue;
                  const obj = JSON.parse(raw);
                  if (obj?.uid) return String(obj.uid);
                }
              }
            } catch {}
            return undefined;
          })();
        let timesheetSummary = "";
        if (wantsAnalyzeTimesheets && uid) {
          try {
            const today = new Date();
            const start = new Date(today);
            start.setDate(today.getDate() - 7);
            const from = start.toISOString().slice(0, 10);
            const to = today.toISOString().slice(0, 10);
            // Prefer Firestore if available
            let list: any[] = [];
            try {
              const col = collection(
                db as any,
                "users",
                uid,
                "harvestTimesheets"
              );
              const snap = await getDocs(col);
              const all: any[] = [];
              snap.forEach((d) => all.push(d.data()));
              list = all.filter((e) => {
                const d = String(e?.spent_date || "");
                return d >= from && d <= to;
              });
            } catch {}
            // Fallback to direct API if Firestore empty
            if (!list || list.length === 0) {
              const url = new URL(
                "/api/harvest/timesheets",
                window.location.origin
              );
              url.searchParams.set("from", from);
              url.searchParams.set("to", to);
              url.searchParams.set("uid", uid);
              url.searchParams.set("sync", "0");
              const res = await fetch(url.toString(), { cache: "no-store" });
              const json = await res.json();
              list = Array.isArray(json?.timeEntries) ? json.timeEntries : [];
            }
            const total = list.reduce((s, e) => s + (Number(e?.hours) || 0), 0);
            const perProject = new Map<string, number>();
            list.forEach((e: any) => {
              const key = String(
                e?.project?.name || e?.client?.name || "Other"
              );
              perProject.set(
                key,
                (perProject.get(key) || 0) + (Number(e?.hours) || 0)
              );
            });
            const top = Array.from(perProject.entries())
              .sort((a, b) => b[1] - a[1])
              .slice(0, 3)
              .map(([k, v]) => `${k}: ${v.toFixed(2)}h`)
              .join(", ");
            timesheetSummary = `Worked ${total.toFixed(
              2
            )}h in the last 7 days. Top projects: ${top || "N/A"}.`;
            // Background sync
            try {
              const url = new URL(
                "/api/harvest/timesheets",
                window.location.origin
              );
              url.searchParams.set("from", from);
              url.searchParams.set("to", to);
              url.searchParams.set("uid", uid);
              url.searchParams.set("sync", "1");
              void fetch(url.toString());
            } catch {}
          } catch {
            timesheetSummary = "Could not load timesheets.";
          }
        }

        let taskSummary = "";
        if (wantsAnalyzeTasks) {
          try {
            // Prefer Firestore tasks if available
            let tasks: any[] = [];
            try {
              const uid =
                (window as any)?.__AXON_UID__ ||
                ((): string | undefined => {
                  try {
                    for (let i = 0; i < window.localStorage.length; i++) {
                      const key = window.localStorage.key(i) || "";
                      if (key.startsWith("firebase:authUser")) {
                        const raw = window.localStorage.getItem(key);
                        if (!raw) continue;
                        const obj = JSON.parse(raw);
                        if (obj?.uid) return String(obj.uid);
                      }
                    }
                  } catch {}
                  return undefined;
                })();
              if (uid) {
                const col = collection(db as any, "users", uid, "tasks");
                const snap = await getDocs(col);
                snap.forEach((d) => tasks.push({ id: d.id, ...d.data() }));
              }
            } catch {}
            if (!tasks || tasks.length === 0) {
              tasks = getTasksFromLocalStorage();
            }
            const counts = tasks.reduce(
              (acc: any, t: any) => {
                acc.total++;
                acc[t.status || "todo"] = (acc[t.status || "todo"] || 0) + 1;
                return acc;
              },
              { total: 0 }
            );
            const now = new Date();
            const todayStr = now.toISOString().slice(0, 10);
            const threeDays = new Date(now);
            threeDays.setDate(now.getDate() + 3);
            const dueToday = tasks.filter((t: any) =>
              (t.dueDate || "").startsWith(todayStr)
            );
            const dueSoon = tasks.filter((t: any) => {
              if (!t.dueDate) return false;
              const d = new Date(t.dueDate);
              return d > now && d <= threeDays;
            });
            const sample = (arr: any[]) =>
              arr
                .slice(0, 3)
                .map((t) => t.name)
                .join(", ");
            taskSummary = `Tasks: total ${counts.total}, todo ${
              counts.todo || 0
            }, inprogress ${counts.inprogress || 0}, blocked ${
              counts.blocked || 0
            }, done ${counts.done || 0}. Due today: ${
              dueToday.length
            } (${sample(dueToday)}). Due soon: ${dueSoon.length} (${sample(
              dueSoon
            )}).`;
          } catch {
            taskSummary = "Could not read tasks.";
          }
        }

        const combined = [timesheetSummary, taskSummary]
          .filter(Boolean)
          .join("\n");
        setMessages((m) => [
          ...m,
          { role: "assistant", content: combined || "No data found." },
        ]);
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        persistMessage("assistant", combined || "No data found.");
        setTyping(false);
        return;
      }
      // Handle task creation wizard follow-ups
      if (pendingCreate.active) {
        const current = pendingCreate;
        if (current.step === "name") {
          const name = trimmed.replace(/^name\s*:\s*/i, "").trim();
          if (!name) {
            setMessages((m) => [
              ...m,
              { role: "assistant", content: "Please provide a task name." },
            ]);
            setTyping(false);
            return;
          }
          setPendingCreate({
            active: true,
            step: "description",
            task: { ...current.task, name },
          });
          setMessages((m) => [
            ...m,
            {
              role: "assistant",
              content:
                "Got it: '" +
                name +
                "'. Add a brief description? (or type 'skip')",
            },
          ]);
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          persistMessage(
            "assistant",
            "Got it: '" + name + "'. Add a brief description? (or type 'skip')"
          );
          setTyping(false);
          return;
        }
        if (current.step === "description") {
          const description = /^skip$/i.test(trimmed) ? undefined : trimmed;
          setPendingCreate({
            active: true,
            step: "dueDate",
            task: { ...current.task, description },
          });
          setMessages((m) => [
            ...m,
            {
              role: "assistant",
              content:
                "Any due date? (YYYY-MM-DD) or type 'skip' to leave unset",
            },
          ]);
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          persistMessage(
            "assistant",
            "Any due date? (YYYY-MM-DD) or type 'skip' to leave unset"
          );
          setTyping(false);
          return;
        }
        if (current.step === "dueDate") {
          let due: string | undefined = undefined;
          if (!/^skip$/i.test(trimmed)) {
            const m = trimmed.match(/^\s*(\d{4}-\d{2}-\d{2})\s*$/);
            if (m) {
              const dt = new Date(m[1] + "T00:00:00Z");
              if (!isNaN(dt.getTime())) due = dt.toISOString();
            }
          }
          const finalTask = { ...current.task, dueDate: due };
          // Create
          const uid =
            (window as any)?.__AXON_UID__ ||
            ((): string | undefined => {
              try {
                for (let i = 0; i < window.localStorage.length; i++) {
                  const key = window.localStorage.key(i) || "";
                  if (key.startsWith("firebase:authUser")) {
                    const raw = window.localStorage.getItem(key);
                    if (!raw) continue;
                    const obj = JSON.parse(raw);
                    if (obj?.uid) return String(obj.uid);
                  }
                }
              } catch {}
              return undefined;
            })();
          if (uid && finalTask.name) {
            try {
              await fetch(`/api/tasks`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  uid,
                  task: { ...finalTask, status: "todo" },
                }),
              });
            } catch {}
            try {
              const existing = getTasksFromLocalStorage();
              const newTask: Task = {
                id: `chat-${Date.now()}`,
                name: finalTask.name!,
                description: finalTask.description,
                dueDate: finalTask.dueDate,
                status: "todo",
                priority: "medium",
                category: "General",
              } as any;
              saveTasksToLocalStorage([newTask, ...existing]);
            } catch {}
            setMessages((m) => [
              ...m,
              {
                role: "assistant",
                content:
                  "Created task: " +
                  finalTask.name +
                  (finalTask.dueDate
                    ? " (due " + finalTask.dueDate.slice(0, 10) + ")"
                    : ""),
              },
            ]);
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            persistMessage(
              "assistant",
              "Created task: " +
                finalTask.name +
                (finalTask.dueDate
                  ? " (due " + finalTask.dueDate.slice(0, 10) + ")"
                  : "")
            );
            setPendingCreate({ active: false });
            setTyping(false);
            return;
          }
        }
      }
      // Draft timesheets from Monday tasks
      const wantsDraftTimesheets =
        /timesheet/i.test(trimmed) &&
        /(draft|create|generate|fill|missing)/i.test(trimmed);
      if (wantsDraftTimesheets) {
        const uid =
          (window as any)?.__AXON_UID__ ||
          ((): string | undefined => {
            try {
              for (let i = 0; i < window.localStorage.length; i++) {
                const key = window.localStorage.key(i) || "";
                if (key.startsWith("firebase:authUser")) {
                  const raw = window.localStorage.getItem(key);
                  if (!raw) continue;
                  const obj = JSON.parse(raw);
                  if (obj?.uid) return String(obj.uid);
                }
              }
            } catch {}
            return undefined;
          })();
        if (uid) {
          const today = new Date();
          const start = new Date(today);
          start.setDate(today.getDate() - 7);
          const from = start.toISOString().slice(0, 10);
          const to = today.toISOString().slice(0, 10);
          try {
            const resRec = await fetch(
              `/api/harvest/drafts/reconcile?uid=${encodeURIComponent(uid)}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  from,
                  to,
                  defaultHours: 1,
                  targetPerDay: 8,
                }),
              }
            );
            const data = await resRec.json();
            if (resRec.ok) {
              const n = Array.isArray(data?.drafts) ? data.drafts.length : 0;
              setMessages((m) => [
                ...m,
                {
                  role: "assistant",
                  content:
                    n > 0
                      ? `Drafted ${n} Harvest timesheet${
                          n === 1 ? "" : "s"
                        } from your Monday tasks for the last 7 days. Review them in Timesheets.`
                      : "No missing days found to draft from Monday tasks in the last 7 days.",
                },
              ]);
              setTyping(false);
              return;
            }
          } catch {}
        }
      }

      // If user asks to "create task" or "add task", start a brief wizard
      const createMatch = /(create|add)\s+task\b/i.test(trimmed);
      if (createMatch) {
        const nameMatch =
          trimmed.match(/task\b(?:\s+named)?\s+\"([^\"]+)\"/i) ||
          trimmed.match(/task\s+(.+)/i);
        const nameExtracted = nameMatch
          ? (
              nameMatch[1] ||
              nameMatch[0].replace(/^(create|add)\s+task\s+/i, "")
            ).trim()
          : undefined;
        if (nameExtracted) {
          setPendingCreate({
            active: true,
            step: "description",
            task: { name: nameExtracted },
          });
          setMessages((m) => [
            ...m,
            {
              role: "assistant",
              content:
                "Noted: '" +
                nameExtracted +
                "'. Add a description? (or type 'skip')",
            },
          ]);
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          persistMessage(
            "assistant",
            "Noted: '" +
              nameExtracted +
              "'. Add a description? (or type 'skip')"
          );
          setTyping(false);
          return;
        } else {
          setPendingCreate({ active: true, step: "name", task: {} });
          setMessages((m) => [
            ...m,
            { role: "assistant", content: "What is the task name?" },
          ]);
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          persistMessage("assistant", "What is the task name?");
          setTyping(false);
          return;
        }
      }
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, { role: "user", content: trimmed }],
        }),
      });
      if (!res.ok) throw new Error("request_failed");
      const raw = await res.text();
      let text: string | null = null;
      try {
        const data = JSON.parse(raw);
        const extract = (d: any): string | null => {
          if (!d) return null;
          if (typeof d === "string") return d;
          const direct =
            (typeof d.reply === "string" && d.reply) ||
            (typeof d.message === "string" && d.message) ||
            (typeof d.response === "string" && d.response) ||
            (typeof d.content === "string" && d.content) ||
            (typeof d.text === "string" && d.text);
          if (direct && String(direct).trim()) return String(direct);

          if (d?.choices?.[0]?.message?.content)
            return String(d.choices[0].message.content);
          if (d?.choices?.[0]?.delta?.content)
            return String(d.choices[0].delta.content);

          if (d?.candidates?.[0]?.content?.parts) {
            const parts = d.candidates[0].content.parts;
            const str = parts
              .map((p: any) => p?.text)
              .filter(Boolean)
              .join("\n")
              .trim();
            if (str) return str;
          }

          if (Array.isArray(d?.messages)) {
            const last = [...d.messages]
              .reverse()
              .find((m: any) => typeof m?.content === "string");
            if (last?.content) return String(last.content);
          }

          if (d.output) {
            const out = extract(d.output);
            if (out) return out;
          }

          const queue: any[] = [d];
          while (queue.length) {
            const cur = queue.shift();
            if (!cur || typeof cur !== "object") continue;
            for (const key of Object.keys(cur)) {
              const val: any = (cur as any)[key];
              if (
                typeof val === "string" &&
                /^(content|text|reply|message|response)$/i.test(key) &&
                val.trim()
              )
                return val;
              if (val && typeof val === "object") queue.push(val);
              if (Array.isArray(val)) for (const v of val) queue.push(v);
            }
          }
          return null;
        };
        text = extract(data);
      } catch {
        text = raw?.trim() || null;
      }
      setMessages((m) => [
        ...m,
        { role: "assistant", content: text || "(No reply text received)" },
      ]);
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      persistMessage("assistant", text || "(No reply text received)");
    } catch (e) {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: "Sorry, I couldn’t reach the AI right now.",
        },
      ]);
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      persistMessage("assistant", "Sorry, I couldn’t reach the AI right now.");
    } finally {
      setTyping(false);
    }
  }

  return (
    <>
      {/* Floating button */}
      <Button
        aria-label="Open chat"
        onClick={() => setOpen(true)}
        className={cn(
          "fixed z-50 md:bottom-8 md:right-8 right-4 group",
          "rounded-full h-12 w-12 p-0",
          "bg-gradient-to-br from-cyan-400 via-fuchsia-500 to-violet-600 text-white",
          "shadow-[0_10px_30px_rgba(0,0,0,0.45),0_0_40px_rgba(0,212,255,0.35)]",
          "hover:scale-[1.05] active:scale-[0.98] transition-transform"
        )}
        style={{
          bottom: "max(84px, calc(env(safe-area-inset-bottom) + 64px))",
        }}
      >
        <span className="absolute -z-10 inline-block h-12 w-12 rounded-full bg-cyan-400/40 blur-xl transition-opacity group-hover:opacity-80" />
        <Bot className="h-5 w-5" />
      </Button>

      {/* Chat panel */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className={cn(
            "w-[min(92vw,28rem)] md:w-[28rem] border-white/10",
            "bg-background/70 backdrop-blur-xl"
          )}
        >
          <SheetHeader>
            <div className="flex items-center gap-3">
              <div className="grid size-8 place-items-center rounded-full bg-gradient-to-br from-cyan-400 to-fuchsia-500 text-white shadow-[0_0_24px_rgba(0,212,255,0.35)]">
                <Bot className="h-4 w-4" />
              </div>
              <div className="text-left">
                <SheetTitle>Axon Assistant</SheetTitle>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <span className="inline-block size-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.9)]" />
                  Online
                </div>
              </div>
            </div>
          </SheetHeader>

          {/* Quick prompts */}
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {quickPrompts.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setInput(p)}
                className="rounded-full border border-white/10 bg-background/40 px-3 py-1.5 text-xs text-foreground shadow hover:bg-background/60"
              >
                {p}
              </button>
            ))}
          </div>

          <div className="mt-3 flex h-[72vh] flex-col md:h-[70vh]">
            <div
              ref={listRef}
              className="flex-1 space-y-3 overflow-auto rounded-xl border border-white/10 bg-background/40 p-3"
            >
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex",
                    m.role === "user" ? "justify-end" : "justify-start"
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[85%] rounded-2xl px-3 py-2 text-sm",
                      m.role === "user"
                        ? "bg-gradient-to-br from-cyan-500/30 to-fuchsia-500/30 text-foreground border border-white/10"
                        : "bg-background/70 text-foreground border border-white/10"
                    )}
                  >
                    {m.content}
                  </div>
                </div>
              ))}
              {typing && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="inline-flex h-6 items-center gap-1 rounded-full bg-background/60 px-2 border border-white/10">
                    <span className="size-1.5 animate-bounce rounded-full bg-foreground [animation-delay:-0.2s]" />
                    <span className="size-1.5 animate-bounce rounded-full bg-foreground" />
                    <span className="size-1.5 animate-bounce rounded-full bg-foreground [animation-delay:0.2s]" />
                  </span>
                  Axon is typing...
                </div>
              )}
            </div>
            <form
              className="mt-3 flex items-center gap-2 rounded-full border border-white/10 bg-background/60 p-2"
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
            >
              <button
                type="button"
                className="grid size-9 place-items-center rounded-full text-muted-foreground hover:text-foreground"
              >
                <Paperclip className="h-4 w-4" />
                <span className="sr-only">Attach</span>
              </button>
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask Axon to plan, schedule, or analyze..."
                className="flex-1 bg-transparent px-2 py-2 text-sm outline-none placeholder:text-muted-foreground"
              />
              <button
                type="button"
                className="grid size-9 place-items-center rounded-full text-muted-foreground hover:text-foreground"
              >
                <Mic className="h-4 w-4" />
                <span className="sr-only">Voice</span>
              </button>
              <Button
                type="submit"
                size="icon"
                className="h-9 w-9 rounded-full"
              >
                <Send className="h-4 w-4" />
                <span className="sr-only">Send</span>
              </Button>
            </form>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
