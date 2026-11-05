import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readlinkSync, renameSync, rmSync, symlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { SkillInstaller, SkillPresence } from '@agenthub/application';

// The skills ship with the app (source). AgentHub keeps one copy of its own (shared) and links
// each account's skill folder to it, so an update reaches every account at once (SPIKE-14).
export function createSkillInstaller({ source, shared }: { source: string; shared: string }): SkillInstaller {
  const names = existsSync(source)
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
    // Anything else under our name belongs to the user and is never replaced.
    return isLink && resolve(directory, readlinkSync(path)) === join(shared, name) ? 'installed' : 'foreign';
  }

  // Replaced whole, through a temporary folder, so a link never points at a half-copied skill.
  function refreshShared(): void {
    mkdirSync(shared, { recursive: true, mode: 0o700 });
    for (const name of names) {
      const target = join(shared, name);
      const staging = join(shared, `.${name}.new`);
      rmSync(staging, { recursive: true, force: true });
      cpSync(join(source, name), staging, { recursive: true });
      rmSync(target, { recursive: true, force: true });
      renameSync(staging, target);
    }
  }

  return {
    names,

    inspect: (directory) => Object.fromEntries(names.map((name) => [name, presence(directory, name)])),

    install(directory) {
      refreshShared();
      mkdirSync(directory, { recursive: true, mode: 0o700 });
      for (const name of names) {
        if (presence(directory, name) === 'missing') symlinkSync(join(shared, name), join(directory, name), 'dir');
      }
    },
  };
}
