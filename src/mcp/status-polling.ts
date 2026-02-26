// Status Polling Module - Async wrap-up job status tracking
import { promises as fs } from 'fs';
import { join } from 'path';

// Job status types
export type JobStatus = 'processing' | 'completed' | 'failed';

export interface JobInfo {
  jobId: string;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
  summaryPath?: string;
  summaryLink?: string;
  error?: string;
  progress?: number;
  message?: string;
}

export interface WrapUpJobResult {
  success: boolean;
  jobId: string;
  status: JobStatus;
  summaryLink?: string;
  progress?: number;
  message: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

const DEFAULT_TEMP_DIR = '.vibe-flow';
const JOB_FILE = 'wrap-up-jobs.json';

/**
 * JobStatusManager - Manages async wrap-up job status with in-memory Map and optional file persistence
 */
export class JobStatusManager {
  private jobs: Map<string, JobInfo>;
  private tempDir: string;
  private useFilePersistence: boolean;

  constructor(tempDir: string = DEFAULT_TEMP_DIR, useFilePersistence: boolean = true) {
    this.tempDir = tempDir;
    this.useFilePersistence = useFilePersistence;
    this.jobs = new Map();
  }

  /**
   * Initialize and load jobs from file if persistence is enabled
   */
  async initialize(): Promise<void> {
    if (this.useFilePersistence) {
      await this.loadFromFile();
    }
  }

  /**
   * Register a new wrap-up job
   */
  registerJob(jobId: string): JobInfo {
    const now = new Date().toISOString();
    const job: JobInfo = {
      jobId,
      status: 'processing',
      createdAt: now,
      updatedAt: now,
      progress: 0,
      message: 'Job registered, processing started'
    };

    this.jobs.set(jobId, job);
    this.persistAsync();

    return job;
  }

  /**
   * Update job status
   */
  updateJobStatus(
    jobId: string,
    status: JobStatus,
    options?: {
      summaryPath?: string;
      summaryLink?: string;
      error?: string;
      progress?: number;
      message?: string;
    }
  ): JobInfo | null {
    const job = this.jobs.get(jobId);
    if (!job) {
      return null;
    }

    const now = new Date().toISOString();
    job.status = status;
    job.updatedAt = now;

    if (options) {
      if (options.summaryPath !== undefined) {
        job.summaryPath = options.summaryPath;
      }
      if (options.summaryLink !== undefined) {
        job.summaryLink = options.summaryLink;
      }
      if (options.error !== undefined) {
        job.error = options.error;
      }
      if (options.progress !== undefined) {
        job.progress = options.progress;
      }
      if (options.message !== undefined) {
        job.message = options.message;
      }
    }

    this.persistAsync();
    return job;
  }

  /**
   * Get job status by jobId
   */
  getJobStatus(jobId: string): WrapUpJobResult {
    const job = this.jobs.get(jobId);

    if (!job) {
      return {
        success: false,
        jobId,
        status: 'failed',
        message: 'Job not found',
        error: `No job found with ID: ${jobId}`,
        createdAt: '',
        updatedAt: ''
      };
    }

    return {
      success: true,
      jobId: job.jobId,
      status: job.status,
      summaryLink: job.summaryLink,
      progress: job.progress,
      message: job.message || this.getStatusMessage(job.status),
      error: job.error,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt
    };
  }

  /**
   * Get summary link for a completed job
   */
  getSummaryLink(jobId: string): string | null {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== 'completed') {
      return null;
    }
    return job.summaryLink || null;
  }

  /**
   * Check if job is completed
   */
  isCompleted(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    return job?.status === 'completed';
  }

  /**
   * Check if job failed
   */
  isFailed(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    return job?.status === 'failed';
  }

  /**
   * Get all jobs
   */
  getAllJobs(): JobInfo[] {
    return Array.from(this.jobs.values());
  }

  /**
   * Get job count by status
   */
  getJobCountByStatus(): Record<JobStatus, number> {
    const counts: Record<JobStatus, number> = {
      processing: 0,
      completed: 0,
      failed: 0
    };

    for (const job of this.jobs.values()) {
      counts[job.status]++;
    }

    return counts;
  }

  /**
   * Clear all jobs
   */
  clearJobs(): void {
    this.jobs.clear();
    this.persistAsync();
  }

  /**
   * Remove a specific job
   */
  removeJob(jobId: string): boolean {
    const deleted = this.jobs.delete(jobId);
    if (deleted) {
      this.persistAsync();
    }
    return deleted;
  }

  /**
   * Generate a unique job ID
   */
  static generateJobId(prefix: string = 'wrapup'): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `${prefix}-${timestamp}-${random}`;
  }

  private getStatusMessage(status: JobStatus): string {
    switch (status) {
      case 'processing':
        return 'Job is still processing';
      case 'completed':
        return 'Job completed successfully';
      case 'failed':
        return 'Job failed';
      default:
        return 'Unknown status';
    }
  }

  private async persistAsync(): Promise<void> {
    if (!this.useFilePersistence) {
      return;
    }

    try {
      const jobsArray = Array.from(this.jobs.entries());
      await fs.writeFile(
        join(this.tempDir, JOB_FILE),
        JSON.stringify(jobsArray, null, 2),
        'utf-8'
      );
    } catch (error) {
      console.error('[JobStatusManager] Failed to persist jobs:', error);
    }
  }

  private async loadFromFile(): Promise<void> {
    try {
      const filePath = join(this.tempDir, JOB_FILE);
      const content = await fs.readFile(filePath, 'utf-8');
      const jobsArray: [string, JobInfo][] = JSON.parse(content);
      this.jobs = new Map(jobsArray);
    } catch {
      // File doesn't exist or is invalid, start with empty map
      this.jobs = new Map();
    }
  }
}

// Singleton instance for global use
let globalJobStatusManager: JobStatusManager | null = null;

/**
 * Get the global JobStatusManager instance
 */
export function getJobStatusManager(): JobStatusManager {
  if (!globalJobStatusManager) {
    globalJobStatusManager = new JobStatusManager();
  }
  return globalJobStatusManager;
}

/**
 * Initialize the global JobStatusManager
 */
export async function initializeJobStatusManager(tempDir?: string): Promise<JobStatusManager> {
  globalJobStatusManager = new JobStatusManager(tempDir);
  await globalJobStatusManager.initialize();
  return globalJobStatusManager;
}

/**
 * Get wrap-up job status - MCP tool handler
 */
export async function getWrapUpJobStatus(jobId: string): Promise<WrapUpJobResult> {
  const manager = getJobStatusManager();
  return manager.getJobStatus(jobId);
}

/**
 * Register a new wrap-up job - MCP tool handler
 */
export function registerWrapUpJob(): { jobId: string; message: string } {
  const manager = getJobStatusManager();
  const jobId = JobStatusManager.generateJobId();
  manager.registerJob(jobId);
  return {
    jobId,
    message: `Job ${jobId} registered successfully`
  };
}

/**
 * Update wrap-up job status - used by async wrap-up executor
 */
export function updateWrapUpJobStatus(
  jobId: string,
  status: JobStatus,
  options?: {
    summaryPath?: string;
    summaryLink?: string;
    error?: string;
    progress?: number;
    message?: string;
  }
): JobInfo | null {
  const manager = getJobStatusManager();
  return manager.updateJobStatus(jobId, status, options);
}
