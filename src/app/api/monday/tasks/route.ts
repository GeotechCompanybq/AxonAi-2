import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

async function fetchMondayTasks(token: string) {
  const query = `query($limit:Int!){
    me { id name email }
    boards (limit: 5) {
      id name
      items (limit: $limit) {
        id name
        column_values { id title text value type }
      }
    }
  }`;
  const res = await fetch("https://api.monday.com/v2", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query, variables: { limit: 200 } }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) {
    console.error("monday graphql error", { status: res.status, json });
    throw new Error("monday_api_error");
  }
  const meId = String(json?.data?.me?.id || "");
  const items =
    json.data?.boards?.flatMap((b: any) =>
      (b.items || []).map((i: any) => ({ ...i, boardName: b.name }))
    ) || [];
  // Keep only items assigned to the current user via a People column
  const assignedToMe = items.filter((it: any) => {
    const cvs = it.column_values || [];
    for (const cv of cvs) {
      if (
        cv?.type !== "people" &&
        !/people|assignee|owner/i.test(cv?.title || "")
      )
        continue;
      try {
        const v = cv?.value ? JSON.parse(cv.value) : null;
        const persons = v?.personsAndTeams
          ?.filter((x: any) => x.kind === "person")
          .map((x: any) => String(x.id));
        if (Array.isArray(persons) && persons.includes(meId)) return true;
      } catch {}
      // Fallback: some workspaces expose id in text when single user
      if (typeof cv?.text === "string" && cv.text.length > 0) {
        // can't reliably parse ID from text; skip
      }
    }
    return false;
  });
  return assignedToMe.map((it: any) => ({
    name: it.name,
    description: it.boardName,
    dueDate:
      it.column_values?.find((c: any) => c.title === "Date")?.text || undefined,
    priority: "medium",
    status: (
      it.column_values?.find((c: any) => c.title === "Status")?.text || "todo"
    ).toLowerCase(),
    category: it.boardName || "Work",
  }));
}

export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("monday_token")?.value;
    if (!token)
      return NextResponse.json({ error: "Not connected" }, { status: 400 });
    const tasks = await fetchMondayTasks(token);
    return NextResponse.json({ tasks });
  } catch (e) {
    console.error("monday tasks error", e);
    return NextResponse.json(
      { error: "Failed to fetch tasks" },
      { status: 500 }
    );
  }
}
