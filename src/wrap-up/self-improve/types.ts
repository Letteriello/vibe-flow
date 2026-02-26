// Types for self-improve module
export interface DraftReport {
  title: string;
  markdownDraft: string;
}

export interface ResolvedBug {
  title: string;
  description: string;
  solution: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
}
