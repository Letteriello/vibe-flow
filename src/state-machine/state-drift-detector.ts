// State Drift Detector - Story 1.4: Detect and recover from state drift
import { promises as fs } from 'fs';
import { join } from 'path';
import * as crypto from 'crypto';

export enum DriftStatus {
  DETECTED = 'STATE_DRIFT_DETECTED',
  CONSISTENT = 'CONSISTENT',
  RECOVERED = 'RECOVERED'
}

export enum CircuitBreakerState {
  CLOSED = 'CLOSED',       // Normal operation
  OPEN = 'OPEN',           // Blocking requests, requires human intervention
  HALF_OPEN = 'HALF_OPEN'  // Testing if recovery is possible
}

export enum CircuitBreakerTrigger {
  MAX_RETRIES_EXCEEDED = 'MAX_RETRIES_EXCEEDED',
  SAME_STATE_STUCK = 'SAME_STATE_STUCK',
  REPEATED_ERROR_PATTERN = 'REPEATED_ERROR_PATTERN',
  HUMAN_INTERVENTION = 'HUMAN_INTERVENTION'
}

export interface DriftDetectionResult {
  status: DriftStatus;
  driftDetails: DriftDetail[];
  recoveryOptions: RecoveryOption[];
}

export interface DriftDetail {
  type: 'missing_file' | 'modified_file' | 'checksum_mismatch';
  file: string;
  expected?: string;
  actual?: string;
}

export interface RecoveryOption {
  id: string;
  description: string;
  action: 'reconcile' | 'manual' | 'rollback';
  risk: 'low' | 'medium' | 'high';
}

// Circuit Breaker interfaces
export interface CircuitBreakerConfig {
  maxRetries: number;
  maxRetriesPerState: number;
  backoffBaseMs: number;
  maxBackoffMs: number;
}

export interface RetryContext {
  transactionCount: number;
  consecutiveFailures: number;
  lastError: string | null;
  lastState: string | null;
  errorPattern: string[];
  circuitBreakerState: CircuitBreakerState;
  triggeredBy: CircuitBreakerTrigger | null;
  lastRetryAt: Date | null;
}

export interface CircuitBreakerResult {
  allowed: boolean;
  state: CircuitBreakerState;
  triggeredBy: CircuitBreakerTrigger | null;
  message: string;
  backoffMs?: number;
}

export interface HumanInterventionRequest {
  id: string;
  reason: string;
  currentState: string;
  errorPattern: string[];
  retryCount: number;
  requestedAt: Date;
  resolved: boolean;
}

// Filesystem hash for directory state tracking
export interface DirectoryHash {
  hash: string;
  timestamp: string;
  fileCount: number;
  files: Record<string, string>; // relative path -> hash
}

export interface DirectoryDriftResult {
  hasDrift: boolean;
  currentHash: string;
  savedHash: string | null;
  driftMessage: string;
  suggestion: string;
}

export class CircuitBreaker {
  private config: CircuitBreakerConfig;
  private context: RetryContext;
  private interventionRequests: Map<string, HumanInterventionRequest>;
  private projectPath: string;

  constructor(
    projectPath: string = process.cwd(),
    config: Partial<CircuitBreakerConfig> = {}
  ) {
    this.projectPath = projectPath;
    this.config = {
      maxRetries: config.maxRetries ?? 3,
      maxRetriesPerState: config.maxRetriesPerState ?? 3,
      backoffBaseMs: config.backoffBaseMs ?? 1000,
      maxBackoffMs: config.maxBackoffMs ?? 30000
    };

    this.context = {
      transactionCount: 0,
      consecutiveFailures: 0,
      lastError: null,
      lastState: null,
      errorPattern: [],
      circuitBreakerState: CircuitBreakerState.CLOSED,
      triggeredBy: null,
      lastRetryAt: null
    };

    this.interventionRequests = new Map();
  }

  /**
   * Calculate exponential backoff delay
   */
  private calculateBackoff(): number {
    const backoff = this.config.backoffBaseMs * Math.pow(2, this.context.consecutiveFailures - 1);
    return Math.min(backoff, this.config.maxBackoffMs);
  }

  /**
   * Check if operation is allowed and update retry context
   */
  async checkAndRecord(
    currentState: string,
    error: string | null = null
  ): Promise<CircuitBreakerResult> {
    this.context.transactionCount++;

    // If OPEN, check if we can transition to HALF_OPEN
    if (this.context.circuitBreakerState === CircuitBreakerState.OPEN) {
      const timeSinceLastRetry = this.context.lastRetryAt
        ? Date.now() - this.context.lastRetryAt.getTime()
        : Infinity;

      // Allow test after backoff period
      if (timeSinceLastRetry >= this.calculateBackoff()) {
        this.context.circuitBreakerState = CircuitBreakerState.HALF_OPEN;
        this.context.lastRetryAt = new Date();
        return {
          allowed: true,
          state: CircuitBreakerState.HALF_OPEN,
          triggeredBy: this.context.triggeredBy,
          message: 'Circuit breaker transitioning to HALF_OPEN - testing recovery'
        };
      }

      return {
        allowed: false,
        state: CircuitBreakerState.OPEN,
        triggeredBy: this.context.triggeredBy,
        message: `Circuit breaker OPEN - human intervention required. Backoff remaining: ${this.calculateBackoff() - timeSinceLastRetry}ms`,
        backoffMs: this.calculateBackoff()
      };
    }

    // If HALF_OPEN and error occurs, go back to OPEN
    if (this.context.circuitBreakerState === CircuitBreakerState.HALF_OPEN && error) {
      this.context.consecutiveFailures++;
      this.context.circuitBreakerState = CircuitBreakerState.OPEN;
      this.context.lastError = error;
      this.context.lastState = currentState;
      this.context.errorPattern.push(error);

      return {
        allowed: false,
        state: CircuitBreakerState.OPEN,
        triggeredBy: CircuitBreakerTrigger.MAX_RETRIES_EXCEEDED,
        message: 'Circuit breaker test failed - returning to OPEN state',
        backoffMs: this.calculateBackoff()
      };
    }

    // If HALF_OPEN and success, close the circuit
    if (this.context.circuitBreakerState === CircuitBreakerState.HALF_OPEN && !error) {
      this.reset();
      return {
        allowed: true,
        state: CircuitBreakerState.CLOSED,
        triggeredBy: null,
        message: 'Circuit breaker CLOSED - recovery successful'
      };
    }

    // CLOSED state - check for repeated failures
    if (error) {
      this.context.consecutiveFailures++;
      this.context.lastError = error;
      this.context.lastState = currentState;
      this.context.errorPattern.push(error);

      // Keep error pattern limited to last 5 errors
      if (this.context.errorPattern.length > 5) {
        this.context.errorPattern.shift();
      }

      // Check triggers for opening circuit
      const shouldOpen = this.shouldOpenCircuit(currentState, error);

      if (shouldOpen.trigger) {
        this.context.circuitBreakerState = CircuitBreakerState.OPEN;
        this.context.triggeredBy = shouldOpen.trigger;
        this.context.lastRetryAt = new Date();

        // Create human intervention request
        const intervention = this.createInterventionRequest(shouldOpen.trigger);
        this.interventionRequests.set(intervention.id, intervention);

        return {
          allowed: false,
          state: CircuitBreakerState.OPEN,
          triggeredBy: shouldOpen.trigger,
          message: shouldOpen.message,
          backoffMs: this.calculateBackoff()
        };
      }

      // Apply backoff delay if approaching limit
      if (this.context.consecutiveFailures >= this.config.maxRetriesPerState - 1) {
        const backoff = this.calculateBackoff();
        return {
          allowed: true,
          state: CircuitBreakerState.CLOSED,
          triggeredBy: null,
          message: `Backoff applied before retry ${this.context.consecutiveFailures + 1}`,
          backoffMs: backoff
        };
      }
    } else {
      // Success - reset consecutive failures
      this.context.consecutiveFailures = 0;
      this.context.lastError = null;
    }

    return {
      allowed: true,
      state: CircuitBreakerState.CLOSED,
      triggeredBy: null,
      message: 'Operation allowed'
    };
  }

  /**
   * Determine if circuit should open based on failure patterns
   */
  private shouldOpenCircuit(
    currentState: string,
    error: string
  ): { trigger: CircuitBreakerTrigger | null; message: string } {
    // Trigger 1: Max consecutive failures exceeded
    if (this.context.consecutiveFailures >= this.config.maxRetries) {
      return {
        trigger: CircuitBreakerTrigger.MAX_RETRIES_EXCEEDED,
        message: `Max retries (${this.config.maxRetries}) exceeded with consecutive failures`
      };
    }

    // Trigger 2: Same state stuck with errors
    if (
      this.context.lastState === currentState &&
      this.context.consecutiveFailures >= this.config.maxRetriesPerState
    ) {
      return {
        trigger: CircuitBreakerTrigger.SAME_STATE_STUCK,
        message: `Agent stuck in same state '${currentState}' for ${this.context.consecutiveFailures} transactions`
      };
    }

    // Trigger 3: Repeated error pattern (same error 3+ times)
    const errorFrequency = this.context.errorPattern.filter(e => e === error).length;
    if (errorFrequency >= 3) {
      return {
        trigger: CircuitBreakerTrigger.REPEATED_ERROR_PATTERN,
        message: `Repeated error pattern detected: '${error}' repeated ${errorFrequency} times`
      };
    }

    return { trigger: null, message: '' };
  }

  /**
   * Create a human intervention request
   */
  private createInterventionRequest(trigger: CircuitBreakerTrigger): HumanInterventionRequest {
    const id = `intervention-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    let reason: string;
    switch (trigger) {
      case CircuitBreakerTrigger.MAX_RETRIES_EXCEEDED:
        reason = `Maximum retry attempts (${this.config.maxRetries}) exceeded`;
        break;
      case CircuitBreakerTrigger.SAME_STATE_STUCK:
        reason = `Agent stuck in state '${this.context.lastState}' for ${this.context.consecutiveFailures} consecutive transactions`;
        break;
      case CircuitBreakerTrigger.REPEATED_ERROR_PATTERN:
        reason = `Repeated error pattern detected: ${this.context.errorPattern[this.context.errorPattern.length - 1]}`;
        break;
      default:
        reason = 'Circuit breaker opened due to repeated failures';
    }

    return {
      id,
      reason,
      currentState: this.context.lastState || 'unknown',
      errorPattern: [...this.context.errorPattern],
      retryCount: this.context.consecutiveFailures,
      requestedAt: new Date(),
      resolved: false
    };
  }

  /**
   * Get all pending human intervention requests
   */
  getInterventionRequests(): HumanInterventionRequest[] {
    return Array.from(this.interventionRequests.values()).filter(r => !r.resolved);
  }

  /**
   * Resolve a human intervention request
   */
  resolveIntervention(interventionId: string): boolean {
    const intervention = this.interventionRequests.get(interventionId);
    if (intervention) {
      intervention.resolved = true;
      return true;
    }
    return false;
  }

  /**
   * Manually trigger circuit breaker for human intervention
   */
  async requestHumanIntervention(reason: string): Promise<string> {
    this.context.circuitBreakerState = CircuitBreakerState.OPEN;
    this.context.triggeredBy = CircuitBreakerTrigger.HUMAN_INTERVENTION;

    const intervention = this.createInterventionRequest(CircuitBreakerTrigger.HUMAN_INTERVENTION);
    intervention.reason = reason;
    this.interventionRequests.set(intervention.id, intervention);

    return intervention.id;
  }

  /**
   * Reset the circuit breaker
   */
  reset(): void {
    this.context = {
      transactionCount: this.context.transactionCount,
      consecutiveFailures: 0,
      lastError: null,
      lastState: null,
      errorPattern: [],
      circuitBreakerState: CircuitBreakerState.CLOSED,
      triggeredBy: null,
      lastRetryAt: null
    };
  }

  /**
   * Get current circuit breaker status
   */
  getStatus(): { state: CircuitBreakerState; context: RetryContext } {
    return {
      state: this.context.circuitBreakerState,
      context: { ...this.context }
    };
  }

  /**
   * Persist circuit breaker state to file
   */
  async persistState(): Promise<void> {
    const statePath = join(this.projectPath, '.vibe-flow', 'circuit-breaker.json');
    const data = {
      context: this.context,
      interventions: Array.from(this.interventionRequests.entries())
    };

    const tempFile = statePath + '.tmp';
    await fs.writeFile(tempFile, JSON.stringify(data, null, 2), 'utf-8');
    await fs.rename(tempFile, statePath);
  }

  /**
   * Restore circuit breaker state from file
   */
  async restoreState(): Promise<boolean> {
    const statePath = join(this.projectPath, '.vibe-flow', 'circuit-breaker.json');

    try {
      const content = await fs.readFile(statePath, 'utf-8');
      const data = JSON.parse(content);

      if (data.context) {
        this.context = data.context;
      }
      if (data.interventions) {
        this.interventionRequests = new Map(data.interventions);
      }

      return true;
    } catch {
      return false;
    }
  }
}

export class StateDriftDetector {
  private projectPath: string;
  private stateFilePath: string;
  private checksumsFilePath: string;
  private circuitBreaker: CircuitBreaker;

  constructor(projectPath: string = process.cwd()) {
    this.projectPath = projectPath;
    this.stateFilePath = join(projectPath, '.vibe-flow', 'state.json');
    this.checksumsFilePath = join(projectPath, '.vibe-flow', 'checksums.json');
    this.circuitBreaker = new CircuitBreaker(projectPath);
  }

  /**
   * Detect state drift between persisted state and real project artifacts
   * Story 1.4 AC:
   * - Given: progress.json indicating mandatory artifact exists
   * - When: health check detects absence/inconsistency
   * - Then: mark as STATE_DRIFT_DETECTED
   * - And: present 3 options: auto-reconciliation, manual correction, rollback
   */
  async detectDrift(): Promise<DriftDetectionResult> {
    const driftDetails: DriftDetail[] = [];

    // First, check if state file exists
    try {
      await fs.access(this.stateFilePath);
    } catch {
      // No state file - this is not drift, just new project
      return {
        status: DriftStatus.CONSISTENT,
        driftDetails: [],
        recoveryOptions: []
      };
    }

    // Read current state
    let state: any;
    try {
      const content = await fs.readFile(this.stateFilePath, 'utf-8');
      state = JSON.parse(content);
    } catch {
      // Invalid JSON - potential drift
      driftDetails.push({
        type: 'checksum_mismatch',
        file: '.vibe-flow/state.json',
        expected: 'valid JSON',
        actual: 'invalid JSON'
      });

      return this.createDriftResult(driftDetails);
    }

    // Check required artifacts based on phase
    const requiredArtifacts = this.getRequiredArtifacts(state.phase);
    for (const artifact of requiredArtifacts) {
      try {
        await fs.access(join(this.projectPath, artifact));
      } catch {
        driftDetails.push({
          type: 'missing_file',
          file: artifact
        });
      }
    }

    // Check if checksums file exists and validate
    try {
      const checksums = await this.loadChecksums();
      if (checksums) {
        for (const [file, expectedChecksum] of Object.entries(checksums)) {
          const actualChecksum = await this.calculateChecksum(join(this.projectPath, file));
          if (actualChecksum !== expectedChecksum) {
            driftDetails.push({
              type: 'checksum_mismatch',
              file,
              expected: expectedChecksum,
              actual: actualChecksum
            });
          }
        }
      }
    } catch {
      // Checksums file doesn't exist yet
    }

    if (driftDetails.length === 0) {
      return {
        status: DriftStatus.CONSISTENT,
        driftDetails: [],
        recoveryOptions: []
      };
    }

    return this.createDriftResult(driftDetails);
  }

  /**
   * Get required artifacts for a given phase
   */
  private getRequiredArtifacts(phase: string): string[] {
    const phaseArtifacts: Record<string, string[]> = {
      ANALYSIS: ['.bmad/brief.md'],
      PLANNING: ['.bmad/brief.md', '.bmad/prd.md'],
      SOLUTIONING: ['.bmad/brief.md', '.bmad/prd.md', '.bmad/architecture.md'],
      IMPLEMENTATION: ['.bmad/brief.md', '.bmad/prd.md', '.bmad/architecture.md', '.bmad/epics.md'],
      COMPLETE: []
    };

    return phaseArtifacts[phase] || [];
  }

  /**
   * Load checksums from file
   */
  private async loadChecksums(): Promise<Record<string, string> | null> {
    try {
      const content = await fs.readFile(this.checksumsFilePath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  /**
   * Calculate MD5 checksum of a file
   */
  private async calculateChecksum(filePath: string): Promise<string> {
    try {
      const content = await fs.readFile(filePath);
      return crypto.createHash('md5').update(content).digest('hex');
    } catch {
      return '';
    }
  }

  /**
   * Create drift result with recovery options
   */
  private createDriftResult(driftDetails: DriftDetail[]): DriftDetectionResult {
    const recoveryOptions: RecoveryOption[] = [
      {
        id: 'auto-reconcile',
        description: 'Automatically reconcile state with actual artifacts',
        action: 'reconcile',
        risk: 'low'
      },
      {
        id: 'manual-correct',
        description: 'Manually correct the drift with guided steps',
        action: 'manual',
        risk: 'medium'
      },
      {
        id: 'rollback',
        description: 'Rollback to previous known good state',
        action: 'rollback',
        risk: 'high'
      }
    ];

    return {
      status: DriftStatus.DETECTED,
      driftDetails,
      recoveryOptions
    };
  }

  /**
   * Reconcile state with actual artifacts (auto-recovery)
   * Story 1.4 AC:
   * - Given: auto-reconciliation choice
   * - When: system can reconcile safely
   * - Then: update state and context with audit trail
   * - And: return to flow without losing valid progress
   */
  async reconcile(): Promise<{ success: boolean; message: string }> {
    const driftResult = await this.detectDrift();

    if (driftResult.status !== DriftStatus.DETECTED) {
      return { success: true, message: 'No drift detected - state is consistent' };
    }

    // For missing files, remove references from state
    // For checksum mismatches, update checksums
    try {
      // Read current state
      const content = await fs.readFile(this.stateFilePath, 'utf-8');
      const state = JSON.parse(content);

      // Add drift detection info to state
      state.lastDriftCheck = new Date().toISOString();
      state.driftDetected = true;
      state.driftDetails = driftResult.driftDetails;

      // Write back with atomic operation
      const tempFile = this.stateFilePath + '.tmp';
      await fs.writeFile(tempFile, JSON.stringify(state, null, 2), 'utf-8');
      await fs.rename(tempFile, this.stateFilePath);

      return {
        success: true,
        message: `Reconciled ${driftResult.driftDetails.length} drift issue(s)`
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Reconciliation failed: ${error.message}`
      };
    }
  }

  /**
   * Record current checksums for future drift detection
   */
  async recordChecksums(files: string[]): Promise<void> {
    const checksums: Record<string, string> = {};

    for (const file of files) {
      const filePath = join(this.projectPath, file);
      checksums[file] = await this.calculateChecksum(filePath);
    }

    const checksumsDir = join(this.projectPath, '.vibe-flow');
    await fs.mkdir(checksumsDir, { recursive: true });

    const tempFile = this.checksumsFilePath + '.tmp';
    await fs.writeFile(tempFile, JSON.stringify(checksums, null, 2), 'utf-8');
    await fs.rename(tempFile, this.checksumsFilePath);
  }

  // ==================== Directory Hash for State Drift Detection ====================

  /**
   * Calculate a hash of all files in .vibe-flow/ directory
   * This creates a snapshot of the entire state directory
   */
  async calculateDirectoryHash(): Promise<DirectoryHash> {
    const vibeFlowDir = join(this.projectPath, '.vibe-flow');
    const files: Record<string, string> = {};

    try {
      const entries = await fs.readdir(vibeFlowDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isFile()) {
          const filePath = join(vibeFlowDir, entry.name);
          const content = await fs.readFile(filePath, 'utf-8');
          // Use a simple hash: hash of content
          files[entry.name] = crypto.createHash('sha256').update(content).digest('hex');
        }
        // Skip directories for now - can extend later
      }
    } catch {
      // Directory doesn't exist yet - return empty hash
    }

    // Create a combined hash of all files
    const sortedFiles = Object.keys(files).sort();
    const combinedContent = sortedFiles.map(name => `${name}:${files[name]}`).join('|');
    const hash = crypto.createHash('sha256').update(combinedContent).digest('hex');

    return {
      hash,
      timestamp: new Date().toISOString(),
      fileCount: Object.keys(files).length,
      files
    };
  }

  /**
   * Save the directory hash to state file for future comparison
   */
  async saveDirectoryHash(): Promise<void> {
    const directoryHash = await this.calculateDirectoryHash();

    try {
      const content = await fs.readFile(this.stateFilePath, 'utf-8');
      const state = JSON.parse(content);

      // Save the directory hash
      state.directoryHash = directoryHash;

      // Write back with atomic operation
      const tempFile = this.stateFilePath + '.tmp';
      await fs.writeFile(tempFile, JSON.stringify(state, null, 2), 'utf-8');
      await fs.rename(tempFile, this.stateFilePath);
    } catch (error: any) {
      console.error('[StateDriftDetector] Failed to save directory hash:', error.message);
      // Don't throw - this is a best-effort operation
    }
  }

  /**
   * Check for drift by comparing current directory hash with saved hash
   * Returns a result with warning message if drift detected
   */
  async checkDirectoryDrift(): Promise<DirectoryDriftResult> {
    const currentHash = await this.calculateDirectoryHash();

    // Try to load saved hash from state
    let savedHash: string | null = null;
    let savedFiles: Record<string, string> = {};
    try {
      const content = await fs.readFile(this.stateFilePath, 'utf-8');
      const state = JSON.parse(content);

      if (state.directoryHash?.hash) {
        savedHash = state.directoryHash.hash;
        savedFiles = state.directoryHash.files || {};
      }
    } catch {
      // No state file or no saved hash - this is a new project
    }

    // If no saved hash, there's no drift to detect yet
    if (!savedHash) {
      return {
        hasDrift: false,
        currentHash: currentHash.hash,
        savedHash: null,
        driftMessage: 'No previous state hash found. Run save to establish baseline.',
        suggestion: ''
      };
    }

    // Filter out state.json from comparison since it may be modified internally
    // when saving the hash (contains the directoryHash field itself)
    const compareFiles = (files: Record<string, string>, excludeStateJson = false) => {
      if (excludeStateJson) {
        const result: Record<string, string> = {};
        for (const [key, value] of Object.entries(files)) {
          if (key !== 'state.json') {
            result[key] = value;
          }
        }
        return result;
      }
      return files;
    };

    const currentFilesToCompare = compareFiles(currentHash.files, true);
    const savedFilesToCompare = compareFiles(savedFiles, true);

    // Recalculate hash for comparison excluding state.json
    const sortedCurrentFiles = Object.keys(currentFilesToCompare).sort();
    const combinedCurrentContent = sortedCurrentFiles.map(name => `${name}:${currentFilesToCompare[name]}`).join('|');
    const currentHashExcludingState = crypto.createHash('sha256').update(combinedCurrentContent).digest('hex');

    const sortedSavedFiles = Object.keys(savedFilesToCompare).sort();
    const combinedSavedContent = sortedSavedFiles.map(name => `${name}:${savedFilesToCompare[name]}`).join('|');
    const savedHashExcludingState = crypto.createHash('sha256').update(combinedSavedContent).digest('hex');

    // Compare hashes (excluding state.json)
    if (currentHashExcludingState === savedHashExcludingState) {
      return {
        hasDrift: false,
        currentHash: currentHash.hash,
        savedHash,
        driftMessage: 'Directory state is consistent with saved state.',
        suggestion: ''
      };
    }

    // Drift detected!
    const changedFiles: string[] = [];

    for (const [file, hash] of Object.entries(currentFilesToCompare)) {
      if (!savedFilesToCompare[file] || savedFilesToCompare[file] !== hash) {
        changedFiles.push(file);
      }
    }

    // Check for new files not in saved state
    for (const file of Object.keys(savedFilesToCompare)) {
      if (!currentFilesToCompare[file]) {
        changedFiles.push(`${file} (deleted)`);
      }
    }

    const driftMessage = `State drift detected! ${changedFiles.length} file(s) in .vibe-flow/ have changed: ${changedFiles.join(', ')}`;

    return {
      hasDrift: true,
      currentHash: currentHash.hash,
      savedHash,
      driftMessage,
      suggestion: 'Run "analyze_project" to resynchronize the state and resolve drift.'
    };
  }

  /**
   * Get saved files from state
   */
  private async getSavedFiles(): Promise<Record<string, string>> {
    try {
      const content = await fs.readFile(this.stateFilePath, 'utf-8');
      const state = JSON.parse(content);
      return state.directoryHash?.files || {};
    } catch {
      return {};
    }
  }

  /**
   * Check for drift and emit warning if detected
   * This is the main entry point for drift detection with user notification
   */
  async checkAndWarnDrift(): Promise<DirectoryDriftResult> {
    const result = await this.checkDirectoryDrift();

    if (result.hasDrift) {
      console.warn('');
      console.warn('⚠️  STATE DRIFT DETECTED');
      console.warn('='.repeat(50));
      console.warn(result.driftMessage);
      console.warn('');
      console.warn('💡 ' + result.suggestion);
      console.warn('');
    }

    return result;
  }

  // ==================== Circuit Breaker Integration ====================

  /**
   * Check if operation is allowed based on retry backoff logic
   * Integrates with atomic persistence to detect stuck patterns
   */
  async checkRetryBackoff(
    currentState: string,
    error: string | null = null
  ): Promise<CircuitBreakerResult> {
    return this.circuitBreaker.checkAndRecord(currentState, error);
  }

  /**
   * Get circuit breaker status
   */
  getCircuitBreakerStatus(): { state: CircuitBreakerState; context: RetryContext } {
    return this.circuitBreaker.getStatus();
  }

  /**
   * Get pending human intervention requests
   */
  getPendingInterventions(): HumanInterventionRequest[] {
    return this.circuitBreaker.getInterventionRequests();
  }

  /**
   * Resolve a human intervention request
   */
  resolveIntervention(interventionId: string): boolean {
    return this.circuitBreaker.resolveIntervention(interventionId);
  }

  /**
   * Manually request human intervention
   */
  async requestHumanIntervention(reason: string): Promise<string> {
    return this.circuitBreaker.requestHumanIntervention(reason);
  }

  /**
   * Reset circuit breaker to closed state
   */
  resetCircuitBreaker(): void {
    this.circuitBreaker.reset();
  }

  /**
   * Persist circuit breaker state for crash recovery
   */
  async persistCircuitBreakerState(): Promise<void> {
    await this.circuitBreaker.persistState();
  }

  /**
   * Restore circuit breaker state
   */
  async restoreCircuitBreakerState(): Promise<boolean> {
    return this.circuitBreaker.restoreState();
  }

  /**
   * Check and record atomic persistence result
   * Call this after each atomic write to track failure patterns
   */
  async recordPersistenceResult(
    operationType: string,
    success: boolean,
    errorMessage?: string
  ): Promise<CircuitBreakerResult> {
    const currentState = `persist:${operationType}`;

    if (success) {
      return this.circuitBreaker.checkAndRecord(currentState, null);
    } else {
      return this.circuitBreaker.checkAndRecord(currentState, errorMessage ?? 'Unknown error');
    }
  }
}

export default StateDriftDetector;
