import * as admin from "firebase-admin";
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

      // Create a document in the `mail` collection that works with
      // the Firebase Trigger Email extension.
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

    switch (notificationData.type) {
      case "burnout_risk":
        return `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; background-color: #f4f4f4;">
            <h2 style="color: #333;">Burnout Risk Notification</h2>
            <p style="color: #666;">Date: ${currentDate}</p>
            <div style="background-color: white; padding: 15px; border-radius: 5px; margin-top: 10px;">
              <h3>Risk Level: ${notificationData.data.burnoutRiskLevel?.toUpperCase()}</h3>
              <p>${notificationData.data.burnoutMessage}</p>
              <a href="/analytics" style="display: inline-block; background-color: #4CAF50; color: white; padding: 10px 15px; text-decoration: none; border-radius: 5px; margin-top: 10px;">View Detailed Analytics</a>
            </div>
          </div>
        `;

      case "efficiency_score":
        return `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; background-color: #f4f4f4;">
            <h2 style="color: #333;">Efficiency Score Update</h2>
            <p style="color: #666;">Date: ${currentDate}</p>
            <div style="background-color: white; padding: 15px; border-radius: 5px; margin-top: 10px;">
              <h3>Your Efficiency Score: ${notificationData.data.efficiencyScore}%</h3>
              <p>${notificationData.data.efficiencyMessage}</p>
              <a href="/analytics" style="display: inline-block; background-color: #2196F3; color: white; padding: 10px 15px; text-decoration: none; border-radius: 5px; margin-top: 10px;">Improve Your Efficiency</a>
            </div>
          </div>
        `;

      case "time_usage":
        return `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; background-color: #f4f4f4;">
            <h2 style="color: #333;">Time Usage Analysis</h2>
            <p style="color: #666;">Date: ${currentDate}</p>
            <div style="background-color: white; padding: 15px; border-radius: 5px; margin-top: 10px;">
              <h3>Weekly Time Distribution</h3>
              <p>${notificationData.data.timeUsageSummary}</p>
              <a href="/analytics" style="display: inline-block; background-color: #FF9800; color: white; padding: 10px 15px; text-decoration: none; border-radius: 5px; margin-top: 10px;">Optimize Your Time</a>
            </div>
          </div>
        `;

      case "task_progress":
        const progress = notificationData.data.taskProgressSummary;
        return `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; background-color: #f4f4f4;">
            <h2 style="color: #333;">Task Progress Overview</h2>
            <p style="color: #666;">Date: ${currentDate}</p>
            <div style="background-color: white; padding: 15px; border-radius: 5px; margin-top: 10px;">
              <h3>Total Tasks: ${progress?.total}</h3>
              <ul>
                <li>Todo: ${progress?.todo}</li>
                <li>In Progress: ${progress?.inProgress}</li>
                <li>Done: ${progress?.done}</li>
                <li>Blocked: ${progress?.blocked}</li>
              </ul>
              <a href="/tasks" style="display: inline-block; background-color: #9C27B0; color: white; padding: 10px 15px; text-decoration: none; border-radius: 5px; margin-top: 10px;">Manage Tasks</a>
            </div>
          </div>
        `;

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
