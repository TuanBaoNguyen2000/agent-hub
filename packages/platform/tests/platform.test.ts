import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { allowlistEnv, browserCaptureScript, createMacPlatform, focusScript, instanceOpenArgs, parseInstances, privateWindowArgs, shellQuote, terminalScript } from '../src/index';

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

describe('login support', () => {
  const page = "https://claude.com/x?a=1&b='q'&c=$(touch injected)";

  it('asks each browser for a private window with the address as one argument', () => {
    expect(privateWindowArgs({ app: 'Google Chrome', flag: '--incognito' }, page)).toEqual(['-na', 'Google Chrome', '--args', '--incognito', page]);
  });

  it('captures the address a CLI would open, unchanged', () => {
    const capture = createMacPlatform({ env: polluted }).captureBrowserRequest();
    expect(capture.url()).toBeNull();

    expect(spawnSync(capture.command, [page]).status).toBe(0);
    expect(capture.url()).toBe(page);

    capture.dispose();
    expect(capture.url()).toBeNull();
  });

  it('quotes the capture file in its script', () => {
    const file = join(root, "url'$(touch injected)");
    const script = join(root, 'browser');
    writeFileSync(script, browserCaptureScript(file), { mode: 0o700 });

    expect(spawnSync(script, ['address']).status).toBe(0);
    expect(existsSync(join(root, 'injected'))).toBe(false);
    expect(readFileSync(file, 'utf8')).toBe('address');
  });

  function browserFolder(openExit = 0) {
    const log = join(root, 'open.log');
    const dir = join(root, 'browsers');
    mkdirSync(dir);
    const command = executable('open', `for arg in "$@"; do echo "$arg" >> ${shellQuote(log)}; done\nexit ${openExit}`);
    return { log, dir, platform: createMacPlatform({ env: polluted, browserDirs: [dir], browserOpenCommand: command }) };
  }

  it('prefers a browser that can open a private window', async () => {
    const { log, dir, platform } = browserFolder();
    mkdirSync(join(dir, 'Firefox.app'));
    mkdirSync(join(dir, 'Google Chrome.app'));

    expect(await platform.openPrivateWindow(page)).toBe('Google Chrome');
    expect(readFileSync(log, 'utf8').trim().split('\n')).toEqual(['-na', 'Google Chrome', '--args', '--incognito', page]);
  });

  it('uses each browser’s own flag', async () => {
    const { log, dir, platform } = browserFolder();
    mkdirSync(join(dir, 'Firefox.app'));

    expect(await platform.openPrivateWindow(page)).toBe('Firefox');
    expect(readFileSync(log, 'utf8')).toContain('--private-window');
  });

  it('reports no private window when no such browser exists, or it fails to open', async () => {
    const none = browserFolder();
    expect(await none.platform.openPrivateWindow(page)).toBeNull();
    expect(existsSync(none.log)).toBe(false);

    rmSync(none.dir, { recursive: true });
    const broken = browserFolder(1);
    mkdirSync(join(broken.dir, 'Google Chrome.app'));
    expect(await broken.platform.openPrivateWindow(page)).toBeNull();
  });

  it('opens the default browser with the address alone', async () => {
    const { log, platform } = browserFolder();

    expect(await platform.openInDefaultBrowser(page)).toBe(true);
    expect(readFileSync(log, 'utf8').trim()).toBe(page);
  });
});

describe('spawnTool', () => {
  const platform = () => createMacPlatform({ env: polluted });

  it('streams whole lines, takes input and reports the exit code', async () => {
    const tool = platform().spawnTool(executable('tool', 'printf "one\\ntw"; printf "o\\n"; read line; echo "got $line"; exit 3'), []);
    const lines: string[] = [];
    tool.onLine((line) => lines.push(line));

    tool.write('hello');

    expect(await tool.exited).toBe(3);
    expect(lines).toEqual(['one', 'two', 'got hello']);
  });

  it('gives the tool only the allowlisted env and the profile values', async () => {
    const tool = platform().spawnTool(executable('tool', 'echo "$CLAUDE_CODE_MESSAGING_TOKEN|$BROWSER"'), [], { extraEnv: { BROWSER: '/x' } });
    const lines: string[] = [];
    tool.onLine((line) => lines.push(line));

    await tool.exited;

    expect(lines).toEqual(['|/x']);
  });

  it('stops a tool on request, and survives being asked twice', async () => {
    const tool = platform().spawnTool(executable('tool', 'exec sleep 30'), []);

    tool.kill();
    expect(await tool.exited).toBeNull();
    tool.kill();
    tool.write('ignored');
  });

  it('reports a tool that cannot start', async () => {
    expect(await platform().spawnTool(join(root, 'missing'), []).exited).toBeNull();
  });
});

describe('parseInstances', () => {
  const exe = '/Applications/Claude.app/Contents/MacOS/Claude';
  const ps = [
    `Mon Nov  2 09:00:05 2026   300 ${exe}`,
    `Mon Nov  2 08:59:00 2026   200 ${exe} --user-data-dir=/Users/a/Dữ liệu b --flag`,
    `Mon Nov  2 09:00:05 2026   150 ${exe} --user-data-dir=/Users/a/c`,
    `Mon Nov  2 08:00:00 2026   100 /Applications/Claude.app/Contents/Frameworks/Claude Helper --type=gpu`,
    `Mon Nov  2 08:00:00 2026    90 ${exe}-other`,
    `Mon Nov  2 08:00:00 2026    80 /bin/zsh -c ${exe}`,
    'garbage',
    '',
  ].join('\n');

  it('lists only the app’s main processes, oldest first, with ties in pid order', () => {
    expect(parseInstances(ps, exe)).toEqual([
      { pid: 200, dataDir: '/Users/a/Dữ liệu b' },
      { pid: 150, dataDir: '/Users/a/c' },
      { pid: 300, dataDir: null },
    ]);
  });

  it('reads the real output of ps', async () => {
    const child = spawn('/bin/sleep', ['30'], { stdio: 'ignore' });

    const instances = await createMacPlatform({ env: polluted }).runningInstances('/bin/sleep');
    child.kill();

    expect(instances).toContainEqual({ pid: child.pid, dataDir: null });
  });
});

describe('focusProcess', () => {
  it('only ever puts a number in the script', () => {
    expect(focusScript(42)).toContain('runningApplicationWithProcessIdentifier(42)');
  });

  it('reports a process that no longer exists', async () => {
    expect(await createMacPlatform({ env: polluted }).focusProcess(999_999)).toBe(false);
  });
});
