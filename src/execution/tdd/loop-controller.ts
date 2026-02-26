/**
 * TDD Loop Controller - Orquestrador principal do fluxo TDD (Red-Green-Refactor)
 *
 * Implementa a máquina de estados do padrão TDD:
 * 1. RED: Gera teste que falha
 * 2. GREEN: Implementa código até teste passar
 * 3. REFACTOR: Opcionalmente melhora o código
 */

/**
 * Estados do loop TDD
 */
export enum TDDPhase {
  IDLE = 'IDLE',
  RED = 'RED',
  GREEN = 'GREEN',
  REFACTOR = 'REFACTOR',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED'
}

/**
 * Resultado de uma execução de teste
 */
export interface TestResult {
  success: boolean;
  output: string;
  error?: string;
  duration: number;
}

/**
 * Resultado de uma iteração TDD
 */
export interface TDDIterationResult {
  phase: TDDPhase;
  success: boolean;
  testCode?: string;
  implementationCode?: string;
  testOutput: string;
  error?: string;
  attempts: number;
  duration: number;
}

/**
 * Resultado completo da task TDD
 */
export interface TDDRunResult {
  taskDescription: string;
  success: boolean;
  iterations: TDDIterationResult[];
  totalDuration: number;
  finalPhase: TDDPhase;
}

/**
 * Interface para gerador de testes (injeção de dependência)
 * Não chama LLM real - apenas define o contrato
 */
export interface TestGenerator {
  /**
   * Gera código de teste para a descrição da task
   */
  generateTest(taskDescription: string, context?: Record<string, unknown>): Promise<string>;

  /**
   * Valida se o teste gerado está correto
   */
  validateTest(testCode: string): Promise<boolean>;
}

/**
 * Interface para gerador de implementação (injeção de dependência)
 */
export interface ImplementationGenerator {
  /**
   * Gera código de implementação para passar no teste
   */
  generateImplementation(
    taskDescription: string,
    testCode: string,
    testOutput: string,
    context?: Record<string, unknown>
  ): Promise<string>;
}

/**
 * Interface para runner de testes (injeção de dependência)
 */
export interface TestRunner {
  /**
   * Executa os testes e retorna o resultado
   */
  runTests(testCode: string, implementationCode: string): Promise<TestResult>;
}

/**
 * Configuração do TDD Loop Controller
 */
export interface TDDLoopConfig {
  testGenerator: TestGenerator;
  implementationGenerator: ImplementationGenerator;
  testRunner: TestRunner;
  maxIterationsPerPhase?: number;
  maxTotalIterations?: number;
  timeoutMs?: number;
  enableRefactor?: boolean;
}

/**
 * Estado interno de uma iteração
 */
interface IterationState {
  phase: TDDPhase;
  testCode: string;
  implementationCode: string;
  testOutput: string;
  attempts: number;
  startTime: number;
  error?: string;
}

/**
 * TDDLoopController - Orquestrador principal do fluxo TDD
 *
 * Implementa o ciclo Red-Green-Refactor como máquina de estados:
 * - RED: Gera teste que falha inicialmente
 * - GREEN: Implementa código até teste passar
 * - REFACTOR: Opcionalmente refatora código
 */
export class TDDLoopController {
  private readonly testGenerator: TestGenerator;
  private readonly implementationGenerator: ImplementationGenerator;
  private readonly testRunner: TestRunner;
  private readonly maxIterationsPerPhase: number;
  private readonly maxTotalIterations: number;
  private readonly timeoutMs: number;
  private readonly enableRefactor: boolean;

  private currentPhase: TDDPhase = TDDPhase.IDLE;
  private iterationCount = 0;
  private iterationHistory: TDDIterationResult[] = [];

  constructor(config: TDDLoopConfig) {
    this.testGenerator = config.testGenerator;
    this.implementationGenerator = config.implementationGenerator;
    this.testRunner = config.testRunner;
    this.maxIterationsPerPhase = config.maxIterationsPerPhase ?? 5;
    this.maxTotalIterations = config.maxTotalIterations ?? 15;
    this.timeoutMs = config.timeoutMs ?? 60000;
    this.enableRefactor = config.enableRefactor ?? true;
  }

  /**
   * Executa a task TDD completa com o fluxo Red-Green-Refactor
   */
  async runTask(taskDescription: string): Promise<TDDRunResult> {
    const startTime = Date.now();
    this.reset();

    this.iterationHistory = [];

    try {
      // Valida input
      if (!taskDescription || taskDescription.trim().length === 0) {
        throw new Error('Task description cannot be empty');
      }

      // Executa o ciclo TDD
      await this.executeTDDCycle(taskDescription);

      const totalDuration = Date.now() - startTime;

      return {
        taskDescription,
        success: this.currentPhase === TDDPhase.COMPLETED,
        iterations: this.iterationHistory,
        totalDuration,
        finalPhase: this.currentPhase
      };
    } catch (error) {
      const totalDuration = Date.now() - startTime;
      this.currentPhase = TDDPhase.FAILED;

      return {
        taskDescription,
        success: false,
        iterations: this.iterationHistory,
        totalDuration,
        finalPhase: TDDPhase.FAILED
      };
    }
  }

  /**
   * Reseta o estado do controller para uma nova execução
   */
  private reset(): void {
    this.currentPhase = TDDPhase.IDLE;
    this.iterationCount = 0;
    this.iterationHistory = [];
  }

  /**
   * Executa o ciclo completo TDD (RED -> GREEN -> REFACTOR)
   */
  private async executeTDDCycle(taskDescription: string): Promise<void> {
    // === FASE RED: Gera teste que falha ===
    this.currentPhase = TDDPhase.RED;
    const redResult = await this.executeRedPhase(taskDescription);

    if (!redResult.success) {
      this.iterationHistory.push(redResult);
      this.currentPhase = TDDPhase.FAILED;
      return;
    }

    this.iterationHistory.push(redResult);

    // Verifica se o teste falha (comportamento esperado no RED)
    if (redResult.testOutput.includes('PASS') || redResult.testOutput.includes('SUCCESS')) {
      // Teste passou sem implementação - rejeita como inválido
      throw new Error(
        'INVALID_TEST: Test passed without implementation. ' +
        'TDD requires RED phase to fail. Test is not properly validating the requirement.'
      );
    }

    // === FASE GREEN: Implementa código até teste passar ===
    this.currentPhase = TDDPhase.GREEN;
    const greenResult = await this.executeGreenPhase(
      taskDescription,
      redResult.testCode,
      redResult.testOutput
    );

    if (!greenResult.success) {
      this.iterationHistory.push(greenResult);
      this.currentPhase = TDDPhase.FAILED;
      return;
    }

    this.iterationHistory.push(greenResult);

    // === FASE REFACTOR: Opcionalmente refatora ===
    if (this.enableRefactor) {
      this.currentPhase = TDDPhase.REFACTOR;
      const refactorResult = await this.executeRefactorPhase(
        taskDescription,
        redResult.testCode,
        greenResult.implementationCode
      );

      if (refactorResult) {
        this.iterationHistory.push(refactorResult);
      }
    }

    this.currentPhase = TDDPhase.COMPLETED;
  }

  /**
   * FASE RED: Gera teste e verifica que falha
   */
  private async executeRedPhase(taskDescription: string): Promise<TDDIterationResult> {
    const startTime = Date.now();
    const state: IterationState = {
      phase: TDDPhase.RED,
      testCode: '',
      implementationCode: '',
      testOutput: '',
      attempts: 0,
      startTime
    };

    // Loop de tentativas para gerar teste válido que falha
    while (state.attempts < this.maxIterationsPerPhase) {
      state.attempts++;
      this.iterationCount++;

      if (this.iterationCount >= this.maxTotalIterations) {
        return this.createIterationResult(state, false, 'Max total iterations reached');
      }

      try {
        // Gera código de teste
        state.testCode = await this.testGenerator.generateTest(taskDescription);

        // Valida estrutura básica do teste
        const isValid = await this.testGenerator.validateTest(state.testCode);
        if (!isValid) {
          state.testOutput = 'Test validation failed';
          continue;
        }

        // Executa teste com implementação vazia/proxy
        const testResult = await this.testRunner.runTests(state.testCode, '');

        state.testOutput = testResult.output;

        // Se o teste falhar, RED foi bem-sucedido
        if (!testResult.success) {
          return this.createIterationResult(state, true);
        }

        // Se o teste passou diretamente, rejeita (teste inválido para TDD)
        // Continua tentando gerar um teste que falha

      } catch (error) {
        state.testOutput = error instanceof Error ? error.message : 'Unknown error';
      }
    }

    return this.createIterationResult(
      state,
      false,
      'Failed to generate valid failing test after max attempts'
    );
  }

  /**
   * FASE GREEN: Implementa código até teste passar
   */
  private async executeGreenPhase(
    taskDescription: string,
    testCode: string,
    initialTestOutput: string
  ): Promise<TDDIterationResult> {
    const startTime = Date.now();
    const state: IterationState = {
      phase: TDDPhase.GREEN,
      testCode,
      implementationCode: '',
      testOutput: initialTestOutput,
      attempts: 0,
      startTime
    };

    // Loop de tentativas para implementar até teste passar
    while (state.attempts < this.maxIterationsPerPhase) {
      state.attempts++;
      this.iterationCount++;

      if (this.iterationCount >= this.maxTotalIterations) {
        return this.createIterationResult(state, false, 'Max total iterations reached');
      }

      try {
        // Gera implementação baseada no teste e output
        state.implementationCode = await this.implementationGenerator.generateImplementation(
          taskDescription,
          testCode,
          state.testOutput
        );

        // Executa teste com a nova implementação
        const testResult = await this.testRunner.runTests(testCode, state.implementationCode);

        state.testOutput = testResult.output;

        // Se o teste passou, GREEN foi bem-sucedido
        if (testResult.success) {
          return this.createIterationResult(state, true);
        }

        // Teste ainda falhou, continua iteração

      } catch (error) {
        state.testOutput = error instanceof Error ? error.message : 'Unknown error';
      }
    }

    return this.createIterationResult(
      state,
      false,
      'Failed to implement passing code after max attempts'
    );
  }

  /**
   * FASE REFACTOR: Opcionalmente refatora código mantendo testes passando
   */
  private async executeRefactorPhase(
    taskDescription: string,
    testCode: string,
    implementationCode: string
  ): Promise<TDDIterationResult | null> {
    const startTime = Date.now();
    const state: IterationState = {
      phase: TDDPhase.REFACTOR,
      testCode,
      implementationCode,
      testOutput: '',
      attempts: 0,
      startTime
    };

    // Refatoração é opcional - tenta uma vez apenas
    // Se não melhorar, mantém o código original
    try {
      state.attempts = 1;

      // Gera implementação refatorada
      const refactoredCode = await this.implementationGenerator.generateImplementation(
        taskDescription,
        testCode,
        'REFACTOR_PHASE'
      );

      // Verifica se refatoração mantém testes passando
      const testResult = await this.testRunner.runTests(testCode, refactoredCode);

      if (testResult.success) {
        state.implementationCode = refactoredCode;
        state.testOutput = testResult.output;
        return this.createIterationResult(state, true);
      }

      // Refatoração quebrou testes, mantém código original
      return null;

    } catch {
      // Erro em refatoração, retorna null para manter código original
      return null;
    }
  }

  /**
   * Cria resultado de iteração a partir do estado interno
   */
  private createIterationResult(
    state: IterationState,
    success: boolean,
    error?: string
  ): TDDIterationResult {
    return {
      phase: state.phase,
      success,
      testCode: state.testCode,
      implementationCode: state.implementationCode,
      testOutput: state.testOutput,
      error: error ?? state.error,
      attempts: state.attempts,
      duration: Date.now() - state.startTime
    };
  }

  /**
   * Retorna o estado atual do controller
   */
  getCurrentPhase(): TDDPhase {
    return this.currentPhase;
  }

  /**
   * Retorna o histórico de iterações
   */
  getIterationHistory(): TDDIterationResult[] {
    return [...this.iterationHistory];
  }

  /**
   * Retorna o número total de iterações executadas
   */
  getIterationCount(): number {
    return this.iterationCount;
  }
}

/**
 * Factory function para criar TDDLoopController com configurações padrão
 */
export function createTDDLoopController(config: TDDLoopConfig): TDDLoopController {
  return new TDDLoopController(config);
}
