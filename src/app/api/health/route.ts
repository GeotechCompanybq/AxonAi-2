import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    now: new Date().toISOString(),
    hasMongoUrl: Boolean(process.env.MONGO_DB_URL || process.env.MONGODB_URI),
    hasHarvestClientId: Boolean(process.env.HARVEST_CLIENT_ID),
    hasHarvestClientSecret: Boolean(process.env.HARVEST_CLIENT_SECRET),
  });
}


