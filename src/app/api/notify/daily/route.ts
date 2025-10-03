import { NextRequest, NextResponse } from "next/server";
import { EmailNotificationService } from "@/lib/email-notifications";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const to = String(body?.to || "").trim();
    const worked = Number(body?.worked ?? 0);
    const remainingHours = Number(body?.remainingHours ?? 0);
    const remainingWorkDays = Number(body?.remainingWorkDays ?? 0);
    const neededPerRemainingDay = Number(body?.neededPerRemainingDay ?? 0);
    if (!to)
      return NextResponse.json({ error: "to required" }, { status: 400 });

    const html = `
      <div style="margin:0;padding:0">
        <div style="background:#0b1220;padding:24px 0;margin:0">
          <div style="max-width:640px;margin:0 auto;background:#0f172a;border:1px solid #1f2a44;border-radius:16px;overflow:hidden">
            <div style="background:linear-gradient(90deg, #06b6d4, #7c3aed);height:4px;width:100%"></div>
            <div style="padding:24px 24px 8px 24px">
              <div style="display:flex;align-items:center;gap:8px;color:#e2e8f0">
                <div style="width:10px;height:10px;border-radius:50%;background:#06b6d4"></div>
                <div style="font-size:18px;font-weight:700;letter-spacing:0.3px">AxonAI</div>
              </div>
              <h1 style="margin:16px 0 0 0;color:#f8fafc;font-size:22px">Daily Performance Summary</h1>
            </div>
            <div style="padding:16px 24px 24px 24px;color:#e2e8f0;line-height:1.6">
              <p><strong>Worked so far:</strong> ${worked.toFixed(2)}h</p>
              <p><strong>Remaining this week:</strong> ${remainingHours.toFixed(2)}h</p>
              <p><strong>Remaining work days:</strong> ${remainingWorkDays}</p>
              <p><strong>Needed per remaining day:</strong> ${neededPerRemainingDay.toFixed(2)}h</p>
              <div style="text-align:center;margin-top:24px"><a href="/analytics" style="background:#06b6d4;color:white;padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:600">Open Analytics</a></div>
            </div>
            <div style="padding:16px 24px;color:#64748b;font-size:12px;border-top:1px solid #1f2a44">This email was sent by AxonAI. Manage notifications in Settings.</div>
          </div>
        </div>
      </div>`;
    await EmailNotificationService.sendEmail({
      to,
      subject: "Your daily performance summary",
      htmlBody: html,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to send daily report";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
