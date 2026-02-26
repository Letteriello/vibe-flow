/**
 * Notification system configuration
 * Webhook URLs loaded from environment variables
 */

export interface WebhookConfig {
  slack?: string;
  discord?: string;
}

export interface NotificationPayload {
  text: string;
  blocks?: unknown[];
}

/**
 * Loads webhook URLs from environment variables
 */
export function loadWebhookConfig(): WebhookConfig {
  return {
    slack: process.env.PANTALK_SLACK_WEBHOOK,
    discord: process.env.PANTALK_DISCORD_WEBHOOK,
  };
}

/**
 * Check if any webhook is configured
 */
export function isWebhookConfigured(config: WebhookConfig): boolean {
  return !!(config.slack || config.discord);
}
