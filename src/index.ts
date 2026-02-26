// vibe-flow - Main entry point
// Workflow orchestration system for AI development agents

export { StateMachine, Phase, ProjectState } from './state-machine/index.js';
export { ConfigManager, UserPreferences, WrapUpConfig, ValidationResult } from './config/index.js';
export { MCPServer } from './mcp/index.js';
export { DecisionHandler, DecisionPoint, DecisionResult } from './decision/index.js';
export { WrapUpExecutor, WrapUpResult } from './wrap-up/index.js';
export { CommandRegistry, CommandDefinition, CommandResult } from './command-registry/index.js';
export { VibeFlowCLI } from './cli.js';

import { VibeFlowCLI } from './cli.js';

const cli = new VibeFlowCLI();
export default cli;
