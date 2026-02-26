// Configuration Loader - Reads, validates, and applies defaults to config.json
import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { z } from 'zod';
import {
  validateConfig,
  validatePartialConfig,
  ConfigValidationError,
  VibeFlowConfig,
  VibeFlowConfigSchema,
  DEFAULT_CONFIG
} from './schema.js';

export { ConfigValidationError, VibeFlowConfig } from './schema.js';

export class ConfigLoader {
  private configPath: string;
  private cachedConfig: VibeFlowConfig | null = null;

  constructor(configPath?: string) {
    // Default path: ~/.vibe-flow/config.json
    const defaultPath = join(homedir(), '.vibe-flow', 'config.json');
    this.configPath = configPath || defaultPath;
  }

  /**
   * Load configuration from disk, validate against schema, and apply defaults
   */
  async load(): Promise<VibeFlowConfig> {
    try {
      const content = await fs.readFile(this.configPath, 'utf-8');

      // First, attempt to parse JSON (this catches syntax errors)
      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch (parseError) {
        const error = parseError as Error;
        throw new ConfigValidationError(
          `Invalid JSON syntax in config file: ${error.message}`,
          [{ path: [], message: error.message, code: 'invalid_type' }]
        );
      }

      // Apply defaults using partial schema first (Zod defaults only apply when field exists)
      const PartialSchema = VibeFlowConfigSchema.partial();
      const withDefaults = PartialSchema.safeParse(parsed);

      if (!withDefaults.success) {
        const issues = withDefaults.error.issues.map(issue => ({
          path: issue.path,
          message: issue.message,
          code: issue.code
        }));
        throw new ConfigValidationError(
          `Config validation failed: ${issues.length} error(s) found`,
          issues
        );
      }

      // Validate against full schema to ensure type safety after defaults applied
      const validated = validateConfig(withDefaults.data);

      this.cachedConfig = validated;
      return validated;
    } catch (error) {
      // If it's already a ConfigValidationError, rethrow
      if (error instanceof ConfigValidationError) {
        throw error;
      }

      // Config doesn't exist or is unreadable - create with defaults
      const defaultConfig = { ...DEFAULT_CONFIG, projectPath: process.cwd() };
      await this.save(defaultConfig);
      this.cachedConfig = defaultConfig;
      return defaultConfig;
    }
  }

  /**
   * Get cached config or load from disk
   */
  async get(): Promise<VibeFlowConfig> {
    if (this.cachedConfig !== null) {
      return this.cachedConfig;
    }
    return this.load();
  }

  /**
   * Save configuration to disk (atomic write)
   */
  async save(config: VibeFlowConfig): Promise<void> {
    const configDir = dirname(this.configPath);
    await fs.mkdir(configDir, { recursive: true });

    const tempFile = this.configPath + '.tmp';
    await fs.writeFile(tempFile, JSON.stringify(config, null, 2), 'utf-8');
    await fs.rename(tempFile, this.configPath);

    this.cachedConfig = config;
  }

  /**
   * Update configuration with partial data
   * Validates the partial data and merges with current config
   */
  async update(updates: Partial<VibeFlowConfig>): Promise<VibeFlowConfig> {
    // Load current config first
    const current = await this.load();

    // Validate the partial updates
    const validatedUpdates = validatePartialConfig(updates);

    // Deep merge: current config + validated updates
    const merged = this.deepMerge(current, validatedUpdates);

    // Validate the merged result to ensure type safety
    const final = validateConfig(merged);

    await this.save(final);
    return final;
  }

  /**
   * Check if config file exists
   */
  async exists(): Promise<boolean> {
    try {
      await fs.access(this.configPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the config file path
   */
  getConfigPath(): string {
    return this.configPath;
  }

  /**
   * Clear cached config (forces reload from disk)
   */
  clearCache(): void {
    this.cachedConfig = null;
  }

  /**
   * Deep merge two objects, with source taking precedence
   */
  private deepMerge<T extends Record<string, unknown>>(target: T, source: Partial<T>): T {
    const result: Record<string, unknown> = { ...target };

    for (const key of Object.keys(source)) {
      const sourceValue = source[key as keyof T];
      const targetValue = target[key as keyof T];

      if (
        sourceValue !== null &&
        typeof sourceValue === 'object' &&
        !Array.isArray(sourceValue) &&
        targetValue !== null &&
        typeof targetValue === 'object' &&
        !Array.isArray(targetValue)
      ) {
        // Recursively merge nested objects
        result[key] = this.deepMerge(
          targetValue as Record<string, unknown>,
          sourceValue as Record<string, unknown>
        );
      } else if (sourceValue !== undefined) {
        // Source value takes precedence (including null)
        result[key] = sourceValue;
      }
    }

    return result as T;
  }
}

// Default singleton instance
let defaultLoader: ConfigLoader | null = null;

export function getConfigLoader(configPath?: string): ConfigLoader {
  if (!defaultLoader) {
    defaultLoader = new ConfigLoader(configPath);
  }
  return defaultLoader;
}

export async function loadConfig(configPath?: string): Promise<VibeFlowConfig> {
  const loader = new ConfigLoader(configPath);
  return loader.load();
}

export async function getConfig(configPath?: string): Promise<VibeFlowConfig> {
  const loader = getConfigLoader(configPath);
  return loader.get();
}
