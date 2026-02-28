// Execution TDD module exports
// Note: Some modules have duplicate type names that require specific handling

// Coverage tracker
export * from './coverage-tracker';

// Mock factory
export * from './mock-factory';

// Regression guard - export all (TestResult is the main type here)
export * from './regression-guard';

// Temp file manager
export * from './tdd-temp-file';

// Loop controller - re-export with alias for TestRunner to avoid conflict with test-runner.ts
export { TDDLoopController, TDDLoopConfig, TDDPhase } from './loop-controller.js';
export type { TestRunner as LoopTestRunner } from './loop-controller.js';
export type { TestResult as LoopTestResult } from './loop-controller.js';

// Failure analyzer
export * from './failure-analyzer';

// Task queue - re-export with alias for TDDTask to avoid conflict with prompts.ts
export { TaskIngestor, TDDTaskStatus } from './task-queue.js';
export type { TDDTask as QueueTDDTask } from './task-queue.js';

// Prompts - keep TDDTask separate
export { buildTestGenerationPrompt, buildImplementationPrompt } from './prompts.js';
export type { TDDTask as PromptsTDDTask } from './prompts.js';

// Test runner - re-export without TestResult to avoid conflict
export { TestRunner, TestRunnerOptions } from './test-runner.js';
export type { TestResult as RunnerTestResult } from './test-runner.js';
