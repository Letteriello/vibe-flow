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
