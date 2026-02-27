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
        "- **plan today** – outline how to create a daily plan from your Jira / Monday tasks (Axon app).",
        "- **sync org jira** – explain and (later) trigger org-wide Jira sync.",
        "- **summarize last meeting** – summarize your latest Loom / Teams transcript (coming soon).",
        "- Or just chat and I’ll echo back while we wire deeper Axon logic.",
      ].join("\n")
    );
    return;
  }

  // Simple command routing – stubs for deeper Axon integration.
  if (lower.startsWith("plan today")) {
    await context.sendActivity(
      [
        "I’ll help you plan your day using your connected Jira / Monday tasks.",
        "",
        "_Framework stub_: wire this to your existing `/api/ai/plan-for-day` + `/api/jira/tasks` and `/api/monday/tasks` endpoints to generate a real plan and post it here.",
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

