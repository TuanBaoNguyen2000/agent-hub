import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, renameSync, rmSync, statSync, symlinkSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { SkillInstaller, SkillManifest, SkillPresence } from '@agenthub/application';
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

// The skills that ship with the app sit in source. AgentHub keeps one copy of every skill of its
// own (shared) and links each account's skill folder to it, so an update reaches every account at
// once (SPIKE-14). The user's own skills are copied into shared when added (ADR-020 item 1).
export function createSkillInstaller({ source, shared }: { source: string; shared: string }): SkillInstaller {
  const builtin = existsSync(source)
    ? readdirSync(source, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && existsSync(join(source, entry.name, 'SKILL.md')))
        .map((entry) => entry.name)
        .sort()
    : [];

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
  function copyInto(from: string, name: string): void {
    mkdirSync(shared, { recursive: true, mode: 0o700 });
    const target = join(shared, name);
    const staging = join(shared, `.${name}.new`);
    rmSync(staging, { recursive: true, force: true });
    cpSync(from, staging, { recursive: true });
    rmSync(target, { recursive: true, force: true });
    renameSync(staging, target);
  }

  function refresh(): void {
    for (const name of builtin) copyInto(join(source, name), name);
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
      copyInto(folder, name);
    },

    removeCopy(name) {
      if (builtin.includes(name)) return;
      rmSync(join(shared, name), { recursive: true, force: true });
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
