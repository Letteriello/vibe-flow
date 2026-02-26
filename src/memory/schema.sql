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
