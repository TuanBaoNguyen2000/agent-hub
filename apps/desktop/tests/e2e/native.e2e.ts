import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { type ElectronApplication, type Page, _electron, expect, test } from '@playwright/test';

// Opens real Terminal windows and Desktop instances, so it only runs when asked:
// AGENTHUB_E2E_NATIVE=1. Uses a stand-in CLI and empty directories; it signs in to nothing
// and never touches a provider's real login.
test.skip(!process.env['AGENTHUB_E2E_NATIVE'], 'Set AGENTHUB_E2E_NATIVE=1 to open real apps.');

const packagedExecutable = process.env['AGENTHUB_E2E_EXECUTABLE'];
const appDirectory = resolve(__dirname, '../..');

let root: string;
let app: ElectronApplication | undefined;
let page: Page;

test.beforeEach(async () => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'agenthub-native-')));
  const dataSwitch = `--user-data-dir=${join(root, 'data')}`;
  app = await _electron.launch(packagedExecutable ? { executablePath: packagedExecutable, args: [dataSwitch] } : { args: [appDirectory, dataSwitch] });
  page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
});

test.afterEach(async () => {
  await app?.close();
  rmSync(root, { recursive: true, force: true });
});

// Sets up a project and a second account, which gets its own folders under the test's data folder.
async function prepareProject(projectPath: string, cliPath: string): Promise<void> {
  mkdirSync(projectPath);
  await app?.evaluate(({ dialog }, chosen) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [chosen] })) as typeof dialog.showOpenDialog;
  }, projectPath);
  await page.getByRole('button', { name: 'Thêm project' }).click();
  await expect(page.locator('#project-path')).toHaveText(projectPath);

  await page.getByRole('button', { name: 'Cài đặt' }).click();
  await page.getByText('Nâng cao').click();
  const cliField = page.getByLabel('Claude CLI');
  await cliField.fill(cliPath);
  await cliField.blur();
  const accounts = page.getByRole('region', { name: 'Accounts' });
  await accounts.getByRole('button', { name: 'Thêm account' }).click();
  await page.getByRole('menuitem', { name: 'Claude', exact: true }).click();
  await accounts.getByRole('button', { name: 'Dùng account này' }).click();
  await expect(accounts.locator('.settings-list > li')).toHaveCount(1);
  await accounts.getByRole('button', { name: 'Thêm account' }).click();
  await page.getByRole('menuitem', { name: 'Claude', exact: true }).click();
  await expect(accounts.locator('.settings-list > li')).toHaveCount(2);

  await page.getByRole('navigation', { name: 'Projects' }).getByRole('button', { name: /Dự án/ }).click();
  await page.getByRole('button', { name: 'Account', exact: true }).click();
  await page.getByRole('menuitemradio').nth(1).click();
}

test('a CLI opens in Terminal.app with the project as cwd and only the allowlisted env', async () => {
  const project = join(root, "Dự án 'nháy' $(touch injected)");
  const output = join(root, 'cli-output.txt');
  const cli = join(root, 'fake claude');
  writeFileSync(
    cli,
    `#!/bin/sh
if [ "$1" = "auth" ]; then echo '{"loggedIn":true}'; exit 0; fi
if [ "$1" = "--version" ]; then echo 1; exit 0; fi
{ pwd; test -t 0 && echo tty; env | cut -d= -f1 | sort; echo "CONFIG=$CLAUDE_CONFIG_DIR"; } > ${JSON.stringify(output)}
`,
    { mode: 0o755 },
  );
  await prepareProject(project, cli);

  await page.getByRole('button', { name: 'Mở trong Terminal' }).click();
  await page.getByRole('group', { name: 'Cần bạn quyết định' }).getByRole('button', { name: 'Cho phép', exact: true }).click();

  await expect(page.getByRole('status', { name: 'Kết quả lần mở' })).toContainText('Đã mở tại folder');
  await page.getByRole('tab', { name: 'Lịch sử' }).click();
  await expect(page.getByText('Account chưa xác minh')).toBeVisible();
  await expect.poll(() => existsSync(output), { timeout: 15_000 }).toBe(true);

  const lines = readFileSync(output, 'utf8').trim().split('\n');
  expect(lines[0]).toBe(project);
  expect(lines).toContain('tty');
  const config = lines.find((line) => line.startsWith('CONFIG='))?.slice('CONFIG='.length) ?? '';
  expect(config.startsWith(join(root, 'data', 'accounts'))).toBe(true);
  expect(existsSync(config)).toBe(true);
  expect(lines.filter((line) => /^(CLAUDE|ANTHROPIC|CODEX|OPENAI|NODE|NVM)/.test(line) && line !== 'CLAUDE_CONFIG_DIR')).toEqual([]);
  expect(existsSync(join(project, 'injected'))).toBe(false);

  // The second click opens straight away: permission is only asked once.
  await page.getByRole('button', { name: 'Mở trong Terminal' }).click();
  await expect(page.getByRole('status', { name: 'Kết quả lần mở' })).toContainText('Đã mở tại folder');
  await expect(page.getByRole('group', { name: 'Cần bạn quyết định' })).toHaveCount(0);
});

test('a second account opens its own Claude Desktop window beside the main app', async () => {
  const project = join(root, 'Dự án thử');
  const cli = join(root, 'fake-claude');
  writeFileSync(cli, `#!/bin/sh\necho '{"loggedIn":true}'\n`, { mode: 0o755 });
  await prepareProject(project, cli);
  const executable = '/Applications/Claude.app/Contents/MacOS/Claude';
  // Without a UTF-8 locale, ps escapes non-ASCII characters in the path.
  const psEnv = { ...process.env, LANG: 'en_US.UTF-8' };
  const instancePid = (): string | undefined =>
    spawnSync('/bin/ps', ['-axww', '-o', 'pid=,args='], { encoding: 'utf8', env: psEnv })
      .stdout.split('\n')
      .find((line) => line.includes(`${executable} --user-data-dir=${join(root, 'data', 'accounts')}`))
      ?.trim()
      .split(/\s+/, 1)[0];

  await page.getByRole('button', { name: 'Mở trong Desktop' }).click();
  const decision = page.getByRole('group', { name: 'Cần bạn quyết định' });
  await decision.getByRole('button', { name: 'Cho phép', exact: true }).click();
  const proceed = decision.getByRole('button', { name: 'Tiếp tục mở' });
  await expect(proceed.or(page.getByRole('status', { name: 'Kết quả lần mở' })).first()).toBeVisible();
  const version = decision.getByRole('checkbox');
  if (await version.count()) await version.check();
  if (await proceed.count()) await proceed.click();

  try {
    await expect(page.getByRole('status', { name: 'Kết quả lần mở' })).toContainText('tự chọn folder', { timeout: 30_000 });
    await page.getByRole('tab', { name: 'Lịch sử' }).click();
    await expect(page.getByText('Account chưa xác minh')).toBeVisible();
    expect(instancePid()).toBeDefined();
    const env = spawnSync('/bin/ps', ['-wwE', '-p', instancePid() ?? '0', '-o', 'command='], { encoding: 'utf8', env: psEnv }).stdout;
    expect(env).toContain(`CLAUDE_CONFIG_DIR=${join(root, 'data', 'accounts')}`);
    expect(env).not.toMatch(/\b(ANTHROPIC|CLAUDE_CODE)[A-Z_]*=/);

    // Claude does not refuse a second process on the same data, so a second click must not start one.
    const running = spawnSync('/bin/ps', ['-axww', '-o', 'args='], { encoding: 'utf8', env: psEnv });
    const needle = `${executable} --user-data-dir=${join(root, 'data', 'accounts')}`;
    const copies = (output: string): number => output.split('\n').filter((line) => line.startsWith(needle)).length;
    expect(copies(running.stdout)).toBe(1);
    await page.getByRole('button', { name: 'Mở trong Desktop' }).click();
    await expect(page.getByText('Account chưa xác minh')).toHaveCount(2, { timeout: 15_000 });
    expect(copies(spawnSync('/bin/ps', ['-axww', '-o', 'args='], { encoding: 'utf8', env: psEnv }).stdout)).toBe(1);
  } finally {
    const pid = instancePid();
    if (pid) process.kill(Number(pid), 'SIGTERM');
  }
});
