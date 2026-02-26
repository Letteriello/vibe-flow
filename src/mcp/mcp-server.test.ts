// MCP Tools Registration Tests - Story 2.1
import { MCPServer, MCPTool } from './index.js';

describe('MCPServer', () => {
  let server: MCPServer;

  beforeEach(() => {
    server = new MCPServer();
  });

  describe('AC #1: MCP Tools Registration', () => {
    it('should register all 4 core MCP tools', () => {
      const tools = server.getTools();

      const toolNames = tools.map(t => t.name);
      expect(toolNames).toContain('start_project');
      expect(toolNames).toContain('advance_step');
      expect(toolNames).toContain('get_status');
      expect(toolNames).toContain('analyze_project');
    });

    it('should expose validated schemas for all tools', () => {
      const tools = server.getTools();

      for (const tool of tools) {
        expect(tool).toHaveProperty('name');
        expect(tool).toHaveProperty('description');
        expect(tool).toHaveProperty('inputSchema');
        expect(tool.inputSchema).toHaveProperty('type');
        expect(tool.inputSchema).toHaveProperty('properties');
      }
    });

    it('should describe required parameters for start_project', () => {
      const tool = server.getTool('start_project');

      expect(tool?.inputSchema.required).toContain('projectName');
      expect(tool?.inputSchema.properties.projectName.type).toBe('string');
    });

    it('should describe optional parameters for advance_step', () => {
      const tool = server.getTool('advance_step');

      expect(tool?.inputSchema.properties).toHaveProperty('force');
      expect(tool?.inputSchema.properties).toHaveProperty('executeCommand');
    });

    it('should describe optional parameters for analyze_project', () => {
      const tool = server.getTool('analyze_project');

      expect(tool?.inputSchema.properties).toHaveProperty('outputFormat');
      expect(tool?.inputSchema.properties.outputFormat.enum).toContain('json');
      expect(tool?.inputSchema.properties.outputFormat.enum).toContain('markdown');
    });

    it('should have handlers for all tools', () => {
      const tools = server.getTools();

      for (const tool of tools) {
        expect(tool.handler).toBeDefined();
        expect(typeof tool.handler).toBe('function');
      }
    });

    it('should return tool by name', () => {
      const tool = server.getTool('start_project');

      expect(tool).toBeDefined();
      expect(tool?.name).toBe('start_project');
    });

    it('should return undefined for unknown tool', () => {
      const tool = server.getTool('unknown_tool');

      expect(tool).toBeUndefined();
    });
  });

  describe('Tool Descriptions', () => {
    it('should have description for start_project', () => {
      const tool = server.getTool('start_project');

      expect(tool?.description).toBeDefined();
      expect(tool?.description.length).toBeGreaterThan(0);
    });

    it('should have description for advance_step', () => {
      const tool = server.getTool('advance_step');

      expect(tool?.description).toBeDefined();
    });

    it('should have description for get_status', () => {
      const tool = server.getTool('get_status');

      expect(tool?.description).toBeDefined();
    });

    it('should have description for analyze_project', () => {
      const tool = server.getTool('analyze_project');

      expect(tool?.description).toBeDefined();
    });
  });

  describe('Return Types', () => {
    it('start_project should return success and project info', async () => {
      const tool = server.getTool('start_project');
      const result = await tool?.handler({ projectName: 'test-project' });

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('projectName');
      expect(result).toHaveProperty('phase');
    });

    it('get_status should return workflow status', async () => {
      // First initialize a project
      const startTool = server.getTool('start_project');
      await startTool?.handler({ projectName: 'test-project' });

      const tool = server.getTool('get_status');
      const result = await tool?.handler({});

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('phase');
      expect(result).toHaveProperty('currentStep');
      expect(result).toHaveProperty('totalSteps');
    });

    it('analyze_project should return analysis report', async () => {
      // First initialize a project
      const startTool = server.getTool('start_project');
      await startTool?.handler({ projectName: 'test-project' });

      const tool = server.getTool('analyze_project');
      const result = await tool?.handler({});

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('report');
    });
  });
});
