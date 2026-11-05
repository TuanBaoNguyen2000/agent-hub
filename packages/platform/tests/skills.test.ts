import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSkillInstaller } from '../src/index';

let root: string;
let source: string;
let shared: string;
let account: string;

function writeSkill(base: string, name: string, body: string): void {
  mkdirSync(join(base, name), { recursive: true });
  writeFileSync(join(base, name, 'SKILL.md'), body);
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "agenthub skills 'thử' "));
  source = join(root, 'bundle');
  shared = join(root, 'data', 'skills');
  account = join(root, 'account', 'skills');
  writeSkill(source, 'context-resume', 'v1');
  writeSkill(source, 'context-init', 'v1');
  mkdirSync(join(source, 'not-a-skill'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('createSkillInstaller', () => {
  it('knows only the bundled folders that hold a SKILL.md', () => {
    expect(createSkillInstaller({ source, shared }).names).toEqual(['context-init', 'context-resume']);
  });

  it('links an account to AgentHub\'s own copy', () => {
    const installer = createSkillInstaller({ source, shared });
    expect(installer.inspect(account)).toEqual({ 'context-init': 'missing', 'context-resume': 'missing' });

    installer.install(account);

    expect(installer.inspect(account)).toEqual({ 'context-init': 'installed', 'context-resume': 'installed' });
    expect(lstatSync(join(account, 'context-resume')).isSymbolicLink()).toBe(true);
    expect(readFileSync(join(account, 'context-resume', 'SKILL.md'), 'utf8')).toBe('v1');
  });

  it('brings an update to every linked account, and leaves no staging folder', () => {
    const other = join(root, 'other', 'skills');
    createSkillInstaller({ source, shared }).install(account);
    createSkillInstaller({ source, shared }).install(other);

    writeSkill(source, 'context-resume', 'v2');
    createSkillInstaller({ source, shared }).install(account);

    expect(readFileSync(join(other, 'context-resume', 'SKILL.md'), 'utf8')).toBe('v2');
    expect(readdirSync(shared).sort()).toEqual(['context-init', 'context-resume']);
  });

  it('never replaces a skill of the same name that the user put there', () => {
    writeSkill(account, 'context-resume', 'mine');
    mkdirSync(join(root, 'elsewhere'));
    symlinkSync(join(root, 'elsewhere'), join(account, 'context-init'));
    const installer = createSkillInstaller({ source, shared });

    installer.install(account);

    expect(installer.inspect(account)).toEqual({ 'context-init': 'foreign', 'context-resume': 'foreign' });
    expect(readFileSync(join(account, 'context-resume', 'SKILL.md'), 'utf8')).toBe('mine');
    expect(readlinkSync(join(account, 'context-init'))).toBe(join(root, 'elsewhere'));
  });

  it('repairs a link whose copy was deleted', () => {
    const installer = createSkillInstaller({ source, shared });
    installer.install(account);
    rmSync(shared, { recursive: true });

    installer.install(account);

    expect(existsSync(join(account, 'context-init', 'SKILL.md'))).toBe(true);
  });

  it('has nothing to install when the bundle is missing', () => {
    const installer = createSkillInstaller({ source: join(root, 'none'), shared });
    expect(installer.names).toEqual([]);
    expect(installer.inspect(account)).toEqual({});
  });
});
