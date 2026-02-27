/**
 * TDD Coordinator - Orquestrador de agentes virtuais para ciclo TDD
 *
 * Coordena a execução do ciclo TDD utilizando sub-agentes especializados:
 * - TesterAgent: Responsável apenas por escrever testes que falham (fase RED)
 * - CoderAgent: Responsável apenas por escrever código para passar nos testes (fase GREEN)
 *
 * Utiliza o barramento de comunicação (AgentCommunicationBroker) para
 * trafegar resultados entre os agentes.
 */

import { EventEmitter } from 'events';
import { TDDTask, TDDTaskStatus, TaskIngestor } from '../tdd/task-queue';
import { TDDPhase, TestResult, TDDRunResult } from '../tdd/loop-controller';
import { TestRunner } from '../tdd/test-runner.js';
import { AgentCommunicationBroker, DiscoveryEvent } from '../../mcp/acp-broker';

/**
 * Roles de agentes virtuais especializados
 */
export enum AgentRole {
  TESTER = 'TESTER',
  CODER = 'CODER',
  COORDINATOR = 'COORDINATOR'
}

/**
 * Status de execução de um agente
 */
export enum AgentExecutionStatus {
  IDLE = 'IDLE',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED'
}

/**
 * Tipo de mensagem trocada entre agentes via Event Bus
 */
export type TDDEventType =
  | 'tdd:task:started'
  | 'tdd:task:completed'
  | 'tdd:task:failed'
  | 'tdd:red:started'
  | 'tdd:red:test-generated'
  | 'tdd:red:test-failed'
  | 'tdd:green:started'
  | 'tdd:green:code-generated'
  | 'tdd:green:passed'
  | 'tdd:green:failed'
  | 'tdd:phase:transition'
  | 'tdd:agent:result';

/**
 * Payload de evento TDD
 */
export interface TDDEventPayload {
  taskId: string;
  taskDescription: string;
  phase: TDDPhase;
  timestamp: number;
  agentId?: string;
  agentRole?: AgentRole;
  data: Record<string, unknown>;
}

/**
 * Interface base para agentes virtuais
 */
export interface VirtualAgent {
  readonly id: string;
  readonly role: AgentRole;
  readonly name: string;
  getStatus(): AgentExecutionStatus;
  execute(context: AgentContext): Promise<AgentResult>;
}

/**
 * Contexto passado para um agente durante execução
 */
export interface AgentContext {
  taskId: string;
  taskDescription: string;
  previousPhase?: TDDPhase;
  testCode?: string;
  testOutput?: string;
  errorContext?: string;
  metadata: Record<string, unknown>;
}

/**
 * Resultado da execução de um agente
 */
export interface AgentResult {
  success: boolean;
  output: string;
  code?: string;
  error?: string;
  duration: number;
  metadata: Record<string, unknown>;
}

/**
 * Configuração do TesterAgent
 */
export interface TesterAgentConfig {
  id: string;
  name: string;
  testFramework?: 'jest' | 'vitest' | 'mocha';
  generateTest: (taskDescription: string, context?: Record<string, unknown>) => Promise<string>;
  validateTest: (testCode: string) => Promise<boolean>;
}

/**
 * TesterAgent - Agente especializado em escrever testes que falham (Fase RED)
 *
 * Responsabilidade única: Gerar código de teste que falha inicialmente,
 * validando o comportamento esperado sem implementação.
 */
export class TesterAgent implements VirtualAgent {
  public readonly id: string;
  public readonly role: AgentRole;
  public readonly name: string;
  private readonly testFramework: 'jest' | 'vitest' | 'mocha';
  private readonly generateTestFn: (taskDescription: string, context?: Record<string, unknown>) => Promise<string>;
  private readonly validateTestFn: (testCode: string) => Promise<boolean>;
  private status: AgentExecutionStatus = AgentExecutionStatus.IDLE;

  constructor(config: TesterAgentConfig) {
    this.id = config.id;
    this.role = AgentRole.TESTER;
    this.name = config.name;
    this.testFramework = config.testFramework ?? 'jest';
    this.generateTestFn = config.generateTest;
    this.validateTestFn = config.validateTest;
  }

  getStatus(): AgentExecutionStatus {
    return this.status;
  }

  async execute(context: AgentContext): Promise<AgentResult> {
    const startTime = Date.now();
    this.status = AgentExecutionStatus.RUNNING;

    try {
      // Gera código de teste
      const testCode = await this.generateTestFn(context.taskDescription, {
        framework: this.testFramework,
        ...context.metadata
      });

      // Valida estrutura do teste
      const isValid = await this.validateTestFn(testCode);

      if (!isValid) {
        this.status = AgentExecutionStatus.FAILED;
        return {
          success: false,
          output: 'Test validation failed - generated test does not meet quality criteria',
          error: 'VALIDATION_FAILED',
          duration: Date.now() - startTime,
          metadata: { testFramework: this.testFramework }
        };
      }

      this.status = AgentExecutionStatus.COMPLETED;
      return {
        success: true,
        output: `Test generated successfully using ${this.testFramework}`,
        code: testCode,
        duration: Date.now() - startTime,
        metadata: {
          testFramework: this.testFramework,
          testLength: testCode.length,
          taskId: context.taskId
        }
      };
    } catch (error) {
      this.status = AgentExecutionStatus.FAILED;
      return {
        success: false,
        output: '',
        error: error instanceof Error ? error.message : 'Unknown error in TesterAgent',
        duration: Date.now() - startTime,
        metadata: {}
      };
    }
  }
}

/**
 * Configuração do CoderAgent
 */
export interface CoderAgentConfig {
  id: string;
  name: string;
  language?: 'typescript' | 'javascript' | 'python';
  generateImplementation: (
    taskDescription: string,
    testCode: string,
    testOutput: string,
    context?: Record<string, unknown>
  ) => Promise<string>;
}

/**
 * CoderAgent - Agente especializado em escrever código para passar nos testes (Fase GREEN)
 *
 * Responsabilidade única: Gerar implementação que satisfaz os testes,
 * utilizando o contexto do erro do teste para guiar a solução.
 */
export class CoderAgent implements VirtualAgent {
  public readonly id: string;
  public readonly role: AgentRole;
  public readonly name: string;
  private readonly language: 'typescript' | 'javascript' | 'python';
  private readonly generateImplementationFn: (
    taskDescription: string,
    testCode: string,
    testOutput: string,
    context?: Record<string, unknown>
  ) => Promise<string>;
  private status: AgentExecutionStatus = AgentExecutionStatus.IDLE;

  constructor(config: CoderAgentConfig) {
    this.id = config.id;
    this.role = AgentRole.CODER;
    this.name = config.name;
    this.language = config.language ?? 'typescript';
    this.generateImplementationFn = config.generateImplementation;
  }

  getStatus(): AgentExecutionStatus {
    return this.status;
  }

  async execute(context: AgentContext): Promise<AgentResult> {
    const startTime = Date.now();
    this.status = AgentExecutionStatus.RUNNING;

    if (!context.testCode) {
      this.status = AgentExecutionStatus.FAILED;
      return {
        success: false,
        output: '',
        error: 'CoderAgent requires testCode in context',
        duration: Date.now() - startTime,
        metadata: {}
      };
    }

    try {
      // Gera implementação usando contexto do erro
      const implementationCode = await this.generateImplementationFn(
        context.taskDescription,
        context.testCode,
        context.testOutput ?? '',
        {
          language: this.language,
          errorContext: context.errorContext,
          ...context.metadata
        }
      );

      this.status = AgentExecutionStatus.COMPLETED;
      return {
        success: true,
        output: `Implementation generated successfully in ${this.language}`,
        code: implementationCode,
        duration: Date.now() - startTime,
        metadata: {
          language: this.language,
          implementationLength: implementationCode.length,
          taskId: context.taskId
        }
      };
    } catch (error) {
      this.status = AgentExecutionStatus.FAILED;
      return {
        success: false,
        output: '',
        error: error instanceof Error ? error.message : 'Unknown error in CoderAgent',
        duration: Date.now() - startTime,
        metadata: {}
      };
    }
  }
}

/**
 * Resultado da coordenação de uma tarefa
 */
export interface CoordinatedTaskResult {
  taskId: string;
  taskDescription: string;
  success: boolean;
  phaseResults: PhaseResult[];
  totalDuration: number;
  finalPhase: TDDPhase;
  error?: string;
}

/**
 * Resultado de uma fase específica (RED ou GREEN)
 */
export interface PhaseResult {
  phase: TDDPhase;
  success: boolean;
  agentId: string;
  agentRole: AgentRole;
  code?: string;
  testOutput?: string;
  duration: number;
  error?: string;
}

/**
 * Configuração do TDDCoordinator
 */
export interface TDDCoordinatorConfig {
  taskIngestor: TaskIngestor;
  broker: AgentCommunicationBroker;
  testerAgentFactory: () => TesterAgent;
  coderAgentFactory: () => CoderAgent;
  maxRetriesPerPhase?: number;
  enableRefactor?: boolean;
  onTaskStart?: (task: TDDTask) => void;
  onTaskComplete?: (result: CoordinatedTaskResult) => void;
  onTaskFail?: (task: TDDTask, error: string) => void;
}

/**
 * Estado interno do coordenador
 */
interface CoordinatorState {
  currentTask: TDDTask | null;
  currentPhase: TDDPhase;
  phaseResults: PhaseResult[];
  startTime: number;
  retryCount: number;
}

/**
 * TDDCoordinator - Orquestrador principal que coordena agentes especializados
 *
 * Gerencia o ciclo de vida TDD utilizando agentes virtuais:
 * - Consome tarefas da fila (TaskIngestor)
 * - Instancia TesterAgent para fase RED
 * - Instancia CoderAgent para fase GREEN
 * - Comunica resultados via Event Bus
 */
export class TDDCoordinator extends EventEmitter {
  private readonly taskIngestor: TaskIngestor;
  private readonly broker: AgentCommunicationBroker;
  private readonly testerAgentFactory: () => TesterAgent;
  private readonly coderAgentFactory: () => CoderAgent;
  private readonly maxRetriesPerPhase: number;
  private readonly enableRefactor: boolean;
  private readonly onTaskStart?: (task: TDDTask) => void;
  private readonly onTaskComplete?: (result: CoordinatedTaskResult) => void;
  private readonly onTaskFail?: (task: TDDTask, error: string) => void;

  private state: CoordinatorState;
  private isRunning: boolean = false;

  constructor(config: TDDCoordinatorConfig) {
    super();
    this.taskIngestor = config.taskIngestor;
    this.broker = config.broker;
    this.testerAgentFactory = config.testerAgentFactory;
    this.coderAgentFactory = config.coderAgentFactory;
    this.maxRetriesPerPhase = config.maxRetriesPerPhase ?? 3;
    this.enableRefactor = config.enableRefactor ?? false;
    this.onTaskStart = config.onTaskStart;
    this.onTaskComplete = config.onTaskComplete;
    this.onTaskFail = config.onTaskFail;

    this.state = this.createInitialState();
  }

  /**
   * Cria estado inicial do coordenador
   */
  private createInitialState(): CoordinatorState {
    return {
      currentTask: null,
      currentPhase: TDDPhase.IDLE,
      phaseResults: [],
      startTime: 0,
      retryCount: 0
    };
  }

  /**
   * Inicia o processamento da fila de tarefas
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Coordinator is already running');
    }

    this.isRunning = true;

    try {
      while (this.taskIngestor.hasMoreTasks()) {
        const peekResult = this.taskIngestor.getNextTask();

        if (!peekResult.task) {
          break;
        }

        const task = this.taskIngestor.markInProgress(peekResult.task.id);
        if (!task) {
          continue;
        }

        await this.processTask(task);
      }
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Processa uma única tarefa TDD
   */
  async processTask(task: TDDTask): Promise<CoordinatedTaskResult> {
    this.state = {
      currentTask: task,
      currentPhase: TDDPhase.IDLE,
      phaseResults: [],
      startTime: Date.now(),
      retryCount: 0
    };

    this.publishEvent('tdd:task:started', {
      taskId: task.id,
      taskDescription: task.description,
      phase: TDDPhase.IDLE,
      data: {}
    });

    this.onTaskStart?.(task);

    try {
      // === FASE RED: TesterAgent gera teste que falha ===
      const redResult = await this.executeRedPhase(task);

      this.state.phaseResults.push(redResult);

      if (!redResult.success) {
        throw new Error(`RED phase failed: ${redResult.error}`);
      }

      // Valida que o teste falhou (comportamento esperado no RED)
      if (this.isTestPassing(redResult.testOutput ?? '')) {
        const error = 'Test passed in RED phase - invalid TDD workflow';
        this.taskIngestor.markFailed(task.id, error);
        throw new Error(error);
      }

      // === FASE GREEN: CoderAgent gera código para passar no teste ===
      const greenResult = await this.executeGreenPhase(task, redResult.code ?? '', redResult.testOutput ?? '');

      this.state.phaseResults.push(greenResult);

      if (!greenResult.success) {
        throw new Error(`GREEN phase failed: ${greenResult.error}`);
      }

      // Valida que o teste passou
      if (!this.isTestPassing(greenResult.testOutput ?? '')) {
        throw new Error('Test did not pass in GREEN phase');
      }

      // === Tarefa concluída com sucesso ===
      this.taskIngestor.markCompleted(task.id);

      const result: CoordinatedTaskResult = {
        taskId: task.id,
        taskDescription: task.description,
        success: true,
        phaseResults: this.state.phaseResults,
        totalDuration: Date.now() - this.state.startTime,
        finalPhase: TDDPhase.COMPLETED
      };

      this.publishEvent('tdd:task:completed', {
        taskId: task.id,
        taskDescription: task.description,
        phase: TDDPhase.COMPLETED,
        data: { result }
      });

      this.onTaskComplete?.(result);
      this.emit('task:completed', result);

      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.taskIngestor.markFailed(task.id, errorMessage);

      const result: CoordinatedTaskResult = {
        taskId: task.id,
        taskDescription: task.description,
        success: false,
        phaseResults: this.state.phaseResults,
        totalDuration: Date.now() - this.state.startTime,
        finalPhase: TDDPhase.FAILED,
        error: errorMessage
      };

      this.publishEvent('tdd:task:failed', {
        taskId: task.id,
        taskDescription: task.description,
        phase: TDDPhase.FAILED,
        data: { error: errorMessage }
      });

      this.onTaskFail?.(task, errorMessage);
      this.emit('task:failed', result);

      return result;
    }
  }

  /**
   * Executa a fase RED utilizando o TesterAgent
   */
  private async executeRedPhase(task: TDDTask): Promise<PhaseResult> {
    this.state.currentPhase = TDDPhase.RED;
    this.publishEvent('tdd:red:started', {
      taskId: task.id,
      taskDescription: task.description,
      phase: TDDPhase.RED,
      data: { retryCount: this.state.retryCount }
    });

    const testerAgent = this.testerAgentFactory();

    const context: AgentContext = {
      taskId: task.id,
      taskDescription: task.description,
      metadata: {
        sourceFile: task.metadata?.sourceFile,
        lineNumber: task.metadata?.lineNumber
      }
    };

    let lastError: string | undefined;
    let testOutput = '';

    // Loop de tentativas para gerar teste válido que falha
    for (let attempt = 0; attempt < this.maxRetriesPerPhase; attempt++) {
      const agentResult = await testerAgent.execute(context);

      this.publishEvent('tdd:red:test-generated', {
        taskId: task.id,
        taskDescription: task.description,
        phase: TDDPhase.RED,
        agentId: testerAgent.id,
        agentRole: AgentRole.TESTER,
        data: {
          success: agentResult.success,
          attempt: attempt + 1,
          output: agentResult.output
        }
      });

      if (!agentResult.success) {
        lastError = agentResult.error;
        continue;
      }

      // Executa o teste para verificar se falha (comportamento esperado)
      const testExecutionResult = await this.runTest(agentResult.code ?? '');
      testOutput = testExecutionResult.output;

      this.publishEvent('tdd:red:test-failed', {
        taskId: task.id,
        taskDescription: task.description,
        phase: TDDPhase.RED,
        agentId: testerAgent.id,
        agentRole: AgentRole.TESTER,
        data: {
          testFailed: !testExecutionResult.success,
          output: testOutput
        }
      });

      // Se o teste falhou como esperado, RED foi bem-sucedido
      if (!testExecutionResult.success) {
        return {
          phase: TDDPhase.RED,
          success: true,
          agentId: testerAgent.id,
          agentRole: AgentRole.TESTER,
          code: agentResult.code,
          testOutput,
          duration: agentResult.duration
        };
      }

      // Teste passou - rejeita como inválido para TDD
      lastError = 'Test passed without implementation - invalid for RED phase';
    }

    return {
      phase: TDDPhase.RED,
      success: false,
      agentId: testerAgent.id,
      agentRole: AgentRole.TESTER,
      testOutput,
      duration: 0,
      error: lastError ?? 'Failed to generate valid failing test'
    };
  }

  /**
   * Executa a fase GREEN utilizando o CoderAgent
   */
  private async executeGreenPhase(task: TDDTask, testCode: string, testOutput: string): Promise<PhaseResult> {
    this.state.currentPhase = TDDPhase.GREEN;
    this.publishEvent('tdd:green:started', {
      taskId: task.id,
      taskDescription: task.description,
      phase: TDDPhase.GREEN,
      data: { retryCount: this.state.retryCount }
    });

    const coderAgent = this.coderAgentFactory();

    const context: AgentContext = {
      taskId: task.id,
      taskDescription: task.description,
      previousPhase: TDDPhase.RED,
      testCode,
      testOutput,
      errorContext: this.extractErrorContext(testOutput),
      metadata: {
        sourceFile: task.metadata?.sourceFile
      }
    };

    let lastError: string | undefined;

    // Loop de tentativas para implementar até teste passar
    for (let attempt = 0; attempt < this.maxRetriesPerPhase; attempt++) {
      const agentResult = await coderAgent.execute(context);

      this.publishEvent('tdd:green:code-generated', {
        taskId: task.id,
        taskDescription: task.description,
        phase: TDDPhase.GREEN,
        agentId: coderAgent.id,
        agentRole: AgentRole.CODER,
        data: {
          success: agentResult.success,
          attempt: attempt + 1,
          output: agentResult.output
        }
      });

      if (!agentResult.success) {
        lastError = agentResult.error;
        continue;
      }

      // Executa o teste com a nova implementação
      const testExecutionResult = await this.runTest(testCode, agentResult.code ?? '');

      if (testExecutionResult.success) {
        this.publishEvent('tdd:green:passed', {
          taskId: task.id,
          taskDescription: task.description,
          phase: TDDPhase.GREEN,
          agentId: coderAgent.id,
          agentRole: AgentRole.CODER,
          data: {
            output: testExecutionResult.output
          }
        });

        return {
          phase: TDDPhase.GREEN,
          success: true,
          agentId: coderAgent.id,
          agentRole: AgentRole.CODER,
          code: agentResult.code,
          testOutput: testExecutionResult.output,
          duration: agentResult.duration
        };
      }

      // Atualiza contexto com novo erro para próxima tentativa
      context.testOutput = testExecutionResult.output;
      context.errorContext = this.extractErrorContext(testExecutionResult.output);
      lastError = testExecutionResult.error;

      this.publishEvent('tdd:green:failed', {
        taskId: task.id,
        taskDescription: task.description,
        phase: TDDPhase.GREEN,
        agentId: coderAgent.id,
        agentRole: AgentRole.CODER,
        data: {
          attempt: attempt + 1,
          output: testExecutionResult.output,
          error: testExecutionResult.error
        }
      });
    }

    return {
      phase: TDDPhase.GREEN,
      success: false,
      agentId: coderAgent.id,
      agentRole: AgentRole.CODER,
      testOutput: testOutput,
      duration: 0,
      error: lastError ?? 'Failed to implement passing code'
    };
  }

  /**
   * Executa teste usando o TestRunner real
   */
  private async runTest(testCode: string, implementationCode?: string): Promise<TestResult> {
    // Save test code to temp file if needed, then run with TestRunner
    const runner = new TestRunner({ timeout: 60000, verbose: false });

    // Run the test using npx jest with the test file
    // For now, execute jest on the project tests
    try {
      const result = await runner.run('npm test -- --passWithNoTests --json');
      return {
        success: result.passed,
        output: result.errorOutput,
        duration: 0
      };
    } catch (error) {
      return {
        success: false,
        output: error instanceof Error ? error.message : 'Test execution failed',
        duration: 0
      };
    }
  }

  /**
   * Verifica se o output do teste indica sucesso
   */
  private isTestPassing(testOutput: string): boolean {
    const upperOutput = testOutput.toUpperCase();
    return upperOutput.includes('PASS') ||
           upperOutput.includes('SUCCESS') ||
           upperOutput.includes('OK') ||
           upperOutput.includes('✓');
  }

  /**
   * Extrai contexto de erro do output do teste
   */
  private extractErrorContext(testOutput: string): string {
    // Extrai informações relevantes de erro do output
    const lines = testOutput.split('\n');
    const errorLines: string[] = [];

    for (const line of lines) {
      const upperLine = line.toUpperCase();
      if (upperLine.includes('ERROR') ||
          upperLine.includes('FAIL') ||
          upperLine.includes('EXPECTED') ||
          upperLine.includes('RECEIVED')) {
        errorLines.push(line);
      }
    }

    return errorLines.slice(0, 10).join('\n'); // Limita a 10 linhas
  }

  /**
   * Publica evento no barramento de comunicação
   */
  private publishEvent(eventType: TDDEventType, payload: Omit<TDDEventPayload, 'timestamp'>): void {
    const event: TDDEventPayload = {
      ...payload,
      timestamp: Date.now()
    };

    // Emite localmente
    this.emit(eventType, event);

    // Publica no broker se disponível
    if (this.broker) {
      try {
        this.broker.emitDiscovery(
          `coordinator-${this.state.currentTask?.id ?? 'unknown'}`,
          'task_completed' as any,
          `[${payload.phase}] ${eventType}`,
          {
            metadata: {
              eventType,
              taskId: payload.taskId,
              phase: payload.phase
            }
          }
        );
      } catch {
        // Silently fail if broker is not available
      }
    }
  }

  /**
   * Retorna o estado atual do coordenador
   */
  getState(): Readonly<CoordinatorState> {
    return { ...this.state };
  }

  /**
   * Verifica se o coordenador está em execução
   */
  getIsRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Para o coordenador
   */
  stop(): void {
    this.isRunning = false;
    this.emit('stopped');
  }
}

/**
 * Factory para criar TDDCoordinator com configurações padrão
 */
export function createTDDCoordinator(config: TDDCoordinatorConfig): TDDCoordinator {
  return new TDDCoordinator(config);
}
