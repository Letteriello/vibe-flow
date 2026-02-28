// TDD Temp File Utility - Manages temporary test files for TDD execution

import { promises as fs } from 'fs';
import { join } from 'path';

/**
 * Configuration for temporary TDD files
 */
export interface TDDTempFileConfig {
  /** Directory to store temp files (default: .vibe-flow/tdd-temp) */
  tempDir?: string;
  /** Maximum file size in bytes (default: 50KB) */
  maxFileSize?: number;
  /** Auto-cleanup timeout in ms (default: 60000) */
  cleanupTimeout?: number;
}

/**
 * Result of a temporary file operation
 */
export interface TDDTempFileResult {
  testFile: string;
  implementationFile: string;
  cleanup: () => Promise<void>;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Required<TDDTempFileConfig> = {
  tempDir: '.vibe-flow/tdd-temp',
  maxFileSize: 50 * 1024, // 50KB
  cleanupTimeout: 60000 // 1 minute
};

/**
 * Manages temporary files for TDD test execution
 */
export class TDDTempFileManager {
  private config: Required<TDDTempFileConfig>;
  private createdFiles: string[] = [];

  constructor(config?: TDDTempFileConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize the temp directory
   */
  async initialize(): Promise<void> {
    await fs.mkdir(this.config.tempDir, { recursive: true });
  }

  /**
   * Create temporary files for test and implementation
   */
  async createFiles(testCode: string, implementationCode: string, prefix?: string): Promise<TDDTempFileResult> {
    const timestamp = Date.now();
    const filePrefix = prefix || `tdd-${timestamp}`;

    const testFile = join(this.config.tempDir, `${filePrefix}.test.ts`);
    const implementationFile = join(this.config.tempDir, `${filePrefix}.ts`);

    // Validate file sizes
    if (testCode.length > this.config.maxFileSize) {
      throw new Error(`Test code exceeds maximum size of ${this.config.maxFileSize} bytes`);
    }
    if (implementationCode.length > this.config.maxFileSize) {
      throw new Error(`Implementation code exceeds maximum size of ${this.config.maxFileSize} bytes`);
    }

    // Write files
    await fs.writeFile(testFile, testCode, 'utf-8');
    await fs.writeFile(implementationFile, implementationCode, 'utf-8');

    this.createdFiles.push(testFile, implementationFile);

    return {
      testFile,
      implementationFile,
      cleanup: () => this.cleanupFiles([testFile, implementationFile])
    };
  }

  /**
   * Create just a test file (for RED phase validation)
   */
  async createTestFile(testCode: string, prefix?: string): Promise<{ file: string; cleanup: () => Promise<void> }> {
    const timestamp = Date.now();
    const filePrefix = prefix || `tdd-test-${timestamp}`;
    const testFile = join(this.config.tempDir, `${filePrefix}.test.ts`);

    if (testCode.length > this.config.maxFileSize) {
      throw new Error(`Test code exceeds maximum size of ${this.config.maxFileSize} bytes`);
    }

    await fs.writeFile(testFile, testCode, 'utf-8');
    this.createdFiles.push(testFile);

    return {
      file: testFile,
      cleanup: () => this.cleanupFiles([testFile])
    };
  }

  /**
   * Cleanup specific files
   */
  private async cleanupFiles(files: string[]): Promise<void> {
    for (const file of files) {
      try {
        await fs.unlink(file);
        this.createdFiles = this.createdFiles.filter(f => f !== file);
      } catch {
        // File may not exist, ignore error
      }
    }
  }

  /**
   * Cleanup all created temporary files
   */
  async cleanupAll(): Promise<void> {
    await this.cleanupFiles([...this.createdFiles]);
  }

  /**
   * Get the Jest command to run a specific test file
   */
  getJestCommand(testFile: string): string {
    return `npx jest "${testFile}" --json`;
  }

  /**
   * Get all created files
   */
  getCreatedFiles(): string[] {
    return [...this.createdFiles];
  }
}

/**
 * Create a default TDD temp file manager
 */
export function createTDDTempFileManager(config?: TDDTempFileConfig): TDDTempFileManager {
  return new TDDTempFileManager(config);
}
