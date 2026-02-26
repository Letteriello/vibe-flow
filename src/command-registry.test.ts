// Command Registry Tests - Maps phases to bmalph CLI commands
import { CommandRegistry, CommandDefinition, DEFAULT_COMMAND_MAP } from './command-registry/index.js';

describe('CommandRegistry', () => {
  let registry: CommandRegistry;

  beforeEach(() => {
    registry = new CommandRegistry();
  });

  describe('getCommand', () => {
    it('should return command for valid phase and step', () => {
      const cmd = registry.getCommand('ANALYSIS', 1);

      expect(cmd).toBeDefined();
      expect(cmd?.command).toBe('/bmalph create-brief');
      expect(cmd?.description).toBe('Create project brief');
      expect(cmd?.checkpoint).toBe(true);
    });

    it('should return null for invalid phase', () => {
      const cmd = registry.getCommand('INVALID', 1);
      expect(cmd).toBeNull();
    });

    it('should return null for invalid step', () => {
      const cmd = registry.getCommand('ANALYSIS', 999);
      expect(cmd).toBeNull();
    });

    it('should return command without checkpoint flag', () => {
      const cmd = registry.getCommand('ANALYSIS', 2);

      expect(cmd).toBeDefined();
      expect(cmd?.checkpoint).toBeFalsy();
    });
  });

  describe('getPhaseCommands', () => {
    it('should return all commands for a phase', () => {
      const commands = registry.getPhaseCommands('ANALYSIS');

      expect(Object.keys(commands)).toHaveLength(5);
      expect(commands[1].command).toBe('/bmalph create-brief');
    });

    it('should return empty object for invalid phase', () => {
      const commands = registry.getPhaseCommands('NONEXISTENT');

      expect(commands).toEqual({});
    });
  });

  describe('isCheckpoint', () => {
    it('should return true for checkpoint steps', () => {
      expect(registry.isCheckpoint('ANALYSIS', 1)).toBe(true);
      expect(registry.isCheckpoint('ANALYSIS', 5)).toBe(true);
    });

    it('should return false for non-checkpoint steps', () => {
      expect(registry.isCheckpoint('ANALYSIS', 2)).toBe(false);
      expect(registry.isCheckpoint('ANALYSIS', 3)).toBe(false);
    });

    it('should return false for invalid phase/step', () => {
      expect(registry.isCheckpoint('INVALID', 1)).toBe(false);
      expect(registry.isCheckpoint('ANALYSIS', 999)).toBe(false);
    });
  });

  describe('getAvailablePhases', () => {
    it('should return all available phases', () => {
      const phases = registry.getAvailablePhases();

      expect(phases).toContain('ANALYSIS');
      expect(phases).toContain('PLANNING');
      expect(phases).toContain('SOLUTIONING');
      expect(phases).toContain('IMPLEMENTATION');
    });
  });

  describe('updateCommandMap', () => {
    it('should allow custom command mapping', () => {
      const customMap = {
        ANALYSIS: {
          1: { command: '/custom', description: 'Custom command', checkpoint: true }
        }
      };

      registry.updateCommandMap(customMap);

      const cmd = registry.getCommand('ANALYSIS', 1);
      expect(cmd?.command).toBe('/custom');
    });
  });

  describe('DEFAULT_COMMAND_MAP', () => {
    it('should have all required phases', () => {
      expect(DEFAULT_COMMAND_MAP.ANALYSIS).toBeDefined();
      expect(DEFAULT_COMMAND_MAP.PLANNING).toBeDefined();
      expect(DEFAULT_COMMAND_MAP.SOLUTIONING).toBeDefined();
      expect(DEFAULT_COMMAND_MAP.IMPLEMENTATION).toBeDefined();
    });

    it('should have checkpoint steps in ANALYSIS', () => {
      expect(DEFAULT_COMMAND_MAP.ANALYSIS[1].checkpoint).toBe(true);
      expect(DEFAULT_COMMAND_MAP.ANALYSIS[5].checkpoint).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle custom map with empty phases', () => {
      const customRegistry = new CommandRegistry({});

      expect(customRegistry.getCommand('ANALYSIS', 1)).toBeNull();
    });

    it('should handle step 0 gracefully', () => {
      const cmd = registry.getCommand('ANALYSIS', 0);
      expect(cmd).toBeNull();
    });

    it('should handle negative steps', () => {
      const cmd = registry.getCommand('ANALYSIS', -1);
      expect(cmd).toBeNull();
    });

    it('should handle empty string phase', () => {
      const cmd = registry.getCommand('', 1);
      expect(cmd).toBeNull();
    });
  });
});
