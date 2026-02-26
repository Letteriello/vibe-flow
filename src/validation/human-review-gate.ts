// Human Review Gate - Story 8.3: Mandatory human approval before code generation
// AC: Dado especificação pronta, Quando usuário tenta gerar código,
//     Então sistema pausa e solicita aprovação, E exibe spec em formato legível,
//     E permite approve/reject/comment, E registra decisão em audit trail

import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { existsSync } from 'fs';
import { validateSpec, SpecValidationEngine } from './spec-validator.js';
import { generateArchitectureMarkdown } from './architecture-spec-template.js';

export enum ReviewDecision {
  APPROVED = 'approved',
  REJECTED = 'rejected',
  PENDING = 'pending',
  COMMENTED = 'commented'
}

export interface ReviewComment {
  id: string;
  author: string;
  timestamp: string;
  content: string;
  line?: number;
  resolved: boolean;
}

export interface HumanReviewRequest {
  id: string;
  specPath: string;
  specContent: string;
  requester: string;
  timestamp: string;
  status: ReviewDecision;
  decision?: ReviewDecision;
  decidedBy?: string;
  decidedAt?: string;
  comments: ReviewComment[];
}

export interface ReviewGateOptions {
  projectPath: string;
  specPath?: string;
  requester?: string;
  autoApproveIfValid?: boolean;
  requireCommentsOnReject?: boolean;
}

export interface ReviewGateResult {
  approved: boolean;
  request: HumanReviewRequest;
  canProceed: boolean;
  message: string;
}

/**
 * Story 8.3: Human Review Gate
 *
 * Provides mandatory human approval before code generation:
 * - Pauses and requests approval
 * - Displays spec in readable format
 * - Allows approve/reject/comment
 * - Records decision in audit trail
 */
export class HumanReviewGate {
  private options: Required<ReviewGateOptions>;
  private auditTrail: HumanReviewRequest[] = [];

  constructor(options: ReviewGateOptions) {
    this.options = {
      projectPath: options.projectPath,
      specPath: options.specPath || this.findSpecFile(),
      requester: options.requester || 'system',
      autoApproveIfValid: options.autoApproveIfValid ?? false,
      requireCommentsOnReject: options.requireCommentsOnReject ?? true
    };
  }

  /**
   * Find the spec file in the project
   */
  private findSpecFile(): string {
    const patterns = [
      'SPEC.md',
      'SPECIFICATION.md',
      'architecture.md',
      '.bmad/architecture.md',
      '.bmad/spec.md'
    ];

    for (const pattern of patterns) {
      const fullPath = join(this.options.projectPath, pattern);
      if (existsSync(fullPath)) {
        return fullPath;
      }
    }

    return join(this.options.projectPath, 'SPEC.md');
  }

  /**
   * Request human review for the specification
   */
  async requestReview(): Promise<HumanReviewRequest> {
    // Load or create spec
    let specContent = '';

    try {
      if (existsSync(this.options.specPath)) {
        specContent = await fs.readFile(this.options.specPath, 'utf-8');
      } else {
        // Generate template if no spec exists
        specContent = generateArchitectureMarkdown(this.options.projectPath);
      }
    } catch (error) {
      specContent = generateArchitectureMarkdown(this.options.projectPath);
    }

    const request: HumanReviewRequest = {
      id: `review-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      specPath: this.options.specPath,
      specContent,
      requester: this.options.requester,
      timestamp: new Date().toISOString(),
      status: ReviewDecision.PENDING,
      comments: []
    };

    // Validate the spec first
    const validation = await validateSpec(this.options.projectPath);

    // Auto-approve if valid and option is set
    if (this.options.autoApproveIfValid && validation.status === 'valid') {
      request.status = ReviewDecision.APPROVED;
      request.decision = ReviewDecision.APPROVED;
      request.decidedBy = 'auto-approval';
      request.decidedAt = new Date().toISOString();
    }

    // Save to audit trail
    await this.saveToAuditTrail(request);

    return request;
  }

  /**
   * Display the specification in readable format for review
   */
  async displaySpecForReview(): Promise<string> {
    const request = await this.requestReview();

    if (request.status === ReviewDecision.APPROVED) {
      return `✅ **Auto-Approved** - Specification is valid and meets quality standards.\n\n`;
    }

    let display = `# 🔍 Specification Review Required\n\n`;
    display += `**Review ID:** ${request.id}\n`;
    display += `**Requested by:** ${request.requester}\n`;
    display += `**Spec file:** ${request.specPath}\n\n`;
    display += `## Specification Content\n\n`;
    display += request.specContent;
    display += `\n\n## Actions Required\n\n`;
    display += `Please review the specification above and:\n`;
    display += `- ✅ **Approve** - Proceed with code generation\n`;
    display += `- ❌ **Reject** - Do not proceed, provide reason\n`;
    display += `- 💬 **Comment** - Add feedback without decision\n\n`;
    display += `## Comments\n`;

    if (request.comments.length === 0) {
      display += `\n_No comments yet._\n`;
    } else {
      for (const comment of request.comments) {
        display += `\n**${comment.author}** (${new Date(comment.timestamp).toLocaleString()}):\n${comment.content}\n`;
      }
    }

    return display;
  }

  /**
   * Approve the specification
   */
  async approve(approver: string, comment?: string): Promise<ReviewGateResult> {
    const request = await this.getLatestRequest();

    if (!request) {
      return {
        approved: false,
        request: {} as HumanReviewRequest,
        canProceed: false,
        message: 'No pending review request found'
      };
    }

    request.status = ReviewDecision.APPROVED;
    request.decision = ReviewDecision.APPROVED;
    request.decidedBy = approver;
    request.decidedAt = new Date().toISOString();

    if (comment) {
      request.comments.push({
        id: `comment-${Date.now()}`,
        author: approver,
        timestamp: new Date().toISOString(),
        content: comment,
        resolved: false
      });
    }

    await this.saveToAuditTrail(request);

    return {
      approved: true,
      request,
      canProceed: true,
      message: `Specification approved by ${approver}`
    };
  }

  /**
   * Reject the specification
   */
  async reject(rejector: string, reason: string): Promise<ReviewGateResult> {
    const request = await this.getLatestRequest();

    if (!request) {
      return {
        approved: false,
        request: {} as HumanReviewRequest,
        canProceed: false,
        message: 'No pending review request found'
      };
    }

    if (this.options.requireCommentsOnReject && !reason) {
      return {
        approved: false,
        request,
        canProceed: false,
        message: 'Rejection requires a reason/comment'
      };
    }

    request.status = ReviewDecision.REJECTED;
    request.decision = ReviewDecision.REJECTED;
    request.decidedBy = rejector;
    request.decidedAt = new Date().toISOString();
    request.comments.push({
      id: `comment-${Date.now()}`,
      author: rejector,
      timestamp: new Date().toISOString(),
      content: `REJECTED: ${reason}`,
      resolved: false
    });

    await this.saveToAuditTrail(request);

    return {
      approved: false,
      request,
      canProceed: false,
      message: `Specification rejected by ${rejector}: ${reason}`
    };
  }

  /**
   * Add a comment without making a decision
   */
  async comment(author: string, content: string): Promise<ReviewGateResult> {
    const request = await this.getLatestRequest();

    if (!request) {
      return {
        approved: false,
        request: {} as HumanReviewRequest,
        canProceed: false,
        message: 'No pending review request found'
      };
    }

    request.comments.push({
      id: `comment-${Date.now()}`,
      author,
      timestamp: new Date().toISOString(),
      content,
      resolved: false
    });

    request.status = ReviewDecision.COMMENTED;
    await this.saveToAuditTrail(request);

    return {
      approved: false,
      request,
      canProceed: false,
      message: 'Comment added successfully'
    };
  }

  /**
   * Check if there is a pending review
   */
  async hasPendingReview(): Promise<boolean> {
    const request = await this.getLatestRequest();
    return request?.status === ReviewDecision.PENDING;
  }

  /**
   * Get the audit trail
   */
  async getAuditTrail(): Promise<HumanReviewRequest[]> {
    const auditPath = join(this.options.projectPath, '.bmad', 'reviews.json');

    try {
      const content = await fs.readFile(auditPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return [];
    }
  }

  /**
   * Get the latest review request
   */
  private async getLatestRequest(): Promise<HumanReviewRequest | null> {
    const audit = await this.getAuditTrail();
    return audit[audit.length - 1] || null;
  }

  /**
   * Save request to audit trail
   */
  private async saveToAuditTrail(request: HumanReviewRequest): Promise<void> {
    const auditPath = join(this.options.projectPath, '.bmad', 'reviews.json');

    // Ensure directory exists
    await fs.mkdir(dirname(auditPath), { recursive: true });

    // Load existing
    let audit: HumanReviewRequest[] = [];
    try {
      const content = await fs.readFile(auditPath, 'utf-8');
      audit = JSON.parse(content);
    } catch {
      // Start fresh
    }

    // Add or update request
    const existingIndex = audit.findIndex(r => r.id === request.id);
    if (existingIndex >= 0) {
      audit[existingIndex] = request;
    } else {
      audit.push(request);
    }

    // Save
    await fs.writeFile(auditPath, JSON.stringify(audit, null, 2), 'utf-8');
  }

  /**
   * Generate audit report
   */
  async generateAuditReport(): Promise<string> {
    const audit = await this.getAuditTrail();

    let report = `# Human Review Audit Trail\n\n`;
    report += `Total reviews: ${audit.length}\n\n`;

    for (const review of audit.reverse()) {
      const icon = review.decision === ReviewDecision.APPROVED ? '✅' :
                   review.decision === ReviewDecision.REJECTED ? '❌' : '⏳';

      report += `## ${icon} Review ${review.id}\n`;
      report += `- **Status:** ${review.status}\n`;
      report += `- **Decision:** ${review.decision || 'Pending'}\n`;
      report += `- **Requested by:** ${review.requester}\n`;
      report += `- **Timestamp:** ${new Date(review.timestamp).toLocaleString()}\n`;

      if (review.decidedBy) {
        report += `- **Decided by:** ${review.decidedBy}\n`;
        report += `- **Decided at:** ${new Date(review.decidedAt!).toLocaleString()}\n`;
      }

      if (review.comments.length > 0) {
        report += `\n**Comments:**\n`;
        for (const comment of review.comments) {
          report += `- ${comment.author}: ${comment.content}\n`;
        }
      }

      report += '\n---\n\n';
    }

    return report;
  }
}

/**
 * Convenience function to request a human review
 */
export async function requestHumanReview(
  projectPath: string,
  options?: Partial<ReviewGateOptions>
): Promise<HumanReviewRequest> {
  const gate = new HumanReviewGate({
    projectPath,
    ...options
  });

  return gate.requestReview();
}
