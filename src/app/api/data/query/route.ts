import { NextRequest, NextResponse } from "next/server";
import { getDb, getCollectionNames } from "@/lib/mongo";
import { getAdminDb } from "@/lib/firebase-admin";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { uid, collection, query, limit = 100 } = body;

    if (!uid) {
      return NextResponse.json(
        { error: "Missing uid parameter" },
        { status: 400 }
      );
    }

    if (!collection) {
      return NextResponse.json(
        { error: "Missing collection parameter" },
        { status: 400 }
      );
    }

    const db = await getDb();
    const collections = getCollectionNames();
    let results: any[] = [];

    try {
      switch (collection) {
        case "tasks":
        case "user_tasks": {
          const filter: any = { uid };
          if (query) {
            // Support text search on name and description
            if (query.search) {
              filter.$or = [
                { name: { $regex: query.search, $options: "i" } },
                { description: { $regex: query.search, $options: "i" } },
              ];
            }
            if (query.status) filter.status = query.status;
            if (query.priority) filter.priority = query.priority;
            if (query.source) filter.source = query.source;
            if (query.category) filter.category = query.category;
            if (query.dueDateBefore) filter.dueDate = { ...filter.dueDate, $lte: query.dueDateBefore };
            if (query.dueDateAfter) filter.dueDate = { ...filter.dueDate, $gte: query.dueDateAfter };
          }
          results = await db
            .collection(collections.userTasks)
            .find(filter)
            .limit(limit)
            .sort({ updatedAt: -1 })
            .toArray();
          break;
        }

        case "timesheets": {
          const filter: any = { uid };
          if (query) {
            if (query.from) filter.spent_date = { ...filter.spent_date, $gte: query.from };
            if (query.to) filter.spent_date = { ...filter.spent_date, $lte: query.to };
            if (query.project) filter.project = query.project;
            if (query.task) filter.task = query.task;
            if (query.minHours) filter.hours = { ...filter.hours, $gte: Number(query.minHours) };
            if (query.maxHours) filter.hours = { ...filter.hours, $lte: Number(query.maxHours) };
          }
          results = await db
            .collection(collections.timesheets)
            .find(filter)
            .limit(limit)
            .sort({ spent_date: -1 })
            .toArray();
          break;
        }

        case "weekly_summaries": {
          const filter: any = { uid };
          if (query) {
            if (query.from) filter.from = query.from;
            if (query.to) filter.to = query.to;
          }
          results = await db
            .collection(collections.weeklySummaries)
            .find(filter)
            .limit(limit)
            .sort({ createdAt: -1 })
            .toArray();
          break;
        }

        case "timesheet_drafts": {
          const filter: any = { uid };
          if (query) {
            if (query.search) {
              filter.$or = [
                { notes: { $regex: query.search, $options: "i" } },
                { project: { $regex: query.search, $options: "i" } },
              ];
            }
            if (query.date) filter.date = query.date;
          }
          results = await db
            .collection(collections.timesheetDrafts)
            .find(filter)
            .limit(limit)
            .sort({ updatedAt: -1 })
            .toArray();
          break;
        }

        case "timesheet_mismatches": {
          const filter: any = { uid };
          if (query) {
            if (query.from) filter.from = query.from;
            if (query.to) filter.to = query.to;
            if (query.status) filter.status = query.status;
          }
          results = await db
            .collection(collections.timesheetMismatches)
            .find(filter)
            .limit(limit)
            .sort({ updatedAt: -1 })
            .toArray();
          break;
        }

        case "chat_sessions": {
          // Load from MongoDB
          const userDoc = await db.collection(collections.users).findOne({ uid });
          if (userDoc && (userDoc as any).axonChatSessions) {
            const sessions = (userDoc as any).axonChatSessions;
            results = Object.entries(sessions).map(([sessionId, data]: [string, any]) => ({
              sessionId,
              title: data.title || "AxonChat",
              updatedAt: data.updatedAt,
              messageCount: data.messages?.length || 0,
            }));
            results.sort((a, b) => b.updatedAt - a.updatedAt);
          }
          break;
        }

        default:
          return NextResponse.json(
            { error: `Unknown collection: ${collection}` },
            { status: 400 }
          );
      }

      return NextResponse.json({
        collection,
        count: results.length,
        results,
      });
    } catch (err) {
      console.error(`Error querying ${collection}:`, err);
      return NextResponse.json(
        { error: `Failed to query ${collection}` },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Data query error:", error);
    return NextResponse.json(
      { error: "Failed to query data" },
      { status: 500 }
    );
  }
}
