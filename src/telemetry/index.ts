// Telemetry Collector - Tracks performance metrics for phase transitions
import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import type { MetricEvent } from '../types.js';

const TELEMETRY_FILE = join(homedir(), '.vibe-flow', 'telemetry.json');

export class TelemetryCollector {
  private events: MetricEvent[] = [];
  private timers: Map<string, number> = new Map();
  private initialized: boolean = false;

  constructor() {
    this.ensureTelemetryDirectory();
  }

  private async ensureTelemetryDirectory(): Promise<void> {
    const telemetryDir = dirname(TELEMETRY_FILE);
    try {
      await fs.mkdir(telemetryDir, { recursive: true });
    } catch (error) {
      console.error('[TelemetryCollector] Failed to create telemetry directory:', error);
    }
  }

  /**
   * Load existing telemetry events from disk
   */
  async load(): Promise<void> {
    try {
      const content = await fs.readFile(TELEMETRY_FILE, 'utf-8');
      this.events = JSON.parse(content);
      this.initialized = true;
    } catch (error) {
      // File doesn't exist yet - start with empty array
      this.events = [];
      this.initialized = true;
    }
  }

  /**
   * Start a timer for a given correlation ID
   */
  startTimer(correlationId: string): void {
    this.timers.set(correlationId, Date.now());
  }

  /**
   * Stop a timer and record a metric event
   */
  async recordMetric(
    name: string,
    correlationId: string,
    success: boolean,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const startTime = this.timers.get(correlationId);
    const durationMs = startTime ? Date.now() - startTime : 0;

    const event: MetricEvent = {
      name,
      durationMs,
      success,
      correlationId,
      timestamp: new Date().toISOString(),
      metadata
    };

    this.events.push(event);
    this.timers.delete(correlationId);

    await this.persist();
  }

  /**
   * Record a metric event with explicit duration
   */
  async recordMetricExplicit(
    name: string,
    durationMs: number,
    correlationId: string,
    success: boolean,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const event: MetricEvent = {
      name,
      durationMs,
      success,
      correlationId,
      timestamp: new Date().toISOString(),
      metadata
    };

    this.events.push(event);
    await this.persist();
  }

  /**
   * Persist events to disk
   */
  private async persist(): Promise<void> {
    const telemetryDir = dirname(TELEMETRY_FILE);
    const tempFile = TELEMETRY_FILE + '.tmp';

    // Ensure directory exists
    try {
      await fs.mkdir(telemetryDir, { recursive: true });
    } catch {
      // Directory may already exist
    }

    try {
      await fs.writeFile(tempFile, JSON.stringify(this.events, null, 2), 'utf-8');
      try {
        await fs.rename(tempFile, TELEMETRY_FILE);
      } catch (renameErr) {
        // Windows fallback: copy file and delete temp
        const err = renameErr as { code?: string };
        if (err.code === 'EXDEV' || err.code === 'ENOENT') {
          await fs.copyFile(tempFile, TELEMETRY_FILE);
          await fs.unlink(tempFile);
        } else {
          throw renameErr;
        }
      }
    } catch (error) {
      console.error('[TelemetryCollector] Failed to persist telemetry:', error);
    }
  }

  /**
   * Get all recorded events
   */
  getEvents(): MetricEvent[] {
    return [...this.events];
  }

  /**
   * Get events filtered by name
   */
  getEventsByName(name: string): MetricEvent[] {
    return this.events.filter(e => e.name === name);
  }

  /**
   * Get average duration for a given metric name
   */
  getAverageDuration(name: string): number {
    const filtered = this.getEventsByName(name);
    if (filtered.length === 0) return 0;

    const total = filtered.reduce((sum, e) => sum + e.durationMs, 0);
    return Math.round(total / filtered.length);
  }

  /**
   * Clear all telemetry events
   */
  async clear(): Promise<void> {
    this.events = [];
    await this.persist();
  }
}

// Singleton instance
let telemetryCollector: TelemetryCollector | null = null;

export function getTelemetryCollector(): TelemetryCollector {
  if (!telemetryCollector) {
    telemetryCollector = new TelemetryCollector();
  }
  return telemetryCollector;
}
