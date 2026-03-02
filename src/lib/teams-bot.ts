import {
  CloudAdapter,
  ConfigurationServiceClientCredentialFactory,
  ConversationState,
  MemoryStorage,
  TurnContext,
  createBotFrameworkAuthenticationFromConfiguration,
} from "botbuilder";
import { chat, type ChatInput } from "@/ai/flows/chat";
import { getTeamsLink } from "@/lib/teams-link-store";

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

function getTenantIdFromContext(context: TurnContext): string | null {
  const channelData = (context.activity.channelData || {}) as any;
  const fromChannelData = channelData?.tenant?.id as string | undefined;
  const fromConversation = (context.activity.conversation as any)
    ?.tenantId as string | undefined;
  return (fromChannelData || fromConversation || "").trim() || null;
}

async function ensureLinkedAxonAccount(context: TurnContext) {
  const channelId = (context.activity.channelId || "").toLowerCase();

  // Integrations require a real Microsoft Teams context so we can safely
  // identify the tenant and user. For other channels (like Web Chat), we
  // explicitly tell the user what to do instead of failing silently.
  if (channelId !== "msteams") {
    await context.sendActivity(
      [
        "This command is only available when you use AxonAI inside Microsoft Teams.",
        "",
        "Install the AxonAI app in Teams and run this command there so I can safely use your Jira, Monday, Harvest, and calendar integrations.",
      ].join("\n")
    );
    return null;
  }

  const teamsUserId = context.activity.from?.id || "";
  const tenantId = getTenantIdFromContext(context);

  if (!teamsUserId || !tenantId) {
    await context.sendActivity(
      "I couldn’t read your Teams tenant information. Please try again in a Teams chat or ask your admin to re-install the AxonAI app."
    );
    return null;
  }

  const existing = await getTeamsLink({ tenantId, teamsUserId });
  if (existing) return existing;

  const baseUrl =
    process.env.APP_BASE_URL?.trim() || "https://axonai.bqitech.com";
  const linkUrl = `${baseUrl}/teams/link?tenantId=${encodeURIComponent(
    tenantId
  )}&userId=${encodeURIComponent(teamsUserId)}`;

  await context.sendActivity(
    [
      "I need to be linked to your Axon account before I can access your Jira, Monday, Harvest, and calendar data.",
      "",
      `Open this link in your browser while signed into Axon to complete the link:`,
      "",
      linkUrl,
    ].join("\n")
  );

  return null;
}

async function answerWithAxonChat(context: TurnContext, userText: string) {
  const trimmed = userText.trim();
  if (!trimmed) {
    await context.sendActivity(
      "I heard you, but I didn’t get any text to respond to. Try typing a question or request."
    );
    return;
  }

  const systemContent =
    "You are AxonAI, an AI assistant chatting with a user inside Microsoft Teams. " +
    "Be concise, friendly, and work-focused. Use short paragraphs or bullets when helpful.";

  const payload: ChatInput = {
    messages: [
      { role: "system", content: systemContent },
      { role: "user", content: trimmed },
    ],
  };

  try {
    const result = await chat(payload);
    const reply = (result.reply || "").trim();
    if (reply) {
      await context.sendActivity(reply);
    } else {
      await context.sendActivity(
        "I wasn’t able to generate a good reply to that. Please try rephrasing your question."
      );
    }
  } catch (e) {
    console.error("Teams AxonChat error", e);
    await context.sendActivity(
      "Something went wrong while I was thinking about that. Please try again in a moment."
    );
  }
}

async function handleMessageTurn(context: TurnContext) {
  const raw = (context.activity.text || "").replace(/[\u200B-\u200D\uFEFF]/g, "");
  const text = raw.trim();
  const lower = text.toLowerCase();

  if (!text) {
    await context.sendActivity(
      "Hi from AxonAI for Teams. Type \"help\" to see what I can do."
    );
    return;
  }

  const isGreeting =
    ["hi", "hey", "hello"].includes(lower) ||
    lower.startsWith("good ") ||
    /^hi\b/.test(lower) ||
    /^hello\b/.test(lower) ||
    /^hey\b/.test(lower);

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
    const link = await ensureLinkedAxonAccount(context);
    if (!link) return;

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
    const link = await ensureLinkedAxonAccount(context);
    if (!link) return;

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
    const link = await ensureLinkedAxonAccount(context);
    if (!link) return;

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
    const link = await ensureLinkedAxonAccount(context);
    if (!link) return;

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

  // Default: full AxonChat-style reply (requires linked Axon account).
  const link = await ensureLinkedAxonAccount(context);
  if (!link) return;

  await answerWithAxonChat(context, text);
}

export async function handleTeamsTurn(context: TurnContext) {
  try {
    if (context.activity.type === "conversationUpdate") {
      const membersAdded = context.activity.membersAdded || [];
      const botId = context.activity.recipient?.id;
      const nonBotMembersAdded = membersAdded.filter((m) => m.id !== botId);
      const botWasAdded = botId
        ? membersAdded.some((m) => m.id === botId)
        : false;
      if (nonBotMembersAdded.length > 0 || botWasAdded) {
        await context.sendActivity(
          [
            "Hi, I’m Axon AI for Teams 👋",
            "",
            "I can help you plan your day from Jira / Monday tasks, keep org Jira in sync, and (soon) summarize meeting transcripts.",
            "",
            "Type **help** to see commands. Try **Hi** or **Hello** to say hi.",
          ].join("\n")
        );
      }
    } else if (context.activity.type === "message") {
      await handleMessageTurn(context);
    }
  } finally {
    await conversationState.saveChanges(context, false);
  }
}

