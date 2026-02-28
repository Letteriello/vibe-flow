# UX Spec: Melhorias nos Módulos de Validação

## Meta
- **PRD vinculado:** docs/planning/validation-improvements/prd.md
- **Status:** draft
- **Criado em:** 2026-02-28

---

## 1. Inventário de Componentes/Interfaces

| ID | Componente | Tipo | Descrição | Requisitos PRD |
|----|------------|------|-----------|----------------|
| INT-001 | SemanticCrossRuleValidator | Classe | Extensão do validador atual com detecção semântica | RF-001, RF-002, RF-003 |
| INT-002 | EnhancedDriftDetector | Classe | Drift detector com parser estruturado | RF-004, RF-005 |
| INT-003 | FallbackTriggerPolicy | Interface | Política configurável de triggers | RF-006, RF-007, RF-008 |
| INT-004 | EnhancedAgentRouter | Classe | Router com múltiplos triggers | RF-006-RF-008 |
| INT-005 | ClaudeCodeDriver (Real) | Classe | Driver com CLI real | RF-009 |
| INT-006 | CodexDriver (Real) | Classe | Driver com CLI real | RF-010 |

---

## 2. Interfaces de API

### 2.1 SemanticCrossRuleValidator

```typescript
interface SemanticValidationResult extends ValidationResult {
  semanticIssues: SemanticIssue[];
  entityGraph: EntityDependencyGraph;
}

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
```

### 2.2 EnhancedDriftDetector

```typescript
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

### 2.3 FallbackTriggerPolicy

```typescript
interface FallbackPolicy {
  triggers: FallbackTrigger[];
  evaluationOrder: FallbackTriggerType[];
}

interface FallbackTrigger {
  type: FallbackTriggerType;
  config: TriggerConfig;
  enabled: boolean;
}

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
```

### 2.4 EnhancedAgentRouter

```typescript
interface EnhancedAgentRouter {
  executeTask(task: string): Promise<DriverResult>;
  getMetrics(): RouterMetrics;
  setFallbackPolicy(policy: FallbackPolicy): void;
  getCircuitState(): CircuitBreakerState;
  resetCircuit(): void;
}

interface RouterMetrics {
  totalExecutions: number;
  fallbackCount: number;
  fallbackReasons: Record<FallbackTriggerType, number>;
  averageLatencyByDriver: Record<string, number>;
}
```

### 2.5 Real Driver Interfaces

```typescript
interface RealAgentDriver extends AgentDriver {
  isAvailable(): Promise<boolean>;
  getVersion(): Promise<string | null>;
  executeTask(task: string, options?: ExecutionOptions): Promise<string>;
}

interface ExecutionOptions {
  timeout?: number;
  model?: string;
  maxTokens?: number;
}
```

---

## 3. Comportamentos Esperados

### 3.1 SemanticCrossRuleValidator

| Cenário | Comportamento |
|---------|---------------|
| Entidade referenciada mas não definida | Gera issue `undefined_reference` com warning |
| Conflito de tipo (array vs object) | Gera issue `type_conflict` com erro |
| Naming mismatch (users vs user) | Gera issue `naming_mismatch` com warning |
| Dependência circular detectada | Gera issue `circular_dependency` com erro |

### 3.2 EnhancedDriftDetector

| Cenário | Comportamento |
|---------|---------------|
| Feature extraída via parser estruturado | Confiança >0.8 |
| Feature detectada via regex antigo | Confiança <0.5, marcada como potencial FP |
| Similaridade >0.85 | Considerada mesma feature |
| Abaixo do threshold | Reportada como esquecida |

### 3.3 EnhancedAgentRouter

| Gatilho | Condição | Ação |
|---------|----------|------|
| rate_limit | 429 ou "Rate Limit" | Fallback imediato |
| timeout | >30s (configurável) | Fallback imediato |
| http_error | 500, 503, 504 | Fallback imediato |
| low_quality | Score <0.5 | Fallback imediato |
| high_latency | >60s (configurável) | Fallback após retry |

### 3.4 Real Drivers

| Cenário | Comportamento |
|---------|---------------|
| CLI disponível | Executa via CLI real |
| CLI não disponível | Log warning, fallback para mock |
| Erro de execução | Lança exceção formatada |

---

## 4. Arquitetura de Módulos

```
src/validation/
├── cross-rule.ts          (existente - manter)
├── semantic-validator.ts  (NOVO - detecção semântica)
├── drift-detector.ts      (existente - manter)
└── enhanced-drift.ts      (NOVO - parser estruturado)

src/drivers/
├── types.ts               (existente - estender)
├── router.ts              (existente - substituir)
├── claude-code.ts         (existente - substituir com real)
├── codex.ts               (existente - substituir com real)
└── fallback-policy.ts     (NOVO - política configurável)
```

---

## 5. Design Tokens & Convenções

- Interfaces existentes: manter compatibilidade com `ValidationResult`, `DriftReport`, `DriverResult`
- Novas classes: seguir padrão `Enhanced*`, `Semantic*` para diferenciação
- Configurações: sempre com valores padrão sensatos
- Logging: usar prefixo `[SemanticValidator]`, `[EnhancedDrift]`, `[AgentRouter]`

---

## 6. Acessibilidade

- N/A - Módulos backend, sem UI

---

## 7. Testes

### 7.1 SemanticCrossRuleValidator Tests

- `should detect undefined entity reference`
- `should detect type conflict between artifacts`
- `should detect naming mismatch (plural/singular)`
- `should detect circular dependencies`
- `should not report false positives for valid references`

### 7.2 EnhancedDriftDetector Tests

- `should extract features via structured parser`
- `should flag low confidence features`
- `should respect configurable threshold`
- `should have false positive rate <15%`

### 7.3 EnhancedAgentRouter Tests

- `should fallback on timeout`
- `should fallback on HTTP 500/503`
- `should fallback on low quality response`
- `should track fallback reasons in metrics`

### 7.4 Real Drivers Tests

- `should detect CLI availability`
- `should execute task via CLI when available`
- `should fallback to mock when CLI unavailable`
- `should handle CLI errors gracefully`
