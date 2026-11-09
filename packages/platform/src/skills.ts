import { createHash } from 'node:crypto';
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, renameSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import type { SkillFile, SkillInstaller, SkillManifest, SkillPresence, SkillSourceState } from '@agenthub/application';
import { DomainError, type MessageKey, type Params } from '@agenthub/domain';

// Agent Skills: lowercase letters, digits and single hyphens, at most 64 characters.
const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_NAME = 64;
const MAX_DESCRIPTION = 1024;

const unquote = (value: string): string => {
  const trimmed = value.trim();
  if (trimmed.length >= 2 && ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'")))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
};

// The top-level keys of a SKILL.md frontmatter. Enough YAML for `key: value`, quoted values and
// `>` or `|` blocks, which is what skills use for name and description.
export function skillFrontmatter(text: string): Record<string, string> | null {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  if (lines[0]?.trim() !== '---') return null;
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === '---');
  if (end < 0) return null;
  const fields: Record<string, string> = {};
  let index = 1;
  while (index < end) {
    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(lines[index] as string);
    index += 1;
    if (!match) continue;
    const [, key, raw] = match as unknown as [string, string, string];
    if (/^[>|][+-]?$/.test(raw.trim())) {
      const block: string[] = [];
      while (index < end && (/^\s/.test(lines[index] as string) || (lines[index] as string).trim() === '')) {
        block.push((lines[index] as string).trim());
        index += 1;
      }
      fields[key] = (raw.trim().startsWith('>') ? block.join(' ') : block.join('\n')).trim();
    } else {
      fields[key] = unquote(raw);
    }
  }
  return fields;
}

const invalid = (key: MessageKey, params?: Params): DomainError => new DomainError('SKILL_INVALID', key, params);

// A folder the user offers as a skill, checked against the Agent Skills format.
export function readSkillManifest(folder: string): SkillManifest {
  let text: string;
  try {
    if (!statSync(folder).isDirectory()) throw invalid('skill.notAFolder');
    text = readFileSync(join(folder, 'SKILL.md'), 'utf8');
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw invalid('skill.noSkillFile');
  }
  const fields = skillFrontmatter(text);
  if (!fields) throw invalid('skill.noFrontmatter');
  const name = fields['name'] ?? '';
  const description = fields['description'] ?? '';
  if (name === '') throw invalid('skill.noName');
  if (name.length > MAX_NAME || !SKILL_NAME.test(name)) {
    throw invalid('skill.badName', { name, max: MAX_NAME });
  }
  const folderName = resolve(folder).split('/').pop() ?? '';
  if (folderName !== name) throw invalid('skill.nameNotFolder', { name, folder: folderName });
  if (description === '') throw invalid('skill.noDescription');
  if (description.length > MAX_DESCRIPTION) throw invalid('skill.descriptionTooLong', { max: MAX_DESCRIPTION });
  return { name, description };
}

// Files of a skill folder, relative and sorted; hidden files (.DS_Store and the like) are not part
// of a skill.
function skillFiles(folder: string): string[] {
  const found: string[] = [];
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile()) found.push(relative(folder, path).split(sep).join('/'));
    }
  };
  if (existsSync(folder)) walk(folder);
  return found.sort();
}

// What a skill is, for telling versions apart: every file's path and bytes.
export function skillHash(folder: string): string | null {
  const files = skillFiles(folder);
  if (files.length === 0) return null;
  const hash = createHash('sha256');
  for (const file of files) {
    hash.update(`${file}\0`);
    hash.update(readFileSync(join(folder, file)));
    hash.update('\0');
  }
  return hash.digest('hex');
}

// Text files shown in the app; anything large or binary is listed without its text.
const MAX_SHOWN_BYTES = 256 * 1024;
function readSkillFolder(folder: string): SkillFile[] {
  return skillFiles(folder).map((path) => {
    const bytes = readFileSync(join(folder, path));
    const text = bytes.length <= MAX_SHOWN_BYTES && !bytes.includes(0) ? bytes.toString('utf8') : null;
    return { path, text };
  });
}

// The folder in source that every shipped skill gets a copy of (ADR-026 item 1); it is not a skill.
export const SHARED_SKILL_FILES = '_shared';

interface Versions {
  // The hash of AgentHub's copy, and whether it changed since the user last looked at it.
  [name: string]: { hash: string; updated: boolean };
}

// The skills that ship with the app sit in source. AgentHub keeps one copy of every skill of its
// own (shared) and links each account's skill folder to it, so an update reaches every account at
// once (SPIKE-14). The user's own skills are copied into shared when added (ADR-020 item 1). Each
// shipped skill gets the files of source/_shared on top, so the rules all skills follow are
// written once (ADR-026 item 1). When an app update changes a shipped skill, the copy it replaces
// is kept in shared/.previous until the user has seen the change (ADR-026 item 7).
export function createSkillInstaller({ source, shared }: { source: string; shared: string }): SkillInstaller {
  const builtin = existsSync(source)
    ? readdirSync(source, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_') && existsSync(join(source, entry.name, 'SKILL.md')))
        .map((entry) => entry.name)
        .sort()
    : [];
  const common = join(source, SHARED_SKILL_FILES);
  const versionsFile = join(shared, '.versions.json');
  const previous = join(shared, '.previous');

  function readVersions(): Versions {
    try {
      const data: unknown = JSON.parse(readFileSync(versionsFile, 'utf8'));
      return typeof data === 'object' && data !== null && !Array.isArray(data) ? (data as Versions) : {};
    } catch {
      return {};
    }
  }

  function writeVersions(versions: Versions): void {
    mkdirSync(shared, { recursive: true, mode: 0o700 });
    const staging = `${versionsFile}.new`;
    writeFileSync(staging, `${JSON.stringify(versions, null, 2)}\n`, { mode: 0o600 });
    renameSync(staging, versionsFile);
  }

  function presence(directory: string, name: string): SkillPresence {
    const path = join(directory, name);
    let isLink: boolean;
    try {
      isLink = lstatSync(path).isSymbolicLink();
    } catch {
      return 'missing';
    }
    // Anything else under our name belongs to the user and is never replaced or removed.
    return isLink && resolve(directory, readlinkSync(path)) === join(shared, name) ? 'installed' : 'foreign';
  }

  // Replaced whole, through a temporary folder, so a link never points at a half-copied skill.
  function copyInto(from: string, name: string, options: { withCommon: boolean; keepPrevious: boolean }): void {
    mkdirSync(shared, { recursive: true, mode: 0o700 });
    const target = join(shared, name);
    const staging = join(shared, `.${name}.new`);
    rmSync(staging, { recursive: true, force: true });
    cpSync(from, staging, { recursive: true, filter: (path) => !path.slice(from.length).split(sep).some((part) => part.startsWith('.')) });
    if (options.withCommon && existsSync(common)) cpSync(common, staging, { recursive: true, filter: (path) => !path.slice(common.length).split(sep).some((part) => part.startsWith('.')) });
    const versions = readVersions();
    const before = existsSync(target) ? skillHash(target) : null;
    const after = skillHash(staging);
    if (before !== null && before === after) {
      rmSync(staging, { recursive: true, force: true });
      if (after !== null && versions[name]?.hash !== after) writeVersions({ ...versions, [name]: { hash: after, updated: versions[name]?.updated ?? false } });
      return;
    }
    if (before !== null && options.keepPrevious) {
      // Keep the copy the user last saw, not every copy in between.
      const kept = join(previous, name);
      if (!(versions[name]?.updated && existsSync(kept))) {
        mkdirSync(previous, { recursive: true, mode: 0o700 });
        rmSync(kept, { recursive: true, force: true });
        renameSync(target, kept);
      }
    }
    rmSync(target, { recursive: true, force: true });
    renameSync(staging, target);
    if (after !== null) writeVersions({ ...versions, [name]: { hash: after, updated: before !== null && options.keepPrevious } });
  }

  function refresh(): void {
    for (const name of builtin) copyInto(join(source, name), name, { withCommon: true, keepPrevious: true });
  }

  return {
    builtin,

    refresh,

    inspect: (directory, names) => Object.fromEntries(names.map((name) => [name, presence(directory, name)])),

    install(directory, names) {
      // Also refreshes AgentHub's copy, so an app update reaches accounts already set up.
      if (names.some((name) => builtin.includes(name))) refresh();
      const missingCopy = names.find((name) => !existsSync(join(shared, name, 'SKILL.md')));
      if (missingCopy) throw new DomainError('SKILL_MISSING', 'skill.copyMissing', { name: missingCopy });
      mkdirSync(directory, { recursive: true, mode: 0o700 });
      for (const name of names) {
        if (presence(directory, name) === 'missing') symlinkSync(join(shared, name), join(directory, name), 'dir');
      }
    },

    uninstall(directory, names) {
      for (const name of names) {
        if (presence(directory, name) === 'installed') unlinkSync(join(directory, name));
      }
    },

    addCopy(folder, name) {
      if (builtin.includes(name)) throw new DomainError('SKILL_EXISTS', 'skill.builtinName', { name });
      copyInto(folder, name, { withCommon: false, keepPrevious: false });
    },

    removeCopy(name) {
      if (builtin.includes(name)) return;
      rmSync(join(shared, name), { recursive: true, force: true });
      rmSync(join(previous, name), { recursive: true, force: true });
      const versions = readVersions();
      if (name in versions) {
        delete versions[name];
        writeVersions(versions);
      }
    },

    // A shipped skill is shown as accounts get it, with the shared files on top.
    files(name) {
      if (builtin.includes(name) && !existsSync(join(shared, name, 'SKILL.md'))) refresh();
      return readSkillFolder(join(shared, name));
    },

    // The copy the user last saw, while a newer one is waiting to be looked at.
    previousFiles: (name) => (readVersions()[name]?.updated && existsSync(join(previous, name)) ? readSkillFolder(join(previous, name)) : null),

    updated: (name) => readVersions()[name]?.updated === true,

    acknowledge(name) {
      rmSync(join(previous, name), { recursive: true, force: true });
      const versions = readVersions();
      const entry = versions[name];
      if (entry?.updated) writeVersions({ ...versions, [name]: { ...entry, updated: false } });
    },

    // A user's skill against the folder it was added from (ADR-026 item 8).
    sourceState(name, folder): SkillSourceState {
      if (!existsSync(join(folder, 'SKILL.md'))) return 'missing';
      return skillHash(folder) === skillHash(join(shared, name)) ? 'same' : 'changed';
    },

    sourceFiles: (folder) => readSkillFolder(folder),

    updateCopy(folder, name) {
      if (builtin.includes(name)) throw new DomainError('SKILL_EXISTS', 'skill.builtinName', { name });
      copyInto(folder, name, { withCommon: false, keepPrevious: false });
    },

    describe(name) {
      for (const base of builtin.includes(name) ? [source, shared] : [shared]) {
        try {
          return skillFrontmatter(readFileSync(join(base, name, 'SKILL.md'), 'utf8'))?.['description'] ?? null;
        } catch {
          // Try the next place.
        }
      }
      return null;
    },
  };
}
