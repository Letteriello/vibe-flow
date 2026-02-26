import * as fs from 'fs/promises';
import * as path from 'path';

export class WrapUpProfiler {
  private timers: Map<string, number> = new Map();
  private results: Map<string, number> = new Map();
  private logPath: string;

  constructor(baseDir: string = '.vibe-flow') {
    this.logPath = path.join(baseDir, 'wrap-up-perf.log');
  }

  startTimer(label: string): void {
    this.timers.set(label, Date.now());
  }

  endTimer(label: string): number | undefined {
    const startTime = this.timers.get(label);
    if (startTime === undefined) {
      return undefined;
    }
    const duration = Date.now() - startTime;
    this.results.set(label, duration);
    this.timers.delete(label);
    return duration;
  }

  async writeLog(): Promise<void> {
    const lines: string[] = [
      '=== Wrap-Up Performance Log ===',
      `Timestamp: ${new Date().toISOString()}`,
      '',
    ];

    const labels = ['Worker', 'LLM', 'DiskWrite'];
    for (const label of labels) {
      const duration = this.results.get(label);
      if (duration !== undefined) {
        lines.push(`${label}: ${duration}ms`);
      }
    }

    // Include any other timers that were recorded
    for (const [label, duration] of Array.from(this.results.entries())) {
      if (!labels.includes(label)) {
        lines.push(`${label}: ${duration}ms`);
      }
    }

    lines.push('');
    lines.push('================================');

    await fs.writeFile(this.logPath, lines.join('\n'), 'utf-8');
  }

  getResults(): Map<string, number> {
    return new Map(this.results);
  }
}
