// Wrap-up Handler - Async background processing for MCP wrap-up tool
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { join } from 'path';
import { ConfigManager } from '../config/index.js';
import { StateMachine } from '../state-machine/index.js';
import { WrapUpExecutor } from '../wrap-up/index.js';

export interface WrapUpJob {
  job_id: string;
  status: 'processing' | 'completed' | 'failed';
  mode: string;
  force: boolean;
  startedAt: string;
  completedAt?: string;
  result?: any;
  error?: string;
}

/**
 * Manages background wrap-up jobs
 */
export class WrapUpHandler {
  private jobs: Map<string, WrapUpJob> = new Map();
  private configManager: ConfigManager;
  private stateMachine: StateMachine;
  private wrapUpExecutor: WrapUpExecutor;
  private jobsFilePath: string;

  constructor(configManager: ConfigManager, stateMachine: StateMachine) {
    this.configManager = configManager;
    this.stateMachine = stateMachine;
    this.wrapUpExecutor = new WrapUpExecutor(configManager, stateMachine);
    this.jobsFilePath = join(process.cwd(), '.vibe-flow', 'wrap-up-jobs.json');
  }

  /**
   * Start a wrap-up job in background and return immediately
   */
  async startJob(
    mode: string = 'full',
    force: boolean = false
  ): Promise<{ status: string; job_id: string }> {
    const jobId = randomUUID();

    const job: WrapUpJob = {
      job_id: jobId,
      status: 'processing',
      mode,
      force,
      startedAt: new Date().toISOString()
    };

    this.jobs.set(jobId, job);
    this.saveJobToFile(job);

    // Execute wrap-up in background (don't await)
    this.executeBackgroundJob(jobId, mode, force);

    return {
      status: 'processing',
      job_id: jobId
    };
  }

  /**
   * Execute wrap-up in background without blocking
   */
  private async executeBackgroundJob(
    jobId: string,
    mode: string,
    force: boolean
  ): Promise<void> {
    try {
      // Wrap-up is always enabled - no check needed
      // Execute the wrap-up
      const result = await this.wrapUpExecutor.execute(mode, force);
      await this.wrapUpExecutor.saveReport(result);

      const job = this.jobs.get(jobId);
      if (job) {
        job.status = 'completed';
        job.completedAt = new Date().toISOString();
        job.result = {
          success: result.success,
          phasesExecuted: result.phasesExecuted,
          shipIt: result.shipIt,
          rememberIt: result.rememberIt,
          selfImprove: result.selfImprove,
          publishIt: result.publishIt,
          errors: result.errors,
          message: result.success ? 'Wrap-up completed successfully' : 'Wrap-up completed with errors'
        };
        this.jobs.set(jobId, job);
        this.saveJobToFile(job);
      }
    } catch (error: any) {
      const job = this.jobs.get(jobId);
      if (job) {
        job.status = 'failed';
        job.error = error.message;
        job.completedAt = new Date().toISOString();
        this.jobs.set(jobId, job);
        this.saveJobToFile(job);
      }
    }
  }

  /**
   * Get job status by ID
   */
  getJobStatus(jobId: string): WrapUpJob | null {
    return this.jobs.get(jobId) || null;
  }

  /**
   * Get all jobs
   */
  getAllJobs(): WrapUpJob[] {
    return Array.from(this.jobs.values());
  }

  /**
   * Get only processing jobs
   */
  getProcessingJobs(): WrapUpJob[] {
    return Array.from(this.jobs.values()).filter(job => job.status === 'processing');
  }

  /**
   * Save job to persistent storage
   */
  private async saveJobToFile(job: WrapUpJob): Promise<void> {
    try {
      const dir = join(process.cwd(), '.vibe-flow');
      await fs.mkdir(dir, { recursive: true });

      // Load existing jobs
      let jobs: Record<string, WrapUpJob> = {};
      try {
        const content = await fs.readFile(this.jobsFilePath, 'utf-8');
        jobs = JSON.parse(content);
      } catch {
        // File doesn't exist yet
      }

      jobs[job.job_id] = job;

      // Keep only last 50 jobs
      const jobIds = Object.keys(jobs).sort((a, b) => {
        const timeA = new Date(jobs[a].startedAt).getTime();
        const timeB = new Date(jobs[b].startedAt).getTime();
        return timeB - timeA;
      });

      if (jobIds.length > 50) {
        const idsToDelete = jobIds.slice(50);
        for (const id of idsToDelete) {
          delete jobs[id];
        }
      }

      await fs.writeFile(this.jobsFilePath, JSON.stringify(jobs, null, 2), 'utf-8');
    } catch (error) {
      console.error('[WrapUpHandler] Failed to save job to file:', error);
    }
  }

  /**
   * Load jobs from persistent storage on initialization
   */
  async loadJobsFromFile(): Promise<void> {
    try {
      const content = await fs.readFile(this.jobsFilePath, 'utf-8');
      const jobs: Record<string, WrapUpJob> = JSON.parse(content);

      for (const [jobId, job] of Object.entries(jobs)) {
        // Only load processing jobs (completed/failed can be retrieved from file)
        if (job.status === 'processing') {
          job.status = 'failed';
          job.error = 'Previous job was interrupted';
          job.completedAt = new Date().toISOString();
        }
        this.jobs.set(jobId, job);
      }
    } catch {
      // File doesn't exist or is invalid - no jobs to load
    }
  }
}
