import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { getDb, getCollectionNames } from "@/lib/mongo";

type OrgOverviewMetrics = {
  ticketsClosed: {
    value: number;
    changePct: number;
  };
  utilizationRate: {
    valuePct: number;
    targetPct: number;
  };
  onTimeCompletion: {
    valuePct: number;
    targetPct: number;
  };
  avgResponseTimeHours: {
    value: number | null;
    targetHours: number;
  };
  changeRequestsShare: {
    valuePct: number;
    changePct: number;
  };
  categories: Array<{ name: string; count: number }>;
};

function parseRange(req: NextRequest): { from: Date; to: Date } {
  const url = new URL(req.url);
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");

  const to = toParam ? new Date(toParam) : new Date();
  const from = fromParam
    ? new Date(fromParam)
    : new Date(to.getTime() - 29 * 86400000); // last 30 days

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    const safeTo = new Date();
    const safeFrom = new Date(safeTo.getTime() - 29 * 86400000);
    return { from: safeFrom, to: safeTo };
  }

  if (from > to) return { from: to, to: from };
  return { from, to };
}

function pctChange(current: number, previous: number): number {
  if (previous === 0) return current === 0 ? 0 : 100;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function isWorkday(d: Date): boolean {
  const day = d.getUTCDay();
  return day !== 0 && day !== 6;
}

function countWorkdays(from: Date, to: Date): number {
  const start = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()));
  let days = 0;
  for (
    let d = new Date(start.getTime());
    d <= end;
    d = new Date(d.getTime() + 86400000)
  ) {
    if (isWorkday(d)) days += 1;
  }
  return Math.max(days, 1);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const { orgId } = await params;
    const authHeader = req.headers.get("authorization") || "";
    const match = authHeader.match(/^Bearer (.+)$/i);
    if (!match) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const decoded = await adminAuth.verifyIdToken(match[1]);
    const requestingUid = decoded.uid;

    // Ensure the user is a member of this org
    const memberDoc = await adminDb
      .collection("orgs")
      .doc(orgId)
      .collection("members")
      .doc(requestingUid)
      .get();
    if (!memberDoc.exists) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Collect all member uids for org-scoped aggregation
    const membersSnap = await adminDb
      .collection("orgs")
      .doc(orgId)
      .collection("members")
      .get();
    const memberUids = membersSnap.docs.map((d) => d.id).filter(Boolean);
    if (memberUids.length === 0) {
      const empty: OrgOverviewMetrics = {
        ticketsClosed: { value: 0, changePct: 0 },
        utilizationRate: { valuePct: 0, targetPct: 80 },
        onTimeCompletion: { valuePct: 0, targetPct: 90 },
        avgResponseTimeHours: { value: null, targetHours: 4 },
        changeRequestsShare: { valuePct: 0, changePct: 0 },
        categories: [],
      };
      return NextResponse.json({ metrics: empty });
    }

    const { from, to } = parseRange(req);
    const periodMs = to.getTime() - from.getTime();
    const prevTo = new Date(from.getTime() - 1);
    const prevFrom = new Date(prevTo.getTime() - periodMs);

    const fromIso = from.toISOString();
    const toIso = to.toISOString();
    const prevFromIso = prevFrom.toISOString();
    const prevToIso = prevTo.toISOString();

    const fromYmd = fromIso.slice(0, 10);
    const toYmd = toIso.slice(0, 10);
    const prevFromYmd = prevFromIso.slice(0, 10);
    const prevToYmd = prevToIso.slice(0, 10);

    const db = await getDb();
    const { userTasks, timesheets } = getCollectionNames();

    // --- Tickets closed (status done) ---
    const ticketsCursor = db.collection(userTasks).find(
      {
        uid: { $in: memberUids },
        status: "done",
        updatedAt: { $gte: fromIso, $lte: toIso },
      },
      {
        projection: {
          category: 1,
          dueDate: 1,
          updatedAt: 1,
          name: 1,
        },
      }
    );
    const tickets = await ticketsCursor.toArray();

    const prevTicketsClosed = await db.collection(userTasks).countDocuments({
      uid: { $in: memberUids },
      status: "done",
      updatedAt: { $gte: prevFromIso, $lte: prevToIso },
    });

    const ticketsClosed = tickets.length;
    const ticketsClosedChange = pctChange(ticketsClosed, prevTicketsClosed);

    // Tickets by category
    const categoryCounts: Record<string, number> = {};
    for (const t of tickets) {
      const rawName: string | null =
        (t as any)?.category ||
        ((t as any)?.name && String((t as any).name)) ||
        null;
      const cat = rawName ? String(rawName) : "Uncategorized";
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    }
    const categories = Object.entries(categoryCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));

    // Change requests share: tasks whose category or name mentions "change"
    let changeCurrent = 0;
    for (const t of tickets) {
      const cat = String((t as any)?.category || "").toLowerCase();
      const name = String((t as any)?.name || "").toLowerCase();
      if (cat.includes("change") || name.includes("change request")) {
        changeCurrent += 1;
      }
    }
    const prevChange = await db.collection(userTasks).countDocuments({
      uid: { $in: memberUids },
      status: "done",
      updatedAt: { $gte: prevFromIso, $lte: prevToIso },
      $or: [
        { category: /change/i },
        { name: /change request/i },
      ],
    });
    const changeShare = ticketsClosed > 0 ? (changeCurrent / ticketsClosed) * 100 : 0;
    const changeSharePrev =
      prevTicketsClosed > 0 ? (prevChange / prevTicketsClosed) * 100 : 0;
    const changeShareDelta = pctChange(changeShare, changeSharePrev);

    // On-time completion: done tickets with dueDate where updatedAt <= dueDate
    let dueCount = 0;
    let onTimeCount = 0;
    for (const t of tickets) {
      const dueRaw = (t as any)?.dueDate;
      const updatedRaw = (t as any)?.updatedAt;
      if (!dueRaw || !updatedRaw) continue;
      const due = new Date(dueRaw);
      const updated = new Date(updatedRaw);
      if (Number.isNaN(due.getTime()) || Number.isNaN(updated.getTime())) continue;
      dueCount += 1;
      if (updated.getTime() <= due.getTime()) onTimeCount += 1;
    }
    const onTimePct = dueCount > 0 ? (onTimeCount / dueCount) * 100 : 0;

    // Avg response time: rough measure based on updatedAt - createdAt if present
    const responseDiffs: number[] = [];
    for (const t of tickets) {
      const createdRaw = (t as any)?.createdAt;
      const updatedRaw = (t as any)?.updatedAt;
      if (!createdRaw || !updatedRaw) continue;
      const created = new Date(createdRaw);
      const updated = new Date(updatedRaw);
      if (Number.isNaN(created.getTime()) || Number.isNaN(updated.getTime())) continue;
      const diffMs = Math.max(0, updated.getTime() - created.getTime());
      responseDiffs.push(diffMs);
    }
    const avgResponseHours =
      responseDiffs.length > 0
        ? responseDiffs.reduce((a, b) => a + b, 0) /
          responseDiffs.length /
          3600000
        : null;

    // Utilization: Harvest timesheets vs simple capacity model
    const timesCursor = db.collection(timesheets).find({
      uid: { $in: memberUids },
      spent_date: { $gte: fromYmd, $lte: toYmd },
    });
    const timeEntries = await timesCursor.toArray();
    const totalHours = timeEntries.reduce(
      (sum, e) => sum + (Number((e as any)?.hours) || 0),
      0
    );

    const prevTimesHours = await db
      .collection(timesheets)
      .aggregate([
        {
          $match: {
            uid: { $in: memberUids },
            spent_date: { $gte: prevFromYmd, $lte: prevToYmd },
          },
        },
        {
          $group: {
            _id: null,
            hours: { $sum: { $toDouble: "$hours" } },
          },
        },
      ])
      .toArray()
      .then((docs) => (docs[0]?.hours as number | undefined) ?? 0)
      .catch(() => 0);

    const workdays = countWorkdays(from, to);
    const hoursCapacity = memberUids.length * workdays * 8;
    const utilizationPct =
      hoursCapacity > 0 ? (totalHours / hoursCapacity) * 100 : 0;
    const utilizationPrevPct =
      hoursCapacity > 0 ? (prevTimesHours / hoursCapacity) * 100 : 0;
    const utilizationChange = pctChange(utilizationPct, utilizationPrevPct);

    const metrics: OrgOverviewMetrics = {
      ticketsClosed: {
        value: ticketsClosed,
        changePct: ticketsClosedChange,
      },
      utilizationRate: {
        valuePct: utilizationPct,
        targetPct: 80,
      },
      onTimeCompletion: {
        valuePct: onTimePct,
        targetPct: 90,
      },
      avgResponseTimeHours: {
        value: avgResponseHours,
        targetHours: 4,
      },
      changeRequestsShare: {
        valuePct: changeShare,
        changePct: changeShareDelta,
      },
      categories,
    };

    return NextResponse.json({ metrics });
  } catch (error) {
    console.error("Org overview metrics error", error);
    return NextResponse.json(
      { error: "Failed to compute org overview metrics" },
      { status: 500 }
    );
  }
}

