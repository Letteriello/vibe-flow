// Unit tests for Implementation Drift Detector

import { describe, it, expect } from '@jest/globals';
import { ImplementationDriftDetector, DriftType } from '../../src/validation/drift-detector.js';

describe('ImplementationDriftDetector', () => {
  const detector = new ImplementationDriftDetector();

  describe('detectDrift', () => {
    it('should return a drift report', () => {
      const plan = '# Project Plan\n\n## Features\n1. Auth';
      const diff = '+++ b/src/auth.ts\nexport function login() {}';

      const report = detector.detectDrift(plan, diff);
      expect(report).toBeDefined();
      expect(report.hasDrift).toBeDefined();
      expect(report.totalIssues).toBeDefined();
      expect(report.items).toBeDefined();
      expect(Array.isArray(report.items)).toBe(true);
    });

    it('should detect when plan has features but diff is empty', () => {
      const plan = `
# Project Plan

Features:
- User authentication
- Password reset functionality
`;

      const diff = '';

      const report = detector.detectDrift(plan, diff);
      expect(report.hasDrift).toBe(true);
      const forgottenItems = report.items.filter(i => i.type === DriftType.FORGOTTEN);
      expect(forgottenItems.length).toBeGreaterThan(0);
    });

    it('should detect undeclared features in diff', () => {
      const plan = `
# Project Plan

Only implement:
- Basic authentication
`;

      const diff = `
+++ b/src/auth.ts
+export function login() {}
+++ b/src/admin.ts
+export function adminPanel() {}
+++ b/src/analytics.ts
+export function trackAnalytics() {}
`;

      const report = detector.detectDrift(plan, diff);
      expect(report.hasDrift).toBe(true);
      expect(report.undeclaredFeatures.length).toBeGreaterThan(0);
    });

    it('should detect partial implementation with TODO', () => {
      const plan = `
# Project Plan

Implement full payment processing
`;

      const diff = `
+++ b/src/payment.ts
+export function processPayment() {
+  // TODO: implement
+  throw new Error('Not implemented');
+}
`;

      const report = detector.detectDrift(plan, diff);
      expect(report.hasDrift).toBe(true);
      const partialItems = report.items.filter(i => i.type === DriftType.PARTIAL);
      expect(partialItems.length).toBeGreaterThan(0);
    });

    it('should return valid report structure', () => {
      const plan = '# Project Plan';
      const diff = '';

      const report = detector.detectDrift(plan, diff);

      expect(report).toHaveProperty('hasDrift');
      expect(report).toHaveProperty('totalIssues');
      expect(report).toHaveProperty('items');
      expect(report).toHaveProperty('undeclaredFeatures');
      expect(report).toHaveProperty('summary');
    });
  });
});
