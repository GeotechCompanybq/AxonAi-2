"use server";

import { ai } from "@/ai/genkit";
import { z } from "zod";
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
  reasoningTitle: z.string().optional(),
  reasoning: z.string().optional(),
});
export type ChatOutput = z.infer<typeof ChatOutputSchema>;

export async function chat(input: ChatInput): Promise<ChatOutput> {
  return chatFlow(input);
}

// NOTE: Genkit typings can differ by provider; cast to any to avoid TS overload conflicts.
const chatPrompt = (ai as any).definePrompt({
  name: "chatPrompt",
  input: { schema: ChatInputSchema },
  output: { schema: ChatOutputSchema },
  prompt: `Conversation so far:
{{#each messages}}
{{role}}: {{content}}
{{/each}}

Write the assistant reply to the latest user message. Follow any system instructions.

Return STRICT JSON matching this TypeScript shape and nothing else:
{
  "reply": string,
  "reasoningTitle"?: string,
  "reasoning"?: string
}

Reasoning requirements:
- This is a short, high-level “what I’m doing” note for the user (no hidden step-by-step).
- Keep it brief (1 title line + 1-3 sentences).
- Don’t include secrets, internal tool output, or chain-of-thought.

Reply requirements:
- The 'reply' field is REQUIRED and must NEVER be empty.
- If the user’s request is unclear, ask ONE short clarifying question in 'reply'.
- Sound human: short acknowledgment, then concise bullets when helpful.
`,
});

const chatFlow = (ai as any).defineFlow(
  {
    name: "chatFlow",
    inputSchema: ChatInputSchema,
    outputSchema: ChatOutputSchema,
  },
  async (input: ChatInput) => {
    const result: any = await chatPrompt(input);
    const output: any =
      result?.output ??
      result?.text ??
      result?.response?.text ??
      result?.message ??
      result;

    // Provider outputs can vary; normalize to { reply: string }
    if (typeof output === "string") {
      const text = output.trim();
      if (text) {
        // Sometimes models return JSON as text; try to parse { reply, reasoningTitle, reasoning }
        try {
          const j = JSON.parse(text);
          if (typeof j?.reply === "string" && j.reply.trim()) {
            return {
              reply: j.reply.trim(),
              reasoningTitle:
                typeof j?.reasoningTitle === "string"
                  ? j.reasoningTitle.trim()
                  : undefined,
              reasoning:
                typeof j?.reasoning === "string" ? j.reasoning.trim() : undefined,
            };
          }
        } catch {}
        return { reply: text };
      }
    }

    const obj: any = output;
    const reply =
      (typeof obj?.reply === "string" && obj.reply) ||
      (typeof obj?.output?.reply === "string" && obj.output.reply) ||
      (typeof obj?.message === "string" && obj.message) ||
      (typeof obj?.content === "string" && obj.content) ||
      "";

    const reasoningTitle =
      (typeof obj?.reasoningTitle === "string" && obj.reasoningTitle) ||
      (typeof obj?.output?.reasoningTitle === "string" && obj.output.reasoningTitle) ||
      "";
    const reasoning =
      (typeof obj?.reasoning === "string" && obj.reasoning) ||
      (typeof obj?.output?.reasoning === "string" && obj.output.reasoning) ||
      "";

    if (String(reply).trim())
      return {
        reply: String(reply).trim(),
        reasoningTitle: String(reasoningTitle || "").trim() || undefined,
        reasoning: String(reasoning || "").trim() || undefined,
      };

    // Hard fallback: ensure we always return a usable, human reply.
    const lastUser =
      [...(input.messages || [])].reverse().find((m) => m.role === "user")
        ?.content || "";
    return {
      reply: lastUser.trim()
        ? `Got it. Quick question so I do this right: what’s the outcome you want from “${lastUser.trim().slice(0, 120)}”?`
        : "Got it. What would you like me to do next?",
      reasoningTitle: String(reasoningTitle || "").trim() || undefined,
      reasoning: String(reasoning || "").trim() || undefined,
    };
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
export const taskQueryFlow = (ai as any).defineFlow({
  name: "taskQuery",
  inputSchema: TaskQueryInputSchema,
  outputSchema: TaskQueryOutputSchema,
  handler: async (input: z.infer<typeof TaskQueryInputSchema>) => {
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
      tasks: tasks.map((task: any) => ({
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
