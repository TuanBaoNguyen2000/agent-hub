import { constants, copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readlinkSync, symlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';

// Moving a project's documents to another folder (ADR-020 item 5): copy every file, never
// overwrite one that is already there. The old folder is left to the caller.

// Finder's own files carry nothing of the documents.
const IGNORED = new Set(['.DS_Store']);

// Every file under root, relative and with "/" separators; symlinks count as files, not followed.
export function contextFiles(root: string, prefix = ''): string[] {
  let names: string[];
  try {
    names = readdirSync(join(root, prefix)).sort();
  } catch {
    return [];
  }
  return names.flatMap((name) => {
    if (IGNORED.has(name)) return [];
    const relativePath = prefix ? `${prefix}/${name}` : name;
    const stat = lstatSync(join(root, relativePath));
    return stat.isDirectory() ? contextFiles(root, relativePath) : [relativePath];
  });
}

export const conflictingFiles = (to: string, files: readonly string[]): string[] =>
  files.filter((file) => existsSync(join(to, file)) || lstatOrNull(join(to, file)) !== null);

function lstatOrNull(path: string): ReturnType<typeof lstatSync> | null {
  try {
    return lstatSync(path);
  } catch {
    return null;
  }
}

export function copyContextFiles(from: string, to: string, files: readonly string[]): void {
  for (const file of files) {
    const source = join(from, file);
    const target = join(to, file);
    mkdirSync(dirname(target), { recursive: true });
    if (lstatSync(source).isSymbolicLink()) symlinkSync(readlinkSync(source), target);
    // COPYFILE_EXCL: a file that appeared since the check is not overwritten either.
    else copyFileSync(source, target, constants.COPYFILE_EXCL);
  }
}
