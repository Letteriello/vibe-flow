// Config Manager - User preferences and configuration
import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';

// Re-export fallback router
export * from './fallback-router.js';

// Re-export cognitive tiering router
export * from './cognitive-tiering.js';

// Re-export schema and config-loader
export * from './schema.js';
export * from './config-loader.js';

export interface UserPreferences {
  language: string;
  autoAdvance: boolean;
  verboseMode: boolean;
  beginnerMode: boolean;
}

export interface WrapUpConfig {
  trigger: {
    postPhase: boolean;
    manual: boolean;
    idle: boolean;
    idleTimeoutMinutes: number;
  };
  phases: {
    shipIt: {
      enabled: boolean;
      autoCommit: boolean;
      autoPush: boolean;
      checkNaming?: boolean;
      moveFiles?: boolean;
      cleanupTemp?: boolean;
      runDeploy?: boolean;
      useConventionalCommits?: boolean;
      confirmBeforeCommit?: boolean;
    };
    rememberIt: {
      enabled: boolean;
      consolidateClaudeMd: boolean;
      updateRules?: boolean;
      updateLocal?: boolean;
      maxContextSize?: string;
    };
    selfImprove: {
      enabled: boolean;
      analyzeErrors: boolean;
      generateRules?: boolean;
      minOccurrenceThreshold?: number;
    };
    publishIt: {
      enabled: boolean;
      platforms?: string[];
      requireReview?: boolean;
    };
  };
  safety: {
    requireTestsPass: boolean;
    secretDetection: boolean;
    forcePushBlocked?: boolean;
    maxTimeoutMinutes?: number;
  };
  output?: {
    verbose?: boolean;
    silentMode?: boolean;
    reportFormat?: string;
  };
}

export interface VibeFlowConfig {
  preferences: UserPreferences;
  wrapUp: WrapUpConfig;
  projectPath: string;
}

const DEFAULT_CONFIG: VibeFlowConfig = {
  preferences: {
    language: 'en',
    autoAdvance: false,
    verboseMode: false,
    beginnerMode: false
  },
  wrapUp: {
    trigger: {
      postPhase: false,
      manual: true,
      idle: false,
      idleTimeoutMinutes: 30
    },
    phases: {
      shipIt: { enabled: true, autoCommit: true, autoPush: false, useConventionalCommits: true, confirmBeforeCommit: true },
      rememberIt: { enabled: true, consolidateClaudeMd: true },
      selfImprove: { enabled: true, analyzeErrors: true },
      publishIt: { enabled: false }
    },
    safety: {
      requireTestsPass: false,
      secretDetection: true
    }
  },
  projectPath: process.cwd()
};

export class ConfigManager {
  private configPath: string;
  private config: VibeFlowConfig | null = null;

  constructor() {
    const configDir = join(homedir(), '.vibe-flow');
    this.configPath = join(configDir, 'config.json');
  }

  async get(): Promise<VibeFlowConfig> {
    // Return cached config without reading from disk
    if (this.config) {
      return this.config;
    }
    // If not cached, load from disk
    return this.load();
  }

  async load(): Promise<VibeFlowConfig> {
    try {
      const content = await fs.readFile(this.configPath, 'utf-8');
      const loaded = JSON.parse(content);
      this.config = this.mergeWithDefaults(loaded);
    } catch (error) {
      // Config doesn't exist, use defaults
      this.config = { ...DEFAULT_CONFIG };
      await this.save();
    }

    return this.config!;
  }

  async save(): Promise<void> {
    if (!this.config) {
      this.config = DEFAULT_CONFIG;
    }

    const configDir = dirname(this.configPath);
    await fs.mkdir(configDir, { recursive: true });

    const tempFile = this.configPath + '.tmp';
    await fs.writeFile(tempFile, JSON.stringify(this.config, null, 2), 'utf-8');
    await fs.rename(tempFile, this.configPath);
  }

  async update(updates: Partial<VibeFlowConfig>): Promise<VibeFlowConfig> {
    await this.load();
    this.config = this.mergeWithDefaults({ ...this.config, ...updates });
    await this.save();
    return this.config!;
  }

  async updatePreferences(prefs: Partial<UserPreferences>): Promise<UserPreferences> {
    await this.load();
    this.config!.preferences = { ...this.config!.preferences, ...prefs };
    await this.save();
    return this.config!.preferences;
  }

  async updateWrapUpConfig(config: Partial<WrapUpConfig>): Promise<WrapUpConfig> {
    await this.load();
    this.config!.wrapUp = { ...this.config!.wrapUp, ...config };
    await this.save();
    return this.config!.wrapUp;
  }

  private mergeWithDefaults(loaded: Partial<VibeFlowConfig>): VibeFlowConfig {
    // Handle legacy snake_case config keys (backwards compatibility)
    const normalizedWrapUp = this.normalizeWrapUpConfig(loaded.wrapUp);

    // Cast loaded.wrapUp.phases to any to handle legacy snake_case properties
    const wrapUpPhases = loaded.wrapUp?.phases as Record<string, any> | undefined;

    return {
      preferences: { ...DEFAULT_CONFIG.preferences, ...loaded.preferences },
      wrapUp: {
        ...DEFAULT_CONFIG.wrapUp,
        ...normalizedWrapUp,
        trigger: { ...DEFAULT_CONFIG.wrapUp.trigger, ...normalizedWrapUp?.trigger },
        phases: {
          shipIt: { ...DEFAULT_CONFIG.wrapUp.phases.shipIt, ...normalizedWrapUp?.phases?.shipIt, ...this.normalizeLegacyPhase(wrapUpPhases?.ship_it) },
          rememberIt: { ...DEFAULT_CONFIG.wrapUp.phases.rememberIt, ...normalizedWrapUp?.phases?.rememberIt, ...this.normalizeLegacyPhase(wrapUpPhases?.remember_it) },
          selfImprove: { ...DEFAULT_CONFIG.wrapUp.phases.selfImprove, ...normalizedWrapUp?.phases?.selfImprove, ...this.normalizeLegacyPhase(wrapUpPhases?.self_improve) },
          publishIt: { ...DEFAULT_CONFIG.wrapUp.phases.publishIt, ...normalizedWrapUp?.phases?.publishIt, ...this.normalizeLegacyPhase(wrapUpPhases?.publish_it) }
        },
        safety: { ...DEFAULT_CONFIG.wrapUp.safety, ...normalizedWrapUp?.safety }
      },
      projectPath: loaded.projectPath || DEFAULT_CONFIG.projectPath
    };
  }

  private normalizeWrapUpConfig(config: Partial<WrapUpConfig> | undefined): Partial<WrapUpConfig> {
    if (!config) return {};
    // Strip out any keys that could disable wrap-up - always use autonomous default
    const stripped: Partial<WrapUpConfig> = { ...config };
    delete (stripped as any).enabled;
    delete (stripped as any).disableWrapUp;
    delete (stripped as any).autoWrapUp;
    delete (stripped as any).wrapUpMode;
    return stripped;
  }

  private normalizeLegacyPhase(legacy: any): any {
    if (!legacy) return {};
    // Convert snake_case to camelCase for legacy configs
    const normalized: any = {};
    for (const [key, value] of Object.entries(legacy)) {
      const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
      normalized[camelKey] = value;
    }
    return normalized;
  }

  getConfigPath(): string {
    return this.configPath;
  }

  validate(config: Partial<VibeFlowConfig>): ValidationResult {
    const errors: string[] = [];

    // Validate preferences
    if (config.preferences) {
      if (config.preferences.language && !['en', 'pt-BR', 'pt', 'es'].includes(config.preferences.language)) {
        errors.push(`Invalid language: ${config.preferences.language}. Must be one of: en, pt-BR, pt, es`);
      }
    }

    // Validate wrapUp config
    if (config.wrapUp) {
      if (config.wrapUp.trigger) {
        if (config.wrapUp.trigger.idleTimeoutMinutes !== undefined) {
          if (config.wrapUp.trigger.idleTimeoutMinutes < 1 || config.wrapUp.trigger.idleTimeoutMinutes > 1440) {
            errors.push('idleTimeoutMinutes must be between 1 and 1440 (24 hours)');
          }
        }
      }

      if (config.wrapUp.safety) {
        if (config.wrapUp.safety.requireTestsPass !== undefined && typeof config.wrapUp.safety.requireTestsPass !== 'boolean') {
          errors.push('safety.requireTestsPass must be a boolean');
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}
