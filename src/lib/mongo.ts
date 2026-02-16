import { MongoClient, ServerApiVersion } from "mongodb";

let cachedClient: MongoClient | null = null;
let connectingPromise: Promise<MongoClient> | null = null;

export function getMongoUri(): string {
  const uri = process.env.MONGO_DB_URL || process.env.MONGODB_URI || "";
  if (!uri) {
    throw new Error("Missing MONGO_DB_URL environment variable");
  }
  return uri;
}

export async function getMongoClient(): Promise<MongoClient> {
  if (cachedClient) return cachedClient;
  if (connectingPromise) return connectingPromise;

  const uri = getMongoUri();
  const client = new MongoClient(uri, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    },
    // Use a modest pool suitable for serverless edge-like workloads too
    maxPoolSize: 10,
    serverSelectionTimeoutMS: Number(
      process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS || 45000
    ),
    connectTimeoutMS: Number(process.env.MONGO_CONNECT_TIMEOUT_MS || 45000),
  });

  connectingPromise = client
    .connect()
    .then((c) => {
      cachedClient = c;
      return c;
    })
    .finally(() => {
      connectingPromise = null;
    });

  return connectingPromise;
}

export async function getDb(dbName?: string) {
  const client = await getMongoClient();
  if (dbName && dbName.trim()) return client.db(dbName.trim());
  const envName = process.env.MONGODB_DB;
  if (envName && envName.trim()) return client.db(envName.trim());
  // No explicit name provided: use database from connection string (e.g., /Axonai)
  return client.db();
}

export function getCollectionNames() {
  return {
    userTasks: "user_tasks", // documents: { uid, id, ...task }
    timesheets: "timesheets", // documents: { uid, harvestId?, spent_date, hours, ... }
    timesheetDrafts: "timesheet_drafts", // documents: { uid, id, ...draft }
    users: "users", // optional mapping of user meta if needed
    weeklySummaries: "weekly_summaries", // documents: { uid, from, to, summary, hoursTotal, entriesCount, createdAt }
    timesheetSettings: "timesheet_settings", // documents: { uid, ...settings }
    timesheetMismatches: "timesheet_mismatches", // documents: { uid, from, to, status, mismatches[], createdAt, updatedAt }
    axonchatSettings: "axonchat_settings", // documents: { uid, tone, updatedAt }
  } as const;
}
