import { NextResponse } from "next/server";
import { getMicrosoftClientSecret } from "@/lib/microsoft";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  let microsoftSecretStatus: "missing" | "ok" | "looks_like_secret_id" = "missing";
  try {
    getMicrosoftClientSecret();
    microsoftSecretStatus = "ok";
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("looks like an Entra 'Secret ID'")) {
      microsoftSecretStatus = "looks_like_secret_id";
    } else {
      microsoftSecretStatus = "missing";
    }
  }

  return NextResponse.json({
    ok: true,
    now: new Date().toISOString(),
    hasMongoUrl: Boolean(process.env.MONGO_DB_URL || process.env.MONGODB_URI),
    hasHarvestClientId: Boolean(process.env.HARVEST_CLIENT_ID),
    hasHarvestClientSecret: Boolean(process.env.HARVEST_CLIENT_SECRET),
    hasMicrosoftClientId: Boolean(process.env.MICROSOFT_CLIENT_ID),
    microsoftClientSecretStatus: microsoftSecretStatus,
  });
}


