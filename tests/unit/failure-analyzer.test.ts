import { parseTestFailure, isRetryableFailure, serializeFailureContext, FailureContext } from '../../src/execution/tdd/failure-analyzer';
import { describe, it, expect } from '@jest/globals';

describe('parseTestFailure', () => {
  const jestFailure = `
FAIL src/services/user.test.ts
  ● should return user by id › getUserById
    expect(received).toBe(expected)

    Expected: {"id": 1, "name": "John"}
    Received: undefined

      at Object.<anonymous> (src/services/user.test.ts:42:15)
      at processTicksAndInternal (src/services/user.service.ts:15:3)

    expect@src/services/user.test.ts:42:10
`;

  it('should extract test name from Jest pattern', () => {
    const result = parseTestFailure(jestFailure);
    expect(result.testName).toBe('should return user by id › getUserById');
  });

  it('should extract file and line from stack trace', () => {
    const result = parseTestFailure(jestFailure);
    expect(result.file).toBe('user.test.ts');
    expect(result.line).toBe(42);
  });

  it('should extract expected value', () => {
    const result = parseTestFailure(jestFailure);
    expect(result.expected).toContain('John');
  });

  it('should extract received value', () => {
    const result = parseTestFailure(jestFailure);
    expect(result.received).toBe('undefined');
  });

  it('should generate surgical summary', () => {
    const result = parseTestFailure(jestFailure);
    expect(result.summary).toContain('Test:');
    expect(result.summary).toContain('Expected:');
    expect(result.summary).toContain('Received:');
  });

  const vitestFailure = `
FAIL src/api/auth.test.ts > describe > login should throw on invalid credentials
AssertionError: expected promise to reject with error matching "Invalid credentials" but got "Wrong password"

    ❯ src/api/auth.test.ts:25:10

    Expected: "Invalid credentials"
    Received: "Wrong password"
`;

  it('should parse Vitest pattern', () => {
    const result = parseTestFailure(vitestFailure);
    expect(result.testName).toBe('login should throw on invalid credentials');
    expect(result.file).toBe('auth.test.ts');
    expect(result.line).toBe(25);
  });

  const snapshotFailure = `
FAIL src/components/button.test.ts
● Button renders correctly › should match snapshot

    Received:
    <button class="btn primary">Click</button>

    Expected:
    <button class="btn">Click</button>

    Difference:
    - Expected
    + Received
`;

  it('should detect snapshot failures', () => {
    const result = parseTestFailure(snapshotFailure);
    expect(result.isSnapshot).toBe(true);
    expect(result.testName).toBe('Button renders correctly › should match snapshot');
  });

  const timeoutFailure = `
FAIL src/api/users.test.ts
● fetchUsers › should load users within timeout
Error: Timeout - Async callback was not invoked within timeout of 5000ms

    at src/api/users.test.ts:18:5
`;

  it('should detect timeout failures', () => {
    const result = parseTestFailure(timeoutFailure);
    expect(result.isTimeout).toBe(true);
    expect(result.errorType).toBe('Timeout');
  });

  const syntaxError = `
SyntaxError: Unexpected token '{'
    at Module._compile (internal/modules/cjs/loader.js:1178:30)
    at src/utils/helper.ts:10:15
`;

  it('should detect error type', () => {
    const result = parseTestFailure(syntaxError);
    expect(result.errorType).toBe('SyntaxError');
  });
});

describe('isRetryableFailure', () => {
  it('should return false for SyntaxError', () => {
    const failure: FailureContext = { testName: 'test', file: 'a.ts', line: 1, expected: null, received: null, errorType: 'SyntaxError', summary: '', isSnapshot: false, isAsync: false, isTimeout: false };
    expect(isRetryableFailure(failure)).toBe(false);
  });

  it('should return false for ReferenceError', () => {
    const failure: FailureContext = { testName: 'test', file: 'a.ts', line: 1, expected: null, received: null, errorType: 'ReferenceError', summary: '', isSnapshot: false, isAsync: false, isTimeout: false };
    expect(isRetryableFailure(failure)).toBe(false);
  });

  it('should return false for TypeError', () => {
    const failure: FailureContext = { testName: 'test', file: 'a.ts', line: 1, expected: null, received: null, errorType: 'TypeError', summary: '', isSnapshot: false, isAsync: false, isTimeout: false };
    expect(isRetryableFailure(failure)).toBe(false);
  });

  it('should return true for assertion errors', () => {
    const failure: FailureContext = { testName: 'test', file: 'a.ts', line: 1, expected: 'a', received: 'b', errorType: 'toBe', summary: '', isSnapshot: false, isAsync: false, isTimeout: false };
    expect(isRetryableFailure(failure)).toBe(true);
  });
});

describe('serializeFailureContext', () => {
  it('should return summary string', () => {
    const failure: FailureContext = { testName: 'my test', file: 'test.ts', line: 10, expected: '123', received: '456', errorType: 'toBe', summary: 'Test: my test | Expected: 123 | Received: 456', isSnapshot: false, isAsync: false, isTimeout: false };
    expect(serializeFailureContext(failure)).toBe('Test: my test | Expected: 123 | Received: 456');
  });
});
