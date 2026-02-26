/**
 * PantalkDaemon - Notification daemon for sending webhook notifications
 */

import { loadWebhookConfig, isWebhookConfigured, WebhookConfig, NotificationPayload } from './config.js';

export interface ApprovalRequest {
  diff: string;
  description?: string;
}

export class PantalkDaemon {
  private config: WebhookConfig;

  constructor(config?: WebhookConfig) {
    this.config = config ?? loadWebhookConfig();
  }

  /**
   * Send a POST request to the configured webhook
   */
  private async sendWebhook(payload: NotificationPayload, webhookUrl: string): Promise<void> {
    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        console.warn(`[Pantalk] Webhook returned status ${response.status}`);
      }
    } catch {
      // Silently ignore network errors when webhook is not available
      console.debug('[Pantalk] Webhook not available, skipping notification');
    }
  }

  /**
   * Send to all configured webhooks
   */
  private async notifyAll(payload: NotificationPayload): Promise<void> {
    if (!isWebhookConfigured(this.config)) {
      console.debug('[Pantalk] No webhooks configured, skipping notification');
      return;
    }

    const promises: Promise<void>[] = [];

    if (this.config.slack) {
      promises.push(this.sendWebhook(payload, this.config.slack));
    }

    if (this.config.discord) {
      promises.push(this.sendWebhook(payload, this.config.discord));
    }

    await Promise.all(promises);
  }

  /**
   * Notify success message
   */
  async notifySuccess(msg: string): Promise<void> {
    const payload: NotificationPayload = {
      text: `✅ Success: ${msg}`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `✅ *Success*\n${msg}`,
          },
        },
      ],
    };

    await this.notifyAll(payload);
  }

  /**
   * Notify failure/error message
   */
  async notifyFailure(err: string | Error): Promise<void> {
    const errorMessage = err instanceof Error ? err.message : err;

    const payload: NotificationPayload = {
      text: `❌ Failure: ${errorMessage}`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `❌ *Failure*\n${errorMessage}`,
          },
        },
      ],
    };

    await this.notifyAll(payload);
  }

  /**
   * Request approval for a diff
   */
  async requireApproval(diff: string): Promise<void> {
    const payload: NotificationPayload = {
      text: `🔔 Approval Required\n\`\`\`\n${diff.slice(0, 1500)}\n\`\`\``,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `🔔 *Approval Required*\nA change requires your approval.`,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `\`\`\`\n${diff.slice(0, 1500)}${diff.length > 1500 ? '\n...' : ''}\n\`\`\``,
          },
        },
      ],
    };

    await this.notifyAll(payload);
  }
}
