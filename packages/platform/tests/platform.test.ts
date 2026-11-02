import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { allowlistEnv, createMacPlatform, instanceOpenArgs, shellQuote, terminalScript } from '../src/index';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "agenthub-platform dữ liệu 'x' "));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function executable(name: string, body: string): string {
  const path = join(root, name);
  writeFileSync(path, `#!/bin/sh\n${body}\n`);
  chmodSync(path, 0o755);
  return path;
}

const polluted: NodeJS.ProcessEnv = {
  HOME: '/Users/test',
  USER: 'test',
  PATH: '/secret/bin',
  CLAUDE_CODE_MESSAGING_TOKEN: 'secret',
  ANTHROPIC_BASE_URL: 'https://example.com',
  NVM_DIR: '/secret',
};

describe('allowlistEnv', () => {
  it('drops everything outside the allowlist', () => {
    const env = allowlistEnv(polluted);

    expect(Object.keys(env).sort()).toEqual(['HOME', 'LANG', 'PATH', 'USER']);
    expect(env['PATH']).not.toContain('/secret');
  });

  it('sets LANG, which a GUI app does not have', () => {
    expect(allowlistEnv({})['LANG']).toBe('en_US.UTF-8');
  });

  it('adds tool folders and profile variables for one child only', () => {
    const env = allowlistEnv(polluted, { pathDirs: ['/tool'], extra: { CLAUDE_CONFIG_DIR: '/b' } });

    expect(env['PATH']?.startsWith('/tool:')).toBe(true);
    expect(env['CLAUDE_CONFIG_DIR']).toBe('/b');
    expect(polluted['CLAUDE_CONFIG_DIR']).toBeUndefined();
  });
});

describe('run', () => {
  it('gives the child only the allowlisted env', async () => {
    const platform = createMacPlatform({ env: polluted });

    const result = await platform.run('/usr/bin/env', [], { extraEnv: { CODEX_HOME: '/b' } });

    expect(result.stdout).toContain('CODEX_HOME=/b');
    expect(result.stdout).not.toContain('secret');
    expect(result.stdout).not.toContain('ANTHROPIC');
  });

  it('runs in a cwd with Unicode, spaces and quotes', async () => {
    const result = await createMacPlatform().run('/bin/pwd', [], { cwd: root });

    expect(result.stdout.trim().endsWith(root.replace(/^\/private/, '').replace(/^\/var/, '/var'))).toBe(true);
  });

  it('passes arguments literally, with no shell', async () => {
    const marker = join(root, 'injected');
    const hostile = `$(touch '${marker}'); touch '${marker}'`;

    const result = await createMacPlatform().run('/bin/echo', [hostile]);

    expect(result.stdout.trim()).toBe(hostile);
    expect(spawnSync('/bin/test', ['-e', marker]).status).toBe(1);
  });

  it('reports a missing binary as an error code', async () => {
    const result = await createMacPlatform().run(join(root, 'none'), []);

    expect(result.errorCode).toBe('ENOENT');
  });

  it('stops a process that runs past its timeout', async () => {
    const result = await createMacPlatform().run('/bin/sleep', ['5'], { timeoutMs: 100 });

    expect(result.timedOut).toBe(true);
  });

  it('puts the tool folder on PATH, for CLIs that are node scripts', async () => {
    const tool = executable('tool', 'echo "$PATH"');

    const result = await createMacPlatform().run(tool, []);

    expect(result.stdout.startsWith(root)).toBe(true);
  });
});

describe('runInPty', () => {
  it('gives a command a terminal, which a pipe does not', async () => {
    const tool = executable('tty-check', 'test -t 1 && echo terminal || echo pipe');
    const platform = createMacPlatform();

    expect((await platform.run(tool, [])).stdout.trim()).toBe('pipe');
    expect((await platform.runInPty(tool, [])).stdout).toContain('terminal');
  });

  it('passes the exit code through', async () => {
    const tool = executable('fails', 'exit 3');

    expect((await createMacPlatform().runInPty(tool, [])).exit).toBe(3);
  });
});

describe('findCli', () => {
  it('uses a configured path when it is executable', async () => {
    const tool = executable('my-claude', 'exit 0');

    expect(await createMacPlatform().findCli('claude', tool)).toBe(tool);
  });

  it('does not fall back when a configured path is wrong', async () => {
    expect(await createMacPlatform().findCli('claude', join(root, 'none'))).toBeNull();
  });

  it('finds a CLI under nvm without any PATH entry for it', async () => {
    const bin = join(root, '.nvm/versions/node/v24.21.0/bin');
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, 'agenthub-fake-cli'), '#!/bin/sh\n');
    chmodSync(join(bin, 'agenthub-fake-cli'), 0o755);
    const platform = createMacPlatform({ env: { HOME: root, SHELL: '/bin/sh', PATH: '/usr/bin:/bin' } });

    expect(await platform.findCli('agenthub-fake-cli', null)).toBe(join(bin, 'agenthub-fake-cli'));
  });
});

describe('terminalScript', () => {
  const request = {
    executable: "/tools/it's claude",
    args: ['auth', '$(touch hacked)'],
    cwd: "/work/Dự án 'nháy' $(touch hacked)",
    env: { HOME: '/Users/test', CLAUDE_CONFIG_DIR: "/b 'x'" },
    stateDir: join('/tmp', 'state dir'),
  };

  it('quotes every value', () => {
    const script = terminalScript(request);

    expect(script).toContain(`cd -- ${shellQuote(request.cwd)}`);
    expect(script).toContain(`CLAUDE_CONFIG_DIR=${shellQuote("/b 'x'")}`);
    expect(script).toContain(shellQuote('$(touch hacked)'));
    expect(script).not.toMatch(/[^'](\$\(touch hacked\))[^']/);
  });

  it('runs correctly for real, with hostile values, and cleans up', () => {
    const stateDir = join(root, 'state');
    mkdirSync(stateDir);
    const cwd = join(root, "Dự án 'nháy' $(touch hacked)");
    mkdirSync(cwd);
    const output = join(root, 'output.txt');
    const tool = executable('probe', `pwd > '${output.replaceAll("'", "'\\''")}'; echo "$1" >> '${output.replaceAll("'", "'\\''")}'; env | cut -d= -f1 | sort >> '${output.replaceAll("'", "'\\''")}'; exit 7`);
    const scriptPath = join(stateDir, 'launch.command');
    writeFileSync(
      scriptPath,
      terminalScript({ executable: tool, args: ['$(touch hacked)'], cwd, env: { HOME: root, PATH: '/usr/bin:/bin', CLAUDE_CONFIG_DIR: '/b' }, stateDir }),
      { mode: 0o700 },
    );

    const run = spawnSync('/bin/zsh', [scriptPath], { env: { TERM: 'xterm', SECRET_TOKEN: 'x' }, cwd: root, encoding: 'utf8' });

    expect(run.status).toBe(7);
    const lines = spawnSync('/bin/cat', [output], { encoding: 'utf8' }).stdout.trim().split('\n');
    expect(lines[0]?.endsWith("Dự án 'nháy' $(touch hacked)")).toBe(true);
    expect(lines[1]).toBe('$(touch hacked)');
    expect(lines).toContain('CLAUDE_CONFIG_DIR');
    expect(lines).not.toContain('SECRET_TOKEN');
    expect(spawnSync('/bin/test', ['-e', join(cwd, 'hacked')]).status).toBe(1);
    expect(spawnSync('/bin/test', ['-e', stateDir]).status).toBe(1);
  });
});

describe('instanceOpenArgs', () => {
  it('keeps each value in one argument', () => {
    expect(instanceOpenArgs({ appName: 'Claude', envName: 'CLAUDE_CONFIG_DIR', envValue: '/a b', dataDir: "/c 'd'" })).toEqual([
      '-n',
      '-a',
      'Claude',
      '--env',
      'CLAUDE_CONFIG_DIR=/a b',
      '--args',
      "--user-data-dir=/c 'd'",
    ]);
  });
});

describe('filesystem helpers', () => {
  it('classifies paths', () => {
    const platform = createMacPlatform();
    const file = join(root, 'file');
    writeFileSync(file, '');

    expect(platform.pathKind(root)).toBe('directory');
    expect(platform.pathKind(file)).toBe('file');
    expect(platform.pathKind(join(root, 'none'))).toBe('missing');
    expect(platform.pathKind('relative/path')).toBe('relative');
  });

  it('creates a private directory', () => {
    const platform = createMacPlatform();
    const dir = join(root, 'a/b');

    platform.ensureDirectory(dir);

    expect(platform.pathKind(dir)).toBe('directory');
    expect(platform.isEmptyDirectory(dir)).toBe(true);
  });
});
