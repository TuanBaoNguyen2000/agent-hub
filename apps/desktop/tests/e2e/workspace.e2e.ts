import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { type ElectronApplication, type Page, _electron, expect, test } from '@playwright/test';

// Set AGENTHUB_E2E_EXECUTABLE to test a packaged app instead of the built sources.
const packagedExecutable = process.env['AGENTHUB_E2E_EXECUTABLE'];
const appDirectory = resolve(__dirname, '../..');

let root: string;
let userData: string;
let projectDir: string;
let browserDir: string;
let app: ElectronApplication | undefined;

function launchArguments(): { executablePath?: string; args: string[] } {
  const dataSwitch = `--user-data-dir=${userData}`;
  return packagedExecutable
    ? { executablePath: packagedExecutable, args: [dataSwitch] }
    : { args: [appDirectory, dataSwitch] };
}

async function launch(): Promise<Page> {
  // Playwright forces a light color scheme unless told not to; the theme test needs the real one.
  // Sign-ins go to a stand-in browser here, never the real one.
  const env = { ...(process.env as Record<string, string>), AGENTHUB_E2E_BROWSER_DIR: browserDir };
  app = await _electron.launch({ ...launchArguments(), colorScheme: null, env });
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  return page;
}

async function quit(): Promise<void> {
  await app?.close();
  app = undefined;
}

async function restart(): Promise<Page> {
  await quit();
  return launch();
}

async function answerFolderDialog(path: string): Promise<void> {
  await app?.evaluate(({ dialog }, chosen) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [chosen] })) as typeof dialog.showOpenDialog;
  }, path);
}

async function addProject(page: Page, path = projectDir): Promise<void> {
  await answerFolderDialog(path);
  await page.getByRole('button', { name: 'Thêm project' }).click();
  await expect(page.locator('#project-path')).toHaveText(path);
}

const tree = (page: Page) => page.getByRole('navigation', { name: 'Projects' });

const contextSection = (page: Page) => page.getByRole('region', { name: 'Tài liệu context' });

async function turnOnContext(page: Page): Promise<void> {
  await contextSection(page).getByRole('radiogroup', { name: 'Tài liệu context' }).getByRole('radio', { name: 'Bật' }).click();
  await expect(contextSection(page).getByTestId('context-path')).toBeVisible();
}


test.beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'agenthub-e2e-')));
  userData = join(root, 'data');
  projectDir = join(root, "Dự án 'nháy' $(touch injected)");
  mkdirSync(projectDir);
  browserDir = join(root, 'browser');
  mkdirSync(join(browserDir, 'Google Chrome.app'), { recursive: true });
  writeFileSync(join(browserDir, 'open'), `#!/bin/sh\nfor arg in "$@"; do echo "$arg" >> ${JSON.stringify(join(browserDir, 'log'))}; done\n`, { mode: 0o755 });
});

test.afterEach(async () => {
  await quit();
  rmSync(root, { recursive: true, force: true });
});

test('Phase 1 exit criteria: a project and its context settings survive a restart', async () => {
  let page = await launch();
  await expect(page.getByRole('heading', { name: 'Chưa có project nào' })).toBeVisible();

  await addProject(page);
  await expect(page.getByText('Project này chưa được mở lần nào')).toBeVisible();
  await turnOnContext(page);
  await contextSection(page).getByRole('radiogroup', { name: 'Ngôn ngữ tài liệu' }).getByRole('radio', { name: 'Tiếng Việt' }).click();
  const defaultFolder = (await contextSection(page).getByTestId('context-path').textContent()) ?? '';
  expect(defaultFolder.startsWith(join(userData, 'projects'))).toBe(true);

  page = await restart();

  await expect(page.locator('#project-path')).toHaveText(projectDir);
  await expect(contextSection(page).getByRole('radio', { name: 'Bật' })).toBeChecked();
  await expect(contextSection(page).getByRole('radio', { name: 'Tiếng Việt' })).toBeChecked();
  await expect(contextSection(page).getByTestId('context-path')).toHaveText(defaultFolder);

  // AgentHub makes the folder for the agents, writes nothing into it, and nothing into the project.
  expect(readdirSync(defaultFolder)).toEqual([]);
  expect(readdirSync(projectDir)).toEqual([]);
  expect(existsSync(join(userData, 'artifacts'))).toBe(false);
});

test('the context documents can live in a folder the user chooses, and go back to the default', async () => {
  const page = await launch();
  await addProject(page);
  await turnOnContext(page);
  const defaultFolder = (await contextSection(page).getByTestId('context-path').textContent()) ?? '';
  const chosen = join(root, 'Tài liệu chung');
  mkdirSync(chosen);

  await answerFolderDialog(chosen);
  await contextSection(page).getByRole('button', { name: 'Chọn folder khác' }).click();
  await expect(contextSection(page).getByTestId('context-path')).toHaveText(chosen);
  await expect(contextSection(page).getByText('Folder bạn chọn')).toBeVisible();

  await contextSection(page).getByRole('button', { name: 'Dùng mặc định' }).click();
  await expect(contextSection(page).getByTestId('context-path')).toHaveText(defaultFolder);

  await contextSection(page).getByRole('radio', { name: 'Tắt' }).click();
  await expect(contextSection(page).getByTestId('context-path')).toBeHidden();
  expect(readdirSync(chosen)).toEqual([]);
});

test('a project folder that moved can be relinked without losing its context settings', async () => {
  let page = await launch();
  await addProject(page);
  await turnOnContext(page);

  await quit();
  const moved = join(root, 'đã chuyển chỗ');
  renameSync(projectDir, moved);
  page = await launch();

  await expect(page.getByText('Không tìm thấy folder của project')).toBeVisible();
  await answerFolderDialog(moved);
  await page.getByRole('button', { name: 'Chọn lại folder' }).click();

  await expect(page.locator('#project-path')).toHaveText(moved);
  await expect(page.getByText('Không tìm thấy folder của project')).toBeHidden();
  await expect(contextSection(page).getByRole('radio', { name: 'Bật' })).toBeChecked();
});

test('the same folder cannot be added twice', async () => {
  const page = await launch();
  await addProject(page);

  await answerFolderDialog(projectDir);
  await page.getByRole('button', { name: 'Thêm project' }).click();

  await expect(page.getByRole('alert')).toContainText('đã được thêm');
  await expect(tree(page).getByRole('button', { name: /Dự án/ })).toHaveCount(1);
});

test('renaming and removing a project leaves its folder alone', async () => {
  const page = await launch();
  await addProject(page);

  const name = page.getByLabel('Tên project');
  await name.fill('Game A');
  await name.press('Enter');
  await expect(tree(page).getByRole('button', { name: 'Game A' })).toBeVisible();

  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'Thao tác với project' }).click();
  await page.getByRole('menuitem', { name: 'Gỡ khỏi AgentHub' }).click();

  await expect(page.getByRole('heading', { name: 'Chưa có project nào' })).toBeVisible();
  expect(existsSync(projectDir)).toBe(true);
});

const accounts = (page: Page) => page.getByRole('region', { name: 'Accounts' });
// One per account: each row also lists its usage windows, which are list items too.
const accountRows = (page: Page) => accounts(page).locator('.settings-list > li');

async function addAccount(page: Page, kind: 'Claude' | 'Codex'): Promise<void> {
  await page.getByRole('button', { name: 'Cài đặt' }).click();
  const before = await accountRows(page).count();
  await accounts(page).getByRole('button', { name: 'Thêm account' }).click();
  await page.getByRole('menuitem', { name: kind, exact: true }).click();
  const useMachine = accounts(page).getByRole('button', { name: 'Dùng account này' });
  const added = accountRows(page).nth(before);
  await expect(useMachine.or(added)).toBeVisible();
  if (await useMachine.isVisible()) await useMachine.click();
  await expect(accountRows(page)).toHaveCount(before + 1);
}

async function setCli(page: Page, label: 'Claude CLI' | 'Codex CLI', path: string): Promise<void> {
  await page.getByRole('button', { name: 'Cài đặt' }).click();
  await page.getByText('Nâng cao').click();
  const field = page.getByLabel(label);
  await field.fill(path);
  await field.blur();
  await expect(field).toHaveValue(path);
}

// Keeps its login per config folder, as the real CLI does. `auth login` asks for a browser, then
// waits until the test approves it by writing an email into that folder (see approveLogin).
function fakeClaude(machineEmail: string | null = 'someone@example.com'): string {
  const cli = join(root, 'fake-claude');
  const machine = join(root, 'machine-claude');
  mkdirSync(machine, { recursive: true });
  if (machineEmail) writeFileSync(join(machine, 'email'), machineEmail);
  // Shape of Claude CLI 2.1.318 `-p /usage --output-format json` (SPIKE-16).
  const usage = [
    'Current session: USED% used · resets Nov 4 at 8:19pm (Asia/Saigon)',
    'Current week (all models): 91% used · resets Nov 6 at 11:59pm (Asia/Saigon)',
    '',
    "What's contributing to your usage?",
    '  62%  Start fresh when you switch tasks',
  ].join('\n');
  writeFileSync(join(root, 'claude-usage.json'), JSON.stringify({ type: 'result', is_error: false, num_turns: 0, local_command: 'usage', result: usage }));
  writeFileSync(
    cli,
    `#!/bin/sh
state="\${CLAUDE_CONFIG_DIR:-${machine}}"
if [ "$1" = "auth" ] && [ "$2" = "status" ]; then
  if [ -f "$state/email" ]; then echo "{\\"loggedIn\\":true,\\"email\\":\\"$(cat "$state/email")\\",\\"orgId\\":\\"org-1\\",\\"subscriptionType\\":\\"pro\\"}"; else echo '{"loggedIn":false}'; fi
  exit 0
fi
if [ "$1" = "auth" ] && [ "$2" = "login" ]; then
  "$BROWSER" 'https://claude.com/cai/oauth/authorize?state=e2e'
  while [ ! -f "$state/approve" ]; do sleep 0.1; done
  mv "$state/approve" "$state/email"
  exit 0
fi
if [ "$1" = "--version" ]; then echo '9.9.9 (Claude Code)'; exit 0; fi
if [ "$1" = "-p" ] && [ "$2" = "/usage" ]; then
  used=42; [ -f "$state/used" ] && used="$(cat "$state/used")"
  sed "s/USED/$used/" ${JSON.stringify(join(root, 'claude-usage.json'))}
  exit 0
fi
exit 0
`,
    { mode: 0o755 },
  );
  return cli;
}

function approveLogin(email: string): void {
  const accountsRoot = join(userData, 'accounts');
  for (const id of readdirSync(accountsRoot)) {
    const folder = join(accountsRoot, id, 'cli');
    if (!existsSync(join(folder, 'email'))) writeFileSync(join(folder, 'approve'), email);
  }
}

const browserLog = (): string => readFileSync(join(browserDir, 'log'), 'utf8');

async function openProject(page: Page): Promise<void> {
  await tree(page).getByRole('button', { name: /Dự án/ }).click();
}

test('a machine login is only used after asking, and accounts go by their email', async () => {
  let page = await launch();
  await setCli(page, 'Claude CLI', fakeClaude());

  await accounts(page).getByRole('button', { name: 'Thêm account' }).click();
  await page.getByRole('menuitem', { name: 'Claude', exact: true }).click();
  const offer = accounts(page).getByRole('group', { name: 'Chọn account để thêm' });
  await expect(offer).toContainText('someone@example.com');
  await expect(accountRows(page)).toHaveCount(0);

  await offer.getByRole('button', { name: 'Dùng account này' }).click();
  const row = accountRows(page).first();
  await expect(row.getByTestId('account-identity')).toHaveText('someone@example.com');
  await expect(row.getByText('Đã đăng nhập (pro)')).toBeVisible();
  await expect(row.getByText(join(userData, 'accounts'))).toBeHidden();

  // No nickname to fill in: the email is the name everywhere.
  await expect(row.getByRole('textbox')).toHaveCount(0);
  await expect(tree(page).getByRole('button', { name: 'Mở someone@example.com' })).toBeVisible();

  await addProject(page);
  const picker = page.getByRole('button', { name: 'Account', exact: true });
  await expect(picker).toContainText('someone@example.com');
  await expect(picker).toContainText('Claude · App chính');
  await picker.click();
  await expect(page.getByRole('menuitemradio')).toHaveText([/someone@example\.com/]);

  page = await restart();
  await page.getByRole('button', { name: 'Cài đặt' }).click();
  await expect(accounts(page).getByTestId('account-identity')).toHaveText('someone@example.com');
});

test('another account signs in through a private window and shows up under its own email', async () => {
  const page = await launch();
  await setCli(page, 'Claude CLI', fakeClaude());

  await accounts(page).getByRole('button', { name: 'Thêm account' }).click();
  await page.getByRole('menuitem', { name: 'Claude', exact: true }).click();
  await accounts(page).getByRole('button', { name: 'Đăng nhập account khác' }).click();

  const row = accountRows(page).first();
  await expect(row.getByRole('group', { name: 'Đang đăng nhập' })).toContainText('cửa sổ riêng tư của Google Chrome');
  await expect(row.getByTestId('account-identity')).toHaveText('Chưa rõ account');
  expect(browserLog().split('\n').slice(0, 5)).toEqual(['-na', 'Google Chrome', '--args', '--incognito', 'https://claude.com/cai/oauth/authorize?state=e2e']);

  await row.getByRole('button', { name: 'Dùng trình duyệt thường' }).click();
  await expect.poll(() => browserLog().split('\n').at(-2)).toBe('https://claude.com/cai/oauth/authorize?state=e2e');
  await row.getByRole('button', { name: 'Sao chép link' }).click();
  await expect
    .poll(() => app?.evaluate(({ clipboard }) => clipboard.readText()))
    .toBe('https://claude.com/cai/oauth/authorize?state=e2e');

  approveLogin('second@example.com');

  await expect(row.getByTestId('account-identity')).toHaveText('second@example.com');
  await expect(row.getByRole('group', { name: 'Đang đăng nhập' })).toBeHidden();
  await expect(row.getByRole('button', { name: 'Đăng nhập lại' })).toBeVisible();
  // The machine's own login is untouched and can still be added.
  await addAccount(page, 'Claude');
  await expect(accounts(page).getByTestId('account-identity')).toHaveText(['second@example.com', 'someone@example.com']);
});

test('each account shows its usage limits from its own CLI, and refreshes on request', async () => {
  const page = await launch();
  await setCli(page, 'Claude CLI', fakeClaude());
  await addAccount(page, 'Claude');

  const row = accountRows(page).first();
  const usage = row.getByTestId('usage');
  await expect(usage.getByRole('meter', { name: 'Phiên 5 giờ: đã dùng 42%' })).toBeVisible();
  await expect(usage.getByRole('meter', { name: 'Tuần: đã dùng 91%' })).toBeVisible();
  await expect(usage).toContainText('đặt lại Nov 4 at 8:19pm (Asia/Saigon)');
  // Only the limit lines are read; what the usage went to stays out.
  await expect(usage).not.toContainText('Start fresh');
  await expect(tree(page).getByTestId('usage-chip')).toHaveText('91%');

  writeFileSync(join(root, 'machine-claude', 'used'), '100');
  await usage.getByRole('button', { name: 'Làm mới' }).click();
  await expect(usage.getByRole('meter', { name: 'Phiên 5 giờ: đã dùng 100%' })).toBeVisible();
  await expect(usage.getByRole('status')).toContainText('đã chạm hạn mức');
});

test('cancelling a sign-in cancels adding the account', async () => {
  const page = await launch();
  await setCli(page, 'Claude CLI', fakeClaude(null));

  await accounts(page).getByRole('button', { name: 'Thêm account' }).click();
  await page.getByRole('menuitem', { name: 'Claude', exact: true }).click();
  await accounts(page).getByRole('button', { name: 'Huỷ' }).click();

  await expect(accountRows(page)).toHaveCount(0);
  await expect(accounts(page).getByRole('button', { name: 'Thêm account' })).toBeVisible();
});

test('a sign-in in progress is still there after leaving Settings', async () => {
  const page = await launch();
  await setCli(page, 'Claude CLI', fakeClaude(null));
  await addProject(page);

  await page.getByRole('button', { name: 'Cài đặt' }).click();
  await accounts(page).getByRole('button', { name: 'Thêm account' }).click();
  await page.getByRole('menuitem', { name: 'Claude', exact: true }).click();
  await expect(accounts(page).getByRole('group', { name: 'Đang đăng nhập' })).toBeVisible();

  await openProject(page);
  await page.getByRole('button', { name: 'Cài đặt' }).click();

  await expect(accounts(page).getByRole('group', { name: 'Đang đăng nhập' })).toBeVisible();
  await accounts(page).getByRole('button', { name: 'Huỷ' }).click();
});

test('two accounts on the same login are flagged, and internal identifiers stay in Main', async () => {
  const page = await launch();
  await setCli(page, 'Claude CLI', fakeClaude());
  await addAccount(page, 'Claude');
  await accounts(page).getByRole('button', { name: 'Thêm account' }).click();
  await page.getByRole('menuitem', { name: 'Claude', exact: true }).click();
  await expect(accounts(page).getByRole('group', { name: 'Đang đăng nhập' })).toBeVisible();

  approveLogin('someone@example.com');

  await expect(accounts(page).getByText('cùng tài khoản với').first()).toBeVisible();
  await expect(accounts(page).getByRole('button', { name: 'Đăng nhập lại' }).last()).toBeVisible();
  const reply = await page.evaluate(async () => {
    const scope = globalThis as unknown as { agentHub: { listProfiles(): Promise<{ data: { id: string }[] }>; getProfileStatus(input: { id: string }): Promise<unknown> } };
    const list = await scope.agentHub.listProfiles();
    return JSON.stringify(await scope.agentHub.getProfileStatus({ id: list.data[0]?.id ?? '' }));
  });
  expect(reply).not.toContain('org-1');
  expect(reply).not.toContain('ingerprint');
});

test('a project with no account points to where to add one', async () => {
  const page = await launch();
  await addProject(page);

  await page.getByRole('main').getByRole('button', { name: 'Thêm account' }).click();

  await expect(accounts(page)).toBeVisible();
});

test('a first launch asks about the project once, and a denied pair stays blocked', async () => {
  const page = await launch();
  await addProject(page);
  await setCli(page, 'Claude CLI', join(root, 'không có claude'));
  await addAccount(page, 'Claude');
  await openProject(page);

  await page.getByRole('button', { name: 'Mở trong Terminal' }).click();
  const decision = page.getByRole('group', { name: 'Cần bạn quyết định' });
  await expect(decision.getByText('Account này sẽ đọc được source code')).toBeVisible();

  await decision.getByRole('button', { name: 'Không cho phép' }).click();
  await expect(decision.getByText('không được phép dùng project')).toBeVisible();
  await expect(decision.getByRole('button', { name: 'Tiếp tục mở' })).toHaveCount(0);

  await decision.getByRole('button', { name: 'Đổi thành cho phép' }).click();
  await expect(decision.getByText('không được phép dùng project')).toBeHidden();
});

test('a missing CLI blocks the Terminal launch with a clear reason', async () => {
  const page = await launch();
  await addProject(page);
  await setCli(page, 'Claude CLI', join(root, 'không có claude'));
  await addAccount(page, 'Claude');
  await openProject(page);

  await page.getByRole('button', { name: 'Mở trong Terminal' }).click();
  const decision = page.getByRole('group', { name: 'Cần bạn quyết định' });
  await expect(decision.getByRole('alert')).toContainText('Không tìm thấy Claude CLI');
});

function isDark(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const scope = globalThis as unknown as { matchMedia(query: string): { matches: boolean } };
    return scope.matchMedia('(prefers-color-scheme: dark)').matches;
  });
}

test('the theme setting applies and survives a restart', async () => {
  let page = await launch();
  await page.getByRole('button', { name: 'Cài đặt' }).click();
  await page.getByText('Nâng cao').click();
  await expect(page.locator('#schema-version')).toHaveText('4');

  const theme = (label: string) => page.getByRole('radiogroup', { name: 'Giao diện' }).getByRole('radio', { name: label });
  await theme('Tối').click();
  await expect(theme('Tối')).toBeChecked();
  expect(await app?.evaluate(({ nativeTheme }) => nativeTheme.themeSource)).toBe('dark');
  expect(await isDark(page)).toBe(true);

  await theme('Sáng').click();
  await expect(theme('Sáng')).toBeChecked();
  await expect.poll(() => isDark(page)).toBe(false);

  await theme('Tối').click();
  await expect.poll(() => isDark(page)).toBe(true);

  page = await restart();
  await expect.poll(() => isDark(page)).toBe(true);
  expect(await app?.evaluate(({ nativeTheme }) => nativeTheme.themeSource)).toBe('dark');
  await page.getByRole('button', { name: 'Cài đặt' }).click();
  await expect(page.getByRole('radiogroup', { name: 'Giao diện' }).getByRole('radio', { name: 'Tối' })).toBeChecked();
});

test('the renderer has no system access and bad payloads are refused', async () => {
  const page = await launch();

  const globals = await page.evaluate(() => {
    const scope = globalThis as unknown as Record<string, unknown>;
    return {
      require: typeof scope['require'],
      process: typeof scope['process'],
      ipcRenderer: typeof scope['ipcRenderer'],
    };
  });
  expect(globals).toEqual({ require: 'undefined', process: 'undefined', ipcRenderer: 'undefined' });

  const replies = await page.evaluate(async () => {
    const scope = globalThis as unknown as {
      agentHub: Record<string, (input?: unknown) => Promise<{ ok: boolean; error?: { code: string } }>>;
    };
    const api = scope.agentHub;
    const bad = [
      await api['addProject']?.({ path: '/tmp', shell: 'rm -rf /' }),
      await api['addProject']?.({ path: 42 }),
      await api['openContextFolder']?.({ id: '../../etc' }),
      await api['listLaunches']?.({ projectId: 'not-a-uuid' }),
      await api['addProject']?.({ path: 'relative/path' }),
    ];
    return bad.map((reply) => reply?.error?.code);
  });
  expect(replies).toEqual([
    'VALIDATION_FAILED',
    'VALIDATION_FAILED',
    'VALIDATION_FAILED',
    'VALIDATION_FAILED',
    'PROJECT_PATH_INVALID',
  ]);
});

test('a second instance exits and leaves the first one running', async () => {
  const page = await launch();
  const { executablePath, args } = launchArguments();
  const require = createRequire(__filename);
  const executable = executablePath ?? (require('electron') as unknown as string);

  const second = spawnSync(executable, args, { timeout: 30_000 });

  expect(second.status).toBe(0);
  await expect(page.getByRole('button', { name: 'Thêm project' })).toBeVisible();
});

test('menus open right beside the control that opened them, and give focus back', async () => {
  const page = await launch();
  await setCli(page, 'Claude CLI', fakeClaude());
  await addAccount(page, 'Claude');
  await addProject(page);

  const picker = page.getByRole('button', { name: 'Account', exact: true });
  await picker.click();
  const menu = page.getByRole('menu', { name: 'Account' });
  await expect(menu.getByRole('menuitemradio', { name: 'someone@example.com' })).toBeFocused();
  await page.waitForTimeout(200);
  const anchor = await picker.boundingBox();
  const panel = await menu.boundingBox();
  if (!anchor || !panel) throw new Error('Menu not laid out');
  expect(panel.y - (anchor.y + anchor.height)).toBeGreaterThanOrEqual(4);
  expect(panel.y - (anchor.y + anchor.height)).toBeLessThanOrEqual(8);
  expect(Math.abs(panel.x - anchor.x)).toBeLessThanOrEqual(1);
  expect(panel.width).toBeGreaterThanOrEqual(anchor.width - 1);
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(picker).toBeFocused();

  // The accounts sit at the bottom of the sidebar, so their menu opens upwards.
  const account = tree(page).getByRole('button', { name: 'Mở someone@example.com' });
  await account.click();
  const accountMenu = page.getByRole('menu', { name: 'Mở someone@example.com' });
  await expect(accountMenu.getByRole('menuitem', { name: 'Mở trong Desktop' })).toBeVisible();
  await expect(accountMenu.getByRole('menuitem', { name: 'Mở trong Terminal' })).toBeVisible();
  await page.waitForTimeout(200);
  const row = await account.boundingBox();
  const above = await accountMenu.boundingBox();
  if (!row || !above) throw new Error('Menu not laid out');
  expect(row.y - (above.y + above.height)).toBeGreaterThanOrEqual(4);
  await page.mouse.click(600, 400);
  await expect(accountMenu).toBeHidden();
});
