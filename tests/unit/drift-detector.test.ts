/**
 * Test: Implementation Drift Detector
 */

import { ImplementationDriftDetector, DriftType, DriftSeverity } from '../../src/validation/drift-detector.js';

const detector = new ImplementationDriftDetector();

// Test 1: Plan with features, all implemented
const plan1 = `
# Project Plan

## Features
1. User authentication with JWT
2. Database connection pooling
3. API rate limiting
4. Error handling middleware
5. Logging system
`;

const diff1 = `
+++ b/src/auth.ts
+export class AuthService {
+  async login() { return { token: 'jwt' }; }
+}
+++ b/src/db.ts
+export class Pool { connect() {} }
+++ b/src/rate-limit.ts
+export function rateLimit() {}
+++ b/src/middleware/error.ts
+export function errorHandler() {}
+++ b/src/logger.ts
+export class Logger {}
`;

console.log('Test 1: All features implemented');
const report1 = detector.detectDrift(plan1, diff1);
console.log('Has drift:', report1.hasDrift);
console.log('Items:', report1.totalIssues);
console.log('');

// Test 2: Forgotten features
const plan2 = `
# Project Plan

Features:
- User authentication
- Password reset functionality
- Email verification
- Two-factor authentication
`;

const diff2 = `
+++ b/src/auth.ts
+export function login() {}
`;

console.log('Test 2: Forgotten features');
const report2 = detector.detectDrift(plan2, diff2);
console.log('Has drift:', report2.hasDrift);
console.log('Total issues:', report2.totalIssues);
console.log('Forgotten:', report2.items.filter(i => i.type === DriftType.FORGOTTEN).length);
console.log('Items:', report2.items.map(i => ({ type: i.type, feature: i.feature })));
console.log('');

// Test 3: Feature creep
const plan3 = `
# Project Plan

Only implement:
- Basic authentication
`;

const diff3 = `
+++ b/src/auth.ts
+export function login() {}
+++ b/src/admin.ts
+export function adminPanel() {}
+++ b/src/analytics.ts
+export function trackAnalytics() {}
`;

console.log('Test 3: Feature creep');
const report3 = detector.detectDrift(plan3, diff3);
console.log('Has drift:', report3.hasDrift);
console.log('Undeclared features:', report3.undeclaredFeatures);
console.log('Feature creep items:', report3.items.filter(i => i.type === DriftType.FEATURE_CREEP).length);
console.log('');

// Test 4: Partial implementation
const plan4 = `
# Project Plan

Implement full payment processing
`;

const diff4 = `
+++ b/src/payment.ts
+export function processPayment() {
+  // TODO: implement
+  throw new Error('Not implemented');
+}
`;

console.log('Test 4: Partial implementation');
const report4 = detector.detectDrift(plan4, diff4);
console.log('Has drift:', report4.hasDrift);
console.log('Partial items:', report4.items.filter(i => i.type === DriftType.PARTIAL).length);
console.log('Items:', report4.items.map(i => ({ type: i.type, description: i.description.substring(0, 50) })));
console.log('');

console.log('=== All tests completed ===');
