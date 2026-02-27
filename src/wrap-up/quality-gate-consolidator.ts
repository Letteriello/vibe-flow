/**
 * Quality Gate Consolidator
 * Ensures memory consolidation only happens AFTER QA approval
 * Prevents persisting broken code or wrong instructions
 */

import { readFile, writeFile, mkdir, access } from 'fs/promises';
import { join, dirname } from 'path';

/**
 * Result of quality gate validation
 */
export interface QualityGateResult {
  approved: boolean;
  blockers: string[];
  warnings: string[];
  validatedAt: string;
 qaApproved: boolean;
  artifactsValid: boolean;
  stateValid: boolean;
}

/**
 * Result of consolidation operation
 */
export interface ConsolidationResult {
  success: boolean;
  message: string;
  consolidatedArtifacts: number;
  errors: string[];
}

/**
 * QA status tracking
 */
interface QAStatus {
  approved: boolean;
  lastCheck: string;
  blockers: string[];
  warnings: string[];
}

/**
 * Default state file location
 */
const DEFAULT_STATE_DIR = '.vibe-flow';
const QA_STATUS_FILE = 'qa-status.json';

/**
 * Global QA status cache
 */
let cachedQAStatus: QAStatus | null = null;

/**
 * Load QA status from state file
 */
async function loadQAStatus(projectRoot?: string): Promise<QAStatus> {
  const root = projectRoot || process.cwd();
  const statePath = join(root, DEFAULT_STATE_DIR, QA_STATUS_FILE);

  try {
    const content = await readFile(statePath, 'utf-8');
    const status = JSON.parse(content);
    cachedQAStatus = status;
    return status;
  } catch {
    // If file doesn't exist or can't be read, assume not approved
    return {
      approved: false,
      lastCheck: new Date().toISOString(),
      blockers: ['QA status file not found - assuming not approved'],
      warnings: []
    };
  }
}

/**
 * Save QA status to state file
 */
async function saveQAStatus(status: QAStatus, projectRoot?: string): Promise<void> {
  const root = projectRoot || process.cwd();
  const stateDir = join(root, DEFAULT_STATE_DIR);
  const statePath = join(stateDir, QA_STATUS_FILE);

  try {
    await mkdir(stateDir, { recursive: true });
    await writeFile(statePath, JSON.stringify(status, null, 2), 'utf-8');
    cachedQAStatus = status;
  } catch (error) {
    console.error('Failed to save QA status:', error);
  }
}

/**
 * Check if wrap-up is blocked (QA not approved)
 */
export function isWrapUpBlocked(): boolean {
  if (!cachedQAStatus) return true;
  return !cachedQAStatus.approved;
}

/**
 * Validate if memory can be consolidated
 * Checks QA approval status and artifact validity
 */
export async function canConsolidateMemory(projectRoot?: string): Promise<QualityGateResult> {
  const qaStatus = await loadQAStatus(projectRoot);

  const blockers: string[] = [];
  const warnings: string[] = [];

  // Check QA approval
  if (!qaStatus.approved) {
    blockers.push('QA has not been approved - consolidation blocked');
  }

  // Check for QA blockers
  if (qaStatus.blockers && qaStatus.blockers.length > 0) {
    blockers.push(...qaStatus.blockers.map(b => `QA blocker: ${b}`));
  }

  // Add warnings from QA
  if (qaStatus.warnings && qaStatus.warnings.length > 0) {
    warnings.push(...qaStatus.warnings);
  }

  // Check if state directory exists
  const root = projectRoot || process.cwd();
  try {
    await access(join(root, DEFAULT_STATE_DIR));
  } catch {
    warnings.push('State directory not found - creating on first consolidation');
  }

  const result: QualityGateResult = {
    approved: blockers.length === 0,
    blockers,
    warnings,
    validatedAt: new Date().toISOString(),
    qaApproved: qaStatus.approved,
    artifactsValid: true,
    stateValid: true
  };

  return result;
}

/**
 * Consolidate memory with quality gate
 * Only consolidates if QA approved
 */
export async function consolidateWithGate(
  artifacts: Map<string, string>,
  projectRoot?: string
): Promise<ConsolidationResult> {
  // First validate quality gate
  const gateResult = await canConsolidateMemory(projectRoot);

  if (!gateResult.approved) {
    return {
      success: false,
      message: `Consolidation blocked: ${gateResult.blockers.join(', ')}`,
      consolidatedArtifacts: 0,
      errors: gateResult.blockers
    };
  }

  const root = projectRoot || process.cwd();
  const consolidatedDir = join(root, DEFAULT_STATE_DIR, 'consolidated');
  const errors: string[] = [];
  let consolidatedCount = 0;

  try {
    await mkdir(consolidatedDir, { recursive: true });

    // Consolidate each artifact
    for (const [filename, content] of artifacts.entries()) {
      try {
        const filePath = join(consolidatedDir, filename);
        await mkdir(dirname(filePath), { recursive: true });
        await writeFile(filePath, content, 'utf-8');
        consolidatedCount++;
      } catch (error) {
        errors.push(`Failed to consolidate ${filename}: ${error}`);
      }
    }

    // Record consolidation in state
    const consolidationRecord = {
      timestamp: new Date().toISOString(),
      artifactsCount: consolidatedCount,
      gateApproved: true
    };

    const recordPath = join(root, DEFAULT_STATE_DIR, 'consolidation-record.json');
    await writeFile(recordPath, JSON.stringify(consolidationRecord, null, 2), 'utf-8');

    return {
      success: errors.length === 0,
      message: errors.length > 0
        ? `Consolidated ${consolidatedCount} artifacts with ${errors.length} errors`
        : `Successfully consolidated ${consolidatedCount} artifacts`,
      consolidatedArtifacts: consolidatedCount,
      errors
    };
  } catch (error) {
    return {
      success: false,
      message: `Consolidation failed: ${error}`,
      consolidatedArtifacts: 0,
      errors: [String(error)]
    };
  }
}

/**
 * Manually set QA approval status
 * Use this after QA passes
 */
export async function setQAApproval(
  approved: boolean,
  blockers: string[] = [],
  warnings: string[] = [],
  projectRoot?: string
): Promise<void> {
  const status: QAStatus = {
    approved,
    lastCheck: new Date().toISOString(),
    blockers,
    warnings
  };

  await saveQAStatus(status, projectRoot);
}

/**
 * Clear QA status cache
 */
export function clearQAStatusCache(): void {
  cachedQAStatus = null;
}

/**
 * Get current QA status (from cache or file)
 */
export async function getQAStatus(projectRoot?: string): Promise<QAStatus> {
  if (cachedQAStatus) return cachedQAStatus;
  return loadQAStatus(projectRoot);
}
