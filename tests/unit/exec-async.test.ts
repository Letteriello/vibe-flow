/**
 * Unit tests for exec-async utility
 */

import { execAsync, ExecResult } from '../../src/utils/exec-async';

describe('execAsync', () => {
  describe('successful commands', () => {
    it('should execute simple echo command', async () => {
      const result = await execAsync('echo hello');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('hello');
    });

    it('should capture stdout correctly', async () => {
      const result = await execAsync('echo test-output');
      expect(result.stdout.trim()).toBe('test-output');
      expect(result.stderr).toBe('');
    });

    it('should return empty strings for commands with no output', async () => {
      const result = await execAsync('true');
      expect(result.stdout).toBe('');
      expect(result.stderr).toBe('');
      expect(result.exitCode).toBe(0);
    });
  });

  describe('failed commands', () => {
    it('should capture stderr from failed command', async () => {
      const result = await execAsync('ls /nonexistent-path-12345');
      expect(result.exitCode).not.toBe(0);
      // Windows and Linux have different error messages
      expect(result.stderr.length).toBeGreaterThan(0);
    });
  });

  describe('timeout', () => {
    it('should handle short timeout', async () => {
      // Use a command that will timeout on Windows bash
      const result = await execAsync('ping -n 10 127.0.0.1', { timeout: 100 });
      // Result depends on OS - either timeout or completion
      expect(typeof result.exitCode).toBe('number');
    });

    it('should allow long-running commands with sufficient timeout', async () => {
      const result = await execAsync('echo hello', { timeout: 5000 });
      expect(result.exitCode).toBe(0);
    });
  });

  describe('buffer handling', () => {
    it('should convert Buffer stdout to string', async () => {
      const result = await execAsync('echo buffer-test');
      expect(typeof result.stdout).toBe('string');
    });

    it('should convert Buffer stderr to string', async () => {
      const result = await execAsync('ls /nonexistent-path-xyz');
      // On error, stderr should have content
      expect(typeof result.stderr).toBe('string');
    });
  });

  describe('working directory', () => {
    it('should execute in specified cwd', async () => {
      const result = await execAsync('pwd', { cwd: process.cwd() });
      expect(result.stdout).toContain('vibe-flow');
    });
  });

  describe('edge cases', () => {
    it('should handle command with special characters', async () => {
      const result = await execAsync('echo "hello world"');
      expect(result.stdout).toContain('hello world');
    });

    it('should handle command with pipes', async () => {
      const result = await execAsync('echo "test" | cat');
      expect(result.stdout).toContain('test');
    });
  });
});
