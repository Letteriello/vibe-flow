/**
 * Automation Proposer Module
 * Analyzes friction logs to propose automation opportunities for routine tasks
 */

export interface SkillProposal {
  name: string;
  description: string;
  type: 'skill' | 'hook';
  suggestedCommand: string;
  frequency: number;
}

export interface FrictionLogEntry {
  timestamp: string;
  command: string;
  context?: string;
  userAgent?: string;
  outcome?: 'success' | 'failure' | 'retry';
}

/**
 * Commands that are not related to code development and could be automated
 */
const NON_CODE_COMMANDS: Array<{ pattern: RegExp; skillName: string; description: string }> = [
  {
    pattern: /^(grep|rg|ag|find)\s+/,
    skillName: 'file-search',
    description: 'Automate file and content searching with intelligent pattern matching',
  },
  {
    pattern: /^docker\s+(restart|stop|start|logs|ps|exec)/,
    skillName: 'docker-management',
    description: 'Manage Docker containers, logs, and lifecycle operations',
  },
  {
    pattern: /^npm\s+(cache|outdated|prune|dedupe|ls|doctor)/,
    skillName: 'npm-maintenance',
    description: 'Automate npm cache cleaning, dependency cleanup, and health checks',
  },
  {
    pattern: /^(yarn|pnpm)\s+(cache|clean|prune)/,
    skillName: 'package-manager-maintenance',
    description: 'Clean caches and prune dependencies across package managers',
  },
  {
    pattern: /^git\s+(fetch|pull|branch|stash|clean)/,
    skillName: 'git-maintenance',
    description: 'Automate routine git operations like fetching, stashing, and cleaning',
  },
  {
    pattern: /^(chmod|chown|ln|mkdir|rmdir|touch)\s+/,
    skillName: 'filesystem-ops',
    description: 'Handle file system operations like permissions, symlinks, and directory management',
  },
  {
    pattern: /^(kill|pkill|killall|top|htop|ps\s+aux)/,
    skillName: 'process-management',
    description: 'Monitor and manage system processes',
  },
  {
    pattern: /^(curl|wget)\s+(-I|-head|--head)/,
    skillName: 'http-health-check',
    description: 'Perform HTTP health checks and endpoint monitoring',
  },
  {
    pattern: /^systemctl\s+(status|restart|stop|start|enable|disable)/,
    skillName: 'systemd-management',
    description: 'Manage systemd services and system daemons',
  },
  {
    pattern: /^(tail|head|cat|less|watch)\s+/,
    skillName: 'log-monitoring',
    description: 'Monitor logs and file contents in real-time',
  },
  {
    pattern: /^(tar|zip|unzip|gzip|gunzip)\s+/,
    skillName: 'archive-management',
    description: 'Compress and decompress files and directories',
  },
  {
    pattern: /^(psql|mysql|mongodump|mongorestore)\s+/,
    skillName: 'database-ops',
    description: 'Execute database operations and backups',
  },
  {
    pattern: /^(terraform|ansible|pulumi|kubectl)\s+/,
    skillName: 'infra-automation',
    description: 'Manage infrastructure and Kubernetes resources',
  },
  {
    pattern: /^(make|cmake|ninja|gradle|maven)\s+/,
    skillName: 'build-automation',
    description: 'Handle build system operations and compilation',
  },
  {
    pattern: /^sudo\s+/,
    skillName: 'elevated-commands',
    description: 'Execute commands with elevated privileges',
  },
];

/**
 * Maps command patterns to potential hook types
 */
const COMMAND_TO_HOOK_MAP: Map<RegExp, 'pre-commit' | 'pre-push' | 'on-fail' | 'on-success' | 'on-start'> = new Map([
  [/^git\s+(commit|push)/, 'pre-push'],
  [/^git\s+commit/, 'pre-commit'],
  [/^(npm|yarn|pnpm)\s+(run|test|build)/, 'on-success'],
]);

/**
 * AutomationProposer analyzes friction logs to identify repetitive non-code commands
 * and proposes automation opportunities in the form of Skills or Hooks
 */
export class AutomationProposer {
  private commandFrequency: Map<string, number> = new Map();
  private readonly minimumFrequencyThreshold = 2;

  /**
   * Analyze friction logs and propose automation skills
   * @param frictionLogs Array of friction log entries from past operations
   * @returns Array of SkillProposal objects for automating routine tasks
   */
  proposeSkills(frictionLogs: FrictionLogEntry[]): SkillProposal[] {
    this.commandFrequency.clear();
    const proposals: SkillProposal[] = [];

    // Count command frequencies
    for (const log of frictionLogs) {
      const command = log.command?.trim();
      if (!command) continue;

      // Normalize command (remove arguments, keep base command)
      const normalizedCommand = this.normalizeCommand(command);
      const currentCount = this.commandFrequency.get(normalizedCommand) || 0;
      this.commandFrequency.set(normalizedCommand, currentCount + 1);
    }

    // Identify patterns that exceed frequency threshold
    const frequentCommands = Array.from(this.commandFrequency.entries())
      .filter(([_, count]) => count >= this.minimumFrequencyThreshold)
      .sort((a, b) => b[1] - a[1]);

    // Generate proposals for non-code commands
    for (const [command, frequency] of frequentCommands) {
      const matchingRule = this.findMatchingRule(command);

      if (matchingRule) {
        // Check if a hook would be more appropriate
        const hookType = this.suggestHookType(command);
        const proposalType: 'skill' | 'hook' = hookType ? 'hook' : 'skill';

        proposals.push({
          name: matchingRule.skillName,
          description: matchingRule.description,
          type: proposalType,
          suggestedCommand: command,
          frequency,
        });
      } else if (this.isGenericCommand(command)) {
        // Generic command that appears frequently - suggest a generic skill
        proposals.push({
          name: this.generateGenericSkillName(command),
          description: this.generateGenericDescription(command),
          type: 'skill',
          suggestedCommand: command,
          frequency,
        });
      }
    }

    // Remove duplicates based on skill name
    const uniqueProposals = this.deduplicateProposals(proposals);

    return uniqueProposals;
  }

  /**
   * Normalize a command to its base form
   */
  private normalizeCommand(command: string): string {
    // Extract base command (first word or first two words for npm/yarn/git)
    const parts = command.split(/\s+/);
    if (parts[0] === 'git' || parts[0] === 'npm' || parts[0] === 'yarn' || parts[0] === 'pnpm') {
      return `${parts[0]} ${parts[1] || ''}`.trim();
    }
    return parts[0];
  }

  /**
   * Find a matching rule for the given command
   */
  private findMatchingRule(command: string): { skillName: string; description: string } | null {
    for (const rule of NON_CODE_COMMANDS) {
      if (rule.pattern.test(command)) {
        return { skillName: rule.skillName, description: rule.description };
      }
    }
    return null;
  }

  /**
   * Determine if a hook would be more appropriate for this command
   */
  private suggestHookType(command: string): 'pre-commit' | 'pre-push' | 'on-fail' | 'on-success' | 'on-start' | null {
    const entries = Array.from(COMMAND_TO_HOOK_MAP.entries());
    for (const [pattern, hookType] of entries) {
      if (pattern.test(command)) {
        return hookType;
      }
    }
    return null;
  }

  /**
   * Check if command is a generic/system command that could be automated
   */
  private isGenericCommand(command: string): boolean {
    const genericPatterns = [
      /^ls/, /^cd/, /^pwd/, /^cp/, /^mv/, /^rm/, /^echo/,
      /^cat/, /^grep/, /^find/, /^chmod/, /^chown/,
    ];
    return genericPatterns.some(pattern => pattern.test(command));
  }

  /**
   * Generate a skill name for generic commands
   */
  private generateGenericSkillName(command: string): string {
    const base = command.split(/\s+/)[0];
    const nameMap: Record<string, string> = {
      ls: 'directory-listing',
      cd: 'navigation',
      pwd: 'working-directory',
      cp: 'file-copy',
      mv: 'file-move',
      rm: 'file-removal',
      echo: 'output-echo',
      cat: 'file-reading',
      grep: 'content-search',
      find: 'file-finding',
      chmod: 'permission-management',
      chown: 'ownership-management',
    };
    return nameMap[base] || 'generic-filesystem-op';
  }

  /**
   * Generate a description for generic commands
   */
  private generateGenericDescription(command: string): string {
    const base = command.split(/\s+/)[0];
    const descMap: Record<string, string> = {
      ls: 'Automate directory listing and file enumeration',
      cd: 'Automate directory navigation',
      pwd: 'Report and manage working directory',
      cp: 'Automate file copying operations',
      mv: 'Automate file moving and renaming',
      rm: 'Handle file removal with safety checks',
      echo: 'Output text and variables',
      cat: 'Read and display file contents',
      grep: 'Search for patterns in files',
      find: 'Locate files by name, type, or attributes',
      chmod: 'Manage file permissions',
      chown: 'Manage file ownership',
    };
    return descMap[base] || 'Automate routine file system operations';
  }

  /**
   * Remove duplicate proposals based on skill name
   */
  private deduplicateProposals(proposals: SkillProposal[]): SkillProposal[] {
    const seen = new Set<string>();
    const unique: SkillProposal[] = [];

    for (const proposal of proposals) {
      if (!seen.has(proposal.name)) {
        seen.add(proposal.name);
        unique.push(proposal);
      }
    }

    return unique;
  }

  /**
   * Get frequency map for testing/debugging purposes
   */
  getCommandFrequency(): Map<string, number> {
    return new Map(this.commandFrequency);
  }
}

export default AutomationProposer;
