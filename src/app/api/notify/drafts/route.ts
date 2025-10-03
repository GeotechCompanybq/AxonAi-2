import { NextRequest, NextResponse } from "next/server";
import { EmailNotificationService } from "@/lib/email-notifications";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const to = String(body?.to || "").trim();
    const drafts = Array.isArray(body?.drafts) ? body.drafts : [];
    if (!to || drafts.length === 0)
      return NextResponse.json(
        { error: "to and drafts required" },
        { status: 400 }
      );

    const list = drafts
      .map(
        (d: any) =>
          `<li><strong>${d.spent_date}</strong> · ${Number(d.hours).toFixed(
            2
          )}h — ${d.notes || ""}</li>`
      )
      .join("");
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 640px; margin:auto;">
        <h2>Draft Timesheets Pending Approval</h2>
        <p>The following draft entries were created from Monday tasks and await your approval:</p>
        <ul>${list}</ul>
        <p>Open AxonAI → Timesheets to approve and submit.</p>
      </div>`;
    await EmailNotificationService.sendEmail({
      to,
      subject: "Draft timesheets pending approval",
      htmlBody: html,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to notify";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
