# Contracts Summary: Validation Improvements

## Phase A Contracts

### TASK-000: Semantic Types

```typescript
// File: src/validation/semantic-types.ts

interface SemanticIssue {
  id: string;
  type: 'undefined_reference' | 'type_conflict' | 'naming_mismatch' | 'circular_dependency';
  severity: 'error' | 'warning';
  message: string;
  sourceArtifact: string;
  targetArtifact?: string;
  entities: string[];
}

interface EntityDependencyGraph {
  nodes: EntityNode[];
  edges: DependencyEdge[];
}

interface EntityNode {
  id: string;
  name: string;
  type: 'endpoint' | 'service' | 'component' | 'model';
  artifact: string;
}

interface DependencyEdge {
  from: string;
  to: string;
  type: 'depends_on' | 'references' | 'extends';
}

interface SemanticValidationResult extends ValidationResult {
  semanticIssues: SemanticIssue[];
  entityGraph: EntityDependencyGraph;
}
```

### TASK-001: Drift Types

```typescript
// File: src/validation/drift-types.ts

interface EnhancedDriftReport extends DriftReport {
  confidenceScore: number;
  falsePositiveFlags: string[];
  structuredFeatures: ParsedFeature[];
}

interface ParsedFeature {
  name: string;
  type: 'function' | 'class' | 'interface' | 'endpoint' | 'service';
  location?: string;
  confidence: number;
}

interface DriftDetectorConfig {
  similarityThreshold: number;  // 0.85-0.95
  enableStructuredParsing: boolean;
  minFeatureLength: number;
}
```

### TASK-002: Fallback Policy Types

```typescript
// File: src/drivers/fallback-policy-types.ts

type FallbackTriggerType =
  | 'rate_limit'
  | 'timeout'
  | 'http_error'
  | 'low_quality_response'
  | 'high_latency';

interface TriggerConfig {
  timeoutMs?: number;
  httpStatusCodes?: number[];
  minQualityScore?: number;
  maxLatencyMs?: number;
}

interface FallbackTrigger {
  type: FallbackTriggerType;
  config: TriggerConfig;
  enabled: boolean;
}

interface FallbackPolicy {
  triggers: FallbackTrigger[];
  evaluationOrder: FallbackTriggerType[];
}

interface RouterMetrics {
  totalExecutions: number;
  fallbackCount: number;
  fallbackReasons: Record<FallbackTriggerType, number>;
  averageLatencyByDriver: Record<string, number>;
}
```

---

## Phase B Exported Classes

### TASK-100: SemanticCrossRuleValidator

```typescript
class SemanticCrossRuleValidator {
  constructor(options?: CrossRuleOptions);
  validateSemantics(artifactA: Record<string, any>, artifactB: Record<string, any>): SemanticValidationResult;
}
```

### TASK-101: EnhancedDriftDetector

```typescript
class EnhancedDriftDetector {
  constructor(config?: Partial<DriftDetectorConfig>);
  detectDriftEnhanced(planContent: string, diff: string): EnhancedDriftReport;
}
```

### TASK-102: FallbackPolicy

```typescript
class FallbackPolicyManager {
  constructor(policy: FallbackPolicy);
  shouldFallback(error: Error | string, metrics: RouterMetrics): boolean;
  addTrigger(trigger: FallbackTrigger): void;
  removeTrigger(type: FallbackTriggerType): void;
}
```

### TASK-103: EnhancedAgentRouter

```typescript
class EnhancedAgentRouter {
  constructor(primary: AgentDriver, fallback: AgentDriver, policy?: FallbackPolicy);
  executeTask(task: string): Promise<DriverResult>;
  getMetrics(): RouterMetrics;
  setFallbackPolicy(policy: FallbackPolicy): void;
  getCircuitState(): CircuitBreakerState;
  resetCircuit(): void;
}
```

### TASK-104: ClaudeCodeDriver (Real)

```typescript
class ClaudeCodeDriver implements AgentDriver, RealAgentDriver {
  async isAvailable(): Promise<boolean>;
  async getVersion(): Promise<string | null>;
  async executeTask(task: string, options?: ExecutionOptions): Promise<string>;
}
```

### TASK-105: CodexDriver (Real)

```typescript
class CodexDriver implements AgentDriver, RealAgentDriver {
  async isAvailable(): Promise<boolean>;
  async getVersion(): Promise<string | null>;
  async executeTask(task: string, options?: ExecutionOptions): Promise<string>;
}
```
