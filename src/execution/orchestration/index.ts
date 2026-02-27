/**
 * Execution Orchestration Module
 *
 * Exports TDD coordination components:
 * - TDDCoordinator: Main orchestrator for TDD cycle
 * - TesterAgent: Agent responsible for writing failing tests (RED phase)
 * - CoderAgent: Agent responsible for writing implementation to pass tests (GREEN phase)
 */

export {
  TDDCoordinator,
  createTDDCoordinator,
  AgentRole,
  AgentExecutionStatus,
  VirtualAgent,
  AgentContext,
  AgentResult,
  TesterAgent,
  TesterAgentConfig,
  CoderAgent,
  CoderAgentConfig,
  TDDEventType,
  TDDEventPayload,
  CoordinatedTaskResult,
  PhaseResult,
  TDDCoordinatorConfig
} from './tdd-coordinator';
