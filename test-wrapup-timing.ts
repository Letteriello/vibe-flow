// Quick test for wrap-up handler timing
import { ConfigManager } from './dist/config/index.js';
import { StateMachine } from './dist/state-machine/index.js';
import { WrapUpHandler } from './dist/mcp/wrap-up-handler.js';

async function test() {
  const configManager = new ConfigManager();
  const stateMachine = new StateMachine();
  const handler = new WrapUpHandler(configManager, stateMachine);

  const start = Date.now();
  const result = await handler.startJob('full', false);
  const elapsed = Date.now() - start;

  console.log('Result:', result);
  console.log('Elapsed time:', elapsed, 'ms');

  if (elapsed < 10) {
    console.log('✅ SUCCESS: Returned in less than 10ms');
  } else {
    console.log('❌ FAILED: Took more than 10ms');
  }
}

test().catch(console.error);
