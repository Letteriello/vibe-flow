import * as fs from 'fs';
import * as path from 'path';

export enum ProjectState {
  NEW = 'NEW',
  IN_PROGRESS = 'IN_PROGRESS',
  REVERSE_ENGINEERING = 'REVERSE_ENGINEERING'
}

interface AnalysisResult {
  state: ProjectState;
  artifacts: {
    hasPackageJson: boolean;
    hasBMadFolder: boolean;
    hasRalphFolder: boolean;
    hasGit: boolean;
  };
  score: number;
}

const WEIGHTS = {
  packageJson: 10,
  bmadFolder: 25,
  ralphFolder: 30,
  git: 5
};

const THRESHOLDS = {
  NEW_MAX: 15,
  IN_PROGRESS_MIN: 25,
  REVERSE_ENGINEERING_MAX: 40
};

function checkArtifactExists(directoryPath: string, artifact: string): boolean {
  const fullPath = path.join(directoryPath, artifact);
  try {
    return fs.existsSync(fullPath);
  } catch {
    return false;
  }
}

function isDirectory(directoryPath: string): boolean {
  try {
    const stat = fs.statSync(directoryPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

function countSourceFiles(directoryPath: string): number {
  const sourceExtensions = ['.ts', '.js', '.jsx', '.tsx', '.py', '.java', '.go', '.rs'];
  let count = 0;

  try {
    const entries = fs.readdirSync(directoryPath, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (sourceExtensions.includes(ext)) {
          count++;
        }
      }
    }
  } catch {
    // Directory not readable
  }

  return count;
}

function hasLegacyCodeWithoutBMAD(
  hasSourceFiles: boolean,
  hasPackageJson: boolean,
  hasBMadFolder: boolean,
  hasRalphFolder: boolean
): boolean {
  return hasSourceFiles && hasPackageJson && !hasBMadFolder && !hasRalphFolder;
}

export function analyzeProjectMaturity(directoryPath: string): AnalysisResult {
  if (!isDirectory(directoryPath)) {
    return {
      state: ProjectState.NEW,
      artifacts: {
        hasPackageJson: false,
        hasBMadFolder: false,
        hasRalphFolder: false,
        hasGit: false
      },
      score: 0
    };
  }

  const hasPackageJson = checkArtifactExists(directoryPath, 'package.json');
  const hasBMadFolder = checkArtifactExists(directoryPath, '_bmad');
  const hasRalphFolder = checkArtifactExists(directoryPath, '.ralph');
  const hasGit = checkArtifactExists(directoryPath, '.git');

  const sourceFileCount = countSourceFiles(directoryPath);
  const hasSourceFiles = sourceFileCount > 0;

  let score = 0;
  if (hasPackageJson) score += WEIGHTS.packageJson;
  if (hasBMadFolder) score += WEIGHTS.bmadFolder;
  if (hasRalphFolder) score += WEIGHTS.ralphFolder;
  if (hasGit) score += WEIGHTS.git;

  const artifacts = {
    hasPackageJson,
    hasBMadFolder,
    hasRalphFolder,
    hasGit
  };

  if (hasRalphFolder) {
    return {
      state: ProjectState.IN_PROGRESS,
      artifacts,
      score
    };
  }

  if (hasLegacyCodeWithoutBMAD(hasSourceFiles, hasPackageJson, hasBMadFolder, hasRalphFolder)) {
    return {
      state: ProjectState.REVERSE_ENGINEERING,
      artifacts,
      score
    };
  }

  if (score <= THRESHOLDS.NEW_MAX) {
    return {
      state: ProjectState.NEW,
      artifacts,
      score
    };
  }

  if (score >= THRESHOLDS.IN_PROGRESS_MIN) {
    return {
      state: ProjectState.IN_PROGRESS,
      artifacts,
      score
    };
  }

  if (score > THRESHOLDS.NEW_MAX && score < THRESHOLDS.IN_PROGRESS_MIN) {
    return {
      state: ProjectState.REVERSE_ENGINEERING,
      artifacts,
      score
    };
  }

  return {
    state: ProjectState.NEW,
    artifacts,
    score
  };
}
