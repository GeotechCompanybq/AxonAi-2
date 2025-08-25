import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
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

    if (!sitesRes.ok) {
      throw new Error(`Failed to fetch Jira sites: ${sitesRes.status}`);
    }

    return await sitesRes.json();
  } catch (error) {
    console.error("Error fetching Jira sites:", error);
    return [];
  }
}

function transformJiraIssue(issue: any) {
  return {
    name: issue.fields.summary,
    description: `${issue.fields.description || ""}\n\nProject: ${
      issue.fields.project.name
    }\nType: ${issue.fields.issuetype.name}\nKey: ${issue.key}`,
    dueDate: issue.fields.duedate,
    status: mapJiraStatusToAppStatus(issue.fields.status.name),
    priority: mapJiraPriorityToAppPriority(issue.fields.priority.name),
    category: issue.fields.project.name,
    externalId: issue.id, // Preserve Jira's unique issue ID
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

async function fetchJiraTasks(token: string) {
  const allTasks: any[] = [];
  const sites = await fetchAccessibleSites(token);

  // First, get user details to log who's retrieving tasks
  const meRes = await fetch("https://api.atlassian.com/me", {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
  const me = await meRes.json();
  const meAccountId = me?.account_id || me?.accountId || "";
  console.log(
    `Fetching tasks for Jira user: ${me?.name || "unknown"} (${
      me?.email || "no-email"
    }) accountId=${meAccountId}`
  );

  for (const site of sites) {
    const baseUrl = site.url;
    const cloudId = site.id;
    let startAt = 0;
    const maxResults = 100;
    let total = Infinity;

    while (startAt < total) {
      const searchUrl = new URL(`${baseUrl}/rest/api/3/search`);
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
  return allTasks;
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
        try {
          const { adminDb } = await import("@/lib/firebase-admin");
          const snap = await adminDb.collection("users").doc(uid).get();
          token = snap.get("jira.accessToken") as string | undefined;
          const refreshToken = snap.get("jira.refreshToken") as
            | string
            | undefined;

          // Attempt token refresh if access token is invalid
          if (!token && refreshToken) {
            const refreshedTokenData = await refreshJiraToken(refreshToken);
            if (refreshedTokenData) {
              token = refreshedTokenData.access_token;
              // Update tokens in Firestore
              await adminDb
                .collection("users")
                .doc(uid)
                .set(
                  {
                    jira: {
                      accessToken: refreshedTokenData.access_token,
                      refreshToken: refreshedTokenData.refresh_token,
                      updatedAt: Date.now(),
                    },
                  },
                  { merge: true }
                );
            }
          }
        } catch (err) {
          console.error("Error retrieving Jira token:", err);
        }
      }
    }

    if (!token) {
      return NextResponse.json(
        { error: "Not connected to Jira" },
        { status: 400 }
      );
    }

    const tasks = await fetchJiraTasks(token);
    return NextResponse.json({ tasks });
  } catch (e) {
    console.error("jira tasks error", e);
    const message =
      e instanceof Error ? e.message : "Failed to fetch Jira tasks";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
