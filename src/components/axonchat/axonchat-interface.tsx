"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Bot,
  Send,
  Sparkles,
  Calendar,
  Clock,
  ListChecks,
  BarChart3,
  Zap,
  Check,
  X,
  Plus,
  ChevronLeft,
  ChevronRight,
  Settings,
  Copy,
  ThumbsDown,
  ThumbsUp,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { IconSpinner } from "@/components/icons";
import {
  getTasksFromLocalStorage,
  saveTasksToLocalStorage,
} from "@/lib/task-storage";
import type { Task } from "@/types";

type ChatMessage = {
  role: "assistant" | "user" | "system";
  content: string;
  reasoningTitle?: string;
  reasoning?: string;
  timestamp: Date;
  metadata?: {
    type?: "task_created" | "timesheet_updated" | "analysis" | "error" | "pending_action";
    data?: any;
    pendingAction?: {
      type:
        | "edit_timesheet"
        | "create_task"
        | "update_task"
        | "delete_entry"
        | "log_time";
      action: () => Promise<void>;
      details: any;
    };
  };
  isStreaming?: boolean;
};

type ConnectionStatus = {
  harvest: boolean;
  microsoft: boolean;
  jira: boolean;
  monday: boolean;
};

type CustomQuickAction = {
  id: string;
  label: string;
  query: string;
};

type Tone = "none" | "concise" | "technical" | "executive";

export function AxonChatInterface() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [tone, setTone] = useState<Tone>("none");
  const [toneSaving, setToneSaving] = useState(false);
  const [feedbackByIndex, setFeedbackByIndex] = useState<Record<number, "up" | "down">>({});
  const [customActions, setCustomActions] = useState<CustomQuickAction[]>([]);
  const [customDialogOpen, setCustomDialogOpen] = useState(false);
  const [customLabel, setCustomLabel] = useState("");
  const [customQuery, setCustomQuery] = useState("");
  const [sessionId, setSessionId] = useState<string>("default");
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [contextOpen, setContextOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [contextTasks, setContextTasks] = useState<any[]>([]);
  const [snapshot, setSnapshot] = useState<{
    loading: boolean;
    hoursThisWeek: number | null;
    meetingsToday: number | null;
  }>({ loading: false, hoursThisWeek: null, meetingsToday: null });
  const [connections, setConnections] = useState<ConnectionStatus>({
    harvest: false,
    microsoft: false,
    jira: false,
    monday: false,
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const sendInFlightRef = useRef(false);
  const contextLoadRef = useRef<{ inFlight: boolean; lastAt: number }>({
    inFlight: false,
    lastAt: 0,
  });

  const CUSTOM_ACTIONS_KEY = "axonchat_custom_actions_v1";

  const quickActions = [
    { label: "View Tasks", icon: ListChecks, query: "Show my tasks" },
    { label: "View Timesheets", icon: Clock, query: "Show my timesheets" },
    { label: "View Calendar", icon: Calendar, query: "Show my calendar" },
    { label: "Analyze", icon: BarChart3, query: "Analyze my productivity" },
  ];

  async function loadTone() {
    const uid = (window as any).__AXON_UID__ || user?.uid;
    if (!uid) return;
    try {
      const res = await fetch(`/api/axonchat/settings?uid=${encodeURIComponent(String(uid))}`, {
        credentials: "include",
      });
      if (!res.ok) return;
      const data = await res.json();
      const t = String(data?.tone || "none").toLowerCase();
      if (t === "concise" || t === "technical" || t === "executive" || t === "none") {
        setTone(t as Tone);
      }
    } catch {}
  }

  async function saveTone(next: Tone) {
    const uid = (window as any).__AXON_UID__ || user?.uid;
    if (!uid) return;
    setToneSaving(true);
    try {
      await fetch(`/api/axonchat/settings?uid=${encodeURIComponent(String(uid))}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ tone: next }),
      });
    } finally {
      setToneSaving(false);
    }
  }

  // Load chat history on mount
  useEffect(() => {
    loadChatHistory();
    checkConnections();
    loadTone();
  }, []);

  // Load context panel data when connections become available
  useEffect(() => {
    void loadContextPanelData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    connections.harvest,
    connections.microsoft,
    connections.jira,
    connections.monday,
  ]);

  // Online/offline status
  useEffect(() => {
    setIsOnline(typeof navigator !== "undefined" ? navigator.onLine : true);
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  // Load custom quick actions
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CUSTOM_ACTIONS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const cleaned = parsed
          .filter((x) => x && typeof x.label === "string" && typeof x.query === "string")
          .map((x) => ({
            id: String(x.id || `${x.label}-${x.query}`),
            label: String(x.label).slice(0, 40),
            query: String(x.query).slice(0, 4000),
          }));
        setCustomActions(cleaned);
      }
    } catch {}
  }, []);

  // Persist custom quick actions
  useEffect(() => {
    try {
      window.localStorage.setItem(CUSTOM_ACTIONS_KEY, JSON.stringify(customActions));
    } catch {}
  }, [customActions]);

  async function loadChatHistory() {
    const uid = (window as any).__AXON_UID__ || user?.uid;
    if (!uid) {
      setIsLoadingHistory(false);
      // Set initial welcome message if no user
      setMessages([
        {
          role: "assistant",
          content: `Hi! I'm **AxonChat**, your AI assistant. I can help you with:

🎯 **Tasks**: Create, view, and manage tasks from Jira and Monday.com
📊 **Timesheets**: View, edit, and analyze your Harvest timesheets
📅 **Calendar**: Check your Microsoft Calendar events and meetings
📈 **Analytics**: Analyze your productivity, time usage, and task completion
⚡ **And more**: Schedule creation, insights, and advanced features

What would you like to do?`,
          timestamp: new Date(),
        },
      ]);
      return;
    }

    try {
      const res = await fetch(`/api/chat/load?uid=${uid}&sessionId=${sessionId}`, {
        credentials: "include",
      });

      if (res.ok) {
        const data = await res.json();
        if (data.messages && data.messages.length > 0) {
          setMessages(data.messages);
        } else {
          // No history, set welcome message
          setMessages([
            {
              role: "assistant",
              content: `Hi! I'm **AxonChat**, your AI assistant. I can help you with:

🎯 **Tasks**: Create, view, and manage tasks from Jira and Monday.com
📊 **Timesheets**: View, edit, and analyze your Harvest timesheets
📅 **Calendar**: Check your Microsoft Calendar events and meetings
📈 **Analytics**: Analyze your productivity, time usage, and task completion
⚡ **And more**: Schedule creation, insights, and advanced features

What would you like to do?`,
              timestamp: new Date(),
            },
          ]);
        }
      } else {
        // Error loading, set welcome message
        setMessages([
          {
            role: "assistant",
            content: `Hi! I'm **AxonChat**, your AI assistant. I can help you with:

🎯 **Tasks**: Create, view, and manage tasks from Jira and Monday.com
📊 **Timesheets**: View, edit, and analyze your Harvest timesheets
📅 **Calendar**: Check your Microsoft Calendar events and meetings
📈 **Analytics**: Analyze your productivity, time usage, and task completion
⚡ **And more**: Schedule creation, insights, and advanced features

What would you like to do?`,
            timestamp: new Date(),
          },
        ]);
      }
    } catch (error) {
      console.error("Failed to load chat history:", error);
      // Set welcome message on error
      setMessages([
        {
          role: "assistant",
          content: `Hi! I'm **AxonChat**, your AI assistant. I can help you with:

🎯 **Tasks**: Create, view, and manage tasks from Jira and Monday.com
📊 **Timesheets**: View, edit, and analyze your Harvest timesheets
📅 **Calendar**: Check your Microsoft Calendar events and meetings
📈 **Analytics**: Analyze your productivity, time usage, and task completion
⚡ **And more**: Schedule creation, insights, and advanced features

What would you like to do?`,
          timestamp: new Date(),
        },
      ]);
    } finally {
      setIsLoadingHistory(false);
    }
  }

  async function saveChatHistory() {
    const uid = (window as any).__AXON_UID__ || user?.uid;
    if (!uid || messages.length === 0) return;

    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Debounce saves - wait 2 seconds after last message change
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        await fetch("/api/chat/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            uid,
            sessionId,
            messages: messages.map((msg) => ({
              role: msg.role,
              content: msg.content,
              reasoningTitle: msg.reasoningTitle,
              reasoning: msg.reasoning,
              timestamp: msg.timestamp,
              metadata: msg.metadata,
            })),
          }),
        });
      } catch (error) {
        console.error("Failed to save chat history:", error);
      }
    }, 2000);
  }

  // Save chat history whenever messages change
  useEffect(() => {
    if (!isLoadingHistory && messages.length > 0) {
      saveChatHistory();
    }
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [messages, isLoadingHistory]);

  // Auto-scroll to bottom when messages change or typing
  useEffect(() => {
    // Small delay to ensure DOM is updated
    const timer = setTimeout(() => {
      if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [messages, isTyping]);

  async function checkConnections() {
    const uid = (window as any).__AXON_UID__ || user?.uid;
    if (!uid) return;

    try {
      // Check all connections in parallel
      const [harvest, microsoft, jira, monday] = await Promise.all([
        fetch(`/api/harvest/status?uid=${uid}`, { credentials: "include" })
          .then((r) => r.json())
          .then((d) => d.connected === true)
          .catch(() => false),
        fetch(`/api/microsoft/status?uid=${uid}`, { credentials: "include" })
          .then((r) => r.json())
          .then((d) => d.connected === true)
          .catch(() => false),
        fetch(`/api/jira/status?uid=${uid}`, { credentials: "include" })
          .then((r) => r.json())
          .then((d) => d.connected === true)
          .catch(() => false),
        fetch(`/api/monday/status?uid=${uid}`, { credentials: "include" })
          .then((r) => r.json())
          .then((d) => d.connected === true)
          .catch(() => false),
      ]);

      setConnections({ harvest, microsoft, jira, monday });
    } catch (e) {
      console.error("Failed to check connections:", e);
    }
  }

  async function loadContextPanelData() {
    const uid = (window as any).__AXON_UID__ || user?.uid;
    if (!uid) return;

    // Throttle background loads (avoid spamming APIs while user types)
    const now = Date.now();
    if (contextLoadRef.current.inFlight) return;
    if (now - contextLoadRef.current.lastAt < 20_000) return;
    contextLoadRef.current.inFlight = true;
    contextLoadRef.current.lastAt = now;

    try {
      // Tasks
      const local = getTasksFromLocalStorage();
      const jiraTasks: any[] = [];
      const mondayTasks: any[] = [];

      await Promise.all([
        connections.jira
          ? fetch(`/api/jira/tasks?uid=${uid}`, { credentials: "include" })
              .then((r) => (r.ok ? r.json() : { tasks: [] }))
              .then((d) => jiraTasks.push(...(d.tasks || [])))
              .catch(() => {})
          : Promise.resolve(),
        connections.monday
          ? fetch(`/api/monday/tasks?uid=${uid}`, { credentials: "include" })
              .then((r) => (r.ok ? r.json() : { tasks: [] }))
              .then((d) => mondayTasks.push(...(d.tasks || [])))
              .catch(() => {})
          : Promise.resolve(),
      ]);

      const combinedTasks = [...local, ...jiraTasks, ...mondayTasks];
      setContextTasks(combinedTasks.slice(0, 20));

      // Snapshot
      setSnapshot((s) => ({ ...s, loading: true }));
      const weekFrom = getWeekStart();
      const today = getToday();
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const endOfToday = new Date(startOfToday);
      endOfToday.setDate(endOfToday.getDate() + 1);

      const [timesheetsRes, calendarRes] = await Promise.all([
        connections.harvest
          ? fetch(`/api/harvest/timesheets?uid=${uid}&from=${weekFrom}&to=${today}`, {
              credentials: "include",
            })
              .then((r) => (r.ok ? r.json() : { timeEntries: [] }))
              .catch(() => ({ timeEntries: [] }))
          : Promise.resolve({ timeEntries: [] }),
        connections.microsoft
          ? fetch(
              `/api/microsoft/calendar?uid=${uid}&start=${startOfToday.toISOString()}&end=${endOfToday.toISOString()}`,
              { credentials: "include" }
            )
              .then((r) => (r.ok ? r.json() : { events: [] }))
              .catch(() => ({ events: [] }))
          : Promise.resolve({ events: [] }),
      ]);

      const hoursThisWeek = Array.isArray(timesheetsRes?.timeEntries)
        ? timesheetsRes.timeEntries.reduce(
            (sum: number, e: any) => sum + (Number(e?.hours) || 0),
            0
          )
        : 0;
      const meetingsToday = Array.isArray(calendarRes?.events)
        ? calendarRes.events.length
        : 0;

      setSnapshot({
        loading: false,
        hoursThisWeek: connections.harvest ? Number(hoursThisWeek) : null,
        meetingsToday: connections.microsoft ? Number(meetingsToday) : null,
      });
    } finally {
      contextLoadRef.current.inFlight = false;
    }
  }

  async function handleSend(explicitText?: string) {
    const trimmed = (explicitText ?? input).trim();
    if (!trimmed || isTyping || sendInFlightRef.current) return;
    sendInFlightRef.current = true;

    // Add user message
    const userMessage: ChatMessage = {
      role: "user",
      content: trimmed,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsTyping(true);

    try {
      const lower = trimmed.toLowerCase();
      if (lower === "/retry") {
        await checkConnections();
        await loadContextPanelData();
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "Done — I retried connections and refreshed your context panel.",
            timestamp: new Date(),
            metadata: { type: "analysis" },
          },
        ]);
        return;
      }

      const routed =
        trimmed.startsWith("/") ? routeSlashCommand(trimmed) : trimmed;

      // Parse intent and route to appropriate handler
      const response = await handleUserQuery(routed);
      
      // handleAIChat already adds messages during streaming (isStreaming flag)
      // For other handlers, add the message directly
      if (response && response.content && !response.isStreaming) {
        const assistantMessage: ChatMessage = {
          role: "assistant",
          content: response.content,
          timestamp: new Date(),
          metadata: response.metadata,
        };
        setMessages((prev) => [...prev, assistantMessage]);
      }
    } catch (error) {
      const errorMessage: ChatMessage = {
        role: "assistant",
        content: `Sorry, I encountered an error: ${error instanceof Error ? error.message : "Unknown error"}. Please try again.`,
        timestamp: new Date(),
        metadata: { type: "error" },
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsTyping(false);
      sendInFlightRef.current = false;
    }
  }

  function routeSlashCommand(text: string): string {
    const raw = text.trim();
    if (!raw.startsWith("/")) return raw;
    const [cmdRaw, ...rest] = raw.slice(1).split(/\s+/);
    const cmd = String(cmdRaw || "").toLowerCase();
    const arg = rest.join(" ").trim();
    if (cmd === "task") return `Create a task: ${arg || "Untitled task"}`;
    if (cmd === "summarize")
      return "Summarize our recent conversation in 5 bullets, then suggest 3 next actions.";
    if (cmd === "plan")
      return "Help me plan my day. Ask one clarifying question if needed, then propose a short prioritized plan.";
    if (cmd === "error")
      return `Help me debug this error. If unclear, ask one question first.\n\n${arg}`;
    return raw; // unknown command: send as-is
  }

  const allQuickActions = useMemo(() => {
    return [
      ...customActions.map((a) => ({
        label: a.label,
        icon: Zap,
        query: a.query,
        id: a.id,
        isCustom: true as const,
      })),
      ...quickActions.map((a) => ({ ...a, id: a.label, isCustom: false as const })),
    ];
  }, [customActions]);

  async function handleUserQuery(query: string): Promise<{ content: string; metadata?: any; isStreaming?: boolean }> {
    const lowerQuery = query.toLowerCase();
    const uid = (window as any).__AXON_UID__ || user?.uid;

    // Log time (Harvest) — catch natural phrasing like "add 2 hours for X"
    if (
      lowerQuery.match(/\b(log|add)\b.*\b(\d+(\.\d+)?)\s*h(ours?)?\b/i) ||
      lowerQuery.match(/\b(\d+(\.\d+)?)\s*h(ours?)?\b.*\b(log|add)\b/i) ||
      lowerQuery.includes("time entry") ||
      lowerQuery.includes("timesheet entry")
    ) {
      return await handleLogTime(query, uid);
    }

    // Task creation
    if (lowerQuery.match(/\b(create|add|make|new)\s+(a\s+)?task/i)) {
      return await handleCreateTask(query, uid);
    }

    // View tasks
    if (lowerQuery.match(/\b(show|list|view|get|what are|what's)\s+(my\s+)?(tasks|todo|todos)/i)) {
      return await handleViewTasks(uid);
    }

    // Timesheet operations
    if (lowerQuery.match(/\b(show|view|get|list|what are)\s+(my\s+)?(timesheets?|hours?|time entries?)/i)) {
      return await handleViewTimesheets(uid);
    }

    if (lowerQuery.match(/\b(update|edit|change|modify)\s+(timesheet|time entry|hours?)/i)) {
      return await handleUpdateTimesheet(query, uid);
    }

    // Calendar operations
    if (lowerQuery.match(/\b(show|view|get|what are|what's)\s+(my\s+)?(calendar|events?|meetings?|schedule)/i)) {
      return await handleViewCalendar(uid);
    }

    // Analytics/Analysis
    if (lowerQuery.match(/\b(analyze|analysis|insights?|stats?|statistics|how am i doing|productivity)/i)) {
      return await handleAnalyze(uid);
    }

    // Schedule creation
    if (lowerQuery.match(/\b(create|make|generate|plan)\s+(a\s+)?(schedule|routine|plan)/i)) {
      return await handleCreateSchedule(query);
    }

    // Connection status
    if (lowerQuery.match(/\b(what|which|show|list)\s+(apps?|connections?|integrations?|connected)/i)) {
      return {
        content: getConnectionStatusMessage(),
      };
    }

    // Database queries
    if (lowerQuery.match(/\b(query|search|find|get|show|list)\s+(data|database|db|stored|saved)/i)) {
      return await handleDatabaseQuery(query, uid);
    }

    // Query specific collections
    if (lowerQuery.match(/\b(show|list|get|find|search)\s+(all\s+)?(tasks?|timesheets?|summaries?|drafts?|mismatches?|sessions?)/i)) {
      return await handleDatabaseQuery(query, uid);
    }

    // Default: Use AI chat
    return await handleAIChat(query);
  }

  function parseHoursFromText(text: string): number | null {
    const m = text.match(/(\d+(?:\.\d+)?)\s*h(?:ours?)?\b/i);
    if (!m) return null;
    const n = Number(m[1]);
    if (!Number.isFinite(n) || n <= 0) return null;
    // sane bounds
    if (n > 24) return null;
    return n;
  }

  function parseSpentDateFromText(text: string): string {
    const lower = text.toLowerCase();
    const iso = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
    if (iso) return iso[1];
    const today = new Date();
    if (lower.includes("yesterday")) {
      const d = new Date(today);
      d.setDate(d.getDate() - 1);
      return d.toISOString().slice(0, 10);
    }
    return today.toISOString().slice(0, 10);
  }

  function extractProjectHint(text: string): string | null {
    const m = text.match(/\b(?:for|to|on)\s+([a-z0-9][a-z0-9 _-]{2,60})/i);
    if (!m) return null;
    let hint = m[1];
    // stop at common trailing phrases
    hint = hint.split(/\b(generate|create|make|task|i have|done|hours?|h)\b/i)[0];
    hint = hint.trim().replace(/\s+/g, " ");
    if (hint.length < 3) return null;
    return hint;
  }

  function extractExplicitField(text: string, field: "project" | "task"): string | null {
    const re = new RegExp(`\\b${field}\\s*:\\s*([^\\n]+)`, "i");
    const m = text.match(re);
    if (!m) return null;
    const v = String(m[1] || "").trim();
    return v.length >= 2 ? v : null;
  }

  function extractTaskHint(text: string, projectHint: string | null): string | null {
    const explicit = extractExplicitField(text, "task");
    if (explicit) return explicit;

    const lower = text.toLowerCase();
    const hoursStripped = lower.replace(/(\d+(?:\.\d+)?)\s*h(?:ours?)?\b/gi, "");
    // If we have "for <project>", take the part before it as task-ish hint
    if (projectHint) {
      const idx = hoursStripped.indexOf(`for ${projectHint.toLowerCase()}`);
      if (idx > 0) {
        const prefix = text.slice(0, idx).trim();
        const cleaned = prefix
          .replace(/\b(log|add|create|make|time|entry|timesheet|hours?)\b/gi, "")
          .replace(/[-–—]+/g, " ")
          .trim()
          .replace(/\s+/g, " ");
        if (cleaned.length >= 3) return cleaned;
      }
    }

    // Fallback: look for " - <task>" style
    const dash = text.split(/[-–—]/).map((s) => s.trim()).filter(Boolean);
    if (dash.length >= 2) {
      const maybe = dash[dash.length - 1];
      if (maybe.length >= 3) return maybe;
    }
    return null;
  }

  function scoreNameMatch(name: string, hint: string): number {
    const n = name.toLowerCase();
    const h = hint.toLowerCase().trim();
    if (!h) return 0;
    if (n === h) return 100;
    if (n.startsWith(h)) return 80;
    if (n.includes(h)) return 60;
    // IMPORTANT: avoid fuzzy token overlap here.
    // We only accept strong substring matches to prevent logging time to the wrong project/task.
    return 0;
  }

  async function handleLogTime(
    query: string,
    uid: string | undefined
  ): Promise<{ content: string; metadata?: any; isStreaming?: boolean }> {
    if (!connections.harvest) {
      return {
        content:
          `## ⚠️ Harvest not connected\n\nConnect Harvest in **Settings** and then try again.\n\nExample:\n- \`Log 2h on Accelanova for AI strategy\``,
        metadata: { type: "error" },
      };
    }
    if (!uid) {
      return {
        content: `## ⚠️ Login required\n\nPlease log in first, then try again.`,
        metadata: { type: "error" },
      };
    }

    const hours = parseHoursFromText(query);
    if (!hours) {
      return {
        content: `Quick question: how many hours should I log? (e.g. \`2h\`, \`1.5h\`)`,
      };
    }
    const spent_date = parseSpentDateFromText(query);
    const explicitProject = extractExplicitField(query, "project");
    const projectHint = explicitProject || extractProjectHint(query);
    const taskHint = extractTaskHint(query, projectHint);
    const notes = query
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 1000);

    // Resolve ONLY from available (assigned) Harvest projects + tasks
    let project: { id: number; name: string } | null = null;
    let task: { id: number; name: string } | null = null;
    try {
      const projRes = await fetch(
        `/api/harvest/project-assignments?uid=${encodeURIComponent(String(uid))}`,
        { credentials: "include" }
      );
      const projJson = await projRes.json().catch(() => ({}));
      if (!projRes.ok) {
        const msg =
          (projJson && (projJson.error || projJson.message)) ||
          `Failed to load Harvest project assignments (${projRes.status})`;
        return {
          content: `## ⚠️ Can’t load Harvest projects\n\n${String(msg)}\n\nTry reconnecting Harvest in **Settings** and then retry.`,
          metadata: { type: "error" },
        };
      }
      const projectsRaw = Array.isArray(projJson?.projects) ? projJson.projects : [];
      const availableProjects = projectsRaw
        .filter((p: any) => Boolean(p?.is_active) && p?.id && p?.name)
        .map((p: any) => ({
          id: Number(p.id),
          name: String(p.name),
          client: String(p.client || ""),
        }));

      // If Harvest returns no user assignments, fall back to account-wide active projects list.
      // This still guarantees "available projects" (they exist in Harvest), but may still be rejected
      // on create if your user isn't allowed to log to that project/task.
      let projectsSource: "assignments" | "account" = "assignments";
      let effectiveProjects = availableProjects;
      if (!effectiveProjects.length) {
        try {
          const allRes = await fetch(
            `/api/harvest/projects?uid=${encodeURIComponent(String(uid))}&all=1`,
            { credentials: "include" }
          );
          const allJson = await allRes.json().catch(() => ({}));
          if (allRes.ok) {
            const allProjectsRaw = Array.isArray(allJson?.projects) ? allJson.projects : [];
            const fromAccount = allProjectsRaw
              .filter((p: any) => Boolean(p?.is_active) && p?.id && p?.name)
              .map((p: any) => ({
                id: Number(p.id),
                name: String(p.name),
                client: String(p.client || ""),
              }));
            if (fromAccount.length) {
              effectiveProjects = fromAccount;
              projectsSource = "account";
            }
          }
        } catch {}
      }

      if (!effectiveProjects.length) {
        return {
          content:
            `## ⚠️ No Harvest projects found\n\nI couldn’t find any active projects via Harvest.\n\nTry reconnecting Harvest in **Settings** and then retry.`,
          metadata: { type: "error" },
        };
      }

      if (projectHint) {
        const scored = effectiveProjects
          .map((p: any) => ({
            p,
            score:
              Math.max(scoreNameMatch(p.name, projectHint), scoreNameMatch(p.client, projectHint)) +
              (p.client ? 5 : 0),
          }))
          .sort((a: any, b: any) => b.score - a.score);
        const best = scored[0];
        // Require a minimum confidence to avoid wrong logs
        if (best?.score >= 60 && (scoreNameMatch(best.p.name, projectHint) >= 60 || scoreNameMatch(best.p.client, projectHint) >= 60)) {
          project = { id: best.p.id, name: best.p.name };
        } else {
          const options = scored.slice(0, 6).map((x: any, i: number) => {
            const label = x.p.client ? `${x.p.client} · ${x.p.name}` : x.p.name;
            return `${i + 1}. ${label}`;
          });
          return {
            content:
              `## Pick a Harvest project\n\nI only log time to **projects that exist in Harvest**.\n\nI couldn’t confidently match **"${projectHint}"**.\n\nReply with:\n- \`Project: <exact name>\`\n\nTop matches:\n${options.map((s: string) => `- ${s}`).join("\n")}\n\n_Source: ${projectsSource === "assignments" ? "your assigned projects" : "account project list"}_`,
            metadata: { type: "analysis" },
          };
        }
      } else {
        const options = effectiveProjects.slice(0, 8).map((p: any, i: number) => {
          const label = p.client ? `${p.client} · ${p.name}` : p.name;
          return `${i + 1}. ${label}`;
        });
        return {
          content:
            `## Which Harvest project should I use?\n\nReply with:\n- \`Project: <exact name>\`\n\nExamples:\n${options.map((s: string) => `- ${s}`).join("\n")}\n\n_Source: ${projectsSource === "assignments" ? "your assigned projects" : "account project list"}_`,
          metadata: { type: "analysis" },
        };
      }

      // Resolve task for selected project from Harvest task assignments
      const tasksRes = await fetch(
        `/api/harvest/task-assignments?uid=${encodeURIComponent(String(uid))}&project_id=${encodeURIComponent(
          String(project.id)
        )}`,
        { credentials: "include" }
      );
      const tasksJson = await tasksRes.json().catch(() => ({}));
      const tasksRaw = Array.isArray(tasksJson?.tasks) ? tasksJson.tasks : [];
      const availableTasks = tasksRaw
        .filter((t: any) => Boolean(t?.is_active) && t?.id && t?.name)
        .map((t: any) => ({ id: Number(t.id), name: String(t.name) }));

      if (!availableTasks.length) {
        return {
          content:
            `## ⚠️ No available tasks for this project\n\nProject: **${project.name}**\n\nThis project has no active task assignments in Harvest.\n\nPick another project or add a task assignment in Harvest.`,
          metadata: { type: "error" },
        };
      }

      if (taskHint) {
        const scoredT = availableTasks
          .map((t: any) => ({ t, score: scoreNameMatch(t.name, taskHint) }))
          .sort((a: any, b: any) => b.score - a.score);
        const bestT = scoredT[0];
        if (bestT?.score >= 60 && scoreNameMatch(bestT.t.name, taskHint) >= 60) {
          task = { id: bestT.t.id, name: bestT.t.name };
        } else {
          const opts = scoredT.slice(0, 8).map((x: any, i: number) => `${i + 1}. ${x.t.name}`);
          return {
            content:
              `## Pick a Harvest task\n\nProject: **${project.name}**\n\nI couldn’t confidently match the task **"${taskHint}"**.\n\nReply with:\n- \`Task: <exact name>\`\n\nTop matches:\n${opts.map((s: string) => `- ${s}`).join("\n")}`,
            metadata: { type: "analysis" },
          };
        }
      } else {
        const opts = availableTasks.slice(0, 10).map((t: any) => `- ${t.name}`);
        return {
          content:
            `## Which Harvest task should I use?\n\nProject: **${project.name}**\n\nReply with:\n- \`Task: <exact name>\`\n\nExamples:\n${opts.join("\n")}`,
          metadata: { type: "analysis" },
        };
      }
    } catch {
      // ignore
    }

    if (!project?.id || !task?.id) {
      const hintLabel = projectHint ? ` (“${projectHint}”)` : "";
      return {
        content:
          `## I can log that time — one quick detail\n\nI couldn’t reliably match the Harvest **project/task** from your message${hintLabel}.\n\nReply with:\n- **Project name** (exact)\n- **Task name** (exact)\n\nExample:\n- Project: Accelanova\n- Task: AI Strategy`,
        metadata: { type: "analysis" },
      };
    }

    const details = {
      spent_date,
      hours,
      project_id: Number(project.id),
      task_id: Number(task.id),
      notes,
      projectName: String(project.name || ""),
      taskName: String(task.name || ""),
    };

    return {
      content:
        `## ⏱️ Pending time log\n\n- **Date**: ${details.spent_date}\n- **Hours**: ${details.hours}h\n- **Project**: ${details.projectName}\n- **Task**: ${details.taskName}\n\nApprove to create this Harvest time entry.`,
      metadata: {
        type: "pending_action",
        pendingAction: {
          type: "log_time",
          details,
          action: async () => {
            try {
              const res = await fetch(
                `/api/harvest/timesheets?uid=${encodeURIComponent(String(uid))}`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  credentials: "include",
                  body: JSON.stringify({
                    project_id: details.project_id,
                    task_id: details.task_id,
                    spent_date: details.spent_date,
                    hours: details.hours,
                    notes: details.notes,
                  }),
                }
              );
              const json = await res.json().catch(() => ({}));
              if (!res.ok) {
                throw new Error(
                  (json && (json.error || json.message)) ||
                    `Harvest error (${res.status})`
                );
              }

              setMessages((prev) => [
                ...prev,
                {
                  role: "assistant",
                  content:
                    `## ✅ Time logged\n\n- **${details.spent_date}** — ${details.hours}h · ${details.projectName} / ${details.taskName}\n\nWant me to pull your timesheets to confirm it’s there?`,
                  timestamp: new Date(),
                  metadata: { type: "timesheet_updated", data: { harvest: json } },
                },
              ]);
            } catch (error) {
              setMessages((prev) => [
                ...prev,
                {
                  role: "assistant",
                  content: `## ❌ Failed to log time\n\n${error instanceof Error ? error.message : "Unknown error"}`,
                  timestamp: new Date(),
                  metadata: { type: "error" },
                },
              ]);
            }
          },
        },
      },
    };
  }

  async function handleCreateTask(query: string, uid: string | undefined): Promise<{ content: string; metadata?: any; isStreaming?: boolean }> {
    // Extract task details from query
    const nameMatch = query.match(/(?:task|create|add)\s+(?:named\s+)?["']?([^"']+)["']?/i) ||
                     query.match(/(?:create|add|make)\s+(?:a\s+)?task\s+(.+)/i);
    const taskName = nameMatch ? nameMatch[1].trim() : "New Task";

    const newTask = {
      id: `chat-${Date.now()}`,
      name: taskName,
      description: "",
      category: "work",
      priority: "medium" as const,
      status: "todo" as const,
      dueDate: undefined,
    };

    // Return pending action for approval
    return {
      content: `📝 **Pending Task Creation**\n\n**Task Name**: ${taskName}\n**Status**: To Do\n**Priority**: Medium\n\nWould you like to create this task?`,
      metadata: {
        type: "pending_action",
        pendingAction: {
          type: "create_task",
          details: newTask,
          action: async () => {
            try {
              const tasks = getTasksFromLocalStorage();
              const updatedTasks = [...tasks, newTask];
              saveTasksToLocalStorage(updatedTasks);

              // Add success message
              setMessages((prev) => [
                ...prev,
                {
                  role: "assistant",
                  content: `✅ **Task Created!**\n\n**${taskName}**\n\nI've added this task to your task list. You can view it in "My Tasks".`,
                  timestamp: new Date(),
                  metadata: { type: "task_created", data: newTask },
                },
              ]);
            } catch (error) {
              setMessages((prev) => [
                ...prev,
                {
                  role: "assistant",
                  content: `❌ Failed to create task: ${error instanceof Error ? error.message : "Unknown error"}`,
                  timestamp: new Date(),
                  metadata: { type: "error" },
                },
              ]);
            }
          },
        },
      },
    };
  }

  async function handleViewTasks(uid: string | undefined): Promise<{ content: string; metadata?: any; isStreaming?: boolean }> {
    try {
      const tasks = getTasksFromLocalStorage();
      const jiraTasks: any[] = [];
      const mondayTasks: any[] = [];
      const errors: string[] = [];

      // Fetch from connected platforms
      if (connections.jira && uid) {
        try {
          const res = await fetch(`/api/jira/tasks?uid=${uid}`, { credentials: "include" });
          if (res.ok) {
            const data = await res.json();
            jiraTasks.push(...(data.tasks || []));
          } else {
            const errorData = await res.json().catch(() => ({}));
            if (res.status === 401 || res.status === 403) {
              errors.push("Jira authentication expired. Please reconnect in Settings.");
            } else {
              errors.push(`Jira: ${errorData.error || "Failed to fetch tasks"}`);
            }
          }
        } catch (e) {
          errors.push("Jira: Connection error");
        }
      }

      if (connections.monday && uid) {
        try {
          const res = await fetch(`/api/monday/tasks?uid=${uid}`, { credentials: "include" });
          if (res.ok) {
            const data = await res.json();
            mondayTasks.push(...(data.tasks || []));
          } else {
            const errorData = await res.json().catch(() => ({}));
            if (res.status === 401 || res.status === 403) {
              errors.push("Monday.com authentication expired. Please reconnect in Settings.");
            } else {
              errors.push(`Monday.com: ${errorData.error || "Failed to fetch tasks"}`);
            }
          }
        } catch (e) {
          errors.push("Monday.com: Connection error");
        }
      }

      const totalTasks = tasks.length + jiraTasks.length + mondayTasks.length;
      const todoTasks = tasks.filter((t) => t.status === "todo").length;
      const inProgress = tasks.filter((t) => t.status === "inprogress").length;
      const done = tasks.filter((t) => t.status === "done").length;

      let content = `## 📋 Your tasks\n\n`;
      content += `### Local\n`;
      content += `- **Total**: ${tasks.length}\n`;
      content += `- **To do**: ${todoTasks}\n`;
      content += `- **In progress**: ${inProgress}\n`;
      content += `- **Done**: ${done}\n\n`;

      if (jiraTasks.length > 0) {
        content += `- **Jira**: ${jiraTasks.length}\n`;
      }
      if (mondayTasks.length > 0) {
        content += `- **Monday.com**: ${mondayTasks.length}\n`;
      }

      if (errors.length > 0) {
        content += `\n### ⚠️ Issues\n`;
        errors.forEach((err) => {
          content += `- ${err}\n`;
        });
      }

      if (totalTasks === 0 && errors.length === 0) {
        content += `\nNo tasks found. Want me to create one?`;
      } else if (totalTasks > 0) {
        content += `\n### Recent\n`;
        tasks.slice(-5).forEach((task) => {
          const status = task.status === "done" ? "✅" : task.status === "inprogress" ? "🔄" : "📝";
          content += `- ${status} ${task.name}\n`;
        });
      }

      return { content, metadata: { type: "analysis" } };
    } catch (error) {
      return {
        content: `❌ Failed to fetch tasks: ${error instanceof Error ? error.message : "Unknown error"}`,
        metadata: { type: "error" },
      };
    }
  }

  async function handleViewTimesheets(uid: string | undefined): Promise<{ content: string; metadata?: any; isStreaming?: boolean }> {
    if (!connections.harvest) {
      return {
        content: `⚠️ **Harvest Not Connected**\n\nPlease connect Harvest in Settings to view your timesheets.`,
      };
    }

    try {
      const today = new Date();
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - today.getDay()); // Start of week
      const from = weekStart.toISOString().slice(0, 10);
      const to = today.toISOString().slice(0, 10);

      const res = await fetch(`/api/harvest/timesheets?uid=${uid}&from=${from}&to=${to}`, {
        credentials: "include",
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        if (res.status === 401 || res.status === 403) {
          return {
            content: `⚠️ **Harvest Authentication Expired**\n\nYour Harvest connection has expired. Please reconnect in Settings to view your timesheets.`,
            metadata: { type: "error" },
          };
        }
        throw new Error(errorData.error || "Failed to fetch timesheets");
      }

      const data = await res.json();
      const entries = data.timeEntries || [];
      const totalHours = entries.reduce((sum: number, e: any) => sum + (Number(e.hours) || 0), 0);

      let content = `## 📊 Your Timesheets (This Week)\n\n`;
      content += `- **Total hours**: ${totalHours.toFixed(1)}h\n`;
      content += `- **Entries**: ${entries.length}\n\n`;

      if (entries.length > 0) {
        content += `### Recent entries\n`;
        entries.slice(0, 5).forEach((entry: any) => {
          const project = entry.project?.name || "Unknown";
          const task = entry.task?.name || "Unknown";
          content += `- **${entry.spent_date}** — ${entry.hours}h · ${project} / ${task}\n`;
          if (entry.notes) {
            content += `  - _${entry.notes.substring(0, 70)}${
              entry.notes.length > 70 ? "…" : ""
            }_\n`;
          }
        });
      } else {
        content += `No time entries found for this week.`;
      }

      return { content, metadata: { type: "analysis" } };
    } catch (error) {
      return {
        content: `❌ Failed to fetch timesheets: ${error instanceof Error ? error.message : "Unknown error"}`,
        metadata: { type: "error" },
      };
    }
  }

  async function handleUpdateTimesheet(query: string, uid: string | undefined): Promise<{ content: string; metadata?: any; isStreaming?: boolean }> {
    if (!connections.harvest) {
      return {
        content: `⚠️ **Harvest Not Connected**\n\nPlease connect Harvest in Settings to edit timesheets.`,
      };
    }

    // Extract entry ID and updates from query
    const idMatch = query.match(/entry\s+(\d+)|id\s+(\d+)/i);
    const hoursMatch = query.match(/(\d+(?:\.\d+)?)\s*hours?/i);
    const notesMatch = query.match(/notes?\s+["'](.+?)["']|notes?\s+(.+)/i);

    if (!idMatch) {
      return {
        content: `❌ **Missing Entry ID**\n\nPlease specify which timesheet entry to update. Example: "Update timesheet entry 12345 to 8 hours"`,
      };
    }

    const entryId = idMatch[1] || idMatch[2];
    const updates: any = {};

    if (hoursMatch) {
      updates.hours = Number(hoursMatch[1]);
    }
    if (notesMatch) {
      updates.notes = notesMatch[1] || notesMatch[2];
    }

    if (Object.keys(updates).length === 0) {
      return {
        content: `❌ **No Updates Specified**\n\nPlease specify what to update (hours, notes, etc.). Example: "Update entry 12345 to 8 hours with notes 'Meeting with team'"`,
      };
    }

    // Return pending action for approval
    return {
      content: `📝 **Pending Timesheet Update**\n\n**Entry ID**: ${entryId}\n**Updates**:\n${Object.entries(updates).map(([k, v]) => `- ${k}: ${v}`).join("\n")}\n\nWould you like to proceed with this update?`,
      metadata: {
        type: "pending_action",
        pendingAction: {
          type: "edit_timesheet",
          details: { id: entryId, updates },
          action: async () => {
            try {
              const res = await fetch(`/api/harvest/timesheets/${entryId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify(updates),
              });

              if (!res.ok) {
                const error = await res.json();
                throw new Error(error.error || "Update failed");
              }

              // Add success message
              setMessages((prev) => [
                ...prev,
                {
                  role: "assistant",
                  content: `✅ **Timesheet Updated!**\n\nEntry #${entryId} has been updated successfully.`,
                  timestamp: new Date(),
                  metadata: { type: "timesheet_updated", data: { id: entryId, updates } },
                },
              ]);
            } catch (error) {
              setMessages((prev) => [
                ...prev,
                {
                  role: "assistant",
                  content: `❌ Failed to update timesheet: ${error instanceof Error ? error.message : "Unknown error"}`,
                  timestamp: new Date(),
                  metadata: { type: "error" },
                },
              ]);
            }
          },
        },
      },
    };
  }

  async function handleViewCalendar(uid: string | undefined): Promise<{ content: string; metadata?: any; isStreaming?: boolean }> {
    if (!connections.microsoft) {
      return {
        content: `⚠️ **Microsoft Calendar Not Connected**\n\nPlease connect Microsoft Calendar in Settings to view your events.`,
      };
    }

    try {
      const today = new Date();
      const start = new Date(today);
      start.setDate(today.getDate() - 1);
      const end = new Date(today);
      end.setDate(today.getDate() + 7);

      const res = await fetch(
        `/api/microsoft/calendar?uid=${uid}&start=${start.toISOString()}&end=${end.toISOString()}`,
        { credentials: "include" }
      );

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        if (res.status === 401 || res.status === 403) {
          return {
            content: `⚠️ **Microsoft Calendar Authentication Expired**\n\nYour Microsoft Calendar connection has expired. Please reconnect in Settings to view your events.`,
            metadata: { type: "error" },
          };
        }
        throw new Error(errorData.error || "Failed to fetch calendar");
      }

      const data = await res.json();
      const events = data.events || [];

      let content = `## 📅 Your calendar (next 7 days)\n\n`;
      content += `- **Total events**: ${events.length}\n\n`;

      if (events.length > 0) {
        // Group by date
        const byDate = new Map<string, any[]>();
        events.forEach((event: any) => {
          if (event.start?.dateTime) {
            const date = new Date(event.start.dateTime).toISOString().slice(0, 10);
            if (!byDate.has(date)) byDate.set(date, []);
            byDate.get(date)!.push(event);
          }
        });

        byDate.forEach((dayEvents, date) => {
          const dateObj = new Date(date);
          content += `### ${dateObj.toLocaleDateString("en-US", {
            weekday: "long",
            month: "short",
            day: "numeric",
          })}\n`;
          dayEvents.forEach((event) => {
            const time = event.start?.dateTime
              ? new Date(event.start.dateTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
              : "All Day";
            const teams = event.isOnlineMeeting ? " (Teams)" : "";
            content += `- **${time}** — ${event.subject || "Untitled"}${teams}\n`;
          });
          content += `\n`;
        });
      } else {
        content += `No events scheduled for the next 7 days.`;
      }

      return { content, metadata: { type: "analysis" } };
    } catch (error) {
      return {
        content: `❌ Failed to fetch calendar: ${error instanceof Error ? error.message : "Unknown error"}`,
        metadata: { type: "error" },
      };
    }
  }

  async function handleAnalyze(uid: string | undefined): Promise<{ content: string; metadata?: any; isStreaming?: boolean }> {
    try {
      // Fetch data from all sources
      const [tasks, timesheets, calendar] = await Promise.all([
        fetch(`/api/jira/tasks?uid=${uid}`, { credentials: "include" }).catch(() => ({ json: () => ({ tasks: [] }) })),
        connections.harvest
          ? fetch(`/api/harvest/timesheets?uid=${uid}&from=${getWeekStart()}&to=${getToday()}`, {
              credentials: "include",
            }).catch(() => ({ json: () => ({ timeEntries: [] }) }))
          : Promise.resolve({ json: () => ({ timeEntries: [] }) }),
        connections.microsoft
          ? fetch(
              `/api/microsoft/calendar?uid=${uid}&start=${new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()}&end=${new Date().toISOString()}`,
              { credentials: "include" }
            ).catch(() => ({ json: () => ({ events: [] }) }))
          : Promise.resolve({ json: () => ({ events: [] }) }),
      ]);

      const tasksData = await tasks.json();
      const timesheetsData = await timesheets.json();
      const calendarData = await calendar.json();

      const allTasks = tasksData.tasks || [];
      const entries = timesheetsData.timeEntries || [];
      const events = calendarData.events || [];

      const totalHours = entries.reduce((sum: number, e: any) => sum + (Number(e.hours) || 0), 0);
      const avgHoursPerDay = entries.length > 0 ? totalHours / 7 : 0;

      let content = `📈 **Productivity Analysis**\n\n`;
      content += `**Tasks**: ${allTasks.length} active tasks\n`;
      content += `**Time Logged**: ${totalHours.toFixed(1)}h this week (avg ${avgHoursPerDay.toFixed(1)}h/day)\n`;
      content += `**Meetings**: ${events.length} events this week\n\n`;

      // Task breakdown
      const taskStatuses = allTasks.reduce((acc: any, t: any) => {
        acc[t.status || "todo"] = (acc[t.status || "todo"] || 0) + 1;
        return acc;
      }, {});
      if (Object.keys(taskStatuses).length > 0) {
        content += `**Task Status:**\n`;
        Object.entries(taskStatuses).forEach(([status, count]) => {
          content += `- ${status}: ${count}\n`;
        });
      }

      // Top projects
      const projects = entries.reduce((acc: any, e: any) => {
        const name = e.project?.name || "Unknown";
        acc[name] = (acc[name] || 0) + (Number(e.hours) || 0);
        return acc;
      }, {});
      const topProjects = Object.entries(projects)
        .sort(([, a]: any, [, b]: any) => b - a)
        .slice(0, 3);

      if (topProjects.length > 0) {
        content += `\n**Top Projects (This Week):**\n`;
        topProjects.forEach(([name, hours]: any) => {
          content += `- ${name}: ${hours.toFixed(1)}h\n`;
        });
      }

      return { content, metadata: { type: "analysis" } };
    } catch (error) {
      return {
        content: `❌ Failed to analyze: ${error instanceof Error ? error.message : "Unknown error"}`,
        metadata: { type: "error" },
      };
    }
  }

  async function handleCreateSchedule(query: string): Promise<{ content: string; metadata?: any; isStreaming?: boolean }> {
    try {
      const res = await fetch("/api/schedule/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduleDescription: query }),
      });

      if (!res.ok) {
        throw new Error("Failed to create schedule");
      }

      const data = await res.json();
      return {
        content: `✅ **Schedule Created!**\n\n${data.scheduleText || "Your schedule has been generated."}\n\nTasks have been added to your task list.`,
        metadata: { type: "task_created" },
      };
    } catch (error) {
      return {
        content: `❌ Failed to create schedule: ${error instanceof Error ? error.message : "Unknown error"}`,
        metadata: { type: "error" },
      };
    }
  }

  async function handleAIChat(query: string): Promise<{ content: string; metadata?: any; isStreaming?: boolean }> {
    // Create a placeholder message for streaming
    const streamingMessage: ChatMessage = {
      role: "assistant",
      content: "",
      timestamp: new Date(),
      isStreaming: true,
    };
    
    setMessages((prev) => [...prev, streamingMessage]);

    const controller = new AbortController();
    let timeoutId: number | undefined;

    try {
      timeoutId = window.setTimeout(() => controller.abort(), 45_000);

      const uid = (window as any).__AXON_UID__ || user?.uid;
      const qs = uid ? `?uid=${encodeURIComponent(String(uid))}` : "";
      const res = await fetch(`/api/chat/stream${qs}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          contextText: (() => {
            const connected = Object.entries(connections)
              .filter(([, v]) => Boolean(v))
              .map(([k]) => k);
            const focus = focusItems.slice(0, 3).map((t) => t.title).filter(Boolean);
            const parts: string[] = [];
            parts.push(`ConnectedApps: ${connected.length ? connected.join(", ") : "none"}`);
            if (snapshot.hoursThisWeek != null) parts.push(`HoursThisWeek: ${snapshot.hoursThisWeek.toFixed(1)}`);
            if (snapshot.meetingsToday != null) parts.push(`MeetingsToday: ${snapshot.meetingsToday}`);
            if (focus.length) parts.push(`TopTasks: ${focus.join(" | ")}`);
            return parts.join("\n");
          })(),
          messages: messages
            .filter((m) => m.role !== "system" && !m.isStreaming)
            .map((m) => ({ role: m.role, content: m.content }))
            .concat([{ role: "user" as const, content: query }]),
        }),
      });

      // If this isn't an SSE response, parse error payload and surface it
      const contentType = res.headers.get("content-type") || "";
      if (!res.ok) {
        const raw = await res.text().catch(() => "");
        let msg = "Chat request failed";
        try {
          const j = raw ? JSON.parse(raw) : null;
          msg =
            (j && (j.error || j.message || j.detail)) ||
            (raw ? raw.slice(0, 200) : msg);
        } catch {
          if (raw) msg = raw.slice(0, 200);
        }
        throw new Error(msg);
      }
      if (!contentType.includes("text/event-stream")) {
        const raw = await res.text().catch(() => "");
        throw new Error(raw ? `Unexpected response: ${raw.slice(0, 200)}` : "Unexpected response");
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let fullContent = "";
      let buffer = "";

      if (!reader) {
        throw new Error("No response body");
      }

      const processSsePart = (part: string) => {
        const dataLine = part
          .split("\n")
          .find((l) => l.startsWith("data:"));
        if (!dataLine) return;

        const raw = dataLine.replace(/^data:\s?/, "").trim();
        if (!raw) return;

        const data = JSON.parse(raw) as any;

        if (data?.error) {
          throw new Error(String(data.error));
        }

          if (typeof data?.reasoningTitle === "string" || typeof data?.reasoning === "string") {
            setMessages((prev) => {
              const updated = [...prev];
              const lastIndex = updated.length - 1;
              if (lastIndex >= 0 && updated[lastIndex].isStreaming) {
                updated[lastIndex] = {
                  ...updated[lastIndex],
                  reasoningTitle:
                    typeof data.reasoningTitle === "string"
                      ? data.reasoningTitle
                      : updated[lastIndex].reasoningTitle,
                  reasoning:
                    typeof data.reasoning === "string"
                      ? data.reasoning
                      : updated[lastIndex].reasoning,
                };
              }
              return updated;
            });
          }

        if (typeof data?.content === "string" && data.content.length > 0) {
          fullContent += data.content;
          setMessages((prev) => {
            const updated = [...prev];
            const lastIndex = updated.length - 1;
            if (lastIndex >= 0 && updated[lastIndex].isStreaming) {
              updated[lastIndex] = {
                ...updated[lastIndex],
                content: fullContent,
              };
            }
            return updated;
          });
        }

        if (data?.done) {
          setMessages((prev) => {
            const updated = [...prev];
            const lastIndex = updated.length - 1;
            if (lastIndex >= 0 && updated[lastIndex].isStreaming) {
              updated[lastIndex] = {
                ...updated[lastIndex],
                content: fullContent || "…",
                isStreaming: false,
              };
            }
            return updated;
          });
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // SSE events are separated by a blank line
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";

        for (const part of parts) {
          processSsePart(part);
        }
      }

      // Flush any remaining decoder bytes and process any remaining (non-terminated) SSE data
      buffer += decoder.decode();
      if (buffer.trim()) {
        try {
          processSsePart(buffer);
        } catch {
          // Best-effort: if the final chunk is truncated/malformed, don't fail the whole request
        }
      }

      // Return with isStreaming flag to prevent duplicate addition
      return {
        content: fullContent || "I'm here to help!",
        isStreaming: true, // Signal that message was already added
      };
    } catch (error) {
      // Remove streaming message on error
      setMessages((prev) => prev.filter((m) => !m.isStreaming));
      return {
        content: `❌ Failed to process request: ${
          (error as any)?.name === "AbortError"
            ? "Timed out waiting for a response"
            : error instanceof Error
              ? error.message
              : "Unknown error"
        }`,
        metadata: { type: "error" },
      };
    } finally {
      if (typeof timeoutId === "number") window.clearTimeout(timeoutId);
    }
  }

  async function handleDatabaseQuery(query: string, uid: string | undefined): Promise<{ content: string; metadata?: any; isStreaming?: boolean }> {
    if (!uid) {
      return {
        content: `⚠️ **Authentication Required**\n\nPlease log in to query database data.`,
      };
    }

    try {
      // Parse query to determine collection and filters
      const lowerQuery = query.toLowerCase();
      let collection = "tasks";
      const queryFilters: any = {};

      // Detect collection type
      if (lowerQuery.includes("timesheet") && !lowerQuery.includes("draft")) {
        collection = "timesheets";
      } else if (lowerQuery.includes("weekly") || lowerQuery.includes("summary")) {
        collection = "weekly_summaries";
      } else if (lowerQuery.includes("draft")) {
        collection = "timesheet_drafts";
      } else if (lowerQuery.includes("mismatch")) {
        collection = "timesheet_mismatches";
      } else if (lowerQuery.includes("session") || lowerQuery.includes("chat")) {
        collection = "chat_sessions";
      } else {
        collection = "tasks";
      }

      // Parse filters from query
      const statusMatch = query.match(/\b(status|state)\s+(todo|inprogress|done|blocked)/i);
      if (statusMatch) queryFilters.status = statusMatch[2].toLowerCase();

      const priorityMatch = query.match(/\b(priority)\s+(low|medium|high)/i);
      if (priorityMatch) queryFilters.priority = priorityMatch[2].toLowerCase();

      const dateMatch = query.match(/\b(from|since|after)\s+(\d{4}-\d{2}-\d{2}|\d+\s+days?)/i);
      if (dateMatch) {
        const dateStr = dateMatch[2];
        if (dateStr.includes("day")) {
          const days = parseInt(dateStr);
          const date = new Date();
          date.setDate(date.getDate() - days);
          queryFilters.from = date.toISOString().slice(0, 10);
        } else {
          queryFilters.from = dateStr;
        }
      }

      const toDateMatch = query.match(/\b(to|until|before)\s+(\d{4}-\d{2}-\d{2})/i);
      if (toDateMatch) queryFilters.to = toDateMatch[2];

      const searchMatch = query.match(/\b(search|find|containing)\s+["']?([^"']+)["']?/i);
      if (searchMatch) queryFilters.search = searchMatch[2];

      // Query database
      const res = await fetch("/api/data/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          uid,
          collection,
          query: Object.keys(queryFilters).length > 0 ? queryFilters : undefined,
          limit: 50,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to query database");
      }

      const data = await res.json();
      const results = data.results || [];
      const count = data.count || 0;

      let content = `## 📊 Database query results\n\n`;
      content += `- **Collection**: \`${collection}\`\n`;
      content += `- **Found**: ${count} ${count === 1 ? "record" : "records"}\n\n`;

      if (count === 0) {
        content += `No records found matching your query.`;
      } else {
        // Format results based on collection type
        switch (collection) {
          case "tasks":
            content += `### Tasks\n`;
            results.slice(0, 10).forEach((task: any) => {
              const status = task.status === "done" ? "✅" : task.status === "inprogress" ? "🔄" : "📝";
              const priority = task.priority === "high" ? "🔴" : task.priority === "medium" ? "🟡" : "🟢";
              content += `- ${status} ${priority} **${task.name}**\n`;
              if (task.description)
                content += `  - ${task.description.substring(0, 120)}${task.description.length > 120 ? "…" : ""}\n`;
              if (task.dueDate) content += `  - Due: ${task.dueDate}\n`;
            });
            if (count > 10) content += `... and ${count - 10} more tasks\n`;
            break;

          case "timesheets":
            content += `### Timesheet entries\n`;
            const totalHours = results.reduce((sum: number, e: any) => sum + (Number(e.hours) || 0), 0);
            content += `- **Total hours**: ${totalHours.toFixed(1)}h\n\n`;
            results.slice(0, 10).forEach((entry: any) => {
              const proj = entry.project ? String(entry.project) : "Unknown";
              const task = entry.task ? String(entry.task) : "Unknown";
              content += `- **${entry.spent_date || "Unknown"}** — ${Number(entry.hours || 0)}h · ${proj} / ${task}\n`;
              if (entry.notes)
                content += `  - _${String(entry.notes).substring(0, 80)}${String(entry.notes).length > 80 ? "…" : ""}_\n`;
            });
            if (count > 10) content += `... and ${count - 10} more entries\n`;
            break;

          case "weekly_summaries":
            content += `**Weekly Summaries:**\n`;
            results.slice(0, 5).forEach((summary: any) => {
              content += `**${summary.from} to ${summary.to}**\n`;
              content += `Hours: ${summary.hoursTotal || 0}h | Entries: ${summary.entriesCount || 0}\n`;
              if (summary.summary) {
                content += `${summary.summary.substring(0, 150)}${summary.summary.length > 150 ? "..." : ""}\n`;
              }
              content += `\n`;
            });
            break;

          case "timesheet_drafts":
            content += `### Timesheet drafts\n`;
            results.slice(0, 10).forEach((draft: any) => {
              content += `- **${draft.date || "Unknown"}** — ${draft.hours || 0}h`;
              if (draft.project) content += ` · ${draft.project}`;
              if (draft.notes)
                content += `\n  - _${String(draft.notes).substring(0, 80)}${String(draft.notes).length > 80 ? "…" : ""}_`;
              content += `\n`;
            });
            break;

          case "chat_sessions":
            content += `### Chat sessions\n`;
            results.forEach((session: any) => {
              const date = new Date(session.updatedAt).toLocaleDateString();
              content += `- **${session.title}** (${session.messageCount} messages)\n`;
              content += `  - Last updated: ${date}\n`;
            });
            break;

          default:
            content += `**Results:**\n`;
            results.slice(0, 10).forEach((item: any, idx: number) => {
              content += `${idx + 1}. ${JSON.stringify(item, null, 2).substring(0, 200)}...\n`;
            });
        }
      }

      return { content, metadata: { type: "analysis" } };
    } catch (error) {
      return {
        content: `❌ Failed to query database: ${error instanceof Error ? error.message : "Unknown error"}`,
        metadata: { type: "error" },
      };
    }
  }

  function getConnectionStatusMessage(): string {
    const connected = Object.values(connections).filter(Boolean).length;
    let msg = `🔌 **Connected Apps**\n\n`;
    msg += `${connections.harvest ? "✅" : "❌"} Harvest\n`;
    msg += `${connections.microsoft ? "✅" : "❌"} Microsoft Calendar\n`;
    msg += `${connections.jira ? "✅" : "❌"} Jira\n`;
    msg += `${connections.monday ? "✅" : "❌"} Monday.com\n\n`;
    msg += `${connected} of 4 apps connected.`;
    if (connected < 4) {
      msg += ` Connect more apps in Settings for full functionality.`;
    }
    return msg;
  }

  function getWeekStart(): string {
    const today = new Date();
    const start = new Date(today);
    start.setDate(today.getDate() - today.getDay());
    return start.toISOString().slice(0, 10);
  }

  function getToday(): string {
    return new Date().toISOString().slice(0, 10);
  }

  const connectedCount = Object.values(connections).filter(Boolean).length;
  const status =
    !isOnline
      ? { label: "Offline", dot: "bg-red-500" }
      : connectedCount === 4
        ? { label: "Connected", dot: "bg-emerald-500" }
        : connectedCount > 0
          ? { label: "Partial", dot: "bg-amber-500" }
          : { label: "Offline", dot: "bg-red-500" };

  const normalizedTasks = (contextTasks || []).map((t: any) => ({
    id: String(t?.id || t?.key || t?._id || ""),
    title: String(t?.name || t?.summary || t?.title || t?.subject || "Untitled"),
    status: String(t?.status || ""),
    source: String(t?.source || t?.platform || t?.provider || ""),
  }));
  const focusItems = normalizedTasks
    .filter((t) => !t.status || t.status === "todo" || t.status === "inprogress")
    .slice(0, 3);
  const activeItems = normalizedTasks
    .filter((t) => !t.status || t.status !== "done")
    .slice(0, 5);

  const recentActions = messages
    .filter(
      (m) =>
        m.role === "assistant" &&
        (m.metadata?.type === "task_created" ||
          m.metadata?.type === "timesheet_updated" ||
          m.metadata?.type === "pending_action")
    )
    .slice(-5)
    .reverse();

  const disconnectedApps = [
    !connections.harvest ? "Harvest" : null,
    !connections.microsoft ? "Microsoft" : null,
    !connections.jira ? "Jira" : null,
    !connections.monday ? "Monday.com" : null,
  ].filter(Boolean) as string[];

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] min-h-[620px] border rounded-lg overflow-hidden bg-background">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-background/80 backdrop-blur">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2 rounded-lg bg-primary/10 shrink-0">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold truncate">AxonChat</h1>
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className={cn("h-2 w-2 rounded-full", status.dot)} />
                {status.label}
              </span>
            </div>
            <p className="text-xs text-muted-foreground truncate">
              AI Assistant for Your Work
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Tone selector */}
          <div className="hidden md:block">
            <Select
              value={tone}
              onValueChange={(v) => {
                const next = v as Tone;
                setTone(next);
                void saveTone(next);
              }}
            >
              <SelectTrigger className="h-8 w-[150px]" disabled={toneSaving}>
                <SelectValue placeholder="Tone" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Default tone</SelectItem>
                <SelectItem value="concise">Concise</SelectItem>
                <SelectItem value="technical">Technical</SelectItem>
                <SelectItem value="executive">Executive</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Integration icons (dim when disconnected) */}
          <div className="hidden sm:flex items-center gap-2">
            <div
              className={cn(
                "flex items-center gap-1.5 px-2 py-1 rounded-md border bg-background",
                connections.harvest ? "opacity-100" : "opacity-40"
              )}
              title={connections.harvest ? "Harvest connected" : "Harvest disconnected"}
            >
              <img
                src="/Intergrations/Harvest-New.png"
                alt="Harvest"
                className="h-5 w-auto object-contain"
              />
            </div>
            <div
              className={cn(
                "flex items-center gap-1.5 px-2 py-1 rounded-md border bg-background",
                connections.microsoft ? "opacity-100" : "opacity-40"
              )}
              title={connections.microsoft ? "Microsoft connected" : "Microsoft disconnected"}
            >
              <img
                src="/Intergrations/microsoft.png"
                alt="Microsoft"
                className="h-5 w-auto object-contain"
              />
            </div>
            <div
              className={cn(
                "flex items-center gap-1.5 px-2 py-1 rounded-md border bg-background",
                connections.jira ? "opacity-100" : "opacity-40"
              )}
              title={connections.jira ? "Jira connected" : "Jira disconnected"}
            >
              <img
                src="/Intergrations/jira-software.png"
                alt="Jira"
                className="h-5 w-auto object-contain"
              />
            </div>
            <div
              className={cn(
                "flex items-center gap-1.5 px-2 py-1 rounded-md border bg-background",
                connections.monday ? "opacity-100" : "opacity-40"
              )}
              title={connections.monday ? "Monday connected" : "Monday disconnected"}
            >
              <img
                src="/Intergrations/monday.png"
                alt="Monday.com"
                className="h-5 w-auto object-contain"
              />
            </div>
          </div>

          <Button asChild variant="ghost" size="icon" className="shrink-0" title="Settings">
            <Link href="/settings">
              <Settings className="h-4 w-4" />
            </Link>
          </Button>

          <Avatar className="h-8 w-8">
            <AvatarImage src={(user as any)?.photoURL || ""} alt={(user as any)?.displayName || "User"} />
            <AvatarFallback>
              {String((user as any)?.displayName || "U")
                .trim()
                .slice(0, 1)
                .toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 min-h-0">
        {/* Context panel */}
        {contextOpen ? (
          <aside className="w-80 border-r bg-muted/10 min-h-0 flex flex-col">
            <div className="flex items-center justify-between px-3 py-2 border-b">
              <div className="text-sm font-medium text-muted-foreground">Context</div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setContextOpen(false)}
                title="Collapse context"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-3 space-y-3">
                <Card>
                  <CardContent className="p-3">
                    <div className="text-xs font-semibold text-muted-foreground mb-2">Today’s Focus</div>
                    {focusItems.length > 0 ? (
                      <div className="space-y-1">
                        {focusItems.map((t) => (
                          <div key={t.id || t.title} className="text-sm">
                            • {t.title}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground">
                        Ask: “What should I do today?” and I’ll turn it into a short focus list.
                      </div>
                    )}
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3">
                    <div className="text-xs font-semibold text-muted-foreground mb-2">Active Tasks</div>
                    {activeItems.length > 0 ? (
                      <div className="space-y-1">
                        {activeItems.map((t) => (
                          <div key={t.id || t.title} className="text-sm flex items-start justify-between gap-2">
                            <span className="truncate">• {t.title}</span>
                            {t.source ? (
                              <span className="text-[11px] text-muted-foreground shrink-0">
                                {t.source}
                              </span>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground">
                        No tasks loaded yet. Ask: “Show my tasks”.
                      </div>
                    )}
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3">
                    <div className="text-xs font-semibold text-muted-foreground mb-2">Recent Activity</div>
                    {recentActions.length > 0 ? (
                      <div className="space-y-1">
                        {recentActions.map((m, i) => (
                          <div key={i} className="text-sm text-muted-foreground">
                            •{" "}
                            {m.metadata?.type === "task_created"
                              ? "Created a task"
                              : m.metadata?.type === "timesheet_updated"
                                ? "Prepared a timesheet update"
                                : "Pending approval requested"}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground">
                        Actions like “created task” and “updated timesheet” will show up here.
                      </div>
                    )}
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3">
                    <div className="text-xs font-semibold text-muted-foreground mb-2">
                      Productivity Snapshot
                    </div>
                    <div className="space-y-1 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">Time logged (week)</span>
                        <span>
                          {snapshot.loading ? (
                            <span className="text-muted-foreground">…</span>
                          ) : snapshot.hoursThisWeek == null ? (
                            <span className="text-muted-foreground">Connect Harvest</span>
                          ) : (
                            `${snapshot.hoursThisWeek.toFixed(1)}h`
                          )}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">Meetings today</span>
                        <span>
                          {snapshot.loading ? (
                            <span className="text-muted-foreground">…</span>
                          ) : snapshot.meetingsToday == null ? (
                            <span className="text-muted-foreground">Connect Microsoft</span>
                          ) : (
                            `${snapshot.meetingsToday}`
                          )}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3">
                    <div className="text-xs font-semibold text-muted-foreground mb-2">System Notices</div>
                    <div className="space-y-2">
                      {!isOnline ? (
                        <div className="text-sm text-muted-foreground">
                          You’re offline. Some integrations may fail until you reconnect.
                        </div>
                      ) : disconnectedApps.length > 0 ? (
                        <div className="text-sm text-muted-foreground">
                          Disconnected: {disconnectedApps.join(", ")}.
                        </div>
                      ) : (
                        <div className="text-sm text-muted-foreground">
                          All integrations look good.
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void checkConnections()}
                          className="shrink-0"
                        >
                          Retry
                        </Button>
                        <Button asChild size="sm" variant="ghost">
                          <Link href="/settings">Open Settings</Link>
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </ScrollArea>
          </aside>
        ) : (
          <aside className="w-12 border-r bg-muted/10 flex flex-col items-center py-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setContextOpen(true)}
              title="Open context"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </aside>
        )}

        {/* Chat column */}
        <div className="flex flex-col flex-1 min-h-0">
          {/* Messages */}
          <ScrollArea className="flex-1">
            <div className="p-4">
              <div className="mx-auto w-full max-w-[680px] space-y-4">
                {messages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={cn(
                      "w-full flex",
                      msg.role === "user" ? "justify-end" : "justify-start"
                    )}
                  >
                    <div
                      className={cn(
                        "flex gap-3 w-full max-w-[680px]",
                        msg.role === "user" ? "flex-row-reverse" : "flex-row"
                      )}
                    >
                      {msg.role === "assistant" ? (
                        <div className="p-2 rounded-full bg-primary/10 shrink-0 mt-1">
                          <Bot className="h-4 w-4 text-primary" />
                        </div>
                      ) : (
                        <div className="p-2 rounded-full bg-primary shrink-0 mt-1">
                          <div className="h-4 w-4 rounded-full bg-primary-foreground" />
                        </div>
                      )}

                      <Card
                        className={cn(
                          "relative group w-fit max-w-[calc(680px-3.25rem)]",
                          msg.role === "user"
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted"
                        )}
                      >
                        <CardContent className="p-4">
                          {msg.role === "assistant" && !msg.isStreaming ? (
                            <div className="absolute top-2 right-2 hidden group-hover:flex items-center gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                title="Copy"
                                onClick={async () => {
                                  try {
                                    await navigator.clipboard.writeText(msg.content || "");
                                  } catch {
                                    // ignore
                                  }
                                }}
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className={cn(
                                  "h-7 w-7",
                                  feedbackByIndex[idx] === "up" && "bg-accent"
                                )}
                                title="Helpful"
                                onClick={() =>
                                  setFeedbackByIndex((prev) => ({ ...prev, [idx]: "up" }))
                                }
                              >
                                <ThumbsUp className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className={cn(
                                  "h-7 w-7",
                                  feedbackByIndex[idx] === "down" && "bg-accent"
                                )}
                                title="Not helpful"
                                onClick={() =>
                                  setFeedbackByIndex((prev) => ({ ...prev, [idx]: "down" }))
                                }
                              >
                                <ThumbsDown className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ) : null}

                          {msg.role === "assistant" &&
                          (msg.reasoningTitle || msg.reasoning) ? (
                            <div className="mb-3 rounded-md border bg-background/40 p-3">
                              <div className="text-[11px] text-muted-foreground mb-1">
                                Reasoning
                              </div>
                              {msg.reasoningTitle ? (
                                <div className="text-sm font-semibold mb-1">
                                  {msg.reasoningTitle}
                                </div>
                              ) : null}
                              {msg.reasoning ? (
                                <div className="text-sm text-muted-foreground">
                                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                    {msg.reasoning}
                                  </ReactMarkdown>
                                </div>
                              ) : null}
                            </div>
                          ) : null}

                          <div
                            className={cn(
                              "text-sm leading-relaxed",
                              msg.role === "user"
                                ? "text-primary-foreground"
                                : "text-foreground"
                            )}
                          >
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm]}
                              components={{
                                h1: ({ children }) => (
                                  <div className="text-base font-semibold mb-2">
                                    {children}
                                  </div>
                                ),
                                h2: ({ children }) => (
                                  <div className="text-sm font-semibold mb-2">
                                    {children}
                                  </div>
                                ),
                                h3: ({ children }) => (
                                  <div className="text-sm font-semibold mb-1">
                                    {children}
                                  </div>
                                ),
                                p: ({ children }) => (
                                  <p className="mb-2 last:mb-0">{children}</p>
                                ),
                                ul: ({ children }) => (
                                  <ul className="mb-2 list-disc pl-5 last:mb-0">
                                    {children}
                                  </ul>
                                ),
                                ol: ({ children }) => (
                                  <ol className="mb-2 list-decimal pl-5 last:mb-0">
                                    {children}
                                  </ol>
                                ),
                                li: ({ children }) => (
                                  <li className="my-0.5">{children}</li>
                                ),
                                strong: ({ children }) => (
                                  <strong className="font-semibold">{children}</strong>
                                ),
                                em: ({ children }) => <em className="italic">{children}</em>,
                                code: ({ children }) => (
                                  <code className="rounded bg-black/10 px-1 py-0.5 font-mono text-[12px]">
                                    {children}
                                  </code>
                                ),
                                pre: ({ children }) => (
                                  <pre className="mb-2 overflow-x-auto rounded-md bg-black/10 p-3 text-[12px] leading-snug">
                                    {children}
                                  </pre>
                                ),
                                a: ({ href, children }) => (
                                  <a
                                    href={href}
                                    className={cn(
                                      "underline underline-offset-2",
                                      msg.role === "user"
                                        ? "text-primary-foreground/90"
                                        : "text-primary"
                                    )}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    {children}
                                  </a>
                                ),
                              }}
                            >
                              {msg.content || ""}
                            </ReactMarkdown>
                            {msg.isStreaming && (
                              <span className="inline-block w-2 h-4 ml-1 bg-primary animate-pulse align-middle" />
                            )}
                          </div>

                          {msg.metadata?.type === "task_created" && (
                            <div className="mt-2 text-xs opacity-70 flex items-center gap-1">
                              <span>✅</span>
                              <span>Task added to your list</span>
                            </div>
                          )}
                          {msg.metadata?.type === "timesheet_updated" && (
                            <div className="mt-2 text-xs opacity-70 flex items-center gap-1">
                              <span>✅</span>
                              <span>Timesheet updated</span>
                            </div>
                          )}
                          {msg.metadata?.type === "pending_action" &&
                            msg.metadata.pendingAction && (
                              <div className="mt-3 pt-3 border-t flex gap-2">
                                <Button
                                  size="sm"
                                  onClick={async () => {
                                    await msg.metadata!.pendingAction!.action();
                                    // Remove pending action from message
                                    setMessages((prev) => {
                                      const updated = [...prev];
                                      updated[idx] = {
                                        ...updated[idx],
                                        metadata: {
                                          ...updated[idx].metadata,
                                          type: undefined,
                                          pendingAction: undefined,
                                        },
                                      };
                                      return updated;
                                    });
                                  }}
                                  className="gap-2"
                                >
                                  <Check className="h-3.5 w-3.5" />
                                  Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    // Remove pending action from message
                                    setMessages((prev) => {
                                      const updated = [...prev];
                                      updated[idx] = {
                                        ...updated[idx],
                                        metadata: {
                                          ...updated[idx].metadata,
                                          type: undefined,
                                          pendingAction: undefined,
                                        },
                                      };
                                      return updated;
                                    });
                                  }}
                                  className="gap-2"
                                >
                                  <X className="h-3.5 w-3.5" />
                                  Decline
                                </Button>
                              </div>
                            )}
                        </CardContent>
                      </Card>
                    </div>
                  </div>
                ))}

                {isTyping && (
                  <div className="w-full flex justify-start">
                    <div className="flex gap-3 w-full max-w-[680px]">
                      <div className="p-2 rounded-full bg-primary/10 shrink-0 mt-1">
                        <Bot className="h-4 w-4 text-primary" />
                      </div>
                      <Card className="bg-muted w-fit max-w-[calc(680px-3.25rem)]">
                        <CardContent className="p-4">
                          <div className="flex items-center gap-2">
                            <IconSpinner className="h-4 w-4" />
                            <span className="text-sm text-muted-foreground">
                              AxonChat is thinking…
                            </span>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            </div>
          </ScrollArea>

          {/* Prompt Bar */}
          <div className="border-t bg-muted/20 p-3">
            <div className="mx-auto w-full max-w-[680px]">
              <div className="flex flex-wrap gap-2 mb-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCustomDialogOpen(true)}
                  className="gap-2"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Custom
                </Button>
                {allQuickActions.slice(0, 6).map((action) => (
                  <Button
                    key={action.id}
                    variant="secondary"
                    size="sm"
                    onClick={() => void handleSend(action.query)}
                    className="gap-2"
                  >
                    <action.icon className="h-3.5 w-3.5" />
                    {action.label}
                    {"isCustom" in action && action.isCustom ? (
                      <button
                        type="button"
                        className="ml-1 opacity-70 hover:opacity-100"
                        title="Remove custom message"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setCustomActions((prev) =>
                            prev.filter((x) => x.id !== action.id)
                          );
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </Button>
                ))}
              </div>

              <Dialog open={customDialogOpen} onOpenChange={setCustomDialogOpen}>
                <DialogContent className="sm:max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Add custom message</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <div className="text-sm font-medium">Button label</div>
                      <Input
                        value={customLabel}
                        onChange={(e) => setCustomLabel(e.target.value)}
                        placeholder="e.g., Weekly meetings?"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <div className="text-sm font-medium">Message</div>
                      <Textarea
                        value={customQuery}
                        onChange={(e) => setCustomQuery(e.target.value)}
                        placeholder="What do you want AxonChat to send when you click it?"
                        className="min-h-[120px]"
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setCustomDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button
                      onClick={() => {
                        const label = customLabel.trim();
                        const query = customQuery.trim();
                        if (!label || !query) return;
                        const id = `custom-${Date.now()}`;
                        setCustomActions((prev) =>
                          [{ id, label, query }, ...prev].slice(0, 20)
                        );
                        setCustomLabel("");
                        setCustomQuery("");
                        setCustomDialogOpen(false);
                      }}
                      disabled={!customLabel.trim() || !customQuery.trim()}
                    >
                      Save
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <div className="flex gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-[60px] w-[44px] shrink-0"
                      title="Quick actions"
                      disabled={isTyping}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-64">
                    <DropdownMenuItem
                      onClick={() => {
                        setCustomDialogOpen(true);
                      }}
                    >
                      Add custom message…
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {allQuickActions.map((action) => (
                      <DropdownMenuItem
                        key={action.id}
                        onClick={() => {
                          void handleSend(action.query);
                        }}
                      >
                        {action.label}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => void handleSend("/summarize")}>
                      /summarize
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => void handleSend("/plan")}>
                      /plan
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => void handleSend("/retry")}>
                      /retry
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <Textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void handleSend();
                    }
                    if (e.key === "ArrowUp" && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey) {
                      if (!input.trim()) {
                        const lastUser = [...messages].reverse().find((m) => m.role === "user");
                        if (lastUser?.content) {
                          e.preventDefault();
                          const text = String(lastUser.content);
                          setInput(text);
                          window.setTimeout(() => {
                            inputRef.current?.focus();
                            try {
                              inputRef.current?.setSelectionRange(text.length, text.length);
                            } catch {}
                          }, 0);
                        }
                      }
                    }
                  }}
                  placeholder="Ask AxonChat…"
                  className="min-h-[60px] resize-none"
                  disabled={isTyping}
                />
                <Button
                  onClick={() => void handleSend()}
                  disabled={!input.trim() || isTyping}
                  size="lg"
                  className="shrink-0"
                >
                  {isTyping ? (
                    <IconSpinner className="h-5 w-5" />
                  ) : (
                    <Send className="h-5 w-5" />
                  )}
                </Button>
              </div>
              <div className="mt-2 text-[11px] text-muted-foreground">
                Enter to send · Shift+Enter for a new line
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
      