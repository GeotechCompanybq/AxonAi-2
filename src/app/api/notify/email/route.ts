import { NextRequest, NextResponse } from "next/server";
import { EmailNotificationService } from "@/lib/email-notifications";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Two modes supported:
    // 1) Analytics notification: { to: string, notificationData: { type, data } }
    // 2) Raw email: { to, subject, htmlBody, textBody }
    const to: string | undefined = body?.to;
    if (!to || typeof to !== "string") {
      return NextResponse.json({ error: "Missing 'to'" }, { status: 400 });
    }

    if (body?.notificationData?.type) {
      await EmailNotificationService.sendAnalyticsNotification(
        to,
        body.notificationData
      );
      return NextResponse.json({ queued: true });
    }

    const subject: string | undefined = body?.subject;
    const htmlBody: string | undefined = body?.htmlBody;
    const textBody: string | undefined = body?.textBody;
    if (!subject || !htmlBody) {
      return NextResponse.json(
        { error: "Missing subject or htmlBody" },
        { status: 400 }
      );
    }

    await EmailNotificationService.sendEmail({
      to,
      subject,
      htmlBody,
      textBody,
    });
    return NextResponse.json({ queued: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to queue email";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
