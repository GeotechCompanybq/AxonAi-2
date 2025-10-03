import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

export const runtime = "nodejs";

const MONDAY_SIGNING_SECRET = process.env.MONDAY_SIGNING_SECRET || "";
const MONDAY_TOKEN = process.env.MONDAY_APP_TOKEN || ""; // workspace/app token

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

function verifySignature(rawBody: string, signature: string | null): boolean {
  if (!signature || !MONDAY_SIGNING_SECRET) return false;
  const expected = crypto
    .createHmac("sha256", MONDAY_SIGNING_SECRET)
    .update(rawBody, "utf8")
    .digest("base64");
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected)
    );
  } catch {
    return false;
  }
}

async function getItem(itemId: number) {
  const q = `query($ids:[ID!]){ items(ids:$ids){ id name board{id name} column_values{id type text value} } }`;
  const data = await graphql<any>({ query: q, variables: { ids: itemId } });
  return data?.data?.items?.[0];
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const sig = req.headers.get("x-monday-signature");
  if (!verifySignature(raw, sig)) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  const evt = JSON.parse(raw) as any;
  const type: string = evt?.type;
  const itemId: number | undefined = evt?.itemId;

  const relevant =
    (type === "change_column_value" || type === "create_item") && itemId;
  if (!relevant) return NextResponse.json({ ok: true, ignored: true });

  const item = await getItem(itemId!);
  const peopleCols = (item?.column_values || []).filter(
    (c: any) =>
      c.type === "people" || /owner|assignee|person/i.test(String(c.id))
  );
  const assigned = new Set<string>();
  for (const c of peopleCols) {
    try {
      const v = c?.value ? JSON.parse(c.value) : null;
      const persons =
        v?.personsAndTeams
          ?.filter((x: any) => x.kind === "person")
          .map((x: any) => String(x.id)) || [];
      persons.forEach((p: string) => assigned.add(p));
    } catch {}
  }

  // TODO: persist or trigger your own logic here
  console.log("monday:webhook", {
    boardId: item?.board?.id,
    boardName: item?.board?.name,
    itemId: item?.id,
    itemName: item?.name,
    assignedUserIds: Array.from(assigned),
  });

  return NextResponse.json({
    ok: true,
    itemId: item?.id,
    assignedUserIds: Array.from(assigned),
  });
}
