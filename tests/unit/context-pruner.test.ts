/**
 * ContextEditor Unit Tests
 *
 * Testa o sistema de edição ativa de contexto para limpeza do histórico.
 *
 * Executar com:
 *   npm test -- --testPathPattern=context-pruner
 *   npx jest tests/unit/context-pruner.test.ts
 */

import * as path from 'path';
import { fileURLToPath } from 'url';

// ESM compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');

const { ContextEditor, editContext, clearThinkingBlocks, clearToolResults, needsContextCleaning } =
  await import(path.join(projectRoot, 'dist/context/context-pruner.js'));

// Helper to create mock messages
function createMockMessages(count: number, withThinking: boolean = false): Array<{ role: string; content: string; timestamp: string }> {
  const messages = [];
  for (let i = 0; i < count; i++) {
    let content = `Message ${i}: ${'x'.repeat(100)}`;
    if (withThinking && i % 3 === 1) {
      content = `<thinking>This is reasoning for message ${i} with lots of details that could be pruned.</thinking>\n\n${content}`;
    }
    messages.push({
      role: i % 3 === 0 ? 'user' : 'assistant',
      content,
      timestamp: new Date(Date.now() - i * 1000).toISOString()
    });
  }
  return messages;
}

// Helper to create mock tool messages
function createMockToolMessages(): Array<Record<string, unknown>> {
  return [
    { role: 'user', content: 'Read file', timestamp: '2026-01-01T00:00:00Z' },
    { role: 'assistant', content: 'Reading file...', timestamp: '2026-01-01T00:00:01Z' },
    { role: 'tool', content: 'File content here...', name: 'Read', timestamp: '2026-01-01T00:00:02Z' },
    { role: 'user', content: 'Grep pattern', timestamp: '2026-01-01T00:00:03Z' },
    { role: 'assistant', content: 'Searching...', timestamp: '2026-01-01T00:00:04Z' },
    { role: 'tool', content: 'Found 5 matches...', name: 'Grep', timestamp: '2026-01-01T00:00:05Z' },
    { role: 'user', content: 'Bash command', timestamp: '2026-01-01T00:00:06Z' },
    { role: 'assistant', content: 'Running...', timestamp: '2026-01-01T00:00:07Z' },
    { role: 'tool', content: 'Command output...', name: 'Bash', timestamp: '2026-01-01T00:00:08Z' },
    { role: 'user', content: 'Most recent message', timestamp: '2026-01-01T00:00:09Z' }
  ];
}

describe('ContextEditor', () => {
  describe('token estimation', () => {
    it('should estimate tokens correctly', () => {
      const editor = new ContextEditor();
      const messages = createMockMessages(10);

      const estimation = editor.estimateTokens(messages);

      expect(estimation.total).toBeGreaterThan(0);
      expect(estimation.byMessage.length).toBe(10);
    });

    it('should track tokens by role', () => {
      const editor = new ContextEditor();
      const messages = createMockMessages(10);

      const estimation = editor.estimateTokens(messages);

      expect(estimation.byRole.get('user')).toBeGreaterThan(0);
      expect(estimation.byRole.get('assistant')).toBeGreaterThan(0);
    });
  });

  describe('needsCleaning', () => {
    it('should return false when under threshold', () => {
      const editor = new ContextEditor({ maxTokens: 100000, warningThreshold: 0.8 });
      const messages = createMockMessages(5);

      const result = editor.needsCleaning(messages);

      expect(result).toBe(false);
    });

    it('should return true when over threshold', () => {
      const editor = new ContextEditor({ maxTokens: 1000, warningThreshold: 0.5 });
      const messages = createMockMessages(50);

      const result = editor.needsCleaning(messages);

      expect(result).toBe(true);
    });
  });

  describe('getTokenStatus', () => {
    it('should return correct status', () => {
      const editor = new ContextEditor({ maxTokens: 10000, warningThreshold: 0.8 });
      const messages = createMockMessages(5);

      const status = editor.getTokenStatus(messages);

      expect(status.limit).toBe(10000);
      expect(status.current).toBeGreaterThan(0);
      expect(status.percentage).toBeLessThan(1);
      expect(status.needsCleaning).toBe(false);
    });
  });

  describe('ThinkingBlockClearing', () => {
    it('should remove thinking blocks from messages', () => {
      const messages: Array<{ role: string; content: string }> = [
        { role: 'assistant', content: '<thinking>Reasoning here</thinking>\n\nFinal answer' },
        { role: 'user', content: 'Hello' }
      ];

      const result = clearThinkingBlocks(messages);

      expect(result[0].content).not.toContain('<thinking>');
      expect(result[0].content).toContain('Final answer');
      expect(result[1].content).toBe('Hello');
    });

    it('should handle messages without thinking blocks', () => {
      const messages: Array<{ role: string; content: string }> = [
        { role: 'assistant', content: 'Just a normal response' }
      ];

      const result = clearThinkingBlocks(messages);

      expect(result[0].content).toBe('Just a normal response');
    });

    it('should apply thinking block clearing in editor', () => {
      const editor = new ContextEditor({ enableThinkingClearing: true, enableToolResultClearing: false });
      const messages = createMockMessages(10, true);

      const result = editor.applyThinkingBlockClearing(messages);

      expect(result.cleared).toBeGreaterThan(0);
    });
  });

  describe('ToolResultClearing', () => {
    it('should clear tool results but preserve essential tools', () => {
      const editor = new ContextEditor({
        preserveRecentMessages: 2,
        essentialTools: ['Read'],
        toolResultRemovalPercentage: 0.5
      });
      const messages = createMockToolMessages();

      const result = editor.applyToolResultClearing(messages);

      // Should clear some non-essential tool messages
      expect(result.cleared).toBeGreaterThan(0);
    });

    it('should preserve recent messages', () => {
      const editor = new ContextEditor({ preserveRecentMessages: 5 });
      const messages = createMockToolMessages();

      const result = editor.applyToolResultClearing(messages);

      // Last 5 messages should be preserved
      expect(result.messages.length).toBe(messages.length);
    });
  });

  describe('editContext', () => {
    it('should return original messages when under threshold', () => {
      const editor = new ContextEditor({ maxTokens: 100000, warningThreshold: 0.8 });
      const messages = createMockMessages(5);

      const result = editor.editContext(messages);

      expect(result.strategyApplied).toBe('none');
      expect(result.tokensSaved).toBe(0);
    });

    it('should apply strategies when over threshold', () => {
      const editor = new ContextEditor({
        maxTokens: 5000,
        warningThreshold: 0.5,
        enableThinkingClearing: true,
        enableToolResultClearing: true
      });
      const messages = createMockMessages(50, true);

      const result = editor.editContext(messages);

      expect(result.strategyApplied).not.toBe('none');
      expect(result.tokensSaved).toBeGreaterThan(0);
      expect(result.originalTokenCount).toBeGreaterThan(result.newTokenCount);
    });
  });

  describe('pure functions', () => {
    it('editContext should work as pure function', () => {
      const messages = createMockMessages(5);

      const result1 = editContext(messages, { maxTokens: 1000 });
      const result2 = editContext(messages, { maxTokens: 1000 });

      expect(result1.messages.length).toBe(result2.messages.length);
    });

    it('needsContextCleaning should work correctly', () => {
      const smallMessages = createMockMessages(5);
      const largeMessages = createMockMessages(100);

      expect(needsContextCleaning(smallMessages, 100000, 0.8)).toBe(false);
      expect(needsContextCleaning(largeMessages, 1000, 0.5)).toBe(true);
    });
  });

  describe('getStatistics', () => {
    it('should return correct statistics', () => {
      const editor = new ContextEditor();
      const messages = createMockMessages(10);

      const stats = editor.getStatistics(messages);

      expect(stats.messageCount).toBe(10);
      expect(stats.tokenCount).toBeGreaterThan(0);
      expect(stats.byRole.user).toBeGreaterThan(0);
      expect(stats.byRole.assistant).toBeGreaterThan(0);
    });
  });

  describe('configuration', () => {
    it('should use default config when not provided', () => {
      const editor = new ContextEditor();

      const config = editor.getConfig();

      expect(config.maxTokens).toBe(100000);
      expect(config.warningThreshold).toBe(0.8);
    });

    it('should update config correctly', () => {
      const editor = new ContextEditor();

      editor.updateConfig({ maxTokens: 50000 });

      const config = editor.getConfig();
      expect(config.maxTokens).toBe(50000);
    });
  });
});
