import { parsePatch } from 'diff';

export interface DiffHunk {
  newStart: number;
  newCount: number;
}

export interface DiffFile {
  /** Path in the old version, null for new files */
  oldPath: string | null;
  /** Path in the new version, null for deleted files */
  newPath: string | null;
  hunks: DiffHunk[];
  /** 1-based line numbers of added lines in the new file */
  addedLines: number[];
  /** 1-based line numbers in the new file where deletions occurred */
  deletedLines: number[];
}

function stripPrefix(path: string | undefined): string | null {
  if (!path || path === '/dev/null') return null;
  return path.replace(/^[ab]\//, '');
}

/**
 * Parse unified diff output (e.g. from `git diff`) into structured file and line data.
 */
export function parseDiff(diff: string): DiffFile[] {
  const patches = parsePatch(diff);

  return patches.map((patch) => {
    const addedLines: number[] = [];
    const deletedLines: number[] = [];
    const hunks: DiffHunk[] = [];

    for (const hunk of patch.hunks) {
      hunks.push({ newStart: hunk.newStart, newCount: hunk.newLines });

      let newLine = hunk.newStart;
      for (const line of hunk.lines) {
        if (line.startsWith('+')) {
          addedLines.push(newLine);
          newLine++;
        } else if (line.startsWith('-')) {
          deletedLines.push(newLine);
        } else {
          newLine++;
        }
      }
    }

    return {
      oldPath: stripPrefix(patch.oldFileName),
      newPath: stripPrefix(patch.newFileName),
      hunks,
      addedLines,
      deletedLines,
    };
  });
}
