import { existsSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import type { DetectedContext } from '@agenthub/application';
import { workstreamFolders } from './context-overview';

// ADR-020 item 4: documents a project already keeps in its folder. A set in the layout of TDD §7.2
// becomes the project's context folder; other notes are listed for context-init to link.

const MAX_DEPTH = 3;
// A Unity project has thousands of folders under Assets/; the scan stops rather than slow down.
export const MAX_SCANNED_FOLDERS = 4000;
const SKIPPED = new Set(['node_modules', 'library', 'temp', 'obj', 'logs']);
const skipped = (name: string): boolean => name.startsWith('.') || SKIPPED.has(name.toLowerCase()) || /^build/i.test(name);

const DOCS_FOLDER = /^docs?$/i;
const SUGGESTIVE = /continuity|status|handoff|context/i;
const ROOT_INSTRUCTIONS = ['AGENTS.md', 'CLAUDE.md'];

function entries(path: string): { folders: string[]; files: string[] } {
  try {
    const all = readdirSync(path, { withFileTypes: true });
    return {
      folders: all.filter((entry) => entry.isDirectory() && !skipped(entry.name)).map((entry) => entry.name).sort(),
      files: all.filter((entry) => entry.isFile()).map((entry) => entry.name).sort(),
    };
  } catch {
    return { folders: [], files: [] };
  }
}

// Same layout as AgentHub's documents: PROJECT_CONTEXT.md, or README.md beside workstreams.
export function isContextFolder(path: string): boolean {
  if (existsSync(join(path, 'PROJECT_CONTEXT.md'))) return true;
  return existsSync(join(path, 'README.md')) && workstreamFolders(path).some((slug) => existsSync(join(path, slug, 'STATUS.md')) || existsSync(join(path, slug, 'Tasks')));
}

const posix = (path: string): string => path.split(sep).join('/');

export function detectContext(projectPath: string, maxFolders = MAX_SCANNED_FOLDERS): DetectedContext {
  const found: string[] = [];
  const others: string[] = [];
  let scanned = 0;
  let complete = true;
  // Breadth first, so the folders nearest the root are the ones seen before the limit.
  const queue: { path: string; depth: number; inDocs: boolean }[] = [{ path: projectPath, depth: 0, inDocs: false }];
  while (queue.length > 0) {
    const current = queue.shift() as (typeof queue)[number];
    if (scanned >= maxFolders) {
      complete = false;
      break;
    }
    scanned += 1;
    if (current.depth > 0 && isContextFolder(current.path)) {
      found.push(current.path);
      continue;
    }
    const { folders, files } = entries(current.path);
    if (current.depth === 0) others.push(...ROOT_INSTRUCTIONS.filter((name) => files.includes(name)));
    if (current.inDocs) {
      others.push(...files.filter((name) => /\.md$/i.test(name) && SUGGESTIVE.test(name)).map((name) => posix(relative(projectPath, join(current.path, name)))));
    }
    // Docs/ is read one level deeper than the rest, since notes nest there.
    const limit = current.inDocs ? MAX_DEPTH + 1 : MAX_DEPTH;
    if (current.depth >= limit) continue;
    for (const name of folders) {
      queue.push({ path: join(current.path, name), depth: current.depth + 1, inDocs: current.inDocs || (current.depth === 0 && DOCS_FOLDER.test(name)) });
    }
  }
  // Notes inside a set that is used as the documents are part of it, not separate notes.
  const outside = others.filter((path) => !found.some((folder) => join(projectPath, path).startsWith(`${folder}${sep}`)));
  return { found, others: outside, complete };
}
