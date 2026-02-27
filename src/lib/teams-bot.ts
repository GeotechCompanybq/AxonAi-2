import {
  CloudAdapter,
  ConfigurationServiceClientCredentialFactory,
  ConversationState,
  MemoryStorage,
  TurnContext,
  createBotFrameworkAuthenticationFromConfiguration,
} from "botbuilder";

const credentialsFactory = new ConfigurationServiceClientCredentialFactory({
  MicrosoftAppId: process.env.MICROSOFT_BOT_APP_ID ?? "",
  MicrosoftAppPassword: process.env.MICROSOFT_BOT_APP_PASSWORD ?? "",
  MicrosoftAppType: "SingleTenant",
  MicrosoftAppTenantId: process.env.MICROSOFT_BOT_TENANT_ID ?? "",
});

const botFrameworkAuthentication =
  createBotFrameworkAuthenticationFromConfiguration(null, credentialsFactory);

export const teamsBotAdapter = new CloudAdapter(botFrameworkAuthentication);

const memoryStorage = new MemoryStorage();
const conversationState = new ConversationState(memoryStorage);

async function handleMessageTurn(context: TurnContext) {
  const text = (context.activity.text || "").trim();
  const lower = text.toLowerCase();

  if (!text) {
    await context.sendActivity(
      "Hi from AxonAI for Teams. Type \"help\" to see what I can do."
    );
    return;
  }

  const isGreeting =
    ["hi", "hey", "hello"].includes(lower) || lower.startsWith("good ");

  if (isGreeting) {
    await context.sendActivity(
      "Hey! I’m the AxonAI bot for Teams.\n\nType **help** to see commands like *plan today*, *sync org jira*, and *summarize last meeting*."
    );
    return;
  }

  if (lower === "help" || lower === "commands" || lower === "?") {
    await context.sendActivity(
      [
        "**Here’s what I understand right now:**",
        "- **plan today** – daily plan from your Jira / Monday tasks.",
        "- **sync org jira** – (admins) org-wide Jira sync.",
        "- **summarize last meeting** – Loom / Teams transcript summary (coming soon).",
        "- **monday**, **jira**, **harvest**, **calendar** – quick info on each integration.",
        "- Or chat and I’ll echo back; type **help** anytime.",
      ].join("\n")
    );
    return;
  }

  // Simple command routing – stubs for deeper Axon integration.
  if (
    lower.startsWith("plan today") ||
    lower.includes("plan my day") ||
    lower.includes("plan my schedule")
  ) {
    await context.sendActivity(
      [
        "I’ll help you plan your day using your connected Jira / Monday tasks.",
        "",
        "_Framework stub_: wire this to your existing `/api/ai/plan-for-day` + `/api/jira/tasks` and `/api/monday/tasks` endpoints to generate a real plan and post it here.",
      ].join("\n")
    );
    return;
  }

  if (
    lower.includes("what's my schedule") ||
    lower.includes("whats my schedule") ||
    (lower.includes("schedule") && lower.includes("today"))
  ) {
    await context.sendActivity(
      [
        "Here’s how I can help with your schedule:",
        "- Look at today’s calendar events from Microsoft / Teams.",
        "- Combine them with your highest-priority Jira / Monday tasks.",
        "- Suggest focused work blocks around meetings.",
        "",
        "_Framework stub_: have me call your calendar + tasks APIs, then return a real schedule summary here.",
      ].join("\n")
    );
    return;
  }

  if (lower.startsWith("sync org jira")) {
    await context.sendActivity(
      [
        "Org-wide Jira sync keeps your Axon analytics and Org Tasks up to date.",
        "",
        "_Framework stub_: from here call your `/api/orgs/{orgId}/sync` endpoint (with the right org) and post a short summary of how many users / tasks were processed.",
      ].join("\n")
    );
    return;
  }

  if (lower.startsWith("summarize last meeting")) {
    await context.sendActivity(
      [
        "I can summarize your latest Loom / Teams meeting transcript and share key action items.",
        "",
        "_Framework stub_: fetch the most recent transcript via your Loom / Microsoft integrations, send it to your AI summarizer, then post the summary back into this chat.",
      ].join("\n")
    );
    return;
  }

  // Single-word integration hints (e.g. "monday", "jira", "harvest").
  if (lower === "monday" || lower === "monday.com") {
    await context.sendActivity(
      "**Monday.com** in Axon: connect in Settings, then use **plan today** to build a daily plan from your Monday boards. I can later pull your Monday tasks here — type **help** for more."
    );
    return;
  }
  if (lower === "jira") {
    await context.sendActivity(
      "**Jira** in Axon: connect in Settings; use **plan today** for a plan from your issues, or **sync org jira** (admins) to refresh org-wide. Type **help** for all commands."
    );
    return;
  }
  if (lower === "harvest") {
    await context.sendActivity(
      "**Harvest** in Axon: connect in Settings to sync timesheets. I can’t pull timesheets from here yet — use the Axon app. Type **help** for more."
    );
    return;
  }
  if (lower === "loom" || lower === "transcript") {
    await context.sendActivity(
      "**Loom / transcripts**: say **summarize last meeting** and I’ll (once wired) summarize your latest meeting transcript. Type **help** for commands."
    );
    return;
  }
  if (lower === "calendar" || lower === "teams" || lower === "schedule") {
    await context.sendActivity(
      "I can help with **calendar** and **schedule**: try **plan today** or **what’s my schedule** to combine meetings and tasks. Type **help** for more."
    );
    return;
  }

  // Default echo / fallback with gentle guidance.
  await context.sendActivity(
    `You said: "${text}".\n\nI don’t fully understand that yet — type **help** to see supported commands.`
  );
}

export async function handleTeamsTurn(context: TurnContext) {
  try {
    if (context.activity.type === "message") {
      await handleMessageTurn(context);
    }
  } finally {
    await conversationState.saveChanges(context, false);
  }
}

