import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const MONDAY_TOKEN = process.env.MONDAY_APP_TOKEN || "";

const graphql = async <T = any>({
  query,
  variables,
}: {
  query: string;
  variables?: Record<string, any>;
}) => {
  const res = await fetch("https://api.monday.com/v2", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: MONDAY_TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = (await res.json()) as T & { errors?: any };
  if (!res.ok || (json as any).errors)
    throw new Error(JSON.stringify((json as any).errors || json));
  return json as T;
};

export async function POST(req: NextRequest) {
  try {
    const { boardId, url, peopleColumnId } = await req.json();
    if (!boardId || !url)
      return NextResponse.json(
        { error: "missing boardId or url" },
        { status: 400 }
      );

    const mutation = `mutation($boardId: ID!, $url: String!, $event: WebhookEventType!, $config: JSON!) {
      create_webhook(board_id: $boardId, url: $url, event: $event, config: $config) { id }
    }`;

    const create = async (event: string, config: any) =>
      graphql<any>({
        query: mutation,
        variables: {
          boardId,
          url,
          event,
          config: JSON.stringify(config || {}),
        },
      });

    const results: Array<{ id: string }> = [];

    // 1) People column changes (if provided)
    if (peopleColumnId) {
      const r = await create("change_column_value", {
        columnId: peopleColumnId,
      });
      const id = r?.data?.create_webhook?.id;
      if (id) results.push({ id });
    }
    // 2) Item created
    {
      const r = await create("create_item", {});
      const id = r?.data?.create_webhook?.id;
      if (id) results.push({ id });
    }

    return NextResponse.json({ ok: true, webhooks: results });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
