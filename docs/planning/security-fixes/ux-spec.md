# UX Spec: Correções de Segurança Críticas

## Meta
- **PRD vinculado:** docs/planning/security-fixes/prd.md
- **Status:** draft
- **Criado em:** 2026-02-28
- **Atualizado em:** 2026-02-28

---

## 1. Visão Geral

Este documento especifica as interfaces, outputs e comportamento esperado para as correções de segurança. Como módulo backend/CLI, não há UI tradicional - a "experiência" é definida por APIs, outputs de terminal e configurações.

---

## 2. Interfaces de API

### 2.1 RegexCache (Novo Módulo)

```typescript
interface RegexCache {
  get(pattern: string): RegExp | undefined;
  set(pattern: string, regex: RegExp): void;
  clear(): void;
  getStats(): CacheStats;
}

interface CacheStats {
  hits: number;
  misses: number;
  size: number;
  hitRate: number;
}
```

**Comportamento:**
- Singleton acessível globalmente
- TTL padrão: 1 hora (configurável)
- Auto-invalidação em memory pressure

### 2.2 SymlinkGuard (Novo Módulo)

```typescript
interface SymlinkGuardOptions {
  projectPath: string;
  allowSymlinks?: boolean;
  maxSymlinkDepth?: number;
}

interface PathValidationResult {
  isValid: boolean;
  isSymlink: boolean;
  resolvedPath: string;
  reason?: string;
}
```

**Comportamento:**
- Valida que symlinks apontam para dentro do projeto
- Bloqueia symlinks que apontam para fora (../, /etc, etc.)
- Log detalhado para auditoria

### 2.3 PerformanceOptimizer (Novo Módulo)

```typescript
interface ScanOptions {
  parallel?: boolean;
  maxConcurrency?: number;
  earlyTermination?: boolean;
  severityThreshold?: SeverityLevel;
}

interface ScanResult {
  // ... existing fields
  performanceMetrics: {
    totalTime: number;
    fileReadTime: number;
    patternMatchTime: number;
    cacheTime: number;
  };
}
```

---

## 3. Outputs de Terminal

### 3.1 Output do Security Scan

```
=== Security Scan Report ===
Project: /path/to/project
Files Scanned: 127
Duration: 850ms

SEVERITY SUMMARY
 Critical:  0
 High:      2
 Medium:    5
 Low:       3

BLOCKED: No

FINDINGS:
 [HIGH] SQL Injection in src/db/user.ts:42
   Pattern: String concatenation in query
   Recommendation: Use parameterized queries

 [HIGH] Hardcoded API Key in src/config.ts:15
   Pattern: apiKey = "sk_live_..."
   Recommendation: Use environment variables
```

### 3.2 Output de Cobertura OWASP

```
=== OWASP Coverage Report ===

Category              | Rules | Coverage
----------------------|-------|----------
A01: Broken Access    |   8   |   80%
A02: Cryptographic    |  12   |  100%
A03: Injection        |  22   |   95%
A04: XXE              |   3   |   60%
A05: Security Config  |   9   |   75%
A06: Vulnerable Comp.  |   0   |    0%
A07: Auth Failures    |   4   |   40%
A08: Deserialization |   5   |  100%
A09: Logging          |   2   |   30%
A10: SSRF             |   3   |   50%

OVERALL COVERAGE: 70%
```

### 3.3 Output de Cache Stats

```
=== Regex Cache Statistics ===
Hits:        1,247
Misses:         156
Size:           52 patterns
Hit Rate:     88.9%
Memory:       ~2.4 MB

Most Used Patterns:
 1. SQL Injection (SQL_STRING_CONCAT) - 234 hits
 2. XSS (INNER_HTML) - 189 hits
 3. Hardcoded Password - 156 hits
```

---

## 4. Comportamento de Erros

### 4.1 Path Traversal Detectado

```
[SECURITY] Path Traversal Attempt Blocked!
  File: malicious_link -> /etc/passwd
  Action: Skipped
  Project: /home/user/project
```

### 4.2 Performance Threshold Exceeded

```
[WARN] Scan exceeded 5s threshold
  Files: 500
  Duration: 7.2s
  Suggestion: Use parallel mode or reduce scope
```

---

## 5. Configurações

### 5.1 Environment Variables

```bash
# Performance
SECURITY_SCAN_PARALLEL=true
SECURITY_MAX_CONCURRENCY=10
SECURITY_SCAN_TIMEOUT=30000

# Cache
SECURITY_CACHE_ENABLED=true
SECURITY_CACHE_TTL=3600000

# Fast Mode (CI)
SECURITY_FAST_MODE=false
SECURITY_FAST_RULES="SQL_INJECTION,HARDCODED_SECRET,XSS"
```

### 5.2 Config File (.vibe-flow/security.json)

```json
{
  "scan": {
    "parallel": true,
    "maxConcurrency": 10,
    "earlyTermination": true,
    "severityThreshold": "HIGH"
  },
  "cache": {
    "enabled": true,
    "ttl": 3600000,
    "maxSize": 1000
  },
  "symlinks": {
    "allow": false,
    "maxDepth": 3
  },
  "owasp": {
    "minCoverage": 0.7,
    "requiredCategories": ["A01", "A02", "A03"]
  }
}
```

---

## 6. Casos de Teste

### Caso 1: Path Traversal via Symlink

**Input:**
- Projeto com symlink `malicious -> /etc/passwd`
- Conteúdo: `const data = readFile('malicious');`

**Esperado:**
- Scan completes sem erro
- Log de "Path Traversal Attempt Blocked"
- Symlink ignorado, não scaneado

### Caso 2: Cache Hit

**Input:**
- Scan 1: `const password = "secret";`
- Scan 2: mesmo código

**Esperado:**
- Scan 1: cache miss, compile regex
- Scan 2: cache hit, reuse regex
- Tempo scan 2 < 50% do tempo scan 1

### Caso 3: Parallel Scan

**Input:**
- 100 arquivos para scan
- `parallel: true, maxConcurrency: 10`

**Esperado:**
- 10 arquivos processados simultaneamente
- Tempo total ~10x menor que sequencial

### Caso 4: Early Termination

**Input:**
- Threshold: HIGH (bloqueia Critical + High)
- Arquivo 5 tem Critical vulnerability

**Esperado:**
- Scan para após encontrar Critical
- Report mostra 4 arquivos scaneados
- Tempo reduzido significativamente
