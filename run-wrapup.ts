// Run wrap-up session
import { MCPServer } from './dist/mcp/index.js';

async function run() {
  console.log('Starting wrap-up session...');
  const mcp = new MCPServer();
  const result = await mcp.handleTool('wrap_up_session', { mode: 'full' });
  console.log(JSON.stringify(result, null, 2));
}

run().catch(e => { console.error(e); process.exit(1); });
