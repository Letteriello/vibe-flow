// Human Review Gate
// Story 8.3: Human Review Gate

import { v4 as uuidv4 } from 'uuid';
import { ReviewDecision } from './types.js';

// In-memory store for review decisions (in production, this would be persisted)
const reviewStore: Map<string, ReviewDecision> = new Map();

export class HumanReviewGate {
  /**
   * Request review for a specification
   */
  static requestReview(specId: string): { reviewId: string; status: 'pending' } {
    const reviewId = uuidv4();

    const decision: ReviewDecision = {
      id: reviewId,
      specId,
      decision: 'needs_changes', // Default to needs_changes until reviewed
      reviewer: '',
      timestamp: new Date().toISOString()
    };

    reviewStore.set(reviewId, decision);

    return { reviewId, status: 'pending' };
  }

  /**
   * Approve a specification
   */
  static approve(specId: string, reviewer: string, comments?: string): ReviewDecision {
    const review = this.findReviewBySpecId(specId);

    if (!review) {
      throw new Error(`No review found for spec ${specId}`);
    }

    const updatedDecision: ReviewDecision = {
      ...review,
      decision: 'approved',
      reviewer,
      comments,
      timestamp: new Date().toISOString()
    };

    reviewStore.set(review.id, updatedDecision);

    return updatedDecision;
  }

  /**
   * Reject a specification
   */
  static reject(specId: string, reviewer: string, comments: string): ReviewDecision {
    const review = this.findReviewBySpecId(specId);

    if (!review) {
      throw new Error(`No review found for spec ${specId}`);
    }

    const updatedDecision: ReviewDecision = {
      ...review,
      decision: 'rejected',
      reviewer,
      comments,
      timestamp: new Date().toISOString()
    };

    reviewStore.set(review.id, updatedDecision);

    return updatedDecision;
  }

  /**
   * Request changes to a specification
   */
  static requestChanges(specId: string, reviewer: string, comments: string): ReviewDecision {
    const review = this.findReviewBySpecId(specId);

    if (!review) {
      throw new Error(`No review found for spec ${specId}`);
    }

    const updatedDecision: ReviewDecision = {
      ...review,
      decision: 'needs_changes',
      reviewer,
      comments,
      timestamp: new Date().toISOString()
    };

    reviewStore.set(review.id, updatedDecision);

    return updatedDecision;
  }

  /**
   * Get review status for a specification
   */
  static getStatus(specId: string): { status: ReviewDecision['decision']; review?: ReviewDecision } {
    const review = this.findReviewBySpecId(specId);

    if (!review) {
      return { status: 'needs_changes' }; // Default to needs_changes if no review
    }

    return { status: review.decision, review };
  }

  /**
   * Check if specification is approved
   */
  static isApproved(specId: string): boolean {
    const { status } = this.getStatus(specId);
    return status === 'approved';
  }

  /**
   * Check if code generation can proceed
   */
  static canProceed(specId: string): boolean {
    return this.isApproved(specId);
  }

  /**
   * Get all reviews
   */
  static getAllReviews(): ReviewDecision[] {
    return Array.from(reviewStore.values());
  }

  /**
   * Clear review store (for testing)
   */
  static clearStore(): void {
    reviewStore.clear();
  }

  /**
   * Find review by spec ID
   */
  private static findReviewBySpecId(specId: string): ReviewDecision | undefined {
    for (const review of reviewStore.values()) {
      if (review.specId === specId) {
        return review;
      }
    }
    return undefined;
  }
}
