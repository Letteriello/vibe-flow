// Configuration Schema - Zod validation for config.json
import { z } from 'zod';

// Language validation
const LanguageSchema = z.enum(['en', 'pt-BR', 'pt', 'es']);

// User Preferences Schema
export const UserPreferencesSchema = z.object({
  language: LanguageSchema.default('en'),
  autoAdvance: z.boolean().default(false),
  verboseMode: z.boolean().default(false),
  beginnerMode: z.boolean().default(false)
});

// WrapUp Phase Schemas
const ShipItPhaseSchema = z.object({
  enabled: z.boolean().default(true),
  autoCommit: z.boolean().default(false),
  autoPush: z.boolean().default(false),
  checkNaming: z.boolean().optional(),
  moveFiles: z.boolean().optional(),
  cleanupTemp: z.boolean().optional(),
  runDeploy: z.boolean().optional(),
  useConventionalCommits: z.boolean().optional(),
  confirmBeforeCommit: z.boolean().optional()
});

const RememberItPhaseSchema = z.object({
  enabled: z.boolean().default(true),
  consolidateClaudeMd: z.boolean().default(true),
  updateRules: z.boolean().optional(),
  updateLocal: z.boolean().optional(),
  maxContextSize: z.string().optional()
});

const SelfImprovePhaseSchema = z.object({
  enabled: z.boolean().default(true),
  analyzeErrors: z.boolean().default(true),
  generateRules: z.boolean().optional(),
  minOccurrenceThreshold: z.number().optional()
});

const PublishItPhaseSchema = z.object({
  enabled: z.boolean().default(false),
  platforms: z.array(z.string()).optional(),
  requireReview: z.boolean().optional()
});

// WrapUp Phases Schema
const WrapUpPhasesSchema = z.object({
  shipIt: ShipItPhaseSchema,
  rememberIt: RememberItPhaseSchema,
  selfImprove: SelfImprovePhaseSchema,
  publishIt: PublishItPhaseSchema
});

// WrapUp Trigger Schema
const WrapUpTriggerSchema = z.object({
  postPhase: z.boolean().default(true),
  manual: z.boolean().default(true),
  idle: z.boolean().default(false),
  idleTimeoutMinutes: z.number().min(1).max(1440).default(30)
});

// WrapUp Safety Schema
const WrapUpSafetySchema = z.object({
  dryRunDefault: z.boolean().default(false),
  requireTestsPass: z.boolean().default(false),
  secretDetection: z.boolean().default(true),
  forcePushBlocked: z.boolean().optional(),
  maxTimeoutMinutes: z.number().optional()
});

// WrapUp Output Schema
const WrapUpOutputSchema = z.object({
  verbose: z.boolean().optional(),
  silentMode: z.boolean().optional(),
  reportFormat: z.string().optional()
});

// WrapUp Config Schema
export const WrapUpConfigSchema = z.object({
  enabled: z.boolean().optional(), // Legacy, stripped during normalization
  trigger: WrapUpTriggerSchema,
  phases: WrapUpPhasesSchema,
  safety: WrapUpSafetySchema,
  output: WrapUpOutputSchema.optional()
});

// Main VibeFlow Config Schema
export const VibeFlowConfigSchema = z.object({
  preferences: UserPreferencesSchema,
  wrapUp: WrapUpConfigSchema,
  projectPath: z.string().optional()
});

// Type exports inferred from schemas
export type UserPreferences = z.infer<typeof UserPreferencesSchema>;
export type WrapUpConfig = z.infer<typeof WrapUpConfigSchema>;
export type VibeFlowConfig = z.infer<typeof VibeFlowConfigSchema>;

// Default config (matches Zod defaults)
export const DEFAULT_CONFIG: VibeFlowConfig = {
  preferences: {
    language: 'en',
    autoAdvance: false,
    verboseMode: false,
    beginnerMode: false
  },
  wrapUp: {
    trigger: {
      postPhase: true,
      manual: true,
      idle: false,
      idleTimeoutMinutes: 30
    },
    phases: {
      shipIt: { enabled: true, autoCommit: false, autoPush: false },
      rememberIt: { enabled: true, consolidateClaudeMd: true },
      selfImprove: { enabled: true, analyzeErrors: true },
      publishIt: { enabled: false }
    },
    safety: {
      dryRunDefault: false,
      requireTestsPass: false,
      secretDetection: true
    }
  }
};

// Config validation error class
export class ConfigValidationError extends Error {
  public readonly errors: ZodErrorIssue[];

  constructor(message: string, errors: ZodErrorIssue[]) {
    super(message);
    this.name = 'ConfigValidationError';
    this.errors = errors;
  }

  toJSON(): object {
    return {
      name: this.name,
      message: this.message,
      errors: this.errors.map(e => ({
        path: e.path.join('.'),
        message: e.message,
        code: e.code
      }))
    };
  }
}

export type ZodErrorIssue = {
  path: (string | number)[];
  message: string;
  code: string;
};

// Validation function
export function validateConfig(raw: unknown): VibeFlowConfig {
  const result = VibeFlowConfigSchema.safeParse(raw);

  if (!result.success) {
    const issues: ZodErrorIssue[] = result.error.issues.map(issue => ({
      path: issue.path,
      message: issue.message,
      code: issue.code
    }));

    throw new ConfigValidationError(
      `Config validation failed: ${issues.length} error(s) found`,
      issues
    );
  }

  return result.data;
}

// Partial validation for updates
export function validatePartialConfig(raw: unknown): Partial<VibeFlowConfig> {
  const result = VibeFlowConfigSchema.partial().safeParse(raw);

  if (!result.success) {
    const issues: ZodErrorIssue[] = result.error.issues.map(issue => ({
      path: issue.path,
      message: issue.message,
      code: issue.code
    }));

    throw new ConfigValidationError(
      `Partial config validation failed: ${issues.length} error(s) found`,
      issues
    );
  }

  return result.data;
}
