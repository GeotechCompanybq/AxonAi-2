import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb, getCollectionNames } from "@/lib/mongo";

export async function fetchMondayTasks(token: string) {
  // GraphQL helpers and queries
  async function graphql<T = any>(
    query: string,
    variables: Record<string, any>
  ) {
    const res = await fetch("https://api.monday.com/v2", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ query, variables }),
    });
    const json = await res.json();
    if (!res.ok || json.errors) {
      throw new Error(JSON.stringify(json.errors || json));
    }
    return json as T;
  }

  // 1) Get current user id
  const meQuery = `query { me { id name email } }`;
  const meJson = await graphql(meQuery, {});
  const meId = String(meJson?.data?.me?.id || "");

  // 2) Page through all boards using boards_page (fallback to boards if needed)
  const boards: Array<{ id: string; name: string }> = [];
  const boardsPageQuery = `query($limit:Int!,$cursor:String){
    boards_page(limit: $limit, cursor: $cursor) {
      cursor
      boards { id name }
    }
  }`;
  let bCursor: string | null = null;
  let supportsBoardsPage = true;
  try {
    do {
      const json: any = await graphql(boardsPageQuery, {
        limit: 50,
        cursor: bCursor,
      });
      const page = json?.data?.boards_page;
      const pageBoards = page?.boards || [];
      for (const b of pageBoards)
        boards.push({ id: String(b.id), name: String(b.name) });
      bCursor = page?.cursor || null;
    } while (bCursor);
  } catch (e) {
    supportsBoardsPage = false;
  }
  if (!supportsBoardsPage) {
    const boardsQuery = `query($limit:Int!){ boards(limit:$limit){ id name } }`;
    const json: any = await graphql(boardsQuery, { limit: 200 });
    const arr = json?.data?.boards || [];
    for (const b of arr)
      boards.push({ id: String(b.id), name: String(b.name) });
  }

  // 3) For each board, page through all items via items_page
  const allItems: any[] = [];
  const itemsPageQuery = `query($boardId:ID!,$limit:Int!,$cursor:String){
    boards (ids: [$boardId]) {
      id
      name
      columns { id title type }
      items_page(limit:$limit, cursor:$cursor){
        cursor
        items{
          id
          name
          state
          group { id title }
          column_values { id text value type }
        }
      }
    }
  }`;
  for (const b of boards) {
    let iCursor: string | null = null;
    do {
      const json: any = await graphql(itemsPageQuery, {
        boardId: b.id,
        limit: 200,
        cursor: iCursor,
      });
      const board = (json?.data?.boards || [])[0];
      const page = board?.items_page;
      const items = page?.items || [];
      for (const it of items) {
        allItems.push({
          ...it,
          boardName: b.name,
          boardColumns: board?.columns || [],
        });
      }
      iCursor = page?.cursor || null;
    } while (iCursor);
  }

  const items = allItems;
  // Keep only items assigned to the current user via a People column
  const assignedToMe = items.filter((it: any) => {
    const cvs = it.column_values || [];
    const columns: Array<any> = it.boardColumns || [];
    const getMeta = (colId: string) => columns.find((c: any) => c.id === colId);
    for (const cv of cvs) {
      const meta = getMeta(cv.id);
      const isPeople =
        cv?.type === "people" ||
        meta?.type === "people" ||
        /people|assignee|owner/i.test(String(meta?.title || cv.id));
      if (!isPeople) continue;
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
  // Further filter: must have a due date (Date or Timeline)
  const withDueDate = assignedToMe.filter((it: any) => {
    const cvs = it.column_values || [];
    const columns: Array<any> = it.boardColumns || [];
    const getMeta = (colId: string) => columns.find((c: any) => c.id === colId);
    return cvs.some((c: any) => {
      const meta = getMeta(c.id);
      const isDateLike =
        c?.type === "date" ||
        c?.type === "timeline" ||
        meta?.type === "date" ||
        meta?.type === "timeline" ||
        /date|timeline/i.test(String(meta?.title || c.id));
      return isDateLike && (c.text?.length || 0) > 0;
    });
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

  // Helper to page through ALL updates for an item
  function stripHtml(html: string): string {
    try {
      return String(html || "")
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    } catch {
      return html;
    }
  }

  async function fetchAllUpdates(itemId: string): Promise<string[]> {
    const query = `query($id:[ID!],$limit:Int!,$page:Int!){
      items(ids:$id){ updates(limit:$limit,page:$page){ id text_body body replies{ text_body } } }
    }`;
    const comments: string[] = [];
    let page = 1;
    const limit = 100;
    for (; page <= 50; page++) {
      let json: any;
      try {
        json = await graphql(query, { id: itemId, limit, page });
      } catch (e: any) {
        // If the workspace/app lacks updates:read, silently skip comments
        const msg = String(e?.message || "");
        if (msg.includes("UNAUTHORIZED_FIELD_OR_TYPE")) return comments;
        throw e;
      }
      const ups = json?.data?.items?.[0]?.updates || [];
      if (!Array.isArray(ups) || ups.length === 0) break;
      for (const u of ups) {
        const raw = String(u?.text_body || "").trim();
        const html = String(u?.body || "").trim();
        const base = raw || stripHtml(html);
        if (base) comments.push(base);
        const reps = Array.isArray(u?.replies) ? u.replies : [];
        for (const r of reps) {
          const rtext = String(r?.text_body || "").trim();
          if (rtext) comments.push(rtext);
        }
      }
    }
    return comments;
  }

  const results: any[] = [];
  for (const it of withDueDate) {
    const cvs = it.column_values || [];
    const columns: Array<any> = it.boardColumns || [];
    const getMeta = (colId: string) => columns.find((c: any) => c.id === colId);
    const statusCv = cvs.find((c: any) => {
      const meta = getMeta(c.id);
      return (
        c?.type === "status" ||
        meta?.type === "status" ||
        /status/i.test(String(meta?.title || c.id))
      );
    });
    const statusText = statusCv?.text;
    const dateCol = cvs.find((c: any) => {
      const meta = getMeta(c.id);
      return (
        c?.type === "date" ||
        c?.type === "timeline" ||
        meta?.type === "date" ||
        meta?.type === "timeline" ||
        /date|timeline/i.test(String(meta?.title || c.id))
      );
    });
    let comments: string[] = [];
    const allowUpdates = /^(1|true|yes)$/i.test(
      process.env.MONDAY_READ_UPDATES || ""
    );
    if (allowUpdates) {
      try {
        comments = await fetchAllUpdates(String(it.id));
      } catch {}
    }
    results.push({
      name: it.name,
      description: `${it.boardName}${
        it.group?.title ? " · " + it.group.title : ""
      }`,
      dueDate: dateCol?.text || undefined,
      priority: "medium",
      status: mapStatus(statusText),
      category: it.boardName || "Work",
      comments,
    });
  }
  return results;
}

export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    let token: string | undefined;
    // Optionally scope to a user id for storing tasks
    const uid = req.nextUrl.searchParams.get("uid") || undefined;
    const doSync = req.nextUrl.searchParams.get("sync") === "1";

    // Always prefer Mongo when uid is present
    if (uid) {
      try {
        const db = await getDb();
        const { users } = getCollectionNames();
        const doc = await db.collection(users).findOne({ uid });
        token = (doc as any)?.monday?.accessToken as string | undefined;
      } catch {}
      // Fallback to Firestore if not in Mongo
      if (!token) {
        try {
          const { adminDb } = await import("@/lib/firebase-admin");
          const snap = await adminDb.collection("users").doc(uid).get();
          token = snap.get("monday.accessToken") as string | undefined;
        } catch {}
      }
      // Final fallback to cookie
      if (!token) {
        token = cookieStore.get("monday_token")?.value;
      }
    } else {
      // No uid: fall back to cookie only
      token = cookieStore.get("monday_token")?.value;
    }
    if (!token)
      return NextResponse.json({ error: "Not connected" }, { status: 400 });
    const tasks = await fetchMondayTasks(token);
    // Upsert tasks into Mongo if uid provided and sync requested
    if (uid && doSync) {
      try {
        const db = await getDb();
        const { userTasks } = getCollectionNames();
        const ops = tasks.map((t: any) => {
          const key = `${t.name}|${t.dueDate || ""}|monday`;
          const id = Buffer.from(key).toString("base64").replace(/=+$/g, "");
          const doc = {
            uid,
            id,
            source: "monday",
            name: t.name,
            description: t.description,
            dueDate: t.dueDate || null,
            priority: t.priority,
            status: t.status,
            category: t.category,
            comments: t.comments || [],
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
        if (ops.length)
          await db.collection(userTasks).bulkWrite(ops as any, {
            ordered: false,
          });
      } catch (e) {
        console.error("Failed to upsert tasks", e);
      }
    }
    return NextResponse.json({ tasks });
  } catch (e) {
    console.error("monday tasks error", e);
    const message = e instanceof Error ? e.message : "Failed to fetch tasks";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
