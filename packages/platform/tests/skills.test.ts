import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DomainError } from '@agenthub/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSkillInstaller, readSkillManifest, skillFrontmatter } from '../src/index';

let root: string;
let source: string;
let shared: string;
let account: string;

const BUILTIN = ['context-init', 'context-resume'];

function writeSkill(base: string, name: string, body: string): void {
  mkdirSync(join(base, name), { recursive: true });
  writeFileSync(join(base, name, 'SKILL.md'), body);
}

const skillText = (name: string, description = 'Does a thing.') => `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n`;

function codeOf(action: () => unknown): string | undefined {
  try {
    action();
  } catch (error) {
    if (error instanceof DomainError) return error.code;
    throw error;
  }
  return undefined;
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
    expect(createSkillInstaller({ source, shared }).builtin).toEqual(BUILTIN);
  });

  it("links an account to AgentHub's own copy", () => {
    const installer = createSkillInstaller({ source, shared });
    expect(installer.inspect(account, BUILTIN)).toEqual({ 'context-init': 'missing', 'context-resume': 'missing' });

    installer.install(account, BUILTIN);

    expect(installer.inspect(account, BUILTIN)).toEqual({ 'context-init': 'installed', 'context-resume': 'installed' });
    expect(lstatSync(join(account, 'context-resume')).isSymbolicLink()).toBe(true);
    expect(readFileSync(join(account, 'context-resume', 'SKILL.md'), 'utf8')).toBe('v1');
  });

  it('installs only the names it is given', () => {
    const installer = createSkillInstaller({ source, shared });
    installer.install(account, ['context-init']);
    expect(installer.inspect(account, BUILTIN)).toEqual({ 'context-init': 'installed', 'context-resume': 'missing' });
  });

  it('brings an update to every linked account on refresh, and leaves no staging folder', () => {
    const other = join(root, 'other', 'skills');
    createSkillInstaller({ source, shared }).install(account, BUILTIN);
    createSkillInstaller({ source, shared }).install(other, BUILTIN);

    writeSkill(source, 'context-resume', 'v2');
    createSkillInstaller({ source, shared }).refresh();

    expect(readFileSync(join(other, 'context-resume', 'SKILL.md'), 'utf8')).toBe('v2');
    expect(readdirSync(shared).filter((name) => !name.startsWith('.')).sort()).toEqual(BUILTIN);
    expect(readdirSync(shared).filter((name) => name.endsWith('.new'))).toEqual([]);
  });

  it('never replaces a skill of the same name that the user put there, nor a link pointing elsewhere', () => {
    writeSkill(account, 'context-resume', 'mine');
    mkdirSync(join(root, 'elsewhere'));
    symlinkSync(join(root, 'elsewhere'), join(account, 'context-init'));
    const installer = createSkillInstaller({ source, shared });

    installer.install(account, BUILTIN);

    expect(installer.inspect(account, BUILTIN)).toEqual({ 'context-init': 'foreign', 'context-resume': 'foreign' });
    expect(readFileSync(join(account, 'context-resume', 'SKILL.md'), 'utf8')).toBe('mine');
    expect(readlinkSync(join(account, 'context-init'))).toBe(join(root, 'elsewhere'));
  });

  it('removes only its own links, never what the user put there', () => {
    const installer = createSkillInstaller({ source, shared });
    installer.install(account, ['context-init']);
    writeSkill(account, 'context-resume', 'mine');

    installer.uninstall(account, BUILTIN);

    expect(installer.inspect(account, BUILTIN)).toEqual({ 'context-init': 'missing', 'context-resume': 'foreign' });
    // The link went, AgentHub's copy stays for other accounts.
    expect(existsSync(join(shared, 'context-init', 'SKILL.md'))).toBe(true);
    expect(readFileSync(join(account, 'context-resume', 'SKILL.md'), 'utf8')).toBe('mine');
  });

  it('leaves a link to a folder elsewhere alone on uninstall', () => {
    mkdirSync(join(root, 'elsewhere'));
    mkdirSync(account, { recursive: true });
    symlinkSync(join(root, 'elsewhere'), join(account, 'context-init'));

    createSkillInstaller({ source, shared }).uninstall(account, BUILTIN);

    expect(readlinkSync(join(account, 'context-init'))).toBe(join(root, 'elsewhere'));
  });

  it('repairs a link whose copy was deleted', () => {
    const installer = createSkillInstaller({ source, shared });
    installer.install(account, BUILTIN);
    rmSync(shared, { recursive: true });

    installer.install(account, BUILTIN);

    expect(existsSync(join(account, 'context-init', 'SKILL.md'))).toBe(true);
  });

  it('keeps a copy of a skill the user added, links it, and removes the copy on request', () => {
    const picked = join(root, 'picked', 'my-skill');
    writeSkill(join(root, 'picked'), 'my-skill', skillText('my-skill'));
    const installer = createSkillInstaller({ source, shared });

    installer.addCopy(picked, 'my-skill');
    rmSync(picked, { recursive: true });
    installer.install(account, ['my-skill']);

    expect(readFileSync(join(account, 'my-skill', 'SKILL.md'), 'utf8')).toContain('name: my-skill');
    expect(installer.describe('my-skill')).toBe('Does a thing.');

    installer.uninstall(account, ['my-skill']);
    installer.removeCopy('my-skill');
    expect(existsSync(join(shared, 'my-skill'))).toBe(false);
    expect(codeOf(() => installer.install(account, ['my-skill']))).toBe('SKILL_MISSING');
  });

  it('refuses to copy over a shipped skill', () => {
    writeSkill(join(root, 'picked'), 'context-init', skillText('context-init'));
    expect(codeOf(() => createSkillInstaller({ source, shared }).addCopy(join(root, 'picked', 'context-init'), 'context-init'))).toBe('SKILL_EXISTS');
  });

  it('has nothing to install when the bundle is missing', () => {
    const installer = createSkillInstaller({ source: join(root, 'none'), shared });
    expect(installer.builtin).toEqual([]);
    expect(installer.inspect(account, [])).toEqual({});
  });
});

describe('shared files and versions (ADR-026)', () => {
  it('puts the files of _shared into every shipped skill, and never treats _shared as a skill', () => {
    mkdirSync(join(source, '_shared', 'references'), { recursive: true });
    writeFileSync(join(source, '_shared', 'references', 'document-layout.md'), 'rules');
    writeFileSync(join(source, '_shared', '.DS_Store'), 'junk');
    writeFileSync(join(source, 'context-init', '.DS_Store'), 'junk');
    const installer = createSkillInstaller({ source, shared });
    expect(installer.builtin).toEqual(BUILTIN);

    installer.refresh();

    for (const name of BUILTIN) expect(readFileSync(join(shared, name, 'references', 'document-layout.md'), 'utf8')).toBe('rules');
    expect(existsSync(join(shared, '_shared'))).toBe(false);
    expect(existsSync(join(shared, 'context-init', '.DS_Store'))).toBe(false);
    expect(installer.files('context-init').map((file) => file.path)).toEqual(['SKILL.md', 'references/document-layout.md']);
  });

  it('marks a shipped skill an update changed, keeps the copy the user last saw, and forgets it once seen', () => {
    createSkillInstaller({ source, shared }).refresh();
    expect(createSkillInstaller({ source, shared }).updated('context-resume')).toBe(false);

    writeSkill(source, 'context-resume', 'v2');
    createSkillInstaller({ source, shared }).refresh();
    writeSkill(source, 'context-resume', 'v3');
    const installer = createSkillInstaller({ source, shared });
    installer.refresh();

    expect(installer.updated('context-resume')).toBe(true);
    expect(installer.updated('context-init')).toBe(false);
    // Two updates in a row compare against what the user saw, not the copy in between.
    expect(installer.previousFiles('context-resume')).toEqual([{ path: 'SKILL.md', text: 'v1' }]);
    expect(installer.files('context-resume')).toEqual([{ path: 'SKILL.md', text: 'v3' }]);

    installer.acknowledge('context-resume');
    expect(installer.updated('context-resume')).toBe(false);
    expect(installer.previousFiles('context-resume')).toBeNull();
    installer.refresh();
    expect(installer.updated('context-resume')).toBe(false);
  });

  it("compares a user's skill with its folder and copies it again on request", () => {
    const folder = join(root, 'mine', 'unity-review');
    writeSkill(join(root, 'mine'), 'unity-review', skillText('unity-review'));
    const installer = createSkillInstaller({ source, shared });
    installer.addCopy(folder, 'unity-review');
    installer.install(account, ['unity-review']);
    expect(installer.sourceState('unity-review', folder)).toBe('same');

    writeFileSync(join(folder, 'SKILL.md'), skillText('unity-review', 'Does more.'));
    mkdirSync(join(folder, 'scripts'));
    writeFileSync(join(folder, 'scripts', 'scan.py'), 'print(1)');
    expect(installer.sourceState('unity-review', folder)).toBe('changed');
    expect(installer.sourceFiles(folder).map((file) => file.path)).toEqual(['SKILL.md', 'scripts/scan.py']);

    installer.updateCopy(folder, 'unity-review');
    expect(installer.sourceState('unity-review', folder)).toBe('same');
    expect(readFileSync(join(account, 'unity-review', 'scripts', 'scan.py'), 'utf8')).toBe('print(1)');
    expect(installer.updated('unity-review')).toBe(false);

    rmSync(folder, { recursive: true });
    expect(installer.sourceState('unity-review', folder)).toBe('missing');
    expect(codeOf(() => installer.updateCopy(folder, 'context-init'))).toBe('SKILL_EXISTS');
  });
});

describe('readSkillManifest (Agent Skills format)', () => {
  function folder(name: string, body: string | null): string {
    const path = join(root, 'offered', name);
    mkdirSync(path, { recursive: true });
    if (body !== null) writeFileSync(join(path, 'SKILL.md'), body);
    return path;
  }

  it('reads name and description, including a folded description', () => {
    expect(readSkillManifest(folder('my-skill', skillText('my-skill')))).toEqual({ name: 'my-skill', description: 'Does a thing.' });
    const folded = '---\nname: "folded-skill"\ndescription: >\n  First line\n  second line.\nlicense: MIT\n---\nBody';
    expect(readSkillManifest(folder('folded-skill', folded))).toEqual({ name: 'folded-skill', description: 'First line second line.' });
  });

  it.each([
    ['no SKILL.md', 'no-file', null],
    ['no frontmatter', 'plain', '# Just a title'],
    ['an unclosed frontmatter', 'open', '---\nname: open\ndescription: x\n'],
    ['no name', 'nameless', '---\ndescription: x\n---\n'],
    ['no description', 'quiet', '---\nname: quiet\n---\n'],
    ['capitals in the name', 'Bad-Name', '---\nname: Bad-Name\ndescription: x\n---\n'],
    ['a double hyphen', 'a--b', '---\nname: a--b\ndescription: x\n---\n'],
    ['a name unlike its folder', 'folder-name', '---\nname: other-name\ndescription: x\n---\n'],
    ['a description over 1024 characters', 'long', `---\nname: long\ndescription: ${'x'.repeat(1025)}\n---\n`],
  ])('refuses a skill with %s', (_case, name, body) => {
    expect(codeOf(() => readSkillManifest(folder(name, body)))).toBe('SKILL_INVALID');
  });

  it('refuses a file instead of a folder', () => {
    writeFileSync(join(root, 'file.md'), skillText('file'));
    expect(codeOf(() => readSkillManifest(join(root, 'file.md')))).toBe('SKILL_INVALID');
  });

  it('parses only the frontmatter keys', () => {
    expect(skillFrontmatter('---\nname: a\nmetadata:\n  nested: 1\n---\nname: b')).toEqual({ name: 'a', metadata: '' });
  });
});
