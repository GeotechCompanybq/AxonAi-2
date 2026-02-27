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
      "Hi from AxonAI. Try typing \"plan today\" or \"sync org jira\"."
    );
    return;
  }

  // Simple command routing – extend as needed.
  if (lower.startsWith("plan today")) {
    await context.sendActivity(
      "I'll generate your Axon daily plan from Jira/Monday/Harvest tasks. (Framework stub – plug into your /api/ai/plan-for-day pipeline here.)"
    );
    return;
  }

  if (lower.startsWith("sync org jira")) {
    await context.sendActivity(
      "Kicking off org-wide Jira sync. (Framework stub – call /api/orgs/{orgId}/sync from here.)"
    );
    return;
  }

  if (lower.startsWith("summarize last meeting")) {
    await context.sendActivity(
      "I'll summarize your latest Loom / Teams meeting transcript. (Framework stub – fetch from Loom/Microsoft and call your AI summarizer.)"
    );
    return;
  }

  // Default echo / fallback.
  await context.sendActivity(`You said: ${text}`);
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

