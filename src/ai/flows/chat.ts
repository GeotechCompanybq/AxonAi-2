"use server";

import { ai } from "@/ai/genkit";
import { z } from "genkit";
import { crossPlatformTaskRetrievalFlow } from "./cross-platform-tasks";

const ChatMessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]).default("user"),
  content: z.string(),
});

const ChatInputSchema = z.object({
  messages: z.array(ChatMessageSchema).min(1),
});
export type ChatInput = z.infer<typeof ChatInputSchema>;

const ChatOutputSchema = z.object({
  reply: z.string(),
});
export type ChatOutput = z.infer<typeof ChatOutputSchema>;

export async function chat(input: ChatInput): Promise<ChatOutput> {
  return chatFlow(input);
}

const chatPrompt = ai.definePrompt({
  name: "chatPrompt",
  input: { schema: ChatInputSchema },
  output: { schema: ChatOutputSchema },
  prompt: `You are Axon, a helpful AI for scheduling, task planning, and analytics.

Conversation so far:
{{#each messages}}
{{role}}: {{content}}
{{/each}}

Respond to the latest user message with a concise, actionable reply.
`,
});

const chatFlow = ai.defineFlow(
  {
    name: "chatFlow",
    inputSchema: ChatInputSchema,
    outputSchema: ChatOutputSchema,
  },
  async (input) => {
    const { output } = await chatPrompt(input);
    return output!;
  }
);

// Define input schema for task-related queries
const TaskQueryInputSchema = z.object({
  userId: z.string(),
  query: z.string(),
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

// Define output schema for task-related responses
const TaskQueryOutputSchema = z.object({
  response: z.string(),
  tasks: z
    .array(
      z.object({
        name: z.string(),
        platform: z.enum(["Jira", "Monday"]),
        status: z.enum(["todo", "inprogress", "done", "blocked"]),
        priority: z.enum(["low", "medium", "high"]),
        dueDate: z.string().optional(),
        description: z.string().optional(),
      })
    )
    .optional(),
  summary: z
    .object({
      totalTasks: z.number(),
      tasksByPlatform: z.record(z.string(), z.number()),
      tasksByStatus: z.record(z.string(), z.number()),
      tasksByPriority: z.record(z.string(), z.number()),
    })
    .optional(),
});

// AI flow for task-related queries
export const taskQueryFlow = ai.defineFlow({
  name: "taskQuery",
  inputSchema: TaskQueryInputSchema,
  outputSchema: TaskQueryOutputSchema,
  handler: async (input) => {
    // Retrieve tasks across platforms
    const taskResult = await crossPlatformTaskRetrievalFlow({
      userId: input.userId,
      platforms: input.platforms,
      filterOptions: input.filterOptions,
    });

    // Generate a natural language response based on the query and tasks
    let response = "";
    const { tasks, summary } = taskResult;

    // Analyze query intent
    const queryLower = input.query.toLowerCase();

    if (queryLower.includes("how many") || queryLower.includes("total")) {
      response = `You have a total of ${
        summary.totalTasks
      } tasks across ${Object.keys(summary.tasksByPlatform).join(
        " and "
      )} platforms.\n\n`;
    }

    if (queryLower.includes("status") || queryLower.includes("progress")) {
      response += "Task Status Breakdown:\n";
      Object.entries(summary.tasksByStatus).forEach(([status, count]) => {
        response += `- ${status}: ${count} tasks\n`;
      });
    }

    if (queryLower.includes("priority")) {
      response += "\nTask Priority Distribution:\n";
      Object.entries(summary.tasksByPriority).forEach(([priority, count]) => {
        response += `- ${priority} priority: ${count} tasks\n`;
      });
    }

    // If no specific query, provide a general summary
    if (!response) {
      response = `You have ${summary.totalTasks} tasks across ${Object.keys(
        summary.tasksByPlatform
      ).join(" and ")} platforms.\n`;
      response += `Status: ${Object.entries(summary.tasksByStatus)
        .map(([status, count]) => `${count} ${status}`)
        .join(", ")}\n`;
      response += `Priorities: ${Object.entries(summary.tasksByPriority)
        .map(([priority, count]) => `${count} ${priority}`)
        .join(", ")}`;
    }

    return {
      response,
      tasks: tasks.map((task) => ({
        name: task.name,
        platform: task.platform,
        status: task.status,
        priority: task.priority,
        dueDate: task.dueDate,
        description: task.description,
      })),
      summary,
    };
  },
});
