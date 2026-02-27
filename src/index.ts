// vibe-flow - Main entry point
// Workflow orchestration system for AI development agents

export { StateMachine, Phase, ProjectState } from './state-machine/index.js';
export { QualityGateInterceptor, QualityGateStatus } from './state-machine/quality-gate.js';
export { MockFactory, MockOptions, MockValue, JsonSchema, commonSchemas, generateMock, generateFromSchema, generateFromTypeScript, generateFromSchemaFile, generateFromTypeScriptFile } from './execution/tdd/mock-factory.js';
export { ConfigManager, UserPreferences, WrapUpConfig, ValidationResult } from './config/index.js';
export { MCPServer } from './mcp/index.js';
export { DecisionHandler, DecisionPoint, DecisionResult } from './decision/index.js';
export { WrapUpExecutor, WrapUpResult } from './wrap-up/index.js';
export { CommandRegistry, CommandDefinition, CommandResult } from './command-registry/index.js';
export { VibeFlowCLI } from './cli.js';

// Token Estimation
export {
  estimateTokens,
  estimateMessagesTokens,
  estimateObjectTokens,
  createTokenEstimator,
  TokenEstimateOptions,
  TokenEstimateResult,
  TokenEstimator,
  TokenEncoding,
  TokenModel,
} from './utils/token-estimation.js';

import { VibeFlowCLI } from './cli.js';

const cli = new VibeFlowCLI();
export default cli;
