import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

async function fetchMondayTasks(token: string) {
  const query = `query($limit:Int!){
    me { id name email }
    boards (limit: 10) {
      id name
      items (limit: $limit) {
        id name
        column_values { id title text }
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
  if (!res.ok || json.errors) throw new Error("monday_api_error");
  const items =
    json.data?.boards?.flatMap((b: any) =>
      (b.items || []).map((i: any) => ({ ...i, boardName: b.name }))
    ) || [];
  return items.map((it: any) => ({
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
    const token = cookies().get("monday_token")?.value;
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
