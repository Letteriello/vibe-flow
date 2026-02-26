// Test file for AgenticMapOperator
import { AgenticMapOperator, agenticMap, SchemaValidator, MapInput } from './src/mcp/agentic-map.js';

async function testAgenticMap() {
  console.log('Testing AgenticMapOperator...\n');

  // Test 1: Basic map operation
  const inputs: string[] = ['file1.ts', 'file2.ts', 'file3.ts', 'file4.ts', 'file5.ts'];
  const prompt = 'Analyze this TypeScript file and return its structure';

  console.log('Test 1: Basic map with 5 inputs');
  const result = await agenticMap(inputs, prompt, { maxConcurrency: 3 });

  console.log(`Total inputs: ${result.totalInputs}`);
  console.log(`Success count: ${result.successCount}`);
  console.log(`Failure count: ${result.failureCount}`);
  console.log(`Total time: ${result.totalExecutionTimeMs}ms`);
  console.log(`Success: ${result.success}\n`);

  // Test 2: With custom schema
  console.log('Test 2: Map with custom schema validation');
  const schemaResult = await agenticMap(
    inputs,
    prompt,
    {
      maxConcurrency: 2,
      responseSchema: {
        type: 'object',
        properties: {
          workerId: { type: 'string' },
          inputId: { type: 'string' },
          inputValue: { type: 'string' },
          timestamp: { type: 'string' }
        },
        required: ['workerId', 'inputId', 'inputValue']
      }
    }
  );

  console.log(`Successful: ${schemaResult.successCount}`);
  console.log(`Validation errors: ${schemaResult.validationErrors.length}`);
  console.log(`Overall success: ${schemaResult.success}\n`);

  // Test 3: Schema validator
  console.log('Test 3: Schema validation');
  const validData = { name: 'test', age: 25 };
  const validSchema = {
    type: 'object' as const,
    properties: {
      name: { type: 'string' as const },
      age: { type: 'number' as const, minimum: 0 }
    },
    required: ['name', 'age']
  };

  const validation = SchemaValidator.validate(validData, validSchema);
  console.log(`Valid data validation: ${validation.valid}`);

  const invalidData = { name: 123, age: -5 };
  const invalidValidation = SchemaValidator.validate(invalidData, validSchema);
  console.log(`Invalid data validation: ${invalidValidation.valid}`);
  console.log(`Errors: ${invalidValidation.errors.join(', ')}\n`);

  // Test 4: Operator instance
  console.log('Test 4: Using Operator instance directly');
  const operator = new AgenticMapOperator({ maxConcurrency: 4, maxRetries: 3 });
  const operatorResult = await operator.map(inputs, prompt);
  console.log(`Operator result - Success: ${operatorResult.success}, Time: ${operatorResult.totalExecutionTimeMs}ms`);

  console.log('\n✓ All tests completed');
}

testAgenticMap().catch(console.error);
