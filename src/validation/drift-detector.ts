/**
 * Implementation Drift Detector
 *
 * Detects when implementation diverges from the original plan:
 * - Forgotten features (promised but not implemented)
 * - Partial implementation (incomplete features)
 * - Feature Creep (unrequested additions)
 */

/**
 * Types of drift detected
 */
export enum DriftType {
  FORGOTTEN = 'forgotten',           // Feature promised in plan but not implemented
  PARTIAL = 'partial',               // Feature partially implemented
  FEATURE_CREEP = 'feature_creep',   // Unrequested feature added
  MODIFIED = 'modified',             // Feature changed from plan
}

/**
 * Severity of the drift issue
 */
export enum DriftSeverity {
  CRITICAL = 'critical',
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
}

/**
 * Individual drift item detected
 */
export interface DriftItem {
  type: DriftType;
  severity: DriftSeverity;
  feature: string;
  description: string;
  location?: string;        // File or line reference
  evidence?: string;        // Supporting evidence from diff
  planReference?: string;   // Where in the plan this was promised
}

/**
 * Complete drift report
 */
export interface DriftReport {
  hasDrift: boolean;
  totalIssues: number;
  criticalCount: number;
  highCount: number;
  summary: string;
  items: DriftItem[];
  planFeatures: string[];      // Features extracted from plan
  implementedFeatures: string[]; // Features found in diff
  undeclaredFeatures: string[];  // Features in diff not in plan
  timestamp: string;
}

/**
 * Options for drift detection
 */
export interface DriftDetectorOptions {
  strictMode?: boolean;           // Treat missing documentation as critical
  ignorePatterns?: string[];      // Regex patterns to ignore
  minConfidence?: number;         // Minimum confidence threshold (0-1)
  detectPartialByKeywords?: boolean; // Use keyword analysis for partial detection
}

/**
 * Implementation Drift Detector
 *
 * Compares plan claims with implementation diff to detect:
 * 1. Features promised but not implemented (FORGOTTEN)
 * 2. Features partially implemented (PARTIAL)
 * 3. Unrequested features added (FEATURE_CREEP)
 */
export class ImplementationDriftDetector {
  private options: Required<DriftDetectorOptions>;

  // Common feature indicators in code
  private readonly FEATURE_INDICATORS = [
    'function', 'class', 'interface', 'type', 'const', 'let', 'var',
    'export', 'import', 'async', 'await', 'return', 'yield',
    'if', 'else', 'switch', 'case', 'for', 'while', 'try', 'catch',
    'def ', 'fn ', 'pub ', 'struct ', 'impl ', 'mod ', 'use ',
  ];

  // Keywords that indicate a feature was promised
  private readonly PROMISE_KEYWORDS = [
    'will', 'should', 'must', 'need', 'require', 'implement',
    'support', 'provide', 'handle', 'allow', 'enable', 'create',
    'add', 'build', 'make', 'develop', 'feature', 'functionality',
  ];

  // Patterns for incomplete/partial implementation
  private readonly PARTIAL_PATTERNS = [
    /\/\/ TODO/i,
    /\/\* TODO/i,
    /\/\/ FIXME/i,
    /\/\* FIXME/i,
    /\/\/ NOT_IMPLEMENTED/i,
    /\/\/ WIP/i,
    /throw new Error\(['"]Not implemented/i,
    /throw new Error\(['"]TODO/i,
    /pass;?\s*$/m,                    // Python pass at end of function
    /^\s*$/m,                          // Empty function body
    /\{\s*\}$/m,                       // Empty braces
  ];

  // Keywords indicating feature creep (unrequested additions)
  private readonly CREEP_INDICATORS = [
    'unnecessary', 'extra', 'bonus', 'additional feature',
    'not requested', 'not specified', 'extra functionality',
  ];

  constructor(options: DriftDetectorOptions = {}) {
    this.options = {
      strictMode: options.strictMode ?? false,
      ignorePatterns: options.ignorePatterns ?? [],
      minConfidence: options.minConfidence ?? 0.5,
      detectPartialByKeywords: options.detectPartialByKeywords ?? true,
    };
  }

  /**
   * Main method: Detect drift between plan and implementation
   */
  detectDrift(planContent: string, implementationDiff: string): DriftReport {
    // Extract features from plan
    const planFeatures = this.extractPlanFeatures(planContent);

    // Extract implemented features from diff
    const implementedFeatures = this.extractImplementedFeatures(implementationDiff);

    // Find undeclared features (in diff but not in plan)
    const undeclaredFeatures = this.findUndeclaredFeatures(
      planFeatures,
      implementedFeatures
    );

    // Detect different types of drift
    const items: DriftItem[] = [];

    // 1. Detect forgotten features
    const forgotten = this.detectForgottenFeatures(
      planFeatures,
      implementedFeatures
    );
    items.push(...forgotten);

    // 2. Detect partial implementations
    const partial = this.detectPartialFeatures(implementationDiff, planFeatures);
    items.push(...partial);

    // 3. Detect feature creep
    const creep = this.detectFeatureCreep(planFeatures, undeclaredFeatures);
    items.push(...creep);

    // Calculate severity counts
    const criticalCount = items.filter(i => i.severity === DriftSeverity.CRITICAL).length;
    const highCount = items.filter(i => i.severity === DriftSeverity.HIGH).length;

    // Generate summary
    const summary = this.generateSummary(items, planFeatures.length, implementedFeatures.length);

    return {
      hasDrift: items.length > 0,
      totalIssues: items.length,
      criticalCount,
      highCount,
      summary,
      items,
      planFeatures,
      implementedFeatures,
      undeclaredFeatures,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Extract features promised in the plan
   */
  private extractPlanFeatures(planContent: string): string[] {
    const features: string[] = [];
    const lines = planContent.split('\n');

    // Common patterns in plans
    const featurePatterns = [
      /[-*•]\s*([A-Z][^\.]+)/,                    // Bullet points with capital letters
      /\d+\.\s*([A-Z][^\.]+)/,                    // Numbered lists
      /(?:feature|function|capability):\s*([^\n]+)/i, // Explicit feature markers
      /(?:implement|add|create|build)\s+([^\n]+)/i,  // Action verbs
      /will\s+(?:support|implement|have|provide)\s+([^\n]+)/i,
      /should\s+(?:support|implement|have|provide)\s+([^\n]+)/i,
      /must\s+(?:support|implement|have|provide)\s+([^\n]+)/i,
      /need[s]?\s+(?:to\s+)?([^\n]+)/i,
      /(?:task|requirement)[s]?:\s*([^\n]+)/i,
      /##\s+([^\n]+)/,                             // Markdown headers
      /^###\s+([^\n]+)/,                           // Markdown subheaders
    ];

    for (const line of lines) {
      for (const pattern of featurePatterns) {
        const match = line.match(pattern);
        if (match && match[1]) {
          const feature = match[1].trim();
          if (this.isValidFeature(feature) && !features.includes(feature)) {
            features.push(feature);
          }
        }
      }
    }

    // Also extract features from code blocks in plan
    const codeBlockFeatures = this.extractFeaturesFromCodeBlocks(planContent);
    features.push(...codeBlockFeatures);

    // Deduplicate
    return [...new Set(features)];
  }

  /**
   * Check if extracted text is a valid feature
   */
  private isValidFeature(text: string): boolean {
    if (!text || text.length < 3) return false;
    if (text.length > 200) return false;

    // Skip lines that are clearly not features
    const skipPatterns = [
      /^the\s+/i,
      /^a\s+/i,
      /^an\s+/i,
      /^this\s+/i,
      /^that\s+/i,
      /^it\s+/i,
      /^we\s+/i,
      /^i\s+/i,
      /^(?:yes|no|ok|okay)$/i,
    ];

    for (const pattern of skipPatterns) {
      if (pattern.test(text)) return false;
    }

    return true;
  }

  /**
   * Extract features from code examples in plan
   */
  private extractFeaturesFromCodeBlocks(planContent: string): string[] {
    const features: string[] = [];
    const codeBlockRegex = /```[\s\S]*?```/g;
    const matches = planContent.match(codeBlockRegex) || [];

    for (const block of matches) {
      // Extract function/class names
      const funcMatch = block.match(/(?:function|class|interface|type|const|let|var)\s+(\w+)/g);
      if (funcMatch) {
        for (const match of funcMatch) {
          const name = match.replace(/^(function|class|interface|type|const|let|var)\s+/, '');
          features.push(name);
        }
      }
    }

    return features;
  }

  /**
   * Extract features implemented in the diff
   */
  private extractImplementedFeatures(diffContent: string): string[] {
    const features = new Set<string>();

    // Extract from file names (new files often indicate features)
    const filePattern = /\+\+\+ b\/(.+)/g;
    let match;
    while ((match = filePattern.exec(diffContent)) !== null) {
      const filepath = match[1];
      // Extract meaningful names from path
      const nameParts = filepath.replace(/\.[^/.]+$/, '').split(/[/\\]/);
      for (const part of nameParts) {
        if (this.isFeatureName(part)) {
          features.add(part);
        }
      }
    }

    // Extract from added code
    const addedLines = diffContent.split('\n').filter(line => line.startsWith('+') && !line.startsWith('+++'));
    for (const line of addedLines) {
      const cleaned = line.substring(1).trim();

      // Look for function/class declarations
      const declPatterns = [
        /(?:export\s+)?(?:async\s+)?function\s+(\w+)/,
        /(?:export\s+)?(?:default\s+)?class\s+(\w+)/,
        /(?:export\s+)?interface\s+(\w+)/,
        /(?:export\s+)?type\s+(\w+)/,
        /(?:export\s+)?const\s+(\w+)\s*=/,
        /(?:export\s+)?let\s+(\w+)\s*=/,
        /(?:export\s+)?var\s+(\w+)\s*=/,
        /#define\s+(\w+)/,
        /def\s+(\w+)/,
        /fn\s+(\w+)/,
        /pub\s+fn\s+(\w+)/,
      ];

      for (const pattern of declPatterns) {
        const declMatch = cleaned.match(pattern);
        if (declMatch && declMatch[1]) {
          features.add(declMatch[1]);
        }
      }
    }

    return Array.from(features);
  }

  /**
   * Check if name looks like a feature name
   */
  private isFeatureName(name: string): boolean {
    if (!name || name.length < 2) return false;
    if (name === 'src' || name === 'lib' || name === 'dist' || name === 'test') return false;
    if (/^index\./.test(name)) return false;
    if (/^\d+$/.test(name)) return false;
    return /^[a-zA-Z]/.test(name);
  }

  /**
   * Find features in diff that weren't in the plan
   */
  private findUndeclaredFeatures(
    planFeatures: string[],
    implementedFeatures: string[]
  ): string[] {
    return implementedFeatures.filter(f => {
      // Check if any plan feature is similar or contains this feature
      const lowerF = f.toLowerCase();
      return !planFeatures.some(pf =>
        pf.toLowerCase().includes(lowerF) ||
        lowerF.includes(pf.toLowerCase()) ||
        this.levenshteinSimilarity(pf.toLowerCase(), lowerF) > 0.8
      );
    });
  }

  /**
   * Simple Levenshtein similarity check
   */
  private levenshteinSimilarity(a: string, b: string): number {
    if (a.length === 0 || b.length === 0) return 0;
    if (a === b) return 1;

    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    const distance = matrix[b.length][a.length];
    const maxLen = Math.max(a.length, b.length);
    return 1 - distance / maxLen;
  }

  /**
   * Detect features promised but not implemented
   */
  private detectForgottenFeatures(
    planFeatures: string[],
    implementedFeatures: string[]
  ): DriftItem[] {
    const items: DriftItem[] = [];

    const implementedLower = implementedFeatures.map(f => f.toLowerCase());

    for (const feature of planFeatures) {
      const featureLower = feature.toLowerCase();

      // Check if feature is mentioned in implementation
      const isImplemented = implementedLower.some(impl =>
        impl.includes(featureLower) ||
        featureLower.includes(impl) ||
        this.levenshteinSimilarity(featureLower, impl) > 0.7
      );

      if (!isImplemented) {
        // Determine severity based on keyword importance
        const severity = this.determineFeatureSeverity(feature);

        items.push({
          type: DriftType.FORGOTTEN,
          severity,
          feature: feature.substring(0, 100),
          description: `Feature promised in plan but not found in implementation: "${feature.substring(0, 100)}"`,
          planReference: this.findPlanReference(feature),
        });
      }
    }

    return items;
  }

  /**
   * Determine severity based on feature importance keywords
   */
  private determineFeatureSeverity(feature: string): DriftSeverity {
    const criticalKeywords = ['must', 'critical', 'required', 'security', 'auth', 'validate', 'error handling'];
    const highKeywords = ['should', 'important', 'main', 'core', 'primary', 'key'];

    const lowerFeature = feature.toLowerCase();

    for (const kw of criticalKeywords) {
      if (lowerFeature.includes(kw)) return DriftSeverity.CRITICAL;
    }
    for (const kw of highKeywords) {
      if (lowerFeature.includes(kw)) return DriftSeverity.HIGH;
    }

    return DriftSeverity.MEDIUM;
  }

  /**
   * Find where in plan this feature was referenced
   */
  private findPlanReference(feature: string): string {
    return `Feature: "${feature.substring(0, 50)}..."`;
  }

  /**
   * Detect partial implementations
   */
  private detectPartialFeatures(
    diffContent: string,
    planFeatures: string[]
  ): DriftItem[] {
    const items: DriftItem[] = [];

    // Check for TODO/FIXME patterns
    for (const pattern of this.PARTIAL_PATTERNS) {
      const matches = diffContent.match(pattern);
      if (matches) {
        items.push({
          type: DriftType.PARTIAL,
          severity: DriftSeverity.HIGH,
          feature: 'Incomplete Implementation',
          description: `Found incomplete implementation marker: "${matches[0].substring(0, 50)}"`,
          evidence: matches[0].substring(0, 100),
        });
      }
    }

    // Check for empty function bodies
    const emptyBodyPattern = /(\w+)\s*\([^)]*\)\s*\{\s*\}/g;
    let match;
    while ((match = emptyBodyPattern.exec(diffContent)) !== null) {
      const funcName = match[1];
      // Only report if this function was in the plan
      const relatedPlanFeature = planFeatures.find(f =>
        f.toLowerCase().includes(funcName.toLowerCase())
      );

      if (relatedPlanFeature) {
        items.push({
          type: DriftType.PARTIAL,
          severity: DriftSeverity.MEDIUM,
          feature: funcName,
          description: `Function "${funcName}" appears to have empty implementation but was promised in plan`,
          evidence: match[0],
        });
      }
    }

    // Check for throw statements indicating stubs
    const stubPattern = /throw\s+new\s+Error\(['"](?:Not implemented|TODO|stub)['"]\)/gi;
    const stubMatches = diffContent.match(stubPattern);
    if (stubMatches) {
      items.push({
        type: DriftType.PARTIAL,
        severity: DriftSeverity.MEDIUM,
        feature: 'Stub Implementation',
        description: `Found ${stubMatches.length} stub implementation(s) (throw Error with TODO/Not implemented)`,
        evidence: stubMatches[0].substring(0, 100),
      });
    }

    return items;
  }

  /**
   * Detect feature creep (unrequested additions)
   */
  private detectFeatureCreep(
    planFeatures: string[],
    undeclaredFeatures: string[]
  ): DriftItem[] {
    const items: DriftItem[] = [];

    // Features completely unrelated to plan
    for (const feature of undeclaredFeatures) {
      // Skip common boilerplate
      if (this.isBoilerplate(feature)) continue;

      items.push({
        type: DriftType.FEATURE_CREEP,
        severity: DriftSeverity.LOW,
        feature,
        description: `Feature "${feature}" implemented but not found in original plan`,
      });
    }

    // Check for suspicious patterns in diff (comments about extra features)
    const creepPatterns = [
      { regex: /\/\/\s*(?:bonus|extra|additional)\s+feature/i, message: 'Comment mentions bonus/extra feature' },
      { regex: /\/\*\s*(?:bonus|extra|additional)\s+feature/i, message: 'Block comment mentions bonus/extra feature' },
    ];

    return items;
  }

  /**
   * Check if feature is boilerplate code
   */
  private isBoilerplate(name: string): boolean {
    const boilerplate = [
      'index', 'main', 'app', 'server', 'client', 'config', 'utils', 'helpers',
      'types', 'constants', 'models', 'services', 'controllers', 'routes',
      'middleware', 'index', 'root', 'entry', 'bootstrap', 'init', 'setup',
    ];
    return boilerplate.includes(name.toLowerCase());
  }

  /**
   * Generate human-readable summary
   */
  private generateSummary(
    items: DriftItem[],
    planCount: number,
    implCount: number
  ): string {
    if (items.length === 0) {
      return 'No drift detected. Implementation matches plan.';
    }

    const forgotten = items.filter(i => i.type === DriftType.FORGOTTEN).length;
    const partial = items.filter(i => i.type === DriftType.PARTIAL).length;
    const creep = items.filter(i => i.type === DriftType.FEATURE_CREEP).length;

    const parts: string[] = [];

    if (forgotten > 0) {
      parts.push(`${forgotten} forgotten feature(s)`);
    }
    if (partial > 0) {
      parts.push(`${partial} partial implementation(s)`);
    }
    if (creep > 0) {
      parts.push(`${creep} unrequested addition(s)`);
    }

    const severity = items.some(i => i.severity === DriftSeverity.CRITICAL)
      ? 'CRITICAL'
      : items.some(i => i.severity === DriftSeverity.HIGH)
        ? 'HIGH'
        : 'Moderate';

    return `[${severity}] Drift detected: ${parts.join(', ')}. Plan had ${planCount} features, implementation shows ${implCount}.`;
  }
}

/**
 * Convenience function for quick drift detection
 */
export function detectDrift(
  planContent: string,
  implementationDiff: string,
  options?: DriftDetectorOptions
): DriftReport {
  const detector = new ImplementationDriftDetector(options);
  return detector.detectDrift(planContent, implementationDiff);
}
