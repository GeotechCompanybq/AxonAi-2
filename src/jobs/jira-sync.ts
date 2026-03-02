import { adminDb } from "@/lib/firebase-admin";
import { getDb, getCollectionNames } from "@/lib/mongo";
import { EmailNotificationService } from "@/lib/email-notifications";

async function fetchAccessibleSites(token: string) {
  try {
    const sitesRes = await fetch(
      "https://api.atlassian.com/oauth/token/accessible-resources",
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      }
    );

    if (!sitesRes.ok) return [];
    const json = await sitesRes.json();
    return Array.isArray(json) ? json : [];
  } catch {
    return [];
  }
}

function mapJiraStatusToAppStatus(status: string): string {
  const statusMap: { [key: string]: string } = {
    "To Do": "todo",
    "In Progress": "inprogress",
    Done: "done",
    Blocked: "blocked",
    "Under Review": "inprogress",
  };
  return statusMap[status] || "todo";
}

function mapJiraPriorityToAppPriority(priority: string): string {
  const priorityMap: { [key: string]: string } = {
    Highest: "high",
    High: "high",
    Medium: "medium",
    Low: "low",
    Lowest: "low",
  };
  return priorityMap[priority] || "medium";
}

function transformJiraIssue(issue: any) {
  const key = String(issue?.key || "");
  const fields = issue?.fields || {};
  return {
    name: String(fields?.summary || "Untitled"),
    description: `${fields?.description || ""}\n\nProject: ${
      fields?.project?.name || ""
    }\nType: ${fields?.issuetype?.name || ""}\nKey: ${key}`.trim(),
    dueDate: fields?.duedate || null,
    status: mapJiraStatusToAppStatus(String(fields?.status?.name || "")),
    priority: mapJiraPriorityToAppPriority(String(fields?.priority?.name || "")),
    category: fields?.project?.name || null,
    externalId: String(issue?.id || key),
    externalKey: key || null,
  };
}

const JIRA_SEARCH_FIELDS = [
  "summary",
  "description",
  "status",
  "priority",
  "duedate",
  "project",
  "issuetype",
] as const;

async function fetchJiraTasks(token: string) {
  const allTasks: any[] = [];
  const sites = await fetchAccessibleSites(token);

  for (const site of sites) {
    const baseUrl = String(site?.url || "");
    if (!baseUrl) continue;

    let startAt = 0;
    const maxResults = 100;
    let total = Infinity;

    while (startAt < total) {
      const searchUrl = new URL(`${baseUrl}/rest/api/3/search`);
      const searchRes = await fetch(searchUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-Atlassian-Token": "no-check",
        },
        body: JSON.stringify({
          jql: "statusCategory != Done AND assignee = currentUser() ORDER BY updated DESC",
          startAt,
          maxResults,
          fields: [...JIRA_SEARCH_FIELDS],
        }),
      });

      if (!searchRes.ok) break;
      const searchData = await searchRes.json();
      total = Number(searchData?.total ?? 0);
      const issues = Array.isArray(searchData?.issues) ? searchData.issues : [];
      allTasks.push(...issues.map(transformJiraIssue));

      startAt += maxResults;
      if (issues.length < maxResults) break;
    }
  }

  return allTasks;
}

/** Fetch issues with custom JQL; returns transformed tasks plus assignee email for org distribution */
async function fetchJiraTasksWithCustomJql(
  token: string,
  jql: string
): Promise<{ task: any; assigneeEmail: string | null }[]> {
  const out: { task: any; assigneeEmail: string | null }[] = [];
  const sites = await fetchAccessibleSites(token);
  const fields = [...JIRA_SEARCH_FIELDS, "assignee"];

  for (const site of sites) {
    const baseUrl = String(site?.url || "");
    if (!baseUrl) continue;

    let startAt = 0;
    const maxResults = 100;
    let total = Infinity;

    while (startAt < total) {
      const searchUrl = new URL(`${baseUrl}/rest/api/3/search`);
      const searchRes = await fetch(searchUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-Atlassian-Token": "no-check",
        },
        body: JSON.stringify({
          jql: jql.trim(),
          startAt,
          maxResults,
          fields,
        }),
      });

      if (!searchRes.ok) break;
      const searchData = await searchRes.json();
      total = Number(searchData?.total ?? 0);
      const issues = Array.isArray(searchData?.issues) ? searchData.issues : [];
      for (const issue of issues) {
        const assignee = issue?.fields?.assignee;
        const assigneeEmail =
          assignee?.emailAddress ?? assignee?.email ?? null;
        out.push({
          task: transformJiraIssue(issue),
          assigneeEmail: assigneeEmail ? String(assigneeEmail).trim().toLowerCase() : null,
        });
      }
      startAt += maxResults;
      if (issues.length < maxResults) break;
    }
  }

  return out;
}

async function refreshJiraToken(refreshToken: string) {
  try {
    const refreshRes = await fetch("https://auth.atlassian.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "refresh_token",
        client_id: process.env.JIRA_CLIENT_ID,
        client_secret: process.env.JIRA_CLIENT_SECRET,
        refresh_token: refreshToken,
      }),
    });
    if (!refreshRes.ok) return null;
    return await refreshRes.json();
  } catch {
    return null;
  }
}

async function fetchAndStoreForUser(uid: string, token: string) {
  const tasks = await fetchJiraTasks(token);
  const db = await getDb();
  const { userTasks, users } = getCollectionNames();
  let newlyInserted = 0;

  const ops = tasks.map((t: any) => {
    const key = `${t.externalId || t.externalKey || t.name}|jira`;
    const id = Buffer.from(key).toString("base64").replace(/=+$/g, "");
    const doc = {
      uid,
      id,
      source: "jira",
      name: t.name,
      description: t.description,
      dueDate: t.dueDate,
      priority: t.priority,
      status: t.status,
      category: t.category,
      externalId: t.externalId || null,
      externalKey: t.externalKey || null,
      updatedAt: new Date().toISOString(),
    };
    return {
      updateOne: { filter: { uid, id }, update: { $set: doc }, upsert: true },
    } as const;
  });

  if (ops.length) {
    const bulkRes: any = await db
      .collection(userTasks)
      .bulkWrite(ops as any, { ordered: false });
    newlyInserted = Number(bulkRes?.upsertedCount || 0);
  }

  if (newlyInserted > 0) {
    try {
      const userDoc = await db.collection(users).findOne({ uid });
      const email = (userDoc as any)?.email as string | undefined;
      if (email) {
        const previewNames = tasks
          .slice(0, 3)
          .map((t: any) => String(t?.name || "Untitled"))
          .join(", ");
        await EmailNotificationService.sendEmail({
          to: email,
          subject: `New tasks imported from Jira (${newlyInserted})`,
          htmlBody: `
            <p>We imported <strong>${newlyInserted}</strong> new task(s) from Jira into your workspace.</p>
            <p style="color:#94a3b8;font-size:12px">Recent: ${previewNames}</p>
            <p><a href="/tasks">Open Tasks</a></p>
          `,
        });
      }
    } catch (e) {
      console.error("Failed to send Jira new-tasks email", e);
    }
  }
}

async function isOrgWideJiraSyncEnabled(): Promise<boolean> {
  try {
    const snap = await adminDb
      .collection("orgs")
      .where("integrations.jira.syncAllUsers", "==", true)
      .limit(1)
      .get();
    return !snap.empty;
  } catch {
    // If org settings cannot be read, fall back to current behavior
    return true;
  }
}

/** Build map of email (lowercase) -> uid for org members */
async function getOrgMemberEmailToUid(memberUids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const db = await getDb();
  const { users } = getCollectionNames();
  for (const uid of memberUids) {
    let email: string | undefined;
    try {
      const doc = await db.collection(users).findOne({ uid });
      email = (doc as any)?.email as string | undefined;
    } catch {}
    if (!email) {
      const snap = await adminDb.collection("users").doc(uid).get();
      email = snap.get("email") as string | undefined;
    }
    if (email) map.set(String(email).trim().toLowerCase(), uid);
  }
  return map;
}

async function upsertTasksForUser(uid: string, tasks: any[]): Promise<number> {
  if (tasks.length === 0) return 0;
  const db = await getDb();
  const { userTasks, users } = getCollectionNames();
  const ops = tasks.map((t: any) => {
    const key = `${t.externalId || t.externalKey || t.name}|jira`;
    const id = Buffer.from(key).toString("base64").replace(/=+$/g, "");
    const doc = {
      uid,
      id,
      source: "jira",
      name: t.name,
      description: t.description,
      dueDate: t.dueDate,
      priority: t.priority,
      status: t.status,
      category: t.category,
      externalId: t.externalId || null,
      externalKey: t.externalKey || null,
      updatedAt: new Date().toISOString(),
    };
    return {
      updateOne: { filter: { uid, id }, update: { $set: doc }, upsert: true },
    } as const;
  });
  const bulkRes: any = await db
    .collection(userTasks)
    .bulkWrite(ops as any, { ordered: false });
  const newlyInserted = Number(bulkRes?.upsertedCount || 0);
  if (newlyInserted > 0) {
    try {
      const userDoc = await db.collection(users).findOne({ uid });
      const email = (userDoc as any)?.email as string | undefined;
      if (email) {
        const previewNames = tasks
          .slice(0, 3)
          .map((t: any) => String(t?.name || "Untitled"))
          .join(", ");
        await EmailNotificationService.sendEmail({
          to: email,
          subject: `New tasks imported from Jira (${newlyInserted})`,
          htmlBody: `
            <p>We imported <strong>${newlyInserted}</strong> new task(s) from Jira into your workspace.</p>
            <p style="color:#94a3b8;font-size:12px">Recent: ${previewNames}</p>
            <p><a href="/tasks">Open Tasks</a></p>
          `,
        });
      }
    } catch (e) {
      console.error("Failed to send Jira new-tasks email", e);
    }
  }
  return newlyInserted;
}

export async function runJiraSync(opts?: { uid?: string; dry?: boolean }) {
  if (opts?.dry) return { ok: true, processed: 0 } as const;

  // Specific user
  if (opts?.uid) {
    let token: string | undefined;
    let refreshToken: string | undefined;
    try {
      const db = await getDb();
      const { users } = getCollectionNames();
      const doc = await db.collection(users).findOne({ uid: opts.uid });
      token = (doc as any)?.jira?.accessToken as string | undefined;
      refreshToken = (doc as any)?.jira?.refreshToken as string | undefined;
    } catch {}
    if (!token) {
      const snap = await adminDb.collection("users").doc(opts.uid).get();
      token = snap.get("jira.accessToken") as string | undefined;
      refreshToken = snap.get("jira.refreshToken") as string | undefined;
    }

    if (!token && refreshToken) {
      const refreshed = await refreshJiraToken(refreshToken);
      if (refreshed?.access_token) {
        token = refreshed.access_token as string;
        try {
          const db = await getDb();
          const { users } = getCollectionNames();
          await db.collection(users).updateOne(
            { uid: opts.uid },
            {
              $set: {
                uid: opts.uid,
                "jira.accessToken": token,
                "jira.refreshToken": refreshed.refresh_token || refreshToken,
                "jira.updatedAt": Date.now(),
              },
            },
            { upsert: true }
          );
        } catch {}
      }
    }

    if (!token) return { error: "No token", status: 400 } as const;
    await fetchAndStoreForUser(opts.uid, token);
    return { ok: true, processed: 1 } as const;
  }

  // Org-wide mode: only run when enabled in integrations settings
  const enabled = await isOrgWideJiraSyncEnabled();
  if (!enabled) {
    return { ok: true, processed: 0 } as const;
  }

  const db = await getDb();
  const { users } = getCollectionNames();

  /** Get Jira token for a user (Mongo then Firestore), refresh if needed */
  async function getTokenForUser(uid: string): Promise<string | null> {
    let token: string | undefined;
    let refreshToken: string | undefined;
    try {
      const doc = await db.collection(users).findOne({ uid });
      token = (doc as any)?.jira?.accessToken as string | undefined;
      refreshToken = (doc as any)?.jira?.refreshToken as string | undefined;
    } catch {}
    if (!token) {
      const snap = await adminDb.collection("users").doc(uid).get();
      token = snap.get("jira.accessToken") as string | undefined;
      refreshToken = snap.get("jira.refreshToken") as string | undefined;
    }
    if (token) return token;
    if (refreshToken) {
      const refreshed = await refreshJiraToken(refreshToken);
      if (refreshed?.access_token) {
        token = refreshed.access_token as string;
        try {
          await db.collection(users).updateOne(
            { uid },
            {
              $set: {
                uid,
                "jira.accessToken": token,
                "jira.refreshToken": refreshed.refresh_token || refreshToken,
                "jira.updatedAt": Date.now(),
              },
            },
            { upsert: true }
          );
        } catch {}
        return token;
      }
    }
    return null;
  }

  let processed = 0;
  const orgsSnap = await adminDb
    .collection("orgs")
    .where("integrations.jira.syncAllUsers", "==", true)
    .get();

  for (const orgDoc of orgsSnap.docs) {
    const orgId = orgDoc.id;
    const integrations = orgDoc.get("integrations") || {};
    const jiraConfig = integrations.jira || {};
    const customJql = typeof jiraConfig.jql === "string" ? jiraConfig.jql.trim() : "";

    const membersSnap = await adminDb
      .collection("orgs")
      .doc(orgId)
      .collection("members")
      .get();
    const memberUids = membersSnap.docs.map((d) => d.id).filter(Boolean);

    if (customJql) {
      // One query with custom JQL; distribute issues to org members by assignee email
      let token: string | null = null;
      for (const uid of memberUids) {
        token = await getTokenForUser(uid);
        if (token) break;
      }
      if (!token) continue;

      const results = await fetchJiraTasksWithCustomJql(token, customJql);
      const emailToUid = await getOrgMemberEmailToUid(memberUids);
      const tasksByUid = new Map<string, any[]>();
      for (const { task, assigneeEmail } of results) {
        const uid = assigneeEmail ? emailToUid.get(assigneeEmail) : null;
        if (!uid) continue;
        const list = tasksByUid.get(uid) || [];
        list.push(task);
        tasksByUid.set(uid, list);
      }
      for (const [uid, tasks] of tasksByUid) {
        await upsertTasksForUser(uid, tasks);
        processed++;
      }
    } else {
      // Per-user default JQL for each org member with a token
      for (const uid of memberUids) {
        const token = await getTokenForUser(uid);
        if (!token) continue;
        await fetchAndStoreForUser(uid, token);
        processed++;
      }
    }
  }

  return { ok: true, processed } as const;
}






