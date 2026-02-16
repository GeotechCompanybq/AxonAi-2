"use server";

import { ai } from "@/ai/genkit";
import { z } from "zod";
import { cookies } from "next/headers";
import { adminDb } from "@/lib/firebase-admin";

// Define schemas for task retrieval and processing
const PlatformTaskSchema = z.object({
  platform: z.enum(["Jira", "Monday"]),
  name: z.string(),
  description: z.string().optional(),
  dueDate: z.string().optional(),
  priority: z.enum(["low", "medium", "high"]),
  status: z.enum(["todo", "inprogress", "done", "blocked"]),
  category: z.string().optional(),
});

const CrossPlatformTaskRetrievalInputSchema = z.object({
  userId: z.string(),
  platforms: z
    .array(z.enum(["Jira", "Monday"]))
    .optional()
    .default(["Jira", "Monday"]),
  filterOptions: z
    .object({
      status: z
        .array(z.enum(["todo", "inprogress", "done", "blocked"]))
        .optional(),
      priority: z.array(z.enum(["low", "medium", "high"])).optional(),
      dueDateBefore: z.string().optional(),
      dueDateAfter: z.string().optional(),
    })
    .optional(),
});

const CrossPlatformTaskRetrievalOutputSchema = z.object({
  tasks: z.array(PlatformTaskSchema),
  summary: z.object({
    totalTasks: z.number(),
    tasksByPlatform: z.record(z.string(), z.number()),
    tasksByStatus: z.record(z.string(), z.number()),
    tasksByPriority: z.record(z.string(), z.number()),
  }),
});

async function fetchJiraTasks(
  token: string
): Promise<Array<z.infer<typeof PlatformTaskSchema>>> {
  const tasksRes = await fetch(
    `https://api.atlassian.com/ex/jira/rest/api/3/search`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jql: "status != Done AND assignee = currentUser()",
        maxResults: 100,
        fields: [
          "summary",
          "description",
          "status",
          "priority",
          "duedate",
          "project",
        ],
      }),
    }
  );

  const data = await tasksRes.json();
  return data.issues.map((issue: any) => ({
    platform: "Jira" as const,
    name: issue.fields.summary,
    description: issue.fields.description,
    dueDate: issue.fields.duedate,
    priority: mapJiraPriority(issue.fields.priority.name),
    status: mapJiraStatus(issue.fields.status.name),
    category: issue.fields.project.name,
  }));
}

async function fetchMondayTasks(
  token: string
): Promise<Array<z.infer<typeof PlatformTaskSchema>>> {
  const tasksRes = await fetch("/api/monday/tasks", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await tasksRes.json();
  return data.tasks.map((task: any) => ({
    platform: "Monday" as const,
    ...task,
  }));
}

function mapJiraPriority(priority: string): "low" | "medium" | "high" {
  const priorityMap: Record<string, "low" | "medium" | "high"> = {
    Lowest: "low",
    Low: "low",
    Medium: "medium",
    High: "high",
    Highest: "high",
  };
  return priorityMap[priority] || "medium";
}

function mapJiraStatus(
  status: string
): "todo" | "inprogress" | "done" | "blocked" {
  const statusMap: Record<string, "todo" | "inprogress" | "done" | "blocked"> =
    {
      "To Do": "todo",
      "In Progress": "inprogress",
      Done: "done",
      Blocked: "blocked",
    };
  return statusMap[status] || "todo";
}

export async function retrieveCrossPlatformTasks(
  input: z.infer<typeof CrossPlatformTaskRetrievalInputSchema>
) {
  const { userId, platforms = ["Jira", "Monday"], filterOptions } = input;

  // Retrieve tokens from Firestore
  const userDoc = await adminDb.collection("users").doc(userId).get();
  const tokens = {
    jira: userDoc.get("jira.accessToken"),
    monday: userDoc.get("monday.accessToken"),
  };

  // Check platform connections
  const connectedPlatforms = platforms.filter((platform) =>
    platform === "Jira"
      ? !!tokens.jira
      : platform === "Monday"
      ? !!tokens.monday
      : false
  );

  // If no platforms are connected
  if (connectedPlatforms.length === 0) {
    return {
      tasks: [],
      summary: {
        totalTasks: 0,
        tasksByPlatform: {},
        tasksByStatus: {},
        tasksByPriority: {},
      },
      connectionMessage:
        "No task management platforms are connected. Please connect Jira or Monday.com in the Settings page.",
    };
  }

  // Fetch tasks from specified platforms
  const allTasks: Array<z.infer<typeof PlatformTaskSchema>> = [];

  if (platforms.includes("Jira") && tokens.jira) {
    const jiraTasks = await fetchJiraTasks(tokens.jira);
    allTasks.push(...jiraTasks);
  }

  if (platforms.includes("Monday") && tokens.monday) {
    const mondayTasks = await fetchMondayTasks(tokens.monday);
    allTasks.push(...mondayTasks);
  }

  // Apply filters if specified
  let filteredTasks = allTasks;
  if (filterOptions) {
    if (filterOptions.status) {
      filteredTasks = filteredTasks.filter((task) =>
        filterOptions.status?.includes(task.status)
      );
    }
    if (filterOptions.priority) {
      filteredTasks = filteredTasks.filter((task) =>
        filterOptions.priority?.includes(task.priority)
      );
    }
    if (filterOptions.dueDateBefore) {
      filteredTasks = filteredTasks.filter(
        (task) =>
          task.dueDate &&
          new Date(task.dueDate) <= new Date(filterOptions.dueDateBefore!)
      );
    }
    if (filterOptions.dueDateAfter) {
      filteredTasks = filteredTasks.filter(
        (task) =>
          task.dueDate &&
          new Date(task.dueDate) >= new Date(filterOptions.dueDateAfter!)
      );
    }
  }

  // Generate summary
  const summary = {
    totalTasks: filteredTasks.length,
    tasksByPlatform: filteredTasks.reduce((acc, task) => {
      acc[task.platform] = (acc[task.platform] || 0) + 1;
      return acc;
    }, {} as Record<string, number>),
    tasksByStatus: filteredTasks.reduce((acc, task) => {
      acc[task.status] = (acc[task.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>),
    tasksByPriority: filteredTasks.reduce((acc, task) => {
      acc[task.priority] = (acc[task.priority] || 0) + 1;
      return acc;
    }, {} as Record<string, number>),
  };

  return { tasks: filteredTasks, summary };
}

// Define the AI flow
// NOTE: Genkit typings can differ by provider; cast to any to avoid TS overload conflicts.
export const crossPlatformTaskRetrievalFlow = (ai as any).defineFlow(
  {
    name: "crossPlatformTaskRetrieval",
    inputSchema: CrossPlatformTaskRetrievalInputSchema,
    outputSchema: CrossPlatformTaskRetrievalOutputSchema,
  },
  async (input: z.infer<typeof CrossPlatformTaskRetrievalInputSchema>) => {
    const { userId, platforms = ["Jira", "Monday"], filterOptions } = input;

    // Retrieve tokens from Firestore
    const userDoc = await adminDb.collection("users").doc(userId).get();
    const tokens: Record<string, string | undefined> = {
      jira: userDoc.get("jira.accessToken"),
      monday: userDoc.get("monday.accessToken"),
    };

    // Check platform connections
    const connectedPlatforms = platforms.filter((platform) =>
      platform === "Jira"
        ? !!tokens.jira
        : platform === "Monday"
        ? !!tokens.monday
        : false
    );

    // If no platforms are connected
    if (connectedPlatforms.length === 0) {
      return {
        tasks: [],
        summary: {
          totalTasks: 0,
          tasksByPlatform: {},
          tasksByStatus: {},
          tasksByPriority: {},
        },
        connectionMessage:
          "No task management platforms are connected. Please connect Jira or Monday.com in the Settings page.",
      };
    }

    // Fetch tasks from specified platforms
    const allTasks: Array<z.infer<typeof PlatformTaskSchema>> = [];

    if (platforms.includes("Jira") && tokens.jira) {
      const jiraTasks = await fetchJiraTasks(tokens.jira);
      allTasks.push(...jiraTasks);
    }

    if (platforms.includes("Monday") && tokens.monday) {
      const mondayTasks = await fetchMondayTasks(tokens.monday);
      allTasks.push(...mondayTasks);
    }

    // Rest of the existing implementation remains the same
    let filteredTasks = allTasks;
    if (filterOptions) {
      if (filterOptions.status) {
        filteredTasks = filteredTasks.filter((task) =>
          filterOptions.status?.includes(task.status)
        );
      }
      if (filterOptions.priority) {
        filteredTasks = filteredTasks.filter((task) =>
          filterOptions.priority?.includes(task.priority)
        );
      }
      if (filterOptions.dueDateBefore) {
        filteredTasks = filteredTasks.filter(
          (task) =>
            task.dueDate &&
            new Date(task.dueDate) <= new Date(filterOptions.dueDateBefore!)
        );
      }
      if (filterOptions.dueDateAfter) {
        filteredTasks = filteredTasks.filter(
          (task) =>
            task.dueDate &&
            new Date(task.dueDate) >= new Date(filterOptions.dueDateAfter!)
        );
      }
    }

    // Generate summary
    const summary = {
      totalTasks: filteredTasks.length,
      tasksByPlatform: filteredTasks.reduce((acc, task) => {
        acc[task.platform] = (acc[task.platform] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      tasksByStatus: filteredTasks.reduce((acc, task) => {
        acc[task.status] = (acc[task.status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      tasksByPriority: filteredTasks.reduce((acc, task) => {
        acc[task.priority] = (acc[task.priority] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
    };

    return {
      tasks: filteredTasks,
      summary,
      connectionMessage:
        connectedPlatforms.length < platforms.length
          ? `Some platforms not connected. Connected: ${connectedPlatforms.join(
              ", "
            )}`
          : undefined,
    };
  }
);
