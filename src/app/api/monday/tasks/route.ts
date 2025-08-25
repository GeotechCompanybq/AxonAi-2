import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

async function fetchMondayTasks(token: string) {
  // Prefer boards_page + items_page as per Monday API docs
  const queryBoardsPage = `query($bLimit:Int!,$iLimit:Int!){
    me { id name email }
    boards_page(limit: $bLimit) {
      cursor
      boards {
        id
        name
        state
        board_kind
        items_page(limit: $iLimit) {
          cursor
          items {
            id
            name
            state
            group { id title }
            column_values { id title text value type }
          }
        }
      }
    }
  }`;
  const queryBoards = `query($bLimit:Int!,$iLimit:Int!){
    me { id name email }
    boards(limit: $bLimit) {
      id
      name
      state
      board_kind
      items_page(limit: $iLimit) {
        cursor
        items {
          id
          name
          state
          group { id title }
          column_values { id title text value type }
        }
      }
    }
  }`;

  async function runQuery(query: string) {
    const res = await fetch("https://api.monday.com/v2", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ query, variables: { bLimit: 5, iLimit: 200 } }),
    });
    const json = await res.json();
    return { res, json } as const;
  }

  let { res, json } = await runQuery(queryBoardsPage);
  if (!res.ok || json.errors) {
    const fieldError = Array.isArray(json?.errors)
      ? json.errors.find(
          (e: any) =>
            typeof e?.message === "string" && e.message.includes("boards_page")
        )
      : undefined;
    if (fieldError) {
      // Fallback to older boards field if boards_page unsupported
      ({ res, json } = await runQuery(queryBoards));
    }
  }
  if (!res.ok || json.errors) {
    console.error("monday graphql error", { status: res.status, json });
    const detail = JSON.stringify(json?.errors || json);
    throw new Error(`monday_api_error: ${detail}`);
  }
  const meId = String(json?.data?.me?.id || "");
  const boardsArr = json.data?.boards_page?.boards || json.data?.boards || [];
  const items =
    boardsArr.flatMap((b: any) =>
      (b.items_page?.items || []).map((i: any) => ({
        ...i,
        boardName: b.name,
        group: i.group,
      }))
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
  function mapStatus(raw: string | undefined): string {
    const s = (raw || "").toLowerCase();
    if (s.includes("done")) return "done";
    if (s.includes("stuck") || s.includes("blocked")) return "blocked";
    if (
      s.includes("working") ||
      s.includes("in progress") ||
      s.includes("progress")
    )
      return "inprogress";
    if (s.includes("not started") || s.includes("backlog")) return "todo";
    return s || "todo";
  }

  return assignedToMe.map((it: any) => {
    const cvs = it.column_values || [];
    const statusText = cvs.find((c: any) => c.title === "Status")?.text;
    const dateCol = cvs.find((c: any) => /date|timeline/i.test(c.title || ""));
    return {
      name: it.name,
      description: `${it.boardName}${
        it.group?.title ? " · " + it.group.title : ""
      }`,
      dueDate: dateCol?.text || undefined,
      priority: "medium",
      status: mapStatus(statusText),
      category: it.boardName || "Work",
    };
  });
}

export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    let token = cookieStore.get("monday_token")?.value;
    if (!token) {
      // Attempt DB lookup using uid passed via query
      const uid = req.nextUrl.searchParams.get("uid") || undefined;
      if (uid) {
        try {
          const { adminDb } = await import("@/lib/firebase-admin");
          const snap = await adminDb.collection("users").doc(uid).get();
          token = snap.get("monday.accessToken") as string | undefined;
        } catch {}
      }
    }
    if (!token)
      return NextResponse.json({ error: "Not connected" }, { status: 400 });
    const tasks = await fetchMondayTasks(token);
    return NextResponse.json({ tasks });
  } catch (e) {
    console.error("monday tasks error", e);
    const message = e instanceof Error ? e.message : "Failed to fetch tasks";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
