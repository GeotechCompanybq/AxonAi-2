import { NextRequest, NextResponse } from "next/server";
import * as admin from "firebase-admin";
import "@/lib/firebase-admin"; // ensure default app is initialized
import { EmailNotificationService } from "@/lib/email-notifications";

type AnyDoc = admin.firestore.DocumentData & { id?: string };

function parseMaybeTimestamp(value: any): number | null {
  if (!value) return null;
  // Firestore Timestamp
  if (typeof value?.toDate === "function") {
    try {
      return value.toDate().getTime();
    } catch {}
  }
  // number (ms or seconds)
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 1e12 ? value : value * 1000;
  }
  // ISO string
  if (typeof value === "string") {
    const t = Date.parse(value);
    return Number.isFinite(t) ? t : null;
  }
  return null;
}

function getScheduledMs(doc: AnyDoc): number | null {
  // Common fields we might use for scheduling
  const candidates: any[] = [
    doc.sendAt,
    doc.scheduledAt,
    doc.scheduleAt,
    doc.send_after,
    doc.notBefore,
    doc.delivery?.sendAt,
    doc.delivery?.startTime,
  ];
  for (const v of candidates) {
    const ms = parseMaybeTimestamp(v);
    if (ms != null) return ms;
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const limit = Math.max(1, Math.min(500, Number(body?.limit ?? 100)));
    const dryRun = Boolean(body?.dryRun);

    const now = Date.now();
    const col = admin.firestore().collection("mail");

    // Fetch a window of docs; we'll filter client-side for unsent + due
    const snap = await col.limit(limit).get();
    const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as AnyDoc[];

    const toProcess = docs.filter((d) => {
      const sentAt = parseMaybeTimestamp(d.sentAt);
      if (sentAt != null) return false; // already sent
      const scheduledMs = getScheduledMs(d);
      if (scheduledMs == null) return true; // no schedule => send now
      return scheduledMs <= now;
    });

    let processed = 0;
    const results: Array<{ id: string; status: string }> = [];

    for (const d of toProcess) {
      const to = Array.isArray(d.to)
        ? d.to.join(",")
        : String(d.to || "").trim();
      const subject = d?.message?.subject || d?.subject || "";
      const html = d?.message?.html || d?.html || "";
      const text = d?.message?.text || d?.text || undefined;
      if (!to || !subject || (!html && !text)) {
        results.push({ id: String(d.id), status: "skipped: missing fields" });
        continue;
      }

      if (!dryRun) {
        await EmailNotificationService.sendEmail({
          to,
          subject,
          htmlBody: html || text,
          textBody: text,
        });
        await col.doc(String(d.id)).set(
          {
            sentAt: admin.firestore.FieldValue.serverTimestamp(),
            status: "sent",
            processedBy: "flush-queue",
          },
          { merge: true }
        );
      }
      processed += 1;
      results.push({ id: String(d.id), status: dryRun ? "dry-run" : "sent" });
    }

    return NextResponse.json({ processed, results });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to flush queue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
