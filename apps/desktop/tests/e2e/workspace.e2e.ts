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
let app: ElectronApplication | undefined;

function launchArguments(): { executablePath?: string; args: string[] } {
  const dataSwitch = `--user-data-dir=${userData}`;
  return packagedExecutable
    ? { executablePath: packagedExecutable, args: [dataSwitch] }
    : { args: [appDirectory, dataSwitch] };
}

async function launch(): Promise<Page> {
  // Playwright forces a light color scheme unless told not to; the theme test needs the real one.
  app = await _electron.launch({ ...launchArguments(), colorScheme: null });
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

async function createTask(page: Page, title: string): Promise<void> {
  await page.getByLabel('Tiêu đề task mới').fill(title);
  await page.getByRole('button', { name: 'Tạo task' }).click();
  await expect(page.getByLabel('Tiêu đề', { exact: true })).toHaveValue(title);
}

function contextEditor(page: Page, label: string) {
  const editor = page.locator('section.editor').filter({ has: page.getByLabel(label) });
  return { text: editor.getByRole('textbox'), save: editor.getByRole('button', { name: 'Lưu' }), status: editor.getByRole('status'), editor };
}

function artifactFiles(): string[] {
  const artifacts = join(userData, 'artifacts');
  return readdirSync(artifacts, { recursive: true, encoding: 'utf8' }).filter((entry) => entry.endsWith('.md'));
}

test.beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'agenthub-e2e-')));
  userData = join(root, 'data');
  projectDir = join(root, "Dự án 'nháy' $(touch injected)");
  mkdirSync(projectDir);
});

test.afterEach(async () => {
  await quit();
  rmSync(root, { recursive: true, force: true });
});

test('Phase 1 exit criteria: project, task and context survive a restart', async () => {
  let page = await launch();
  await expect(page.getByRole('heading', { name: 'Chưa có project nào' })).toBeVisible();

  await addProject(page);
  await createTask(page, 'QA-024 — sửa lỗi');
  await page.getByLabel('Mục tiêu').fill('Sửa lỗi spawn');
  await page.getByLabel('Tiêu chí hoàn thành').fill('Không crash');
  await page.getByLabel('Trạng thái').selectOption('active');
  await page.getByRole('button', { name: 'Lưu task' }).click();
  await expect(page.getByRole('button', { name: 'Lưu task' })).toBeDisabled();

  const context = contextEditor(page, 'Task context');
  await context.text.fill('# Bối cảnh\nGhi chú tiếng Việt — 日本語');
  await context.save.click();
  await expect(context.status).toHaveText('Đã lưu');

  page = await restart();

  await expect(page.locator('#project-path')).toHaveText(projectDir);
  await page.getByRole('button', { name: /QA-024/ }).click();
  await expect(page.getByLabel('Mục tiêu')).toHaveValue('Sửa lỗi spawn');
  await expect(page.getByLabel('Tiêu chí hoàn thành')).toHaveValue('Không crash');
  await expect(page.getByLabel('Trạng thái')).toHaveValue('active');
  await expect(contextEditor(page, 'Task context').text).toHaveValue('# Bối cảnh\nGhi chú tiếng Việt — 日本語');

  expect(readdirSync(projectDir)).toEqual([]);
  expect(artifactFiles().some((file) => file.endsWith('task.md'))).toBe(true);
});

test('a project folder that moved can be relinked without losing tasks', async () => {
  let page = await launch();
  await addProject(page);
  await createTask(page, 'QA-1');

  await quit();
  const moved = join(root, 'đã chuyển chỗ');
  renameSync(projectDir, moved);
  page = await launch();

  await expect(page.getByText('Không tìm thấy folder của project')).toBeVisible();
  await answerFolderDialog(moved);
  await page.getByRole('button', { name: 'Chọn lại folder' }).click();

  await expect(page.locator('#project-path')).toHaveText(moved);
  await expect(page.getByText('Không tìm thấy folder của project')).toBeHidden();
  await expect(page.getByRole('button', { name: /QA-1/ })).toBeVisible();
});

test('the same folder cannot be added twice', async () => {
  const page = await launch();
  await addProject(page);

  await answerFolderDialog(projectDir);
  await page.getByRole('button', { name: 'Thêm project' }).click();

  await expect(page.getByRole('alert')).toContainText('đã được thêm');
  await expect(page.getByRole('navigation').getByRole('listitem')).toHaveCount(1);
});

test('renaming and removing a project leaves its folder alone', async () => {
  const page = await launch();
  await addProject(page);

  const name = page.getByLabel('Tên project');
  await name.fill('Game A');
  await name.press('Enter');
  await expect(page.getByRole('navigation').getByRole('button', { name: 'Game A' })).toBeVisible();

  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'Gỡ khỏi AgentHub' }).click();

  await expect(page.getByRole('heading', { name: 'Chưa có project nào' })).toBeVisible();
  expect(existsSync(projectDir)).toBe(true);
});

test('saving over a change made outside the app asks first', async () => {
  const page = await launch();
  await addProject(page);
  await createTask(page, 'QA-2');
  const context = contextEditor(page, 'Task context');
  await context.text.fill('bản đầu');
  await context.save.click();
  await expect(context.status).toHaveText('Đã lưu');

  const [file] = artifactFiles().filter((entry) => entry.endsWith('task.md'));
  const path = join(userData, 'artifacts', file ?? '');
  writeFileSync(path, 'sửa bằng editor khác');

  await context.text.fill('bản trong app');
  await context.save.click();
  await expect(context.editor.getByRole('alert')).toContainText('thay đổi ở nơi khác');
  expect(readFileSync(path, 'utf8')).toBe('sửa bằng editor khác');

  await context.editor.getByRole('button', { name: /Tải lại/ }).click();
  await expect(context.text).toHaveValue('sửa bằng editor khác');
  await expect(context.editor.getByRole('alert')).toBeHidden();

  await context.text.fill('bản ghi đè');
  writeFileSync(path, 'lại đổi bên ngoài');
  await context.save.click();
  await context.editor.getByRole('button', { name: /Ghi đè/ }).click();
  await expect(context.status).toHaveText('Đã lưu');
  expect(readFileSync(path, 'utf8')).toBe('bản ghi đè');
});

test('leaving a form with unsaved edits asks before discarding them', async () => {
  const page = await launch();
  await addProject(page);
  await createTask(page, 'QA-3');
  const context = contextEditor(page, 'Task context');
  await context.text.fill('chưa lưu');
  await expect(context.status).toHaveText('Chưa lưu');

  page.once('dialog', (dialog) => void dialog.dismiss());
  await page.getByRole('button', { name: /Danh sách task/ }).click();
  await expect(context.text).toHaveValue('chưa lưu');

  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: /Danh sách task/ }).click();
  await expect(page.getByRole('heading', { name: 'Tasks' })).toBeVisible();
});

test('closing the window with unsaved edits lets the user stay', async () => {
  const page = await launch();
  await addProject(page);
  await createTask(page, 'QA-4');
  const context = contextEditor(page, 'Task context');
  await context.text.fill('chưa lưu');
  await expect(context.status).toHaveText('Chưa lưu');

  const answerCloseDialog = async (choice: number): Promise<void> => {
    await app?.evaluate(({ dialog }, answer) => {
      dialog.showMessageBoxSync = (() => answer) as typeof dialog.showMessageBoxSync;
    }, choice);
  };
  const windowCount = async (): Promise<number | undefined> =>
    app?.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);
  const closeWindow = async (): Promise<void> => {
    await app?.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close());
  };

  await answerCloseDialog(0);
  await closeWindow();
  await expect(context.text).toHaveValue('chưa lưu');
  expect(await windowCount()).toBe(1);

  await answerCloseDialog(1);
  await closeWindow();
  await expect.poll(windowCount).toBe(0);
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
  await expect(page.locator('#schema-version')).toHaveText('1');

  await page.getByLabel('Giao diện').selectOption('dark');
  await expect(page.getByLabel('Giao diện')).toHaveValue('dark');
  expect(await app?.evaluate(({ nativeTheme }) => nativeTheme.themeSource)).toBe('dark');
  expect(await isDark(page)).toBe(true);

  await page.getByLabel('Giao diện').selectOption('light');
  await expect(page.getByLabel('Giao diện')).toHaveValue('light');
  await expect.poll(() => isDark(page)).toBe(false);

  await page.getByLabel('Giao diện').selectOption('dark');
  await expect.poll(() => isDark(page)).toBe(true);

  page = await restart();
  await expect.poll(() => isDark(page)).toBe(true);
  expect(await app?.evaluate(({ nativeTheme }) => nativeTheme.themeSource)).toBe('dark');
  await page.getByRole('button', { name: 'Cài đặt' }).click();
  await expect(page.getByLabel('Giao diện')).toHaveValue('dark');
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
      await api['getContext']?.({ reference: { scope: 'project', projectId: '../../etc' } }),
      await api['listTasks']?.({ projectId: 'not-a-uuid' }),
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
