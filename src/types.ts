// Core types and interfaces for vibe-flow
// Testing Conventional Commits feature - test 2

export type ProjectState = 'NEW' | 'REVERSE_ENGINEERING' | 'IN_PROGRESS';

export type Phase = 'ANALYSIS' | 'PLANNING' | 'SOLUTIONING' | 'COMPLETE';

export interface ProjectContext {
  id: string;
  name: string;
  state: ProjectState;
  phase: Phase;
  createdAt: string;
  updatedAt: string;
  discoveries: string[];
  decisions: Decision[];
  artifacts: Artifact[];
  currentStep: number;
  totalSteps: number;
}

export interface Decision {
  id: string;
  question: string;
  answer: string;
  timestamp: string;
}

export interface Artifact {
  id: string;
  type: string;
  path: string;
  content?: string;
}

export interface Progress {
  projectId: string;
  phase: Phase;
  step: number;
  completedSteps: string[];
  lastUpdated: string;
}

export interface VibeFlowConfig {
  language: string;
  autoAdvance: boolean;
  verboseMode: boolean;
  beginnerMode: boolean;
  configPath: string;
}

export interface MCPToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

// Telemetry types
export interface MetricEvent {
  name: string;
  durationMs: number;
  success: boolean;
  correlationId: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

// AI Code Review types
export type FocusArea = 'bug' | 'logical_flaw' | 'security_vulnerability' | 'anti_pattern' | 'performance_issue' | 'code_smell' | 'spec_violation';

export interface AdversarialReviewParams {
  files: string[];
  focusAreas?: FocusArea[];
  compareWithSpec?: boolean;
  projectPath?: string;
}

export interface ReviewFinding {
  type: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  file: string;
  line?: number;
  description: string;
  suggestion?: string;
}

export interface AdversarialReviewResult {
  findings: ReviewFinding[];
  summary: {
    total: number;
    critical: number;
    warnings: number;
  };
}

export interface SecurityScanParams {
  path: string;
  patterns?: string[];
}

export interface QualityCheckParams {
  path: string;
  severity?: 'error' | 'warning' | 'info';
}
