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
    const { webhookId } = await req.json();
    if (!webhookId)
      return NextResponse.json({ error: "missing webhookId" }, { status: 400 });
    const mutation = `mutation($id: ID!){ delete_webhook (id: $id) { id } }`;
    const r = await graphql<any>({
      query: mutation,
      variables: { id: webhookId },
    });
    return NextResponse.json({
      ok: true,
      deleted: r?.data?.delete_webhook?.id,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
