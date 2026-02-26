// WAL Parser Tests - Unit tests para o parser assíncrono via streams

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  WALParser,
  parseWALFile,
  forEachWALEvent,
  type WALLogEvent
} from '../../src/wrap-up/wal-parser';

describe('WALParser', () => {
  let testDir: string;
  let testFile: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wal-parser-test-'));
  });

  afterEach(() => {
    // Cleanup
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('parseFile', () => {
    it('should parse a valid WAL file line by line', async () => {
      // Create test WAL file
      testFile = path.join(testDir, 'test.wal');
      const events = [
        { id: '1', timestamp: 1000, action: 'write', target: '/file1.txt', content: 'content1' },
        { id: '2', timestamp: 2000, action: 'edit', target: '/file1.txt', content: 'content2' },
        { id: '3', timestamp: 3000, action: 'delete', target: '/file2.txt' }
      ];
      fs.writeFileSync(testFile, events.map(e => JSON.stringify(e)).join('\n'), 'utf-8');

      const parser = new WALParser({ metadataOnly: true });
      const result = await parser.parseFile(testFile);

      expect(result.parsedEvents).toBe(3);
      expect(result.events).toHaveLength(3);
      expect(result.events[0].content).toBeUndefined(); // metadataOnly removes content
      expect(result.events[0].target).toBe('/file1.txt');
      expect(result.events[2].action).toBe('delete');
    });

    it('should skip invalid JSON lines', async () => {
      testFile = path.join(testDir, 'invalid.wal');
      fs.writeFileSync(testFile, [
        '{"id": "1", "timestamp": 1000, "action": "write"}',
        'invalid json line',
        '{"id": "2", "timestamp": 2000, "action": "read"}'
      ].join('\n'), 'utf-8');

      const parser = new WALParser();
      const result = await parser.parseFile(testFile);

      expect(result.parsedEvents).toBe(2);
      expect(result.skippedLines).toBe(1);
    });

    it('should handle empty file', async () => {
      testFile = path.join(testDir, 'empty.wal');
      fs.writeFileSync(testFile, '', 'utf-8');

      const parser = new WALParser();
      const result = await parser.parseFile(testFile);

      expect(result.events).toHaveLength(0);
      expect(result.parsedEvents).toBe(0);
    });

    it('should throw error for non-existent file', async () => {
      const parser = new WALParser();
      const result = await parser.parseFile('/non/existent/file.wal');

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('not found');
    });

    it('should extract metadata only when metadataOnly is true', async () => {
      testFile = path.join(testDir, 'meta.wal');
      const largeContent = 'x'.repeat(10000); // 10KB of content
      fs.writeFileSync(testFile, JSON.stringify({
        id: '1',
        timestamp: 1000,
        action: 'write',
        target: '/large.txt',
        content: largeContent,
        metadata: { key: 'value' }
      }) + '\n', 'utf-8');

      const parser = new WALParser({ metadataOnly: true });
      const result = await parser.parseFile(testFile);

      expect(result.events[0].content).toBeUndefined(); // Content removed
      expect(result.events[0].metadata).toBeDefined(); // Metadata preserved
    });
  });

  describe('parseFileGenerator', () => {
    it('should yield events one by one without loading all in memory', async () => {
      testFile = path.join(testDir, 'generator.wal');
      const events = Array.from({ length: 100 }, (_, i) => ({
        id: `event-${i}`,
        timestamp: 1000 + i,
        action: 'write' as const,
        target: `/file${i}.txt`
      }));
      fs.writeFileSync(testFile, events.map(e => JSON.stringify(e)).join('\n'), 'utf-8');

      const parser = new WALParser();
      const collected: WALLogEvent[] = [];

      for await (const event of parser.parseFileGenerator(testFile)) {
        collected.push(event);
      }

      expect(collected).toHaveLength(100);
    });
  });

  describe('parseDirectory', () => {
    it('should parse multiple WAL files in a directory', async () => {
      // Create multiple files
      fs.writeFileSync(path.join(testDir, 'session1.wal'), JSON.stringify({
        id: '1', timestamp: 1000, action: 'write', target: '/a.txt'
      }) + '\n');
      fs.writeFileSync(path.join(testDir, 'session2.wal'), JSON.stringify({
        id: '2', timestamp: 2000, action: 'edit', target: '/b.txt'
      }) + '\n');
      fs.writeFileSync(path.join(testDir, 'other.txt'), 'not a wal file');

      const parser = new WALParser();
      const result = await parser.parseDirectory(testDir, '*.wal');

      expect(result.parsedEvents).toBe(2);
      expect(result.events).toHaveLength(2);
    });
  });

  describe('convenience functions', () => {
    it('parseWALFile should work as a simple wrapper', async () => {
      testFile = path.join(testDir, 'simple.wal');
      fs.writeFileSync(testFile, JSON.stringify({
        id: '1', timestamp: 1000, action: 'write', target: '/test.txt'
      }) + '\n');

      const events = await parseWALFile(testFile);

      expect(events).toHaveLength(1);
      expect(events[0].id).toBe('1');
    });

    it('forEachWALEvent should iterate and call callback', async () => {
      testFile = path.join(testDir, 'foreach.wal');
      fs.writeFileSync(testFile, [
        { id: '1', timestamp: 1000, action: 'write', target: '/a.txt' },
        { id: '2', timestamp: 2000, action: 'read', target: '/b.txt' }
      ].map(e => JSON.stringify(e)).join('\n'));

      let count = 0;
      const callback = jest.fn();

      await forEachWALEvent(testFile, callback);

      expect(callback).toHaveBeenCalledTimes(2);
    });
  });

  describe('event loop blocking prevention', () => {
    it('should process large file without blocking event loop', async () => {
      // Create a large file with many events
      testFile = path.join(testDir, 'large.wal');
      const events = Array.from({ length: 1000 }, (_, i) => ({
        id: `event-${i}`,
        timestamp: 1000 + i,
        action: 'write',
        target: `/file${i}.txt`
      }));
      fs.writeFileSync(testFile, events.map(e => JSON.stringify(e)).join('\n'), 'utf-8');

      const parser = new WALParser();
      const result = await parser.parseFile(testFile);

      // Should complete without timeout
      expect(result.parsedEvents).toBe(1000);
    }, 10000); // 10 second timeout
  });
});
