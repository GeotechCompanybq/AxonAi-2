import { ai } from "@/ai/genkit";
import { z } from "zod";

export const EnhanceNotesInputSchema = z.object({
  notes: z.string().describe("Raw Jira task description or developer notes"),
  jiraUrl: z.string().url().optional().describe("Link to the Jira ticket"),
  title: z
    .string()
    .optional()
    .describe("Optional short task title to refine and use in the comment"),
});

export const EnhanceNotesOutputSchema = z.object({
  comment: z.string().describe("2–3 sentence Harvest timesheet comment"),
});

const enhanceNotesPrompt = (ai as any).definePrompt({
  name: "enhanceNotesPrompt",
  input: { schema: EnhanceNotesInputSchema },
  output: { schema: EnhanceNotesOutputSchema },
  prompt: `You are a professional configuration analyst and QA/QC specialist.
Your task is to transform raw Jira task descriptions or developer notes into clear, concise Harvest timesheet comments suitable for project documentation.

Guidelines:
- Begin with a short, descriptive task title. If a title is provided, refine and use it; otherwise infer one from the notes.
- Reference the Jira ticket using the provided link in parentheses, when available.
- Use professional language describing what was done — implemented, configured, tested, validated, reviewed, etc.
- Keep it 2–3 sentences maximum.
- Avoid filler words, lists, or technical overload; focus on clarity and results.
- Maintain a neutral, factual tone.

Inputs:
- Notes: {{{notes}}}
- Jira link (optional): {{{jiraUrl}}}
- Title (optional): {{{title}}}

Output:
- Populate the field 'comment' with a single string that begins with the task title, followed by a concise 2–3 sentence description of the work performed, and references the Jira link in parentheses if provided.
`,
});

export async function enhanceNotes(
  input: z.infer<typeof EnhanceNotesInputSchema>
) {
  const { output } = await enhanceNotesPrompt(input);
  return output!;
}
