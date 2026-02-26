// Architecture Specification Template - Story 8.1: Template for documenting architecture before coding
// AC: Dado usuário inicia novo feature, Quando template de especificação é apresentado,
//     Então inclui campos: Overview, Data Model, API, Security, Edge Cases
//     E inclui exemplos de preenchimento, E permite customização por projeto

import { promises as fs } from 'fs';
import { join, dirname } from 'path';

export interface ArchitectureSpecTemplate {
  version: string;
  lastUpdated: string;
  overview: OverviewSection;
  dataModel?: DataModelSection;
  api?: APISection;
  security?: SecuritySection;
  edgeCases?: EdgeCaseSection[];
  customSections?: CustomSection[];
}

export interface OverviewSection {
  featureName: string;
  description: string;
  problemStatement: string;
  proposedSolution: string;
  alternativesConsidered: string[];
  successCriteria: string[];
}

export interface DataModelSection {
  entities: Entity[];
  relationships: Relationship[];
  diagrams?: string;
}

export interface Entity {
  name: string;
  description: string;
  fields: Field[];
}

export interface Field {
  name: string;
  type: string;
  required: boolean;
  description: string;
}

export interface Relationship {
  from: string;
  to: string;
  type: 'one-to-one' | 'one-to-many' | 'many-to-many';
  description: string;
}

export interface APISection {
  endpoints: Endpoint[];
  requestResponseExamples?: RequestResponseExample[];
}

export interface Endpoint {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  description: string;
  requestBody?: RequestBody;
  response: ResponseSchema;
  errors?: ErrorResponse[];
}

export interface RequestBody {
  contentType: string;
  schema: Record<string, any>;
  example?: Record<string, any>;
}

export interface ResponseSchema {
  statusCode: number;
  description: string;
  schema?: Record<string, any>;
  example?: Record<string, any>;
}

export interface ErrorResponse {
  statusCode: number;
  code: string;
  description: string;
}

export interface RequestResponseExample {
  name: string;
  request: {
    method: string;
    path: string;
    headers?: Record<string, string>;
    body?: any;
  };
  response: {
    statusCode: number;
    headers?: Record<string, string>;
    body: any;
  };
}

export interface SecuritySection {
  authentication?: AuthenticationSpec;
  authorization?: AuthorizationSpec;
  dataProtection?: DataProtectionSpec;
  securityHeaders?: string[];
}

export interface AuthenticationSpec {
  method: string;
  implementation: string;
  tokenExpiry?: string;
}

export interface AuthorizationSpec {
  model: string;
  roles: string[];
  permissions: string[];
}

export interface DataProtectionSpec {
  encryption: string;
  piiHandling: string;
  dataRetention: string;
}

export interface EdgeCaseSection {
  scenario: string;
  expectedBehavior: string;
  handling: string;
}

export interface CustomSection {
  title: string;
  content: string;
}

export interface TemplateOptions {
  projectName?: string;
  featureName?: string;
  customSections?: string[];
}

/**
 * Story 8.1: Architecture Specification Template
 *
 * Provides a template for documenting architecture before coding.
 * Includes fields: Overview, Data Model, API, Security, Edge Cases
 * Supports customization per project.
 */
export class ArchitectureSpecTemplateGenerator {
  private projectName: string;

  constructor(projectName?: string) {
    this.projectName = projectName || 'MyProject';
  }

  /**
   * Generate a new architecture specification template
   */
  generate(options?: TemplateOptions): ArchitectureSpecTemplate {
    const customSections = options?.customSections || [];

    return {
      version: '1.0.0',
      lastUpdated: new Date().toISOString(),
      overview: this.generateOverview(options?.featureName),
      dataModel: this.generateDataModel(),
      api: this.generateAPI(),
      security: this.generateSecurity(),
      edgeCases: this.generateEdgeCases(),
      customSections: customSections.map(name => ({
        title: name,
        content: 'TODO: Add content for ' + name
      }))
    };
  }

  /**
   * Generate Overview section
   */
  private generateOverview(featureName?: string): OverviewSection {
    return {
      featureName: featureName || 'NewFeature',
      description: 'Brief description of what this feature does and its value proposition.',
      problemStatement: 'What problem does this feature solve? Why is it needed?',
      proposedSolution: 'High-level description of the proposed solution approach.',
      alternativesConsidered: [
        'Alternative 1: Description of alternative approach and why it was not chosen',
        'Alternative 2: Description of alternative approach and why it was not chosen'
      ],
      successCriteria: [
        'Criterion 1: Measurable success criteria for this feature',
        'Criterion 2: Measurable success criteria for this feature'
      ]
    };
  }

  /**
   * Generate Data Model section
   */
  private generateDataModel(): DataModelSection {
    return {
      entities: [
        {
          name: 'EntityName',
          description: 'Description of what this entity represents',
          fields: [
            {
              name: 'id',
              type: 'string | UUID',
              required: true,
              description: 'Unique identifier'
            },
            {
              name: 'createdAt',
              type: 'timestamp',
              required: true,
              description: 'Creation timestamp'
            }
          ]
        }
      ],
      relationships: [
        {
          from: 'EntityA',
          to: 'EntityB',
          type: 'one-to-many',
          description: 'One EntityA can have many EntityB'
        }
      ],
      diagrams: 'TODO: Add entity relationship diagram (Mermaid or other format)'
    };
  }

  /**
   * Generate API section
   */
  private generateAPI(): APISection {
    return {
      endpoints: [
        {
          method: 'GET',
          path: '/api/v1/resource',
          description: 'Retrieve a list of resources',
          response: {
            statusCode: 200,
            description: 'Successful response',
            schema: {
              type: 'array',
              items: { $ref: '#/components/schemas/Resource' }
            },
            example: {
              data: [{ id: '1', name: 'Example' }]
            }
          },
          errors: [
            {
              statusCode: 401,
              code: 'UNAUTHORIZED',
              description: 'Authentication required'
            },
            {
              statusCode: 500,
              code: 'INTERNAL_ERROR',
              description: 'Server error'
            }
          ]
        },
        {
          method: 'POST',
          path: '/api/v1/resource',
          description: 'Create a new resource',
          requestBody: {
            contentType: 'application/json',
            schema: {
              type: 'object',
              required: ['name'],
              properties: {
                name: { type: 'string' }
              }
            },
            example: { name: 'New Resource' }
          },
          response: {
            statusCode: 201,
            description: 'Resource created successfully',
            example: { id: '1', name: 'New Resource', createdAt: '2024-01-01T00:00:00Z' }
          }
        }
      ],
      requestResponseExamples: [
        {
          name: 'Get Users Example',
          request: {
            method: 'GET',
            path: '/api/v1/users?page=1&limit=10',
            headers: {
              'Authorization': 'Bearer token',
              'Content-Type': 'application/json'
            }
          },
          response: {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: {
              data: [
                { id: '1', name: 'John Doe', email: 'john@example.com' }
              ],
              pagination: { page: 1, limit: 10, total: 100 }
            }
          }
        }
      ]
    };
  }

  /**
   * Generate Security section
   */
  private generateSecurity(): SecuritySection {
    return {
      authentication: {
        method: 'JWT Bearer Token',
        implementation: 'OAuth 2.0 with JWT access tokens',
        tokenExpiry: '15 minutes for access token, 7 days for refresh token'
      },
      authorization: {
        model: 'RBAC (Role-Based Access Control)',
        roles: ['admin', 'user', 'guest'],
        permissions: [
          'admin: * (full access)',
          'user: read, write own resources',
          'guest: read public resources only'
        ]
      },
      dataProtection: {
        encryption: 'TLS 1.3 for transit, AES-256 for at-rest encryption',
        piiHandling: 'PII is encrypted and access is logged. Follows GDPR compliance.',
        dataRetention: 'Data retained for 90 days then automatically purged unless required by law.'
      },
      securityHeaders: [
        'Content-Security-Policy',
        'X-Frame-Options: DENY',
        'X-Content-Type-Options: nosniff',
        'Strict-Transport-Security: max-age=31536000; includeSubDomains',
        'X-XSS-Protection: 1; mode=block'
      ]
    };
  }

  /**
   * Generate Edge Cases section
   */
  private generateEdgeCases(): EdgeCaseSection[] {
    return [
      {
        scenario: 'Network failure during API call',
        expectedBehavior: 'System should retry with exponential backoff',
        handling: 'Implement retry logic with max 3 attempts, then show user-friendly error'
      },
      {
        scenario: 'Concurrent updates to same resource',
        expectedBehavior: 'Last write wins or optimistic locking',
        handling: 'Use ETag/If-Match header for optimistic concurrency control'
      },
      {
        scenario: 'Authentication token expires mid-operation',
        expectedBehavior: 'Refresh token and retry',
        handling: 'Implement token refresh interceptor, retry original request once'
      },
      {
        scenario: 'Database connection pool exhausted',
        expectedBehavior: 'Graceful degradation',
        handling: 'Return 503 Service Unavailable with retry-after header'
      }
    ];
  }

  /**
   * Generate template as Markdown
   */
  generateMarkdown(options?: TemplateOptions): string {
    const template = this.generate(options);
    let md = `# Architecture Specification: ${template.overview.featureName}\n\n`;
    md += `**Version:** ${template.version}\n`;
    md += `**Last Updated:** ${new Date(template.lastUpdated).toLocaleDateString()}\n\n`;

    // Overview
    md += `## 1. Overview\n\n`;
    md += `### Feature Name\n${template.overview.featureName}\n\n`;
    md += `### Description\n${template.overview.description}\n\n`;
    md += `### Problem Statement\n${template.overview.problemStatement}\n\n`;
    md += `### Proposed Solution\n${template.overview.proposedSolution}\n\n`;
    md += `### Alternatives Considered\n`;
    for (const alt of template.overview.alternativesConsidered) {
      md += `- ${alt}\n`;
    }
    md += `\n### Success Criteria\n`;
    for (const criterion of template.overview.successCriteria) {
      md += `- ${criterion}\n`;
    }
    md += `\n`;

    // Data Model
    if (template.dataModel) {
      md += `## 2. Data Model\n\n`;
      md += `### Entities\n\n`;
      for (const entity of template.dataModel.entities) {
        md += `#### ${entity.name}\n${entity.description}\n\n`;
        md += `| Field | Type | Required | Description |\n`;
        md += `|-------|------|----------|-------------|\n`;
        for (const field of entity.fields) {
          md += `| ${field.name} | ${field.type} | ${field.required ? 'Yes' : 'No'} | ${field.description} |\n`;
        }
        md += `\n`;
      }

      md += `### Relationships\n\n`;
      for (const rel of template.dataModel.relationships) {
        md += `- **${rel.from} → ${rel.to}** (${rel.type}): ${rel.description}\n`;
      }
      md += `\n`;
    }

    // API
    if (template.api) {
      md += `## 3. API Design\n\n`;
      for (const endpoint of template.api.endpoints) {
        md += `### ${endpoint.method} ${endpoint.path}\n`;
        md += `${endpoint.description}\n\n`;
        if (endpoint.requestBody) {
          md += `**Request Body:**\n\`\`\`json\n${JSON.stringify(endpoint.requestBody.example || {}, null, 2)}\n\`\`\`\n\n`;
        }
        md += `**Response:** ${endpoint.response.statusCode} - ${endpoint.response.description}\n`;
        if (endpoint.errors) {
          md += `\n**Errors:**\n`;
          for (const error of endpoint.errors) {
            md += `- ${error.statusCode} (${error.code}): ${error.description}\n`;
          }
        }
        md += `\n`;
      }
    }

    // Security
    if (template.security) {
      md += `## 4. Security\n\n`;
      if (template.security.authentication) {
        md += `### Authentication\n`;
        md += `- **Method:** ${template.security.authentication.method}\n`;
        md += `- **Implementation:** ${template.security.authentication.implementation}\n`;
        if (template.security.authentication.tokenExpiry) {
          md += `- **Token Expiry:** ${template.security.authentication.tokenExpiry}\n`;
        }
        md += `\n`;
      }
      if (template.security.authorization) {
        md += `### Authorization\n`;
        md += `- **Model:** ${template.security.authorization.model}\n`;
        md += `\n**Roles:**\n`;
        for (const role of template.security.authorization.roles) {
          md += `- ${role}\n`;
        }
        md += `\n**Permissions:**\n`;
        for (const perm of template.security.authorization.permissions) {
          md += `- ${perm}\n`;
        }
        md += `\n`;
      }
      if (template.security.securityHeaders?.length) {
        md += `### Security Headers\n`;
        for (const header of template.security.securityHeaders) {
          md += `- ${header}\n`;
        }
        md += `\n`;
      }
    }

    // Edge Cases
    if (template.edgeCases?.length) {
      md += `## 5. Edge Cases & Error Handling\n\n`;
      for (const edgeCase of template.edgeCases) {
        md += `### ${edgeCase.scenario}\n`;
        md += `- **Expected:** ${edgeCase.expectedBehavior}\n`;
        md += `- **Handling:** ${edgeCase.handling}\n\n`;
      }
    }

    // Custom Sections
    if (template.customSections?.length) {
      for (const section of template.customSections) {
        md += `## ${section.title}\n\n${section.content}\n\n`;
      }
    }

    return md;
  }

  /**
   * Save template to file
   */
  async saveTemplate(path: string, options?: TemplateOptions): Promise<void> {
    const markdown = this.generateMarkdown(options);
    await fs.writeFile(path, markdown, 'utf-8');
  }
}

/**
 * Convenience function to generate architecture spec template
 */
export function generateArchitectureTemplate(
  projectName?: string,
  options?: TemplateOptions
): ArchitectureSpecTemplate {
  const generator = new ArchitectureSpecTemplateGenerator(projectName);
  return generator.generate(options);
}

/**
 * Convenience function to generate architecture spec as markdown
 */
export function generateArchitectureMarkdown(
  projectName?: string,
  options?: TemplateOptions
): string {
  const generator = new ArchitectureSpecTemplateGenerator(projectName);
  return generator.generateMarkdown(options);
}
