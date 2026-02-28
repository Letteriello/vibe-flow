# Contracts: Correções de Segurança Críticas

Este documento lista todas as interfaces e tipos que serão criados ou modificados nas Tasks da Fase A.

---

## Interfaces a Criar/Modificar

### 1. src/security/types.ts (Atualizar)

#### Novas Interfaces

```typescript
// Cache
export interface RegexCache {
  get(pattern: string): RegExp | undefined;
  set(pattern: string, regex: RegExp): void;
  clear(): void;
  getStats(): CacheStats;
}

export interface CacheStats {
  hits: number;
  misses: number;
  size: number;
  hitRate: number;
}

// Symlink
export interface SymlinkGuardOptions {
  projectPath: string;
  allowSymlinks?: boolean;
  maxSymlinkDepth?: number;
}

export interface PathValidationResult {
  isValid: boolean;
  isSymlink: boolean;
  resolvedPath: string;
  reason?: string;
}

// Performance
export interface ScanOptions {
  parallel?: boolean;
  maxConcurrency?: number;
  earlyTermination?: boolean;
  severityThreshold?: VulnerabilitySeverity;
}

export interface PerformanceMetrics {
  totalTime: number;
  fileReadTime: number;
  patternMatchTime: number;
  cacheTime: number;
}
```

---

## Módulos a Criar

### 1. src/security/regex-cache.ts

**Responsabilidade:** Memoização de padrões RegExp para performance

**Contrato de Entrada:**
- Nenhuma dependência externa significativa

**Contrato de Saída:**
```typescript
export class RegexCacheImpl implements RegexCache {
  constructor(ttl?: number);
  get(pattern: string): RegExp | undefined;
  set(pattern: string, regex: RegExp): void;
  clear(): void;
  getStats(): CacheStats;
}

export const regexCache: RegexCacheImpl;
```

---

### 2. src/security/symlink-guard.ts

**Responsabilidade:** Validação de paths para prevenir path traversal via symlinks

**Contrato de Entrada:**
- `SymlinkGuardOptions` de `types.ts`
- Node.js `fs` e `path` modules

**Contrato de Saída:**
```typescript
export class SymlinkGuard {
  constructor(options: SymlinkGuardOptions);
  validatePath(filePath: string): Promise<PathValidationResult>;
}
```

---

### 3. src/security/performance-optimizer.ts

**Responsabilidade:** Otimização de performance com leitura paralela e early termination

**Contrato de Entrada:**
- `ScanOptions` de `types.ts`
- Arquivos a processar

**Contrato de Saída:**
```typescript
export class PerformanceOptimizer {
  constructor(options?: ScanOptions);
  scanParallel(
    files: string[],
    scanner: FileScanner,
    onFinding?: (finding: any) => void
  ): Promise<{ results: any[]; metrics: PerformanceMetrics }>;
}
```

---

## Módulos a Modificar

### 1. src/security/index.ts

**Adicionar exports:**
```typescript
export { RegexCacheImpl, regexCache } from './regex-cache.js';
export { SymlinkGuard } from './symlink-guard.js';
export { PerformanceOptimizer } from './performance-optimizer.js';
export type { CacheStats, SymlinkGuardOptions, PathValidationResult, ScanOptions, PerformanceMetrics } from './types.js';
```

---

## OWASP Rules a Adicionar

### Categoria A01: Broken Access Control (8 regras)

| ID | Nome | Pattern Type |
|----|------|--------------|
| A01-AC-001 | IDOR - Direct Object Reference | Regex |
| A01-AC-002 | Missing Authorization Check | Regex |
| A01-AC-003 | Privilege Escalation | Regex |
| A01-AC-004 | Insecure Direct Object Reference | Regex |
| A01-AC-005 | CORS Misconfiguration | Regex |
| A01-AC-006 | Missing Function Access Control | Regex |
| A01-AC-007 | Path Traversal in URL | Regex |
| A01-AC-008 | LDAP Injection | Regex |

### Categoria A04: XXE (3 regras)

| ID | Nome | Pattern Type |
|----|------|--------------|
| A04-XXE-001 | XML External Entity Enabled | Regex |
| A04-XXE-002 | DTD Processing Enabled | Regex |
| A04-XXE-003 | XML Parser Misconfiguration | Regex |

### Categoria A06: Vulnerable Components (5 regras)

| ID | Nome | Pattern Type |
|----|------|--------------|
| A06-VC-001 | Outdated Package | Version Check |
| A06-VC-002 | Known Vulnerable Package | Package Manifest |
| A06-VC-003 | Insecure Dependency | Package Lock |
| A06-VC-004 | Unmaintained Package | Registry Check |
| A06-VC-005 | License Compliance | Package Metadata |

### Categoria A07: Auth Failures (4 regras)

| ID | Nome | Pattern Type |
|----|------|--------------|
| A07-AUTH-001 | Weak Password Policy | Regex |
| A07-AUTH-002 | Missing Rate Limiting | Regex |
| A07-AUTH-003 | Session Fixation | Regex |
| A07-AUTH-004 | Missing Account Lockout | Regex |

### Categoria A09: Security Logging (2 regras)

| ID | Nome | Pattern Type |
|----|------|--------------|
| A09-LOG-001 | Missing Security Logging | Regex |
| A09-LOG-002 | Insufficient Log Detail | Regex |

---

## Novos Testes a Criar

| Arquivo | Módulo | Cenários |
|---------|--------|----------|
| tests/unit/security-cache.test.ts | RegexCache | get, set, clear, TTL, hits/misses |
| tests/unit/symlink-guard.test.ts | SymlinkGuard | interno, externo, profundidade |
| tests/unit/security-perf.test.ts | PerformanceOptimizer | parallel, early termination |
