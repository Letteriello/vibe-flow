// LCM (Large Context Management) Tool Schemas
// Defines input schemas for MCP tools related to context recovery

/**
 * Input schema for lcm_describe tool
 * Describes metadata for a given ID (pointer or file)
 */
export const lcmDescribeSchema = {
  type: 'object' as const,
  properties: {
    id: {
      type: 'string',
      description: 'The ID to describe. Can be a pointerId from a compacted summary or a file path'
    },
    projectPath: {
      type: 'string',
      description: 'Optional project path. Defaults to current working directory'
    }
  },
  required: ['id']
};

/**
 * Input schema for lcm_expand tool
 * Expands a compacted summary to reveal original messages
 */
export const lcmExpandSchema = {
  type: 'object' as const,
  properties: {
    pointerId: {
      type: 'string',
      description: 'The pointerId from a compacted summary to expand'
    },
    projectPath: {
      type: 'string',
      description: 'Optional project path. Defaults to current working directory'
    }
  },
  required: ['pointerId']
};

/**
 * Input schema for lcm_grep tool
 * Searches for regex pattern across all archived messages
 */
export const lcmGrepSchema = {
  type: 'object' as const,
  properties: {
    pattern: {
      type: 'string',
      description: 'Regex pattern to search for in message content'
    },
    options: {
      type: 'object',
      description: 'Search options',
      properties: {
        caseSensitive: {
          type: 'boolean',
          description: 'Whether the search should be case sensitive',
          default: false
        },
        maxResults: {
          type: 'number',
          description: 'Maximum number of results to return',
          default: 50
        },
        includeContent: {
          type: 'boolean',
          description: 'Include the matched content in results',
          default: true
        }
      }
    },
    projectPath: {
      type: 'string',
      description: 'Optional project path. Defaults to current working directory'
    }
  },
  required: ['pattern']
};

/**
 * Union type for all LCM tool inputs
 */
export type LCMDescribeInput = {
  id: string;
  projectPath?: string;
};

export type LCMExpandInput = {
  pointerId: string;
  projectPath?: string;
};

export type LCMGrepInput = {
  pattern: string;
  options?: {
    caseSensitive?: boolean;
    maxResults?: number;
    includeContent?: boolean;
  };
  projectPath?: string;
};

export type LCMToolInput = LCMDescribeInput | LCMExpandInput | LCMGrepInput;
