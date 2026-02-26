/**
 * Unit tests for LLM Map-Reduce Operators
 */

import { z } from 'zod';
import {
  llmMap,
  llmReduce,
  getSuccessfulOutputs,
  getFailedOutputs,
  extractData,
  LLMMapInput,
  LLMMapOutput,
  LLMClient,
} from '../../src/context/operators/index.js';

// Mock LLM Client for testing
class MockLLMClient implements LLMClient {
  private shouldFail: boolean;
  private failUntilAttempt: number;

  constructor(shouldFail = false, failUntilAttempt = 0) {
    this.shouldFail = shouldFail;
    this.failUntilAttempt = failUntilAttempt;
  }

  async call(prompt: string, schema: z.ZodSchema): Promise<string> {
    // Simulate processing delay
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Extract item from prompt
    const match = prompt.match(/\{.*?: "(.*?)"\}/);
    const text = match ? match[1] : 'unknown';

    if (this.shouldFail && this.failUntilAttempt > 0) {
      this.failUntilAttempt--;
      // Return invalid JSON first, then valid
      return '{ invalid json';
    }

    // Return valid JSON matching schema
    return JSON.stringify({
      sentiment: text.includes('good') ? 'positive' : 'negative',
      confidence: 0.95,
    });
  }
}

describe('llmMap', () => {
  const inputSchema = z.object({
    sentiment: z.enum(['positive', 'negative']),
    confidence: z.number(),
  });

  const testInputs: LLMMapInput<{ text: string }>[] = [
    { id: '1', data: { text: 'good job' } },
    { id: '2', data: { text: 'bad result' } },
    { id: '3', data: { text: 'great work' } },
    { id: '4', data: { text: 'terrible' } },
    { id: '5', data: { text: 'excellent' } },
  ];

  it('should process all items with default concurrency (5)', async () => {
    const client = new MockLLMClient();
    const prompt = 'Classify: {item}';

    const result = await llmMap(
      testInputs,
      prompt,
      inputSchema,
      client
    );

    expect(result.total).toBe(5);
    expect(result.successful).toBe(5);
    expect(result.failed).toBe(0);
  });

  it('should process all items with custom concurrency', async () => {
    const client = new MockLLMClient();
    const prompt = 'Classify: {item}';

    const result = await llmMap(
      testInputs,
      prompt,
      inputSchema,
      client,
      { concurrency: 2 }
    );

    expect(result.total).toBe(5);
    expect(result.successful).toBe(5);
  });

  it('should retry on schema validation errors', async () => {
    const client = new MockLLMClient(true, 1); // Fail once then succeed
    const prompt = 'Classify: {item}';

    const result = await llmMap(
      testInputs.slice(0, 2),
      prompt,
      inputSchema,
      client,
      { maxRetries: 2 }
    );

    expect(result.total).toBe(2);
    // After retries, should succeed
    expect(result.successful).toBeGreaterThan(0);
  });

  it('should return empty result for empty input array', async () => {
    const client = new MockLLMClient();
    const prompt = 'Classify: {item}';

    const result = await llmMap(
      [],
      prompt,
      inputSchema,
      client
    );

    expect(result.total).toBe(0);
    expect(result.outputs).toHaveLength(0);
  });

  it('should include attempt count in output', async () => {
    const client = new MockLLMClient();
    const prompt = 'Classify: {item}';

    const result = await llmMap(
      testInputs.slice(0, 1),
      prompt,
      inputSchema,
      client
    );

    expect(result.outputs[0].attempts).toBe(1);
  });
});

describe('llmReduce', () => {
  it('should aggregate outputs correctly', () => {
    const outputs: LLMMapOutput<{ value: number }>[] = [
      { id: '1', data: { value: 10 } },
      { id: '2', data: { value: 20 } },
      { id: '3', data: { value: 30 } },
    ];

    const sum = llmReduce(outputs, (acc, item) => acc + item.data.value, 0);

    expect(sum).toBe(60);
  });
});

describe('Utility functions', () => {
  const mockResult = {
    outputs: [
      { id: '1', data: { value: 1 }, error: undefined },
      { id: '2', data: { value: 2 }, error: 'some error' },
      { id: '3', data: { value: 3 }, error: undefined },
    ],
    successful: 2,
    failed: 1,
    total: 3,
  };

  it('getSuccessfulOutputs should filter correctly', () => {
    const successful = getSuccessfulOutputs(mockResult);
    expect(successful).toHaveLength(2);
  });

  it('getFailedOutputs should filter correctly', () => {
    const failed = getFailedOutputs(mockResult);
    expect(failed).toHaveLength(1);
  });

  it('extractData should return only data array', () => {
    const data = extractData(mockResult);
    expect(data).toEqual([{ value: 1 }, { value: 3 }]);
  });
});
