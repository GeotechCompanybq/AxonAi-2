"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Send, Sparkles, Calendar, Clock, ListChecks, BarChart3, Zap, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
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
  timestamp: Date;
  metadata?: {
    type?: "task_created" | "timesheet_updated" | "analysis" | "error" | "pending_action";
    data?: any;
    pendingAction?: {
      type: "edit_timesheet" | "create_task" | "update_task" | "delete_entry";
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

export function AxonChatInterface() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [sessionId, setSessionId] = useState<string>("default");
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [connections, setConnections] = useState<ConnectionStatus>({
    harvest: false,
    microsoft: false,
    jira: false,
    monday: false,
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load chat history on mount
  useEffect(() => {
    loadChatHistory();
    checkConnections();
  }, []);

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

  async function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || isTyping) return;

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
      // Parse intent and route to appropriate handler
      const response = await handleUserQuery(trimmed);
      
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
    }
  }

  async function handleUserQuery(query: string): Promise<{ content: string; metadata?: any; isStreaming?: boolean }> {
    const lowerQuery = query.toLowerCase();
    const uid = (window as any).__AXON_UID__ || user?.uid;

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

      let content = `📋 **Your Tasks**\n\n`;
      content += `**Local Tasks**: ${tasks.length} total\n`;
      content += `- To Do: ${todoTasks}\n`;
      content += `- In Progress: ${inProgress}\n`;
      content += `- Done: ${done}\n\n`;

      if (jiraTasks.length > 0) {
        content += `**Jira**: ${jiraTasks.length} tasks\n`;
      }
      if (mondayTasks.length > 0) {
        content += `**Monday.com**: ${mondayTasks.length} tasks\n`;
      }

      if (errors.length > 0) {
        content += `\n⚠️ **Issues:**\n`;
        errors.forEach((err) => {
          content += `- ${err}\n`;
        });
      }

      if (totalTasks === 0 && errors.length === 0) {
        content += `\nNo tasks found. Would you like me to create one?`;
      } else if (totalTasks > 0) {
        content += `\n**Recent Tasks:**\n`;
        tasks.slice(-5).forEach((task) => {
          const status = task.status === "done" ? "✅" : task.status === "inprogress" ? "🔄" : "📝";
          content += `${status} ${task.name}\n`;
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

      let content = `📊 **Your Timesheets (This Week)**\n\n`;
      content += `**Total Hours**: ${totalHours.toFixed(1)}h\n`;
      content += `**Entries**: ${entries.length}\n\n`;

      if (entries.length > 0) {
        content += `**Recent Entries:**\n`;
        entries.slice(0, 5).forEach((entry: any) => {
          const project = entry.project?.name || "Unknown";
          const task = entry.task?.name || "Unknown";
          content += `• ${entry.spent_date}: ${entry.hours}h - ${project} / ${task}\n`;
          if (entry.notes) {
            content += `  _${entry.notes.substring(0, 50)}${entry.notes.length > 50 ? "..." : ""}_\n`;
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

      let content = `📅 **Your Calendar (Next 7 Days)**\n\n`;
      content += `**Total Events**: ${events.length}\n\n`;

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
          content += `**${dateObj.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}**\n`;
          dayEvents.forEach((event) => {
            const time = event.start?.dateTime
              ? new Date(event.start.dateTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
              : "All Day";
            const teams = event.isOnlineMeeting ? " (Teams)" : "";
            content += `• ${time}: ${event.subject || "Untitled"}${teams}\n`;
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

    try {
      const res = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: messages
            .filter((m) => m.role !== "system" && !m.isStreaming)
            .map((m) => ({ role: m.role, content: m.content }))
            .concat([{ role: "user" as const, content: query }]),
        }),
      });

      if (!res.ok) {
        throw new Error("Chat request failed");
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let fullContent = "";

      if (!reader) {
        throw new Error("No response body");
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.error) {
                throw new Error(data.error);
              }
              if (data.content) {
                fullContent += data.content;
                // Update streaming message in real-time
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
              if (data.done) {
                // Mark as complete
                setMessages((prev) => {
                  const updated = [...prev];
                  const lastIndex = updated.length - 1;
                  if (lastIndex >= 0 && updated[lastIndex].isStreaming) {
                    updated[lastIndex] = {
                      ...updated[lastIndex],
                      isStreaming: false,
                    };
                  }
                  return updated;
                });
              }
            } catch (e) {
              // Ignore JSON parse errors for incomplete chunks
            }
          }
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
        content: `❌ Failed to process request: ${error instanceof Error ? error.message : "Unknown error"}`,
        metadata: { type: "error" },
      };
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

      let content = `📊 **Database Query Results**\n\n`;
      content += `**Collection**: ${collection}\n`;
      content += `**Found**: ${count} ${count === 1 ? "record" : "records"}\n\n`;

      if (count === 0) {
        content += `No records found matching your query.`;
      } else {
        // Format results based on collection type
        switch (collection) {
          case "tasks":
            content += `**Tasks:**\n`;
            results.slice(0, 10).forEach((task: any) => {
              const status = task.status === "done" ? "✅" : task.status === "inprogress" ? "🔄" : "📝";
              const priority = task.priority === "high" ? "🔴" : task.priority === "medium" ? "🟡" : "🟢";
              content += `${status} ${priority} **${task.name}**\n`;
              if (task.description) content += `  ${task.description.substring(0, 100)}${task.description.length > 100 ? "..." : ""}\n`;
              if (task.dueDate) content += `  Due: ${task.dueDate}\n`;
              content += `\n`;
            });
            if (count > 10) content += `... and ${count - 10} more tasks\n`;
            break;

          case "timesheets":
            content += `**Timesheet Entries:**\n`;
            const totalHours = results.reduce((sum: number, e: any) => sum + (Number(e.hours) || 0), 0);
            content += `**Total Hours**: ${totalHours.toFixed(1)}h\n\n`;
            results.slice(0, 10).forEach((entry: any) => {
              content += `• ${entry.spent_date}: ${entry.hours}h`;
              if (entry.project) content += ` - ${entry.project}`;
              if (entry.task) content += ` / ${entry.task}`;
              if (entry.notes) content += `\n  _${entry.notes.substring(0, 50)}${entry.notes.length > 50 ? "..." : ""}_`;
              content += `\n`;
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
            content += `**Timesheet Drafts:**\n`;
            results.slice(0, 10).forEach((draft: any) => {
              content += `• ${draft.date || "Unknown"}: ${draft.hours || 0}h`;
              if (draft.project) content += ` - ${draft.project}`;
              if (draft.notes) content += `\n  _${draft.notes.substring(0, 50)}${draft.notes.length > 50 ? "..." : ""}_`;
              content += `\n`;
            });
            break;

          case "chat_sessions":
            content += `**Chat Sessions:**\n`;
            results.forEach((session: any) => {
              const date = new Date(session.updatedAt).toLocaleDateString();
              content += `• **${session.title}** (${session.messageCount} messages)\n`;
              content += `  Last updated: ${date}\n\n`;
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

  const quickActions = [
    { label: "View Tasks", icon: ListChecks, query: "Show my tasks" },
    { label: "View Timesheets", icon: Clock, query: "Show my timesheets" },
    { label: "View Calendar", icon: Calendar, query: "Show my calendar" },
    { label: "Analyze", icon: BarChart3, query: "Analyze my productivity" },
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] max-h-[800px]">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">AxonChat</h1>
            <p className="text-sm text-muted-foreground">AI Assistant for Your Work</p>
          </div>
        </div>
        <div className="flex gap-2 items-center">
          {connections.harvest && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md border bg-background">
              <img 
                src="/Intergrations/Harvest-New.png" 
                alt="Harvest" 
                className="h-5 w-auto object-contain"
              />
            </div>
          )}
          {connections.microsoft && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md border bg-background">
              <img 
                src="/Intergrations/microsoft.png" 
                alt="Microsoft" 
                className="h-5 w-auto object-contain"
              />
            </div>
          )}
          {connections.jira && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md border bg-background">
              <img 
                src="/Intergrations/jira-software.png" 
                alt="Jira" 
                className="h-5 w-auto object-contain"
              />
            </div>
          )}
          {connections.monday && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md border bg-background">
              <img 
                src="/Intergrations/monday.png" 
                alt="Monday.com" 
                className="h-5 w-auto object-contain"
              />
            </div>
          )}
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={cn(
                "flex gap-3",
                msg.role === "user" ? "justify-end" : "justify-start"
              )}
            >
              {msg.role === "assistant" && (
                <div className="p-2 rounded-full bg-primary/10 shrink-0">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
              )}
              <Card
                className={cn(
                  "max-w-[80%]",
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                )}
              >
                <CardContent className="p-4">
                  <div className="whitespace-pre-wrap text-sm prose prose-sm dark:prose-invert max-w-none">
                    {msg.content.split('\n').map((line, i) => {
                      // Simple markdown-like rendering
                      if (line.startsWith('**') && line.endsWith('**')) {
                        return <strong key={i}>{line.slice(2, -2)}</strong>;
                      }
                      if (line.startsWith('✅') || line.startsWith('❌') || line.startsWith('⚠️')) {
                        return <div key={i} className="font-semibold">{line}</div>;
                      }
                      if (line.startsWith('•') || line.startsWith('-')) {
                        return <div key={i} className="ml-4">{line}</div>;
                      }
                      return <div key={i}>{line || '\u00A0'}</div>;
                    })}
                    {msg.isStreaming && (
                      <span className="inline-block w-2 h-4 ml-1 bg-primary animate-pulse" />
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
                  {msg.metadata?.type === "pending_action" && msg.metadata.pendingAction && (
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
              {msg.role === "user" && (
                <div className="p-2 rounded-full bg-primary shrink-0">
                  <div className="h-4 w-4 rounded-full bg-primary-foreground" />
                </div>
              )}
            </div>
          ))}
          {isTyping && (
            <div className="flex gap-3 justify-start">
              <div className="p-2 rounded-full bg-primary/10 shrink-0">
                <Bot className="h-4 w-4 text-primary" />
              </div>
              <Card className="bg-muted max-w-[80%]">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <IconSpinner className="h-4 w-4" />
                    <span className="text-sm text-muted-foreground">Thinking...</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Quick Actions */}
      <div className="p-4 border-t bg-muted/30">
        <div className="flex flex-wrap gap-2 mb-3">
          {quickActions.map((action, idx) => (
            <Button
              key={idx}
              variant="outline"
              size="sm"
              onClick={() => {
                setInput(action.query);
                setTimeout(() => handleSend(), 100);
              }}
              className="gap-2"
            >
              <action.icon className="h-3.5 w-3.5" />
              {action.label}
            </Button>
          ))}
        </div>

        {/* Input */}
        <div className="flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Ask me anything... (e.g., 'Create a task for reviewing the proposal', 'Show my timesheets', 'Analyze my productivity')"
            className="min-h-[60px] resize-none"
            disabled={isTyping}
          />
          <Button
            onClick={handleSend}
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
      </div>
    </div>
  );
}
      