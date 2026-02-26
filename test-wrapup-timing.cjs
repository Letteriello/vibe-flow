// Quick test for wrap-up handler timing
const { ConfigManager } = require('./dist/config/index.js');
const { StateMachine } = require('./dist/state-machine/index.js');
const { WrapUpHandler } = require('./dist/mcp/wrap-up-handler.js');

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

  // Wait a bit to see background completion
  setTimeout(() => {
    console.log('\nBackground job status:', handler.getJobStatus(result.job_id));
  }, 2000);
}

test().catch(console.error);
