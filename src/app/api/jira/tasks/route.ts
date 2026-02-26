import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb, getCollectionNames } from "@/lib/mongo";
import { EmailNotificationService } from "@/lib/email-notifications";

async function fetchAccessibleSites(token: string): Promise<{ sites: any[]; authError?: boolean }> {
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

    if (!sitesRes.ok) {
      if (sitesRes.status === 401 || sitesRes.status === 403) {
        return { sites: [], authError: true };
      }
      throw new Error(`Failed to fetch Jira sites: ${sitesRes.status}`);
    }

    return { sites: await sitesRes.json() };
  } catch (error) {
    console.error("Error fetching Jira sites:", error);
    return { sites: [] };
  }
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

async function fetchJiraTasks(token: string): Promise<{ tasks: any[]; authError?: boolean }> {
  const allTasks: any[] = [];
  const { sites, authError } = await fetchAccessibleSites(token);
  
  if (authError) {
    return { tasks: [], authError: true };
  }

  // First, get user details to log who's retrieving tasks
  const meRes = await fetch("https://api.atlassian.com/me", {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
  
  if (!meRes.ok && (meRes.status === 401 || meRes.status === 403)) {
    return { tasks: [], authError: true };
  }
  
  const me = await meRes.json();
  const meAccountId = me?.account_id || me?.accountId || "";
  console.log(
    `Fetching tasks for Jira user: ${me?.name || "unknown"} (${
      me?.email || "no-email"
    }) accountId=${meAccountId}`
  );

  for (const site of sites) {
    const cloudId = String(site?.id || "");
    if (!cloudId) continue;
    let startAt = 0;
    const maxResults = 100;
    let total = Infinity;

    while (startAt < total) {
      const searchUrl = new URL(
        `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/search`
      );
      // Build robust JQL: use statusCategory to avoid custom status names,
      // and match either currentUser() or the explicit accountId.
      const jqlParts = [
        "statusCategory != Done",
        meAccountId
          ? `(assignee = currentUser() OR assignee in (accountId(\"${meAccountId}\")))`
          : "assignee = currentUser()",
      ];
      const jql = `${jqlParts.join(" AND ")} ORDER BY updated DESC`;

      const searchRes = await fetch(searchUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-Atlassian-Token": "no-check",
        },
        body: JSON.stringify({
          // Prefer statusCategory and include explicit accountId fallback
          jql,
          startAt,
          maxResults,
          fields: [
            "summary",
            "description",
            "status",
            "priority",
            "duedate",
            "project",
            "issuetype",
            "assignee", // Add assignee to verify
          ],
        }),
      });

      if (!searchRes.ok) {
        console.error(`Failed to fetch Jira tasks: ${searchRes.status}`);
        break;
      }

      const searchData = await searchRes.json();
      total = searchData.total;

      // Log task details for verification
      console.log(
        `Retrieved ${searchData.issues.length} tasks from ${site.name}`
      );
      searchData.issues.forEach((issue: any) => {
        console.log(`- Task: ${issue.key} - ${issue.fields.summary}`);
        // Optional: Log assignee details for extra verification
        console.log(
          `  Assignee: ${issue.fields.assignee?.displayName || "Unknown"}`
        );
      });

      const siteTasks = searchData.issues.map(transformJiraIssue);
      allTasks.push(...siteTasks);

      startAt += maxResults;
      if (searchData.issues.length < maxResults) break;
    }
  }

  console.log(`Total tasks retrieved: ${allTasks.length}`);
  return { tasks: allTasks };
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

    if (!refreshRes.ok) {
      throw new Error("Token refresh failed");
    }

    const tokenData = await refreshRes.json();
    return tokenData;
  } catch (error) {
    console.error("Error refreshing Jira token:", error);
    return null;
  }
}

export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    let token = cookieStore.get("jira_token")?.value;

    // Fallback: attempt DB lookup using uid passed via query
    if (!token) {
      const uid = req.nextUrl.searchParams.get("uid") || undefined;
      if (uid) {
        // Prefer Mongo
        let refreshToken: string | undefined;
        try {
          const db = await getDb();
          const { users } = getCollectionNames();
          const doc = await db.collection(users).findOne({ uid });
          token = (doc as any)?.jira?.accessToken as string | undefined;
          refreshToken = (doc as any)?.jira?.refreshToken as string | undefined;
        } catch {}
        // Firestore fallback
        if (!token) {
          try {
            const { adminDb } = await import("@/lib/firebase-admin");
            const snap = await adminDb.collection("users").doc(uid).get();
            token = snap.get("jira.accessToken") as string | undefined;
            refreshToken = snap.get("jira.refreshToken") as string | undefined;
          } catch (err) {
            console.error("Error retrieving Jira token:", err);
          }
        }
        // Attempt token refresh if access token is missing but refresh exists
        if (!token && refreshToken) {
          const refreshed = await refreshJiraToken(refreshToken);
          if (refreshed) {
            token = refreshed.access_token;
            try {
              const db = await getDb();
              const { users } = getCollectionNames();
              await db.collection(users).updateOne(
                { uid },
                {
                  $set: {
                    uid,
                    "jira.accessToken": refreshed.access_token,
                    "jira.refreshToken": refreshed.refresh_token,
                    "jira.updatedAt": Date.now(),
                  },
                },
                { upsert: true }
              );
            } catch {}
          }
        }
      }
    }

    if (!token) {
      return NextResponse.json(
        { error: "Not connected to Jira" },
        { status: 400 }
      );
    }

    const result = await fetchJiraTasks(token);
    if (result.authError) {
      return NextResponse.json(
        {
          error: "Jira authentication expired. Please reconnect in Settings.",
          authError: true,
        },
        { status: 401 }
      );
    }

    // When a uid is provided, also upsert tasks into the user's task collection
    const uid = req.nextUrl.searchParams.get("uid") || undefined;
    if (uid && Array.isArray(result.tasks) && result.tasks.length > 0) {
      try {
        const db = await getDb();
        const { userTasks, users } = getCollectionNames();

        const ops = result.tasks.map((t: any) => {
          const key = `${t.externalId || t.externalKey || t.name}|jira`;
          const id = Buffer.from(key).toString("base64").replace(/=+$/g, "");
          const doc = {
            uid,
            id,
            source: "jira",
            name: t.name,
            description: t.description,
            dueDate: t.dueDate || null,
            priority: t.priority,
            status: t.status,
            category: t.category,
            externalId: t.externalId || null,
            externalKey: t.externalKey || null,
            updatedAt: new Date().toISOString(),
          };
          return {
            updateOne: {
              filter: { uid, id },
              update: { $set: doc },
              upsert: true,
            },
          } as const;
        });

        let newlyInserted = 0;
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
              const previewNames = result.tasks
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
      } catch (e) {
        console.error("Failed to upsert Jira tasks", e);
      }
    }

    return NextResponse.json({ tasks: result.tasks });
  } catch (e) {
    console.error("jira tasks error", e);
    const message =
      e instanceof Error ? e.message : "Failed to fetch Jira tasks";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
