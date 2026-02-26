/**
 * Mock Factory - Gerador de fixtures baseadas em tipagem TypeScript/JSON Schema
 * Utilitário para TDD com dados falsos válidos baseados em estruturas de tipos
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================
// Tipos e Interfaces
// ============================================

export interface MockOptions {
  seed?: number;
  locale?: 'en' | 'pt-BR';
  optionalProbability?: number;
  arrayMinLength?: number;
  arrayMaxLength?: number;
  stringMinLength?: number;
  stringMaxLength?: number;
  depth?: number;
}

export type MockValue = string | number | boolean | null | undefined | MockValue[] | { [key: string]: MockValue };

export type SchemaType =
  | 'string'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'null'
  | 'array'
  | 'object'
  | 'date'
  | 'email'
  | 'uuid'
  | 'url'
  | 'phone'
  | 'cpf'
  | 'cnpj'
  | 'name'
  | 'firstName'
  | 'lastName'
  | 'address'
  | 'city'
  | 'country'
  | 'hexColor'
  | 'rgbColor'
  | 'json'
  | 'md5'
  | 'sha256'
  | 'base64'
  | 'ipv4'
  | 'ipv6'
  | 'uri'
  | 'alpha'
  | 'alphaNumeric'
  | 'undefined';

export interface JsonSchema {
  type?: SchemaType;
  format?: string;
  properties?: { [key: string]: JsonSchema };
  items?: JsonSchema | JsonSchema[];
  required?: string[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  enum?: MockValue[];
  const?: MockValue;
  default?: MockValue;
  description?: string;
  $ref?: string;
  oneOf?: JsonSchema[];
  anyOf?: JsonSchema[];
  allOf?: JsonSchema[];
  nullable?: boolean;
  minimumItems?: number;
  maximumItems?: number;
  uniqueItems?: boolean;
  additionalProperties?: boolean | JsonSchema;
}

export interface ParseResult {
  success: boolean;
  schema?: JsonSchema;
  error?: string;
}

// ============================================
// Utilitários Internos
// ============================================

class RandomGenerator {
  private seed: number;

  constructor(seed?: number) {
    this.seed = seed ?? Math.floor(Math.random() * 2147483647);
  }

  // Gerador de números aleatórios com seed (LCG)
  next(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return (this.seed - 1) / 2147483646;
  }

  // Inteiro entre min e max (inclusive)
  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  // Float entre min e max
  float(min: number, max: number): number {
    return this.next() * (max - min) + min;
  }

  // Boolean aleatório
  boolean(probability: number = 0.5): boolean {
    return this.next() < probability;
  }

  // Escolher elemento aleatório de array
  pick<T>(array: T[]): T {
    return array[this.int(0, array.length - 1)];
  }

  // Embaralhar array
  shuffle<T>(array: T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  // выбор случайного элемента с вероятностью
  weightedPick<T>(items: { item: T; weight: number }[]): T {
    const totalWeight = items.reduce((sum, i) => sum + i.weight, 0);
    let random = this.next() * totalWeight;
    for (const { item, weight } of items) {
      random -= weight;
      if (random <= 0) return item;
    }
    return items[items.length - 1].item;
  }
}

// ============================================
// Geradores de Dados por Tipo
// ============================================

class DataGenerators {
  private random: RandomGenerator;
  private options: MockOptions;

  constructor(random: RandomGenerator, options: MockOptions) {
    this.random = random;
    this.options = options;
  }

  // String aleatória de comprimento específico
  private generateAlpha(length?: number): string {
    const len = length ?? this.random.int(this.options.stringMinLength ?? 5, this.options.stringMaxLength ?? 20);
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let result = '';
    for (let i = 0; i < len; i++) {
      result += chars[this.random.int(0, chars.length - 1)];
    }
    return result;
  }

  // String alfanumérica
  private generateAlphaNumeric(length?: number): string {
    const len = length ?? this.random.int(this.options.stringMinLength ?? 5, this.options.stringMaxLength ?? 20);
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < len; i++) {
      result += chars[this.random.int(0, chars.length - 1)];
    }
    return result;
  }

  // Gera string baseada em formato
  generateByFormat(format?: string): string {
    if (!format) return this.generateAlpha();

    switch (format) {
      case 'date':
        return new Date(this.random.int(946684800, 1735689600) * 1000).toISOString().split('T')[0];
      case 'date-time':
        return new Date(this.random.int(946684800, 1735689600) * 1000).toISOString();
      case 'time':
        return `${this.random.int(0, 23).toString().padStart(2, '0')}:${this.random.int(0, 59).toString().padStart(2, '0')}:${this.random.int(0, 59).toString().padStart(2, '0')}`;
      case 'email':
        return `${this.generateAlpha(8).toLowerCase()}@${this.generateAlpha(5).toLowerCase()}.com`;
      case 'uri':
      case 'url':
        return `https://${this.generateAlpha(8).toLowerCase()}.com/${this.generateAlpha(5)}`;
      case 'uuid':
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = this.random.int(0, 15);
          const v = c === 'x' ? r : (r & 0x3) | 0x8;
          return v.toString(16);
        });
      case 'phone':
        return `+55${this.random.int(10, 99)}${this.random.int(90000, 99999)}${this.random.int(1000, 9999)}`;
      case 'cpf':
        const cpf = [
          this.random.int(100, 999),
          this.random.int(100, 999),
          this.random.int(100, 999),
          this.random.int(0, 9),
          this.random.int(0, 9),
          this.random.int(0, 9),
          this.random.int(0, 9),
          this.random.int(0, 9),
          this.random.int(0, 9)
        ];
        // Simplified CPF (without digits calculation for mock purposes)
        return cpf.join('');
      case 'cnpj':
        const cnpj = [
          this.random.int(10, 99),
          this.random.int(100, 999),
          this.random.int(100, 999),
          '0001',
          this.random.int(0, 9)
        ];
        return cnpj.join('');
      case 'ipv4':
        return `${this.random.int(1, 255)}.${this.random.int(0, 255)}.${this.random.int(0, 255)}.${this.random.int(1, 254)}`;
      case 'ipv6':
        const parts = Array(8).fill(0).map(() => this.random.int(0, 65535).toString(16));
        return parts.join(':');
      case 'hex-color':
        return `#${this.generateAlphaNumeric(6).toLowerCase()}`;
      case 'rgb-color':
        return `rgb(${this.random.int(0, 255)}, ${this.random.int(0, 255)}, ${this.random.int(0, 255)})`;
      case 'base64':
        return Buffer.from(this.generateAlpha(12)).toString('base64');
      case 'md5':
        return this.generateAlphaNumeric(32).toLowerCase();
      case 'sha256':
        return this.generateAlphaNumeric(64).toLowerCase();
      default:
        return this.generateAlpha();
    }
  }

  // Gera valor para tipo específico
  generateForType(type: SchemaType, format?: string): MockValue {
    switch (type) {
      case 'string':
        return format ? this.generateByFormat(format) : this.generateAlpha();
      case 'number':
      case 'integer':
        return this.random.int(-1000000, 1000000);
      case 'boolean':
        return this.random.boolean();
      case 'null':
        return null;
      case 'date':
        return new Date(this.random.int(946684800, 1735689600) * 1000).toISOString();
      case 'email':
        return this.generateByFormat('email');
      case 'uuid':
        return this.generateByFormat('uuid');
      case 'url':
        return this.generateByFormat('url');
      case 'phone':
        return this.generateByFormat('phone');
      case 'cpf':
        return this.generateByFormat('cpf');
      case 'cnpj':
        return this.generateByFormat('cnpj');
      case 'name':
        return this.generateName();
      case 'firstName':
        return this.generateFirstName();
      case 'lastName':
        return this.generateLastName();
      case 'address':
        return this.generateAddress();
      case 'city':
        return this.generateCity();
      case 'country':
        return this.generateCountry();
      case 'hexColor':
        return this.generateByFormat('hex-color');
      case 'rgbColor':
        return this.generateByFormat('rgb-color');
      case 'json':
        return JSON.stringify({ key: this.generateAlpha(), value: this.random.int(1, 100) });
      case 'md5':
        return this.generateByFormat('md5');
      case 'sha256':
        return this.generateByFormat('sha256');
      case 'base64':
        return this.generateByFormat('base64');
      case 'ipv4':
        return this.generateByFormat('ipv4');
      case 'ipv6':
        return this.generateByFormat('ipv6');
      case 'uri':
        return this.generateByFormat('uri');
      case 'alpha':
        return this.generateAlpha();
      case 'alphaNumeric':
        return this.generateAlphaNumeric();
      case 'undefined':
        return undefined;
      default:
        return this.generateAlpha();
    }
  }

  // Dados de nomes (português/inglês)
  private firstNames: Record<string, string[]> = {
    en: ['John', 'Jane', 'Michael', 'Sarah', 'David', 'Emily', 'Robert', 'Lisa', 'William', 'Emma', 'James', 'Olivia', 'Daniel', 'Ava', 'Matthew', 'Sophia', 'Andrew', 'Isabella', 'Christopher', 'Mia'],
    'pt-BR': ['Gabriel', 'Ana', 'Lucas', 'Mariana', 'Carlos', 'Julia', 'Pedro', 'Fernanda', 'Rafael', 'Camila', 'João', 'Beatriz', 'Bruno', 'Larissa', 'Felipe', 'Amanda', 'Diego', 'Gabriela', 'Vinícius', 'Carolina']
  };

  private lastNames: Record<string, string[]> = {
    en: ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Anderson', 'Taylor', 'Thomas', 'Moore', 'Jackson', 'Martin', 'Lee', 'Thompson', 'White', 'Harris'],
    'pt-BR': ['Silva', 'Santos', 'Oliveira', 'Souza', 'Rodrigues', 'Ferreira', 'Almeida', 'Nascimento', 'Lima', 'Araujo', 'Melo', 'Costa', 'Ribeiro', 'Cardoso', 'Fernandes', 'Barbosa', 'Carvalho', 'Gomes', 'Machado', 'Correia']
  };

  private cities: Record<string, string[]> = {
    en: ['New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix', 'Philadelphia', 'San Antonio', 'San Diego', 'Dallas', 'San Jose'],
    'pt-BR': ['São Paulo', 'Rio de Janeiro', 'Belo Horizonte', 'Brasília', 'Salvador', 'Fortaleza', 'Manaus', 'Curitiba', 'Recife', 'Porto Alegre']
  };

  private countries: Record<string, string[]> = {
    en: ['United States', 'United Kingdom', 'Canada', 'Australia', 'Germany', 'France', 'Japan', 'Brazil', 'India', 'China'],
    'pt-BR': ['Brasil', 'Estados Unidos', 'Reino Unido', 'Canadá', 'Austrália', 'Alemanha', 'França', 'Japão', 'Índia', 'China']
  };

  private streets: Record<string, string[]> = {
    en: ['Main St', 'Oak Ave', 'Maple Dr', 'Cedar Ln', 'Pine St', 'Elm St', 'Washington Blvd', 'Park Ave', 'Lake Dr', 'Hill Rd'],
    'pt-BR': ['Av. Brasil', 'Rua das Flores', 'Av. Paulista', 'Rua Augusta', 'Av. Nossa Senhora', 'Rua do Centro', 'Av. Central', 'Rua Nova', 'Av. Principal', 'Rua dos Bandeirantes']
  };

  private generateFirstName(): string {
    const locale = this.options.locale ?? 'en';
    return this.random.pick(this.firstNames[locale] ?? this.firstNames.en);
  }

  private generateLastName(): string {
    const locale = this.options.locale ?? 'en';
    return this.random.pick(this.lastNames[locale] ?? this.lastNames.en);
  }

  private generateName(): string {
    return `${this.generateFirstName()} ${this.generateLastName()}`;
  }

  private generateAddress(): string {
    const locale = this.options.locale ?? 'en';
    const num = this.random.int(1, 9999);
    const street = this.random.pick(this.streets[locale] ?? this.streets.en);
    return `${num} ${street}`;
  }

  private generateCity(): string {
    const locale = this.options.locale ?? 'en';
    return this.random.pick(this.cities[locale] ?? this.cities.en);
  }

  private generateCountry(): string {
    const locale = this.options.locale ?? 'en';
    return this.random.pick(this.countries[locale] ?? this.countries.en);
  }
}

// ============================================
// Parser de Interfaces TypeScript
// ============================================

class TypeScriptParser {
  /**
   * Parseia uma string de interface TypeScript e gera JSON Schema
   */
  parseInterface(interfaceString: string): JsonSchema {
    const schema: JsonSchema = {
      type: 'object',
      properties: {},
      required: []
    };

    // Remove comments
    const cleanCode = interfaceString
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\s+/g, ' ')
      .trim();

    // Extract interface name
    const nameMatch = cleanCode.match(/interface\s+(\w+)/);
    const interfaceName = nameMatch ? nameMatch[1] : 'Anonymous';

    // Extract properties between { and }
    const bodyMatch = cleanCode.match(/interface\s+\w+\s*\{([\s\S]*?)\}/);
    if (!bodyMatch) return schema;

    const body = bodyMatch[1];
    // Split by semicolon, handling nested structures
    const propertyLines = body.split(';').filter(line => line.trim().length > 0);

    for (const line of propertyLines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Parse property: name: type
      const propMatch = trimmed.match(/^(\w+)(\??)\s*:\s*(.+)$/);
      if (!propMatch) continue;

      const [, propName, optional, typeStr] = propMatch;

      const propSchema = this.parseType(typeStr.trim());
      schema.properties![propName] = propSchema;

      if (!optional) {
        schema.required!.push(propName);
      }
    }

    return schema;
  }

  /**
   * Parseia uma string de tipo TypeScript para JSON Schema
   */
  parseType(typeStr: string): JsonSchema {
    const trimmed = typeStr.trim();

    // Handle union types: string | number | null
    if (trimmed.includes('|')) {
      const types = trimmed.split('|').map(t => t.trim());
      // For mock generation, take first non-null type
      const nonNullTypes = types.filter(t => t !== 'null' && t !== 'undefined' && t !== 'never');
      if (nonNullTypes.length === 0) return { type: 'null' };
      return this.parseType(nonNullTypes[0]);
    }

    // Handle array: string[]
    if (trimmed.endsWith('[]')) {
      const itemType = trimmed.slice(0, -2);
      return {
        type: 'array',
        items: this.parseType(itemType)
      };
    }

    // Handle Array<Type>
    if (trimmed.startsWith('Array<')) {
      const innerMatch = trimmed.match(/Array<(.+)>$/);
      if (innerMatch) {
        return {
          type: 'array',
          items: this.parseType(innerMatch[1])
        };
      }
    }

    // Handle Record<string, Type>
    if (trimmed.startsWith('Record<')) {
      const innerMatch = trimmed.match(/Record<(.+),\s*(.+)>/);
      if (innerMatch) {
        return {
          type: 'object',
          additionalProperties: this.parseType(innerMatch[2])
        };
      }
    }

    // Handle Partial<Type>
    if (trimmed.startsWith('Partial<')) {
      const innerMatch = trimmed.match(/Partial<(.+)>/);
      if (innerMatch) {
        return this.parseType(innerMatch[1]);
      }
    }

    // Handle Pick<Type, 'prop1' | 'prop2'>
    if (trimmed.startsWith('Pick<')) {
      const innerMatch = trimmed.match(/Pick<(.+),\s*[^>]+>/);
      if (innerMatch) {
        return this.parseType(innerMatch[1]);
      }
    }

    // Handle optional: type?
    if (trimmed.endsWith('?')) {
      return this.parseType(trimmed.slice(0, -1));
    }

    // Handle basic types
    switch (trimmed) {
      case 'string':
      case 'String':
        return { type: 'string' };
      case 'number':
      case 'Number':
        return { type: 'number' };
      case 'integer':
        return { type: 'integer' };
      case 'boolean':
      case 'Boolean':
        return { type: 'boolean' };
      case 'null':
        return { type: 'null' };
      case 'undefined':
        return { type: 'undefined' };
      case 'any':
      case 'unknown':
        return { type: 'string' }; // Default to string for any/unknown
      case 'never':
        return { type: 'string' };
      case 'void':
        return { type: 'null' };
      case 'Date':
        return { type: 'string', format: 'date-time' };
      case 'object':
      case 'Object':
        return { type: 'object' };
      default:
        // Could be a custom type - default to object
        return { type: 'object' };
    }
  }

  /**
   * Parseia múltiplas interfaces de um arquivo
   */
  parseFile(filePath: string): JsonSchema {
    const content = fs.readFileSync(filePath, 'utf-8');
    return this.parseInterface(content);
  }
}

// ============================================
// Parser de JSON Schema
// ============================================

class JsonSchemaParser {
  /**
   * Parseia uma string JSON Schema
   */
  parse(schemaString: string): ParseResult {
    try {
      const schema = JSON.parse(schemaString) as JsonSchema;
      return { success: true, schema };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Invalid JSON Schema'
      };
    }
  }

  /**
   * Carrega JSON Schema de arquivo
   */
  parseFile(filePath: string): ParseResult {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      return this.parse(content);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to read file'
      };
    }
  }

  /**
   * Valida se um objeto é um JSON Schema válido
   */
  isValidSchema(schema: unknown): schema is JsonSchema {
    if (typeof schema !== 'object' || schema === null) return false;
    const s = schema as JsonSchema;
    return (
      s.type !== undefined ||
      s.properties !== undefined ||
      s.items !== undefined ||
      s.$ref !== undefined
    );
  }
}

// ============================================
// MockFactory - Classe Principal
// ============================================

export class MockFactory {
  private random: RandomGenerator;
  private generators: DataGenerators;
  private options: MockOptions;

  constructor(options: MockOptions = {}) {
    this.options = {
      locale: 'en',
      optionalProbability: 0.3,
      arrayMinLength: 1,
      arrayMaxLength: 5,
      stringMinLength: 5,
      stringMaxLength: 20,
      depth: 3,
      ...options
    };

    this.random = new RandomGenerator(this.options.seed);
    this.generators = new DataGenerators(this.random, this.options);
  }

  /**
   * Gera um mock a partir de um JSON Schema
   */
  generate(schema: JsonSchema, depth: number = 0): MockValue {
    // Prevent infinite recursion
    if (depth > (this.options.depth ?? 3)) {
      return this.generators.generateForType('string');
    }

    // Handle $ref (simplified - just return empty for now)
    if (schema.$ref) {
      return {};
    }

    // Handle oneOf - pick randomly
    if (schema.oneOf && schema.oneOf.length > 0) {
      return this.generate(this.random.pick(schema.oneOf), depth + 1);
    }

    // Handle anyOf - pick randomly
    if (schema.anyOf && schema.anyOf.length > 0) {
      return this.generate(this.random.pick(schema.anyOf), depth + 1);
    }

    // Handle const
    if (schema.const !== undefined) {
      return schema.const;
    }

    // Handle enum
    if (schema.enum && schema.enum.length > 0) {
      return this.random.pick(schema.enum);
    }

    // Handle default
    if (schema.default !== undefined) {
      return schema.default;
    }

    // Handle nullable
    if (schema.nullable && this.random.boolean(this.options.optionalProbability ?? 0.3)) {
      return null;
    }

    const type = schema.type ?? 'string';
    const format = schema.format;

    // Handle object type
    if (type === 'object' || schema.properties) {
      return this.generateObject(schema, depth);
    }

    // Handle array type
    if (type === 'array' || schema.items) {
      return this.generateArray(schema, depth);
    }

    // Handle basic types
    return this.generators.generateForType(type, format);
  }

  /**
   * Gera um objeto a partir de schema
   */
  private generateObject(schema: JsonSchema, depth: number): { [key: string]: MockValue } {
    const result: { [key: string]: MockValue } = {};
    const properties = schema.properties ?? {};
    const required = schema.required ?? [];

    for (const [key, propSchema] of Object.entries(properties)) {
      // Skip optional properties based on probability
      if (!required.includes(key) && this.random.boolean(this.options.optionalProbability ?? 0.3)) {
        continue;
      }

      result[key] = this.generate(propSchema as JsonSchema, depth + 1);
    }

    // Handle additionalProperties
    if (schema.additionalProperties === true) {
      const extraCount = this.random.int(0, 3);
      for (let i = 0; i < extraCount; i++) {
        const key = this.generators.generateForType('alphaNumeric') as string;
        result[key] = this.generators.generateForType('string');
      }
    }

    return result;
  }

  /**
   * Gera um array a partir de schema
   */
  private generateArray(schema: JsonSchema, depth: number): MockValue[] {
    const minItems = schema.minimumItems ?? this.options.arrayMinLength ?? 1;
    const maxItems = schema.maximumItems ?? this.options.arrayMaxLength ?? 5;
    const count = this.random.int(minItems, maxItems);

    // Get item schema
    let itemSchema: JsonSchema;
    if (Array.isArray(schema.items)) {
      itemSchema = this.random.pick(schema.items);
    } else if (schema.items) {
      itemSchema = schema.items;
    } else {
      itemSchema = { type: 'string' };
    }

    const result: MockValue[] = [];
    for (let i = 0; i < count; i++) {
      result.push(this.generate(itemSchema, depth + 1));
    }

    // Handle uniqueItems
    if (schema.uniqueItems && result.length > 0) {
      return this.random.shuffle(result);
    }

    return result;
  }

  /**
   * Gera múltiplas instâncias
   */
  generateMany(schema: JsonSchema, count: number): MockValue[] {
    return Array(count).fill(null).map(() => this.generate(schema));
  }

  /**
   * Gera fixture a partir de string JSON Schema
   */
  generateFromSchemaString(schemaString: string): MockValue {
    const parser = new JsonSchemaParser();
    const result = parser.parse(schemaString);
    if (!result.success || !result.schema) {
      throw new Error(result.error ?? 'Invalid schema');
    }
    return this.generate(result.schema);
  }

  /**
   * Gera fixture a partir de arquivo JSON Schema
   */
  generateFromSchemaFile(filePath: string): MockValue {
    const parser = new JsonSchemaParser();
    const result = parser.parseFile(filePath);
    if (!result.success || !result.schema) {
      throw new Error(result.error ?? 'Invalid schema file');
    }
    return this.generate(result.schema);
  }

  /**
   * Gera fixture a partir de interface TypeScript
   */
  generateFromTypeScript(interfaceString: string): MockValue {
    const parser = new TypeScriptParser();
    const schema = parser.parseInterface(interfaceString);
    return this.generate(schema);
  }

  /**
   * Gera fixture a partir de arquivo TypeScript
   */
  generateFromTypeScriptFile(filePath: string): MockValue {
    const parser = new TypeScriptParser();
    const schema = parser.parseFile(filePath);
    return this.generate(schema);
  }

  /**
   * Reseta o gerador com nova seed
   */
  reset(seed?: number): void {
    this.random = new RandomGenerator(seed ?? this.options.seed);
    this.generators = new DataGenerators(this.random, this.options);
  }

  /**
   * Retorna a seed atual
   */
  getSeed(): number {
    return this.random['seed'];
  }
}

// ============================================
// Funções de convenience (export default)
// ============================================

/**
 * Cria uma nova MockFactory com opções padrão
 */
export function createMockFactory(options?: MockOptions): MockFactory {
  return new MockFactory(options);
}

/**
 * Gera um mock rápido a partir de JSON Schema
 */
export function generateMock(schema: JsonSchema, options?: MockOptions): MockValue {
  return new MockFactory(options).generate(schema);
}

/**
 * Gera múltiplos mocks
 */
export function generateMocks(schema: JsonSchema, count: number, options?: MockOptions): MockValue[] {
  return new MockFactory(options).generateMany(schema, count);
}

/**
 * Gera mock a partir de string JSON Schema
 */
export function generateFromSchema(schemaString: string, options?: MockOptions): MockValue {
  return new MockFactory(options).generateFromSchemaString(schemaString);
}

/**
 * Gera mock a partir de arquivo JSON Schema
 */
export function generateFromSchemaFile(filePath: string, options?: MockOptions): MockValue {
  return new MockFactory(options).generateFromSchemaFile(filePath);
}

/**
 * Gera mock a partir de interface TypeScript
 */
export function generateFromTypeScript(interfaceString: string, options?: MockOptions): MockValue {
  return new MockFactory(options).generateFromTypeScript(interfaceString);
}

/**
 * Gera mock a partir de arquivo TypeScript
 */
export function generateFromTypeScriptFile(filePath: string, options?: MockValue): MockValue {
  return new MockFactory(options as MockOptions).generateFromTypeScriptFile(filePath);
}

// ============================================
// Schemas Predefinidos Úteis
// ============================================

export const commonSchemas = {
  // Schema básico de pessoa
  person: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      name: { type: 'string' },
      email: { type: 'string', format: 'email' },
      age: { type: 'integer', minimum: 0, maximum: 150 },
      isActive: { type: 'boolean' },
      createdAt: { type: 'string', format: 'date-time' }
    },
    required: ['id', 'name', 'email']
  } as JsonSchema,

  // Schema de usuário
  user: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      username: { type: 'string' },
      email: { type: 'string', format: 'email' },
      password: { type: 'string' },
      roles: { type: 'array', items: { type: 'string' } },
      profile: {
        type: 'object',
        properties: {
          firstName: { type: 'string' },
          lastName: { type: 'string' },
          avatar: { type: 'string', format: 'url' },
          bio: { type: 'string' }
        }
      },
      metadata: { type: 'object' }
    },
    required: ['id', 'username', 'email']
  } as JsonSchema,

  // Schema de produto
  product: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      name: { type: 'string' },
      description: { type: 'string' },
      price: { type: 'number', minimum: 0 },
      currency: { type: 'string' },
      inStock: { type: 'boolean' },
      quantity: { type: 'integer', minimum: 0 },
      category: { type: 'string' },
      tags: { type: 'array', items: { type: 'string' } },
      images: { type: 'array', items: { type: 'string', format: 'url' } },
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' }
    },
    required: ['id', 'name', 'price']
  } as JsonSchema,

  // Schema de post/blog
  post: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      title: { type: 'string' },
      slug: { type: 'string' },
      content: { type: 'string' },
      excerpt: { type: 'string' },
      author: { type: 'string', format: 'uuid' },
      status: { type: 'string', enum: ['draft', 'published', 'archived'] },
      tags: { type: 'array', items: { type: 'string' } },
      featuredImage: { type: 'string', format: 'url' },
      publishedAt: { type: 'string', format: 'date-time' },
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' }
    },
    required: ['id', 'title', 'slug', 'author']
  } as JsonSchema,

  // Schema de endereço
  address: {
    type: 'object',
    properties: {
      street: { type: 'string' },
      number: { type: 'string' },
      complement: { type: 'string' },
      city: { type: 'string' },
      state: { type: 'string' },
      country: { type: 'string' },
      zipCode: { type: 'string' },
      coordinates: {
        type: 'object',
        properties: {
          lat: { type: 'number' },
          lng: { type: 'number' }
        }
      }
    },
    required: ['street', 'city', 'country', 'zipCode']
  } as JsonSchema
};

// Exportação padrão
export default MockFactory;
