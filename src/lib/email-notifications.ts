import * as admin from "firebase-admin";
import "@/lib/firebase-admin"; // ensure default app is initialized
import nodemailer from "nodemailer";
import { format } from "date-fns";

interface EmailNotificationOptions {
  to: string;
  subject: string;
  htmlBody: string;
  textBody?: string;
}

interface AnalyticsNotificationData {
  type: "burnout_risk" | "efficiency_score" | "time_usage" | "task_progress";
  data: {
    burnoutRiskLevel?: string;
    burnoutMessage?: string;
    efficiencyScore?: number;
    efficiencyMessage?: string;
    timeUsageSummary?: string;
    taskProgressSummary?: {
      total: number;
      todo: number;
      inProgress: number;
      done: number;
      blocked: number;
    };
  };
}

export class EmailNotificationService {
  private static smtpTransport: nodemailer.Transporter | null = null;
  private static getSmtpTransport(): nodemailer.Transporter | null {
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASSWORD;
    const host = process.env.SMTP_HOST || "smtp.gmail.com";
    const port = Number(process.env.SMTP_PORT || 587);
    const secure =
      String(process.env.SMTP_SECURE || "").toLowerCase() === "true";
    if (!user || !pass) return null;
    if (!EmailNotificationService.smtpTransport) {
      EmailNotificationService.smtpTransport = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: { user, pass },
      });
    }
    return EmailNotificationService.smtpTransport;
  }
  /**
   * Send an email notification using Firebase Admin SDK
   * @param options Email notification configuration
   */
  static async sendEmail(options: EmailNotificationOptions): Promise<void> {
    try {
      // Validate email parameters
      if (!options.to || !options.subject || !options.htmlBody) {
        throw new Error("Missing required email parameters");
      }

      // If SMTP creds are provided, send directly via SMTP (Gmail)
      const smtp = EmailNotificationService.getSmtpTransport();
      if (smtp) {
        const from =
          process.env.SMTP_FROM ||
          process.env.SMTP_USER ||
          "no-reply@example.com";
        await smtp.sendMail({
          from,
          to: options.to,
          subject: options.subject,
          html: options.htmlBody,
          text:
            options.textBody ||
            EmailNotificationService.extractTextFromHtml(options.htmlBody),
        });
        console.log(`Sent email via SMTP to ${options.to}`);
        return;
      }

      // Fallback: queue in Firestore for the Trigger Email extension
      await admin
        .firestore()
        .collection("mail")
        .add({
          to: options.to,
          message: {
            subject: options.subject,
            html: options.htmlBody,
            text:
              options.textBody ||
              EmailNotificationService.extractTextFromHtml(options.htmlBody),
          },
        });

      console.log(`Queued email to ${options.to}`);
    } catch (error) {
      console.error("Failed to send email notification:", error);
      throw error;
    }
  }

  /**
   * Create email templates for different analytics notification types
   */
  static createAnalyticsNotificationTemplate(
    notificationData: AnalyticsNotificationData
  ): string {
    const currentDate = format(new Date(), "MMMM dd, yyyy");

    function resolveLogoUrl(): string | null {
      const explicit = process.env.AXON_LOGO_URL;
      if (explicit && explicit.trim().length > 0) return explicit.trim();
      const base =
        (process.env.NEXT_PUBLIC_APP_URL || "").trim() ||
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
      if (base) return `${base.replace(/\/$/, "")}/axon-logo.png`;
      return "/axon-logo.png";
    }

    function frame(
      content: string,
      opts?: {
        title?: string;
        accent?: string;
        ctaHref?: string;
        ctaText?: string;
      }
    ) {
      const accent = opts?.accent || "#06b6d4"; // cyan-500
      const cta =
        opts?.ctaHref && opts?.ctaText
          ? `<div style=\"text-align:center;margin-top:24px\"><a href=\"${opts.ctaHref}\" style=\"background:${accent};color:white;padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:600\">${opts.ctaText}</a></div>`
          : "";
      const logo = resolveLogoUrl();
      return `
        <div style="background:#0b1220;padding:24px 0;margin:0">
          <div style="max-width:640px;margin:0 auto;background:#0f172a;border:1px solid #1f2a44;border-radius:16px;overflow:hidden">
            <div style="background:linear-gradient(90deg, ${accent}, #7c3aed);height:4px;width:100%"></div>
            <div style="padding:24px 24px 8px 24px">
              <div style="display:flex;align-items:center;gap:8px;color:#e2e8f0">
                ${
                  logo
                    ? `<img src="${logo}" alt="AxonAI" style="height:24px;width:auto;display:block"/>`
                    : `<div style=\"width:10px;height:10px;border-radius:50%;background:${accent}\"></div><div style=\"font-size:18px;font-weight:700;letter-spacing:0.3px\">AxonAI</div>`
                }
              </div>
              ${
                opts?.title
                  ? `<h1 style="margin:16px 0 0 0;color:#f8fafc;font-size:22px">${opts.title}</h1>`
                  : ""
              }
              <p style="margin:6px 0 0 0;color:#94a3b8;font-size:12px">${currentDate}</p>
            </div>
            <div style="padding:16px 24px 24px 24px;color:#e2e8f0;line-height:1.6">${content}</div>
            ${cta}
            <div style="padding:16px 24px;color:#64748b;font-size:12px;border-top:1px solid #1f2a44">This email was sent by AxonAI. Manage notifications in Settings.</div>
          </div>
        </div>
      `;
    }

    switch (notificationData.type) {
      case "burnout_risk":
        return frame(
          `
          <h2 style="margin:0 0 10px 0;color:#fda4af">Burnout Risk</h2>
          <p><strong>Risk Level:</strong> ${
            notificationData.data.burnoutRiskLevel?.toUpperCase() || "UNKNOWN"
          }</p>
          <p>${
            notificationData.data.burnoutMessage ||
            "Please review your workload and consider short breaks."
          }</p>
        `,
          {
            title: "Wellness alert",
            accent: "#ef4444",
            ctaHref: "/analytics",
            ctaText: "View analytics",
          }
        );

      case "efficiency_score":
        return frame(
          `
          <h2 style="margin:0 0 10px 0;color:#93c5fd">Efficiency Score</h2>
          <p style="font-size:32px;margin:0 0 8px 0;font-weight:800;color:#f8fafc">${
            notificationData.data.efficiencyScore ?? 0
          }%</p>
          <p>${
            notificationData.data.efficiencyMessage ||
            "Keep pushing towards your weekly goal."
          }</p>
        `,
          {
            title: "Performance update",
            accent: "#3b82f6",
            ctaHref: "/analytics",
            ctaText: "Improve efficiency",
          }
        );

      case "time_usage":
        return frame(
          `
          <h2 style="margin:0 0 10px 0;color:#5eead4">Time Usage</h2>
          <p>${
            notificationData.data.timeUsageSummary ||
            "Your weekly distribution is ready."
          }</p>
        `,
          {
            title: "Time analysis",
            accent: "#06b6d4",
            ctaHref: "/analytics",
            ctaText: "Optimize time",
          }
        );

      case "task_progress":
        const progress = notificationData.data.taskProgressSummary;
        return frame(
          `
          <h2 style="margin:0 0 10px 0;color:#c4b5fd">Task Progress</h2>
          <ul style="margin:0;padding-left:18px">
            <li>Total: ${progress?.total ?? 0}</li>
            <li>Todo: ${progress?.todo ?? 0}</li>
            <li>In Progress: ${progress?.inProgress ?? 0}</li>
            <li>Done: ${progress?.done ?? 0}</li>
            <li>Blocked: ${progress?.blocked ?? 0}</li>
          </ul>
        `,
          {
            title: "Tasks overview",
            accent: "#7c3aed",
            ctaHref: "/tasks",
            ctaText: "Open tasks",
          }
        );

      default:
        throw new Error("Invalid analytics notification type");
    }
  }

  /**
   * Send analytics notification
   */
  static async sendAnalyticsNotification(
    recipientEmail: string,
    notificationData: AnalyticsNotificationData
  ): Promise<void> {
    const htmlBody = this.createAnalyticsNotificationTemplate(notificationData);

    await this.sendEmail({
      to: recipientEmail,
      subject: `${notificationData.type
        .replace("_", " ")
        .toUpperCase()} Notification`,
      htmlBody: htmlBody,
      textBody: this.extractTextFromHtml(htmlBody),
    });
  }

  /**
   * Extract plain text from HTML for text-only notifications
   */
  private static extractTextFromHtml(html: string): string {
    return html
      .replace(/<[^>]*>/g, "") // Remove HTML tags
      .replace(/\s+/g, " ") // Replace multiple spaces with single space
      .trim();
  }
}
