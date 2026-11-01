import { statSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import type { PathInspector, PathStatus } from '@agenthub/application';

export function createPathInspector(): PathInspector {
  return {
    inspect(path: string): PathStatus {
      if (!isAbsolute(path)) return 'not_absolute';
      try {
        return statSync(path).isDirectory() ? 'directory' : 'not_directory';
      } catch {
        return 'missing';
      }
    },
  };
}
