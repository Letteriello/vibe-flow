# Contratos: Integracao TDD

## Interfaces Canonicas (TASK-001)

### TDDTestResult

```typescript
interface TDDTestResult {
  success: boolean;
  output: string;
  duration: number;
  error?: string;
  failedTests?: string[];
}
```

### TDDTestRunnerConfig

```typescript
interface TDDTestRunnerConfig {
  timeout?: number;
  workingDir?: string;
  verbose?: boolean;
}
```

### TDDLoopConfigExtended

```typescript
interface TDDLoopConfigExtended {
  // Interfaces existentes do TDDLoopConfig
  testGenerator: TestGenerator;
  implementationGenerator: ImplementationGenerator;
  testRunner: TestRunner;
  maxIterationsPerPhase?: number;
  maxTotalIterations?: number;
  timeoutMs?: number;
  enableRefactor?: boolean;

  // Novas opcoes de integracao
  usePrompts?: boolean;
  useFailureAnalyzer?: boolean;
  coveragePath?: string;
  coverageThresholds?: CoverageThresholds;
  enableRegressionGuard?: boolean;
  regressionConfig?: RegressionGuardConfig;
}
```

## Contratos de Entrada (Modulos Existentes)

### prompts.ts

```typescript
// Funcoes ja exportadas
buildTestGenerationPrompt(task: TDDTask): string
buildImplementationPrompt(task: TDDTask, testCode: string, testErrors?: string[]): string

// Interface ja exportada
interface TDDTask {
  featureName: string;
  description: string;
  expectedBehavior: string;
  inputOutput?: { input: string; expectedOutput: string };
  constraints?: string[];
  existingCode?: string;
}
```

### failure-analyzer.ts

```typescript
// Funcoes ja exportadas
parseTestFailure(rawError: string): FailureContext
isRetryableFailure(failure: FailureContext): boolean
serializeFailureContext(failure: FailureContext): string

// Interfaces ja exportadas
interface FailureContext {
  testName: string;
  file: string;
  line: number | null;
  expected: string | null;
  received: string | null;
  errorType: string | null;
  summary: string;
  isSnapshot: boolean;
  isAsync: boolean;
  isTimeout: boolean;
}
```

### coverage-tracker.ts

```typescript
// Funcoes ja exportadas
verifyTestCoverage(coverageJsonPath: string, targetFile: string, thresholds?: CoverageThresholds): TestValidityReport
verifyMultipleTestCoverages(coverageJsonPath: string, targetFiles: string[], thresholds?: CoverageThresholds): TestValidityReport[]

// Interfaces ja exportadas
interface CoverageThresholds {
  statement: number;
  branch: number;
}

interface TestValidityReport {
  targetFile: string;
  coveragePath: string;
  timestamp: string;
  thresholds: CoverageThresholds;
  report: CoverageReport;
  isStructurallyValid: boolean;
  warnings: string[];
}
```

### regression-guard.ts

```typescript
// Classes e funcoes ja exportadas
class RegressionGuard {
  constructor(config: Partial<RegressionGuardConfig>);
  async validateAfterTaskCompletion(context: { taskId: string; taskArea: string; modifiedFiles: string[] }): Promise<RegressionReport>;
}

interface RegressionGuardConfig {
  projectRoot: string;
  testCommand: string;
  watchPaths?: string[];
  maxRetries?: number;
  timeout?: number;
}

interface RegressionReport {
  hasRegression: boolean;
  regressionType: RegressionType | null;
  severity: RegressionSeverity;
  affectedAreas: string[];
  currentTaskArea: string;
  unrelatedFailures: UnrelatedFailure[];
  recommendation: RegressionRecommendation;
  fullSuiteResult: SuiteResult;
  timestamp: string;
}
```

## Contratos de Saida (TDDIntegrator)

### Factory Function

```typescript
function createIntegratedLoopController(config: TDDLoopConfigExtended): TDDLoopController
```

### Configuracao Padrao

```typescript
const DEFAULT_INTEGRATION_CONFIG = {
  usePrompts: true,
  useFailureAnalyzer: true,
  enableRegressionGuard: false,
  coverageThresholds: {
    statement: 80,
    branch: 80
  }
}
```
