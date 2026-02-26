// Quality module types - Pre-flight checks and quality reports

// Check status
export enum CheckStatus {
  READY = 'ready',
  MISSING = 'missing',
  NEEDS_REVIEW = 'needs_review',
  WARNING = 'warning'
}

// Pre-flight check item
export interface PreFlightCheck {
  id: string;
  name: string;
  description: string;
  status: CheckStatus;
  category: 'dependencies' | 'tests' | 'documentation' | 'configuration' | 'security';
  details?: string;
  recommendation?: string;
}

// Pre-flight check result
export interface PreFlightResult {
  timestamp: string;
  projectPath: string;
  checks: PreFlightCheck[];
  summary: {
    total: number;
    ready: number;
    missing: number;
    needsReview: number;
    warning: number;
  };
  overallScore: number; // 0-100
  canProceed: boolean; // true if overallScore >= 70
}

// Quality issue
export interface QualityIssue {
  id: string;
  type: 'error' | 'warning' | 'info';
  category: 'lint' | 'format' | 'code-smell' | 'complexity' | 'duplication';
  message: string;
  file: string;
  line?: number;
  column?: number;
  rule?: string;
  suggestion?: string;
}

// Quality report
export interface QualityReport {
  timestamp: string;
  projectPath: string;
  issues: QualityIssue[];
  summary: {
    errors: number;
    warnings: number;
    info: number;
    score: number; // 0-10
  };
  passed: boolean;
  recommendations: string[];
}

// AI-specific quality issue
export interface AIQualityIssue {
  id: string;
  type: 'duplication' | 'naming' | 'comment' | 'structure';
  severity: 'high' | 'medium' | 'low';
  message: string;
  file: string;
  line?: number;
  code?: string;
  suggestion: string;
}

// Quality check options
export interface QualityCheckOptions {
  projectPath: string;
  runLinter?: boolean;
  runFormatter?: boolean;
  detectAIPatterns?: boolean;
  threshold?: number;
}
