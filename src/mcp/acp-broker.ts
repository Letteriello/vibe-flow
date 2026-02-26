/**
 * ACP (Agent Communication Protocol) Broker
 * In-memory Event Bus for multi-agent coordination (A2A)
 */

import { EventEmitter } from 'events';

/**
 * Tipo de evento de descoberta
 */
export type DiscoveryEventType =
  | 'credential_found'
  | 'secret_detected'
  | 'vulnerability_found'
  | 'sensitive_data_found'
  | 'agent_discovered'
  | 'task_completed'
  | 'resource_found';

/**
 * Nível de severidade da descoberta
 */
export type DiscoverySeverity = 'low' | 'medium' | 'high' | 'critical';

/**
 * Payload de evento de descoberta
 */
export interface DiscoveryEvent {
  id: string;
  type: DiscoveryEventType;
  agentId: string;
  agentName: string;
  timestamp: number;
  payload: {
    message: string;
    path?: string;
    severity: DiscoverySeverity;
    metadata?: Record<string, string>;
  };
}

/**
 * Assinatura de callback para subscriber
 */
export type EventCallback = (event: DiscoveryEvent) => void | Promise<void>;

/**
 * Assinatura de agente registrado
 */
export interface RegisteredAgent {
  id: string;
  name: string;
  subscribedEvents: Set<DiscoveryEventType>;
  registeredAt: number;
}

/**
 * Estatísticas do broker
 */
export interface BrokerStats {
  totalEventsPublished: number;
  totalEventsDelivered: number;
  registeredAgents: number;
  uptime: number;
}

/**
 * Agent Communication Broker
 * In-memory Pub/Sub pattern for multi-agent coordination
 */
export class AgentCommunicationBroker extends EventEmitter {
  private agents: Map<string, RegisteredAgent> = new Map();
  private eventHistory: DiscoveryEvent[] = [];
  private readonly maxHistorySize: number;
  private readonly startTime: number;
  private totalEventsPublished: number = 0;
  private totalEventsDelivered: number = 0;

  constructor(maxHistorySize: number = 1000) {
    super();
    this.maxHistorySize = maxHistorySize;
    this.startTime = Date.now();
    this.setMaxListeners(100);
  }

  /**
   * Registra um agente no broker
   */
  registerAgent(agentId: string, agentName: string): RegisteredAgent {
    if (this.agents.has(agentId)) {
      throw new Error(`Agent ${agentId} is already registered`);
    }

    const agent: RegisteredAgent = {
      id: agentId,
      name: agentName,
      subscribedEvents: new Set<DiscoveryEventType>([
        'credential_found',
        'secret_detected',
        'vulnerability_found',
        'sensitive_data_found',
        'agent_discovered',
        'task_completed',
        'resource_found',
      ]),
      registeredAt: Date.now(),
    };

    this.agents.set(agentId, agent);
    return agent;
  }

  /**
   * Desregistra um agente do broker
   */
  unregisterAgent(agentId: string): boolean {
    const agent = this.agents.get(agentId);
    if (!agent) {
      return false;
    }

    this.removeAllListeners(`agent:${agentId}`);
    this.agents.delete(agentId);
    return true;
  }

  /**
   * Inscreve um agente em tipos específicos de eventos
   */
  subscribe(agentId: string, eventTypes: DiscoveryEventType[]): boolean {
    const agent = this.agents.get(agentId);
    if (!agent) {
      return false;
    }

    for (const eventType of eventTypes) {
      agent.subscribedEvents.add(eventType);
    }

    return true;
  }

  /**
   * Desinscreve um agente de tipos específicos de eventos
   */
  unsubscribe(agentId: string, eventTypes: DiscoveryEventType[]): boolean {
    const agent = this.agents.get(agentId);
    if (!agent) {
      return false;
    }

    for (const eventType of eventTypes) {
      agent.subscribedEvents.delete(eventType);
    }

    return true;
  }

  /**
   * Publica um evento de descoberta
   */
  publish(event: DiscoveryEvent): DiscoveryEvent {
    this.totalEventsPublished++;

    // Armazena no histórico
    this.eventHistory.push(event);
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }

    // Emite o evento geral
    this.emit('discovery', event);

    // Emite o evento específico por tipo
    this.emit(`event:${event.type}`, event);

    // Emite para todos os agentes registrados que assinaram esse tipo
    for (const agent of Array.from(this.agents.values())) {
      if (agent.subscribedEvents.has(event.type)) {
        this.totalEventsDelivered++;
        this.emit(`agent:${agent.id}`, event);
      }
    }

    return event;
  }

  /**
   * Cria e publica um evento de descoberta de forma simplificada
   */
  emitDiscovery(
    agentId: string,
    type: DiscoveryEventType,
    message: string,
    options?: {
      path?: string;
      severity?: DiscoverySeverity;
      metadata?: Record<string, string>;
    }
  ): DiscoveryEvent {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} is not registered`);
    }

    const event: DiscoveryEvent = {
      id: `${agentId}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      type,
      agentId,
      agentName: agent.name,
      timestamp: Date.now(),
      payload: {
        message,
        path: options?.path,
        severity: options?.severity ?? 'medium',
        metadata: options?.metadata,
      },
    };

    return this.publish(event);
  }

  /**
   * Obtém todos os eventos de um tipo específico
   */
  getEventsByType(type: DiscoveryEventType): DiscoveryEvent[] {
    return this.eventHistory.filter((event) => event.type === type);
  }

  /**
   * Obtém todos os eventos de um agente específico
   */
  getEventsByAgent(agentId: string): DiscoveryEvent[] {
    return this.eventHistory.filter((event) => event.agentId === agentId);
  }

  /**
   * Obtém todos os eventos de uma pasta/path específico
   */
  getEventsByPath(path: string): DiscoveryEvent[] {
    return this.eventHistory.filter(
      (event) => event.payload.path === path
    );
  }

  /**
   * Obtém todos os agentes registrados
   */
  getRegisteredAgents(): RegisteredAgent[] {
    return Array.from(this.agents.values());
  }

  /**
   * Obtém um agente específico
   */
  getAgent(agentId: string): RegisteredAgent | undefined {
    return this.agents.get(agentId);
  }

  /**
   * Obtém o histórico de eventos
   */
  getEventHistory(limit?: number): DiscoveryEvent[] {
    if (limit) {
      return this.eventHistory.slice(-limit);
    }
    return [...this.eventHistory];
  }

  /**
   * Obtém estatísticas do broker
   */
  getStats(): BrokerStats {
    return {
      totalEventsPublished: this.totalEventsPublished,
      totalEventsDelivered: this.totalEventsDelivered,
      registeredAgents: this.agents.size,
      uptime: Date.now() - this.startTime,
    };
  }

  /**
   * Limpa o histórico de eventos
   */
  clearHistory(): void {
    this.eventHistory = [];
  }

  /**
   *shutdown o broker - remove todos os agentes e limpa listeners
   */
  shutdown(): void {
    this.removeAllListeners();
    this.agents.clear();
    this.eventHistory = [];
  }
}

/**
 * Instância singleton do broker
 */
let brokerInstance: AgentCommunicationBroker | null = null;

/**
 * Obtém a instância singleton do broker
 */
export function getBroker(maxHistorySize?: number): AgentCommunicationBroker {
  if (!brokerInstance) {
    brokerInstance = new AgentCommunicationBroker(maxHistorySize);
  }
  return brokerInstance;
}

/**
 * Reseta a instância singleton (útil para testes)
 */
export function resetBroker(): void {
  if (brokerInstance) {
    brokerInstance.shutdown();
    brokerInstance = null;
  }
}
