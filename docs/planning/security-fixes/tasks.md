# Tasks: Correções de Segurança Críticas

## Mapa de Execução

### Fase A — Contratos (Serializada, 1 terminal)

| Task | Descrição | Estimativa |
|------|-----------|------------|
| TASK-001 | Definir interfaces RegexCache, SymlinkGuard, PerformanceOptimizer | S (~20min) |
| TASK-002 | Criar testes de especificação para os novos módulos | M (~45min) |

**Tempo estimado Fase A:** ~65 min

### Fase B — Implementação (Paralela, até 5 terminais)

#### Rodada 1: Core Infrastructure

| Task | Descrição | Estimativa | Paralelo com |
|------|-----------|------------|---------------|
| TASK-100 | Implementar RegexCache com memoização | M (~45min) | TASK-101, 102 |
| TASK-101 | Implementar SymlinkGuard para path traversal | M (~45min) | TASK-100, 102 |
| TASK-102 | Implementar PerformanceOptimizer com parallelização | M (~45min) | TASK-100, 101 |

#### Rodada 2: Expansão de Regras OWASP

| Task | Descrição | Estimativa | Paralelo com |
|------|-----------|------------|---------------|
| TASK-200 | Adicionar regras A01 (Broken Access Control) - 8 regras | M (~45min) | TASK-201-204 |
| TASK-201 | Adicionar regras A04 (XXE) - 3 regras | S (~20min) | TASK-200, 202-204 |
| TASK-202 | Adicionar regras A06 (Vulnerable Components) - 5 regras | S (~25min) | TASK-200-201, 203-204 |
| TASK-203 | Adicionar regras A07 (Auth Failures) - 4 regras | S (~25min) | TASK-200-202, 204 |
| TASK-204 | Adicionar regras A09 (Security Logging) - 2 regras | S (~15min) | TASK-200-203 |

#### Rodada 3: Melhoria de Padrões

| Task | Descrição | Estimativa | Paralelo com |
|------|-----------|------------|---------------|
| TASK-300 | Expandir detecção XSS (8+ padrões) | M (~40min) | TASK-301-302 |
| TASK-301 | Expandir detecção SQL Injection (15+ padrões) | M (~50min) | TASK-300, 302 |
| TASK-302 | Expandir detecção Command Injection (6+ padrões) | M (~40min) | TASK-300-301 |

#### Rodada 4: Integração e Performance

| Task | Descrição | Estimativa | Paralelo com |
|------|-----------|------------|---------------|
| TASK-400 | Integrar RegexCache nos módulos existentes | S (~25min) | TASK-401 |
| TASK-401 | Integrar SymlinkGuard no SecurityScanner | S (~25min) | TASK-400 |
| TASK-402 | Adicionar early termination por threshold | S (~20min) | - |
| TASK-403 | Adicionar modo fast para CI | S (~20min) | - |

### Fase C — Integração (Serializada, 1 terminal)

| Task | Descrição | Estimativa |
|------|-----------|------------|
| TASK-INT-001 | Atualizar exports em src/security/index.ts | S (~15min) |
| TASK-INT-002 | Executar testes existentes e corrigir breakages | M (~30min) |
| TASK-INT-003 | Executar testes de performance e validar metas | M (~30min) |
| TASK-INT-004 | Atualizar file-registry.md | S (~15min) |

**Tempo estimado Fase C:** ~90 min

---

## Detalhamento das Tasks

### Fase A: Contratos

---

## TASK-001: Definir Interfaces de Segurança Expandidas

**Fase:** A (Serializada)
**Tipo:** interface
**Prioridade:** P0
**Estimativa:** S (~20min)

**Requisitos PRD:** RF-001, RF-002, RF-003, RF-007

### Arquivos sob propriedade (OWNERSHIP)
- `src/security/types.ts` (atualizar)

### Contratos de entrada
- Tipos existentes: `Vulnerability`, `VulnerabilitySeverity`, `VulnerabilityCategory`
- Interfaces a criar: `RegexCache`, `CacheStats`, `SymlinkGuardOptions`, `PathValidationResult`, `ScanOptions`, `PerformanceMetrics`

### Contratos de saída
- Novas interfaces exports via `src/security/index.ts`
- Compatibilidade com APIs existentes (`SecurityScanResult`)

### Critérios de conclusão
- [ ] Interfaces definidas em types.ts
- [ ] Exports atualizados em index.ts
- [ ] Typescript compila sem erros

### Instruções
Adicionar as seguintes interfaces ao arquivo existente `src/security/types.ts`:

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

## TASK-002: Criar Testes de Specificação

**Fase:** A (Serializada)
**Tipo:** test
**Prioridade:** P0
**Estimativa:** M (~45min)

**Requisitos PRD:** RF-001, RF-002, RF-003

### Arquivos sob propriedade (OWNERSHIP)
- `tests/unit/security-cache.test.ts` (criar)
- `tests/unit/symlink-guard.test.ts` (criar)
- `tests/unit/security-perf.test.ts` (criar)

### Contratos de entrada
- Interfaces da TASK-001

### Contratos de saída
- Testes com describe/it blocks vazios ou com assertions básicas

### Critérios de conclusão
- [ ] Arquivos de teste criados
- [ ] Testes compilam (mesmo que falhem)
- [ ] Cobrem os cenários principais

### Instruções
Criar arquivos de teste básicos que serão implementados nas tasks da Fase B:

1. **tests/unit/security-cache.test.ts**: Testes para RegexCache
   - get/set/clear
   - hit/miss tracking
   - TTL expiration

2. **tests/unit/symlink-guard.test.ts**: Testes para SymlinkGuard
   - Validar symlink interno
   - Bloquear symlink externo
   - Profundidade máxima

3. **tests/unit/security-perf.test.ts**: Testes para PerformanceOptimizer
   - Leitura paralela
   - Early termination
   - Métricas de tempo

---

### Fase B: Implementação

---

## TASK-100: Implementar RegexCache

**Fase:** B (Paralela)
**Tipo:** component
**Prioridade:** P0
**Estimativa:** M (~45min)

**Requisitos PRD:** RF-003

### Arquivos sob propriedade (OWNERSHIP)
- `src/security/regex-cache.ts` (criar)
- `src/security/index.ts` (atualizar exports)

### Contratos de entrada
- Interfaces da TASK-001

### Contratos de saída
- `RegexCache` singleton com métodos: `get()`, `set()`, `clear()`, `getStats()`

### Critérios de conclusão
- [ ] Cache implementa memoização de RegExp
- [ ] Tracking de hits/misses
- [ ] TTL configurável
- [ ] Testes passam

### Instruções
Criar `src/security/regex-cache.ts`:

```typescript
import { RegexCache as IRegexCache, CacheStats } from './types.js';

class RegexCacheImpl implements IRegexCache {
  private cache = new Map<string, RegExp>();
  private accessOrder: string[] = [];
  private ttl: number;
  private timestamps = new Map<string, number>();
  private hits = 0;
  private misses = 0;

  constructor(ttl = 3600000) {
    this.ttl = ttl;
  }

  get(pattern: string): RegExp | undefined {
    const ts = this.timestamps.get(pattern);
    if (ts && Date.now() - ts > this.ttl) {
      this.clearPattern(pattern);
      this.misses++;
      return undefined;
    }
    const regex = this.cache.get(pattern);
    if (regex) {
      this.hits++;
      this.updateAccessOrder(pattern);
      return regex;
    }
    this.misses++;
    return undefined;
  }

  set(pattern: string, regex: RegExp): void {
    this.cache.set(pattern, regex);
    this.timestamps.set(pattern, Date.now());
    this.updateAccessOrder(pattern);
  }

  clear(): void {
    this.cache.clear();
    this.timestamps.clear();
    this.accessOrder = [];
    this.hits = 0;
    this.misses = 0;
  }

  getStats(): CacheStats {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      size: this.cache.size,
      hitRate: total > 0 ? this.hits / total : 0
    };
  }

  private clearPattern(pattern: string): void {
    this.cache.delete(pattern);
    this.timestamps.delete(pattern);
    this.accessOrder = this.accessOrder.filter(p => p !== pattern);
  }

  private updateAccessOrder(pattern: string): void {
    this.accessOrder = this.accessOrder.filter(p => p !== pattern);
    this.accessOrder.push(pattern);
  }
}

// Singleton export
export const regexCache = new RegexCacheImpl();
```

---

## TASK-101: Implementar SymlinkGuard

**Fase:** B (Paralela)
**Tipo:** component
**Prioridade:** P0
**Estimativa:** M (~45min)

**Requisitos PRD:** RF-001

### Arquivos sob propriedade (OWNERSHIP)
- `src/security/symlink-guard.ts` (criar)
- `src/security/index.ts` (atualizar exports)

### Contratos de entrada
- `SymlinkGuardOptions` da TASK-001
- `path` e `fs` modules

### Contratos de saída
- `SymlinkGuard` com método `validatePath(path): PathValidationResult`

### Critérios de conclusão
- [ ] Detecta symlinks
- [ ] Resolve caminho real
- [ ] Bloqueia symlinks externos ao projeto
- [ ] Testes passam

### Instruções
Criar `src/security/symlink-guard.ts` com validação de path traversal:

```typescript
import { promises as fs } from 'fs';
import { resolve, isAbsolute, normalize } from 'path';
import { SymlinkGuardOptions, PathValidationResult } from './types.js';

export class SymlinkGuard {
  private projectPath: string;
  private allowSymlinks: boolean;
  private maxDepth: number;

  constructor(options: SymlinkGuardOptions) {
    this.projectPath = resolve(options.projectPath);
    this.allowSymlinks = options.allowSymlinks ?? false;
    this.maxDepth = options.maxSymlinkDepth ?? 3;
  }

  async validatePath(filePath: string): Promise<PathValidationResult> {
    const resolvedPath = resolve(filePath);
    const isSymlink = await this.isSymlink(resolvedPath);

    if (isSymlink && !this.allowSymlinks) {
      const target = await this.readSymlinkTarget(resolvedPath);
      const isExternal = await this.isExternalPath(target);

      return {
        isValid: !isExternal,
        isSymlink: true,
        resolvedPath,
        reason: isExternal ? 'Symlink points outside project' : undefined
      };
    }

    // Check for path traversal without symlinks
    if (this.containsTraversal(filePath)) {
      return {
        isValid: false,
        isSymlink: false,
        resolvedPath,
        reason: 'Path contains traversal sequences (..)'
      };
    }

    return {
      isValid: true,
      isSymlink,
      resolvedPath
    };
  }

  private async isSymlink(path: string): Promise<boolean> {
    try {
      const stats = await fs.lstat(path);
      return stats.isSymbolicLink();
    } catch {
      return false;
    }
  }

  private async readSymlinkTarget(linkPath: string): Promise<string> {
    const target = await fs.readlink(linkPath);
    return isAbsolute(target) ? target : resolve(linkPath, '..', target);
  }

  private async isExternalPath(targetPath: string): Promise<boolean> {
    const normalizedTarget = normalize(targetPath);
    const normalizedProject = normalize(this.projectPath);
    return !normalizedTarget.startsWith(normalizedProject);
  }

  private containsTraversal(path: string): boolean {
    const normalized = normalize(path);
    return normalized.includes('..');
  }
}
```

---

## TASK-102: Implementar PerformanceOptimizer

**Fase:** B (Paralela)
**Tipo:** component
**Prioridade:** P0
**Estimativa:** M (~45min)

**Requisitos PRD:** RF-007

### Arquivos sob propriedade (OWNERSHIP)
- `src/security/performance-optimizer.ts` (criar)
- `src/security/index.ts` (atualizar exports)

### Contratos de entrada
- `ScanOptions` da TASK-001
- Arquivos a processar

### Contratos de saída
- `PerformanceOptimizer` com métodos: `scanParallel()`, `scanWithEarlyTermination()`

### Critérios de conclusão
- [ ] Leitura paralela com concurrency limit
- [ ] Early termination por threshold
- [ ] Métricas de performance coletadas

### Instruções
Criar `src/security/performance-optimizer.ts`:

```typescript
import { promises as fs } from 'fs';
import { PerformanceMetrics, ScanOptions, VulnerabilitySeverity } from './types.js';

type FileScanner = (filePath: string) => Promise<any[]>;

export class PerformanceOptimizer {
  private options: Required<ScanOptions>;

  constructor(options: ScanOptions = {}) {
    this.options = {
      parallel: options.parallel ?? false,
      maxConcurrency: options.maxConcurrency ?? 10,
      earlyTermination: options.earlyTermination ?? false,
      severityThreshold: options.severityThreshold ?? 'INFO'
    };
  }

  async scanParallel(
    files: string[],
    scanner: FileScanner,
    onFinding?: (finding: any) => void
  ): Promise<{ results: any[]; metrics: PerformanceMetrics }> {
    const startTime = Date.now();
    const results: any[] = [];
    const severityLevels = ['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
    const thresholdIndex = severityLevels.indexOf(this.options.severityThreshold);

    const processFile = async (file: string) => {
      const findings = await scanner(file);

      if (this.options.earlyTermination && onFinding) {
        for (const finding of findings) {
          const findingIndex = severityLevels.indexOf(finding.severity);
          if (findingIndex >= thresholdIndex) {
            onFinding(finding);
            return { shouldStop: true, findings };
          }
        }
      }

      return { shouldStop: false, findings };
    };

    if (this.options.parallel) {
      const chunks = this.chunkArray(files, this.options.maxConcurrency);

      for (const chunk of chunks) {
        const chunkResults = await Promise.all(chunk.map(processFile));
        for (const result of chunkResults) {
          results.push(...result.findings);
        }
      }
    } else {
      for (const file of files) {
        const result = await processFile(file);
        results.push(...result.findings);
      }
    }

    return {
      results,
      metrics: {
        totalTime: Date.now() - startTime,
        fileReadTime: 0,
        patternMatchTime: 0,
        cacheTime: 0
      }
    };
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}
```

---

## TASK-200 a TASK-204: Regras OWASP

Cada task adiciona regras específicas por categoria. Ver arquivo separado: `tasks/phase-b/owasp-rules.md`

---

## TASK-300: Expandir XSS

Adicionar 6+ novos padrões XSS:
- `insertAdjacentHTML`
- `document.write`
- `outerHTML`
- `runtime + eval`
- Template literals sem escape
- DOMPurify bypass attempts

---

## TASK-301: Expandir SQL Injection

Adicionar 10+ novos padrões:
- NoSQL injection (MongoDB, Mongoose)
- ORM raw queries
- GraphQL resolvers
- LIKE clause injection
- Order By injection
- UNION-based
- Boolean-based
- Time-based blind
- Error-based
- Second-order injection

---

## TASK-302: Expandir Command Injection

Adicionar 5+ novos padrões:
- `execFile` com shell options
- `spawn` com shell=True
- Backtick command substitution
- Heredoc injection
- Environment variable injection

---

## TASK-400 a TASK-403: Integração

Integração dos módulos nos scanners existentes.

---

### Fase C: Integração

---

## TASK-INT-001: Atualizar Exports

Adicionar novos módulos ao `src/security/index.ts`.

## TASK-INT-002: Executar Testes

Rodar testes existentes e verificar compatibilidade.

## TASK-INT-003: Validar Performance

Executar benchmarks e validar metas de performance.

## TASK-INT-004: Atualizar Registry

Adicionar novos arquivos ao `docs/architecture/file-registry.md`.

---

## Tempo Total Estimado

| Fase | Tempo |
|------|-------|
| Fase A (Serial) | ~65 min |
| Fase B (Paralelo) | ~240 min (3 rodadas ~80min cada) |
| Fase C (Serial) | ~90 min |
| **Total** | **~395 min (~6.5 horas)** |

## Paralelismo Efetivo

- Fase A: 1 terminal
- Fase B: até 5 terminais simultâneos
- Fase C: 1 terminal

Speedup estimado vs sequencial: ~3x
