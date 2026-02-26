import Database from "better-sqlite3";
import { mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const DB_PATH = join(__dirname, "..", "..", ".vibe-flow", "memory.db");

// Ensure .vibe-flow directory exists
const dbDir = dirname(DB_PATH);
if (!existsSync(dbDir)) {
  mkdirSync(dbDir, { recursive: true });
}

// Initialize database connection
const db = new Database(DB_PATH);

// Enable WAL mode for better crash recovery
db.pragma("journal_mode = WAL");

// Schema definition
const SCHEMA = `
-- Agent Memories Table
CREATE TABLE IF NOT EXISTS agent_memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_scope VARCHAR(50) NOT NULL CHECK(agent_scope IN ('agent', 'team', 'project', 'global')),
  context_key VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(agent_scope, context_key)
);

-- Index for faster lookups by scope
CREATE INDEX IF NOT EXISTS idx_agent_memories_scope ON agent_memories(agent_scope);

-- Index for faster lookups by key
CREATE INDEX IF NOT EXISTS idx_agent_memories_key ON agent_memories(context_key);
`;

// Execute schema
db.exec(SCHEMA);

export type AgentScope = "agent" | "team" | "project" | "global";

export interface Memory {
  id: number;
  agent_scope: AgentScope;
  context_key: string;
  content: string;
  created_at: string;
}

/**
 * Save a memory entry to the database.
 * If a memory with the same scope and key exists, it will be updated.
 */
export function saveMemory(scope: AgentScope, key: string, content: string): void {
  const stmt = db.prepare(`
    INSERT INTO agent_memories (agent_scope, context_key, content)
    VALUES (?, ?, ?)
    ON CONFLICT(agent_scope, context_key) DO UPDATE SET
      content = excluded.content,
      created_at = CURRENT_TIMESTAMP
  `);
  stmt.run(scope, key, content);
}

/**
 * Retrieve a memory entry from the database by scope and key.
 * Returns undefined if not found.
 */
export function retrieveMemory(scope: AgentScope, key: string): Memory | undefined {
  const stmt = db.prepare(`
    SELECT id, agent_scope, context_key, content, created_at
    FROM agent_memories
    WHERE agent_scope = ? AND context_key = ?
  `);
  return stmt.get(scope, key) as Memory | undefined;
}
