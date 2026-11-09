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
let trashDir: string;
let app: ElectronApplication | undefined;

// The interface follows the system language until the user picks one; the tests read Vietnamese.
function launchArguments(): { executablePath?: string; args: string[] } {
  const switches = [`--user-data-dir=${userData}`, '--lang=vi'];
  return packagedExecutable
    ? { executablePath: packagedExecutable, args: switches }
    : { args: [appDirectory, ...switches] };
}

async function launch(): Promise<Page> {
  // Playwright forces a light color scheme unless told not to; the theme test needs the real one.
  // Sign-ins go to a stand-in browser here, never the real one.
  const env = { ...(process.env as Record<string, string>), AGENTHUB_E2E_BROWSER_DIR: browserDir, AGENTHUB_E2E_TRASH_DIR: trashDir };
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

type SettingsTab = 'Chung' | 'Account' | 'Công cụ agent' | 'MCP server' | 'Nâng cao';

// Settings open over the window (Cmd+,); each topic has its own tab.
async function settings(page: Page, tab: SettingsTab): Promise<void> {
  const dialog = page.getByRole('dialog', { name: /^(Cài đặt|Settings)$/ });
  if (!(await dialog.isVisible())) await page.keyboard.press('Meta+Comma');
  await dialog.getByRole('tab', { name: tab, exact: true }).click();
}

async function closeSettings(page: Page): Promise<void> {
  const dialog = page.getByRole('dialog', { name: /^(Cài đặt|Settings)$/ });
  if (await dialog.isVisible()) await dialog.getByRole('button', { name: /^(Đóng|Close)$/ }).click();
  await expect(dialog).toBeHidden();
}

// ADR-023 item 1: the folder, then the dialog that says what it holds and asks about documents.
async function addProject(page: Page, path = projectDir, docs: 'none' | 'suggested' = 'none'): Promise<void> {
  await closeSettings(page);
  await answerFolderDialog(path);
  await page.getByRole('button', { name: 'Thêm project', exact: true }).click();
  const dialog = addDialog(page);
  await expect(dialog.getByTestId('add-project-path')).toHaveText(path);
  if (docs === 'none') await dialog.getByRole('radio', { name: /^Chưa dùng tài liệu/ }).click();
  await dialog.getByRole('button', { name: 'Thêm project', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('#project-path')).toHaveText(path);
}

const addDialog = (page: Page) => page.getByRole('dialog', { name: 'Thêm project' });

const tree = (page: Page) => page.getByRole('navigation', { name: 'Điều hướng' });

async function openTab(page: Page, name: 'Tổng quan' | 'Task' | 'Handoff' | 'Lịch sử' | 'Cài đặt'): Promise<void> {
  await closeSettings(page);
  await page.getByRole('tablist', { name: 'Trang project' }).getByRole('tab', { name, exact: true }).click();
}

const docsCard = (page: Page) => page.getByRole('region', { name: 'Tài liệu context' });
const contextSettings = (page: Page) => page.getByRole('region', { name: 'Cài đặt tài liệu context' });

// "Thiết lập tài liệu" on the overview: AgentHub's data unless a folder is given; returns where
// the documents went. AgentHub writes the empty layout there (ADR-023 item 2).
async function createDocs(page: Page, options: { folder?: string; language?: 'English' | 'Tiếng Việt' } = {}): Promise<string> {
  await openTab(page, 'Tổng quan');
  await docsCard(page).getByRole('button', { name: 'Thiết lập tài liệu' }).click();
  const dialog = page.getByRole('dialog', { name: 'Thiết lập tài liệu' });
  if (options.folder) {
    await answerFolderDialog(options.folder);
    await dialog.getByRole('radio', { name: 'Folder khác' }).click();
    await expect(dialog.getByTestId('setup-folder')).toHaveText(options.folder);
  } else {
    await dialog.getByRole('radio', { name: 'Trong AgentHub' }).click();
  }
  if (options.language) await dialog.getByRole('radio', { name: options.language }).click();
  await dialog.getByRole('button', { name: 'Tạo tài liệu' }).click();
  await expect(dialog).toBeHidden();
  const path = docsCard(page).getByTestId('context-path');
  await expect(path).toBeVisible();
  return (await path.textContent()) ?? '';
}

// ADR-023 item 6: the documents panel on the right, shown with its button.
async function openDocuments(page: Page): Promise<void> {
  await closeSettings(page);
  const toggle = page.getByRole('button', { name: 'Tài liệu', exact: true });
  if ((await toggle.getAttribute('aria-pressed')) !== 'true') await toggle.click();
  await expect(page.getByRole('complementary', { name: 'Tài liệu của project' })).toBeVisible();
}

test.beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'agenthub-e2e-')));
  userData = join(root, 'data');
  projectDir = join(root, "Dự án 'nháy' $(touch injected)");
  mkdirSync(projectDir);
  browserDir = join(root, 'browser');
  trashDir = join(root, 'trash');
  mkdirSync(trashDir);
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
  // The history waits in its own tab (ADR-020 item 2).
  await expect(page.getByText('Chưa mở project này lần nào')).toBeHidden();
  await openTab(page, 'Lịch sử');
  await expect(page.getByText('Chưa mở project này lần nào')).toBeVisible();

  const defaultFolder = await createDocs(page, { language: 'Tiếng Việt' });
  expect(defaultFolder.startsWith(join(userData, 'projects'))).toBe(true);
  // Only the layout so far: an agent has to fill it in (ADR-023 item 2).
  await expect(docsCard(page)).toContainText('Cần điền');
  await expect(docsCard(page).getByRole('button', { name: 'Nhờ agent điền tài liệu' })).toBeVisible();

  page = await restart();

  await expect(page.locator('#project-path')).toHaveText(projectDir);
  await expect(docsCard(page).getByTestId('context-path')).toHaveText(defaultFolder);
  await openTab(page, 'Cài đặt');
  await expect(contextSettings(page).getByRole('radio', { name: 'Tiếng Việt' })).toBeChecked();
  await expect(contextSettings(page).getByTestId('context-path')).toHaveText(defaultFolder);

  // AgentHub writes the empty layout in the documents' language, and nothing into the project.
  expect(readdirSync(defaultFolder).sort()).toEqual(['PROJECT_CONTEXT.md', 'README.md', 'Workstreams']);
  expect(readFileSync(join(defaultFolder, 'Workstreams', 'main', 'STATUS.md'), 'utf8')).toContain('# Chung');
  expect(readdirSync(projectDir)).toEqual([]);
  expect(existsSync(join(userData, 'artifacts'))).toBe(false);
});

test('adding a project scans its folder and asks: use the documents found, or create them in the repo (ADR-023 items 1–3)', async () => {
  const docs = join(projectDir, 'AgentContext');
  mkdirSync(join(docs, 'Playables', 'playable005', 'Tasks'), { recursive: true });
  writeFileSync(join(docs, 'README.md'), '# Context');
  writeFileSync(join(docs, 'PROJECT_CONTEXT.md'), '# Project\n\nUnity 6.\n');
  writeFileSync(join(docs, 'Playables', 'playable005', 'STATUS.md'), '# Playable 005\n');
  writeFileSync(join(docs, 'Playables', 'playable005', 'Tasks', 'TASK-016-intro.md'), '# TASK-016 Intro\n\nStatus: In progress\n\n## Handoff log\n');
  const page = await launch();

  await answerFolderDialog(projectDir);
  await page.getByRole('button', { name: 'Chọn folder' }).click();
  const dialog = addDialog(page);
  await expect(dialog).toContainText('Tìm thấy một bộ tài liệu');
  const found = dialog.getByRole('radio', { name: /^Dùng AgentContext/ });
  await expect(found).toBeChecked();
  await expect(dialog).toContainText('1 workstream · 1 task');
  // "In the repo" would collide with the set that is there; the user decides, nothing is written yet.
  await dialog.getByRole('radio', { name: /^Tạo bộ mới/ }).click();
  await expect(dialog.getByRole('radio', { name: 'Trong AgentHub' })).toBeChecked();
  await dialog.getByRole('radio', { name: 'Trong repo' }).click();
  await expect(dialog).toContainText('đã có và chứa file khác');
  await expect(dialog.getByRole('button', { name: 'Thêm project', exact: true })).toBeDisabled();
  await found.click();
  await dialog.getByRole('button', { name: 'Thêm project', exact: true }).click();

  await expect(docsCard(page)).toContainText('Sẵn sàng');
  await expect(docsCard(page).getByTestId('context-summary')).toHaveText('1 workstream · 1 task');
  await openTab(page, 'Task');
  await expect(page.getByTestId('context-task')).toContainText('TASK-016');
  await expect(page.getByRole('region', { name: 'Đang làm' })).toContainText('Intro');

  // A second project, empty: AgentContext/ goes into the repo with the layout, ready for tasks.
  const second = join(root, 'Game B');
  mkdirSync(second);
  await answerFolderDialog(second);
  await page.getByRole('button', { name: 'Thêm project', exact: true }).click();
  await expect(addDialog(page).getByRole('radio', { name: /^Tạo bộ tài liệu mới/ })).toBeChecked();
  await expect(addDialog(page).getByRole('radio', { name: 'Trong repo' })).toBeChecked();
  await addDialog(page).getByRole('button', { name: 'Thêm project', exact: true }).click();
  await expect(docsCard(page).getByTestId('context-path')).toHaveText(join(second, 'AgentContext'));
  expect(readdirSync(join(second, 'AgentContext')).sort()).toEqual(['PROJECT_CONTEXT.md', 'README.md', 'Workstreams']);
  await openTab(page, 'Task');
  await expect(page.getByRole('button', { name: 'Tạo task' })).toBeVisible();
});

test('tasks and handoffs come from the documents, and a pasted handoff lands at the top of the log', async () => {
  const page = await launch();
  await addProject(page);
  const folder = await createDocs(page);
  const ref = join('Workstreams', 'combo', 'Tasks', 'TASK-001-combo-counter.md');
  mkdirSync(join(folder, 'Workstreams', 'combo', 'Tasks'), { recursive: true });
  rmSync(join(folder, 'PROJECT_CONTEXT.md'));
  writeFileSync(join(folder, 'Workstreams', 'combo', 'STATUS.md'), '# Combo\n\n| Task | State |\n|---|---|\n| TASK-001 | in progress |\n');
  writeFileSync(join(folder, ref), '# TASK-001 Combo counter\n');

  // "Kiểm tra tài liệu" reads the files again and says what is missing from the layout.
  const card = docsCard(page);
  await card.getByRole('button', { name: 'Kiểm tra tài liệu' }).click();
  await expect(card.getByTestId('context-summary')).toHaveText('2 workstream · 1 task');
  await expect(card.getByTestId('git-observation')).toHaveText('Folder project không phải Git repo.');
  await expect(card).toContainText('Có vấn đề');
  await expect(card.getByRole('list', { name: 'Cảnh báo' })).toContainText('Tài liệu thiếu PROJECT_CONTEXT.md.');
  await expect(card.getByText('cảnh báo ở các task')).toBeVisible();
  await expect(card.getByRole('status')).toContainText('cảnh báo');

  // What AgentHub can write itself, it offers to; a file that is there stays as it is.
  await card.getByRole('button', { name: 'Tạo file còn thiếu' }).click();
  await expect(card.getByRole('list', { name: 'Cảnh báo' })).toBeHidden();
  expect(existsSync(join(folder, 'PROJECT_CONTEXT.md'))).toBe(true);
  expect(readFileSync(join(folder, ref), 'utf8')).toBe('# TASK-001 Combo counter\n');

  writeFileSync(join(folder, ref), '# TASK-001 Combo counter\n\n## Handoff log\n');
  await card.getByRole('button', { name: 'Xem ở tab Task' }).click();
  const row = page.getByTestId('context-task');
  await expect(row).toContainText('TASK-001');
  await expect(row).toContainText('Combo counter');
  await expect(page.getByRole('region', { name: 'Đang làm' })).toContainText('Combo counter');
  await expect(row).toContainText('Chưa có handoff');
  await row.click();
  const detail = page.getByRole('complementary', { name: 'Chi tiết task' });
  await detail.getByRole('button', { name: 'Làm tiếp task này' }).click();
  await expect(row).toContainText('lần mở tới');

  await openTab(page, 'Tổng quan');
  await expect(page.getByTestId('launch-task')).toContainText('TASK-001 Combo counter');

  // With documents there is no Handoff tab: the log is in the task, and so is pasting (ADR-023).
  await expect(page.getByRole('tablist', { name: 'Trang project' }).getByRole('tab', { name: 'Handoff' })).toHaveCount(0);
  // ADR-024 item 2: the checkpoint prompt is on the progress row at the top of the overview.
  await expect(page.getByTestId('progress-row')).toContainText('Chưa có checkpoint');
  await page.getByTestId('progress-row').getByRole('button', { name: 'Thêm về tiến độ' }).click();
  await expect(page.getByRole('menuitem', { name: 'Copy lời nhắc checkpoint' })).toBeVisible();
  await page.keyboard.press('Escape');
  await openTab(page, 'Task');
  await detail.getByRole('button', { name: 'Thêm handoff', exact: true }).click();
  await detail.getByLabel('Nội dung handoff').fill('### 2026-11-05 10:00 — Chat / Claude\n- **Done:** pasted');
  // The open disclosure and the submit button share the name; the submit comes last.
  await detail.getByRole('button', { name: 'Thêm handoff', exact: true }).last().click();
  await expect(detail.getByRole('status')).toHaveText('Đã thêm vào TASK-001.');
  await expect(detail.locator('.handoff-heading').first()).toHaveText('2026-11-05 10:00 — Chat / Claude');
  await expect(row).not.toContainText('Chưa có handoff');
  expect(readFileSync(join(folder, ref), 'utf8')).toBe('# TASK-001 Combo counter\n\n## Handoff log\n\n### 2026-11-05 10:00 — Chat / Claude\n- **Done:** pasted\n');
  expect(readdirSync(projectDir)).toEqual([]);
});

test('tasks are read, created, edited in place and moved between states in AgentHub, and an agent can be asked to fill one in (ADR-021, ADR-023)', async () => {
  const page = await launch();
  await addProject(page);
  const folder = await createDocs(page);
  const ref = join('Workstreams', 'combo', 'Tasks', 'TASK-001-combo-counter.md');
  mkdirSync(join(folder, 'Workstreams', 'combo', 'Tasks'), { recursive: true });
  writeFileSync(join(folder, 'PROJECT_CONTEXT.md'), '# Project\n\nUnity.\n');
  writeFileSync(join(folder, 'Workstreams', 'combo', 'STATUS.md'), '# Combo\n\n| Task | State |\n|---|---|\n| TASK-001 | in progress |\n');
  writeFileSync(join(folder, ref), '# TASK-001 Combo counter\n\n## Goal\n\nCount **combos**.\n\n## Risks\n\nKeep me.\n\n## Handoff log\n\n### 2026-11-05 10:00 — B / Codex\n- **Done:** counter\n');
  await docsCard(page).getByRole('button', { name: 'Kiểm tra tài liệu' }).click();

  await openTab(page, 'Task');
  await page.getByTestId('context-task').filter({ hasText: 'TASK-001' }).click();
  const detail = page.getByRole('complementary', { name: 'Chi tiết task' });
  await expect(detail.getByRole('heading', { name: 'TASK-001 Combo counter' })).toBeVisible();
  await expect(detail.getByRole('region', { name: 'Mục tiêu' }).locator('.markdown strong')).toHaveText('combos');
  // The handoff log is a timeline, newest first.
  await expect(detail.locator('.handoff-heading').first()).toHaveText('2026-11-05 10:00 — B / Codex');

  // Create, then the list, the file and STATUS show it as To do.
  await page.getByRole('button', { name: 'Tạo task' }).click();
  const dialog = page.getByRole('dialog', { name: 'Tạo task' });
  await dialog.getByLabel('Tên task').fill('Hiện combo');
  await dialog.getByLabel('Mục tiêu').fill('Show the combo count.');
  await dialog.getByRole('button', { name: 'Tạo task', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('region', { name: 'Cần làm' })).toContainText('Hiện combo');
  const created = join(folder, 'Workstreams', 'combo', 'Tasks', 'TASK-002-hien-combo.md');
  expect(readFileSync(created, 'utf8')).toBe('# TASK-002 Hiện combo\n\nStatus: To do\n\n## Goal\n\nShow the combo count.\n\n## Acceptance criteria\n\n## Notes\n\n## Handoff log\n');
  expect(readFileSync(join(folder, 'Workstreams', 'combo', 'STATUS.md'), 'utf8')).toContain('| TASK-002 Hiện combo | To do |');

  // A section the task lacks is added in place; a criterion is ticked straight into the file.
  await page.getByTestId('context-task').filter({ hasText: 'TASK-001' }).click();
  await detail.getByRole('button', { name: '+ Thêm Acceptance criteria' }).click();
  await detail.getByLabel('Tiêu chí 1', { exact: true }).fill('Shows x2 after two hits');
  await detail.getByRole('button', { name: 'Lưu' }).click();
  await expect(detail.getByRole('checkbox', { name: 'Shows x2 after two hits' })).not.toBeChecked();
  await detail.getByRole('checkbox', { name: 'Shows x2 after two hits' }).check();
  await expect(detail.getByRole('checkbox', { name: 'Shows x2 after two hits' })).toBeChecked();
  expect(readFileSync(join(folder, ref), 'utf8')).toBe(
    '# TASK-001 Combo counter\n\n## Goal\n\nCount **combos**.\n\n## Risks\n\nKeep me.\n\n## Acceptance criteria\n\n- [x] Shows x2 after two hits\n\n## Handoff log\n\n### 2026-11-05 10:00 — B / Codex\n- **Done:** counter\n',
  );
  await expect(page.getByTestId('context-task').filter({ hasText: 'TASK-001' })).toContainText('1/1');

  // A change from outside while editing stops the save until the user reloads.
  await detail.getByRole('button', { name: 'Sửa Mục tiêu' }).click();
  await detail.getByRole('textbox', { name: 'Mục tiêu' }).fill('Mine');
  writeFileSync(join(folder, ref), `${readFileSync(join(folder, ref), 'utf8')}\n### 2026-11-06 10:00 — Claude\n- agent was here\n`);
  await expect(detail.getByRole('alert')).toContainText('vừa bị sửa bên ngoài');
  await expect(detail.getByRole('button', { name: 'Lưu' })).toBeDisabled();
  await detail.getByRole('button', { name: 'Tải lại' }).click();
  await expect(detail.getByText('agent was here')).toBeVisible();
  expect(readFileSync(join(folder, ref), 'utf8')).not.toContain('Mine');

  // Done writes the state in the task file and STATUS, and the user's confirmation.
  await detail.getByRole('button', { name: 'Trạng thái' }).click();
  await page.getByRole('menuitemradio', { name: 'Xong' }).click();
  await page.getByRole('button', { name: /^Xong/ }).click();
  await expect(page.getByRole('region', { name: 'Xong' })).toContainText('Combo counter');
  expect(readFileSync(join(folder, 'Workstreams', 'combo', 'STATUS.md'), 'utf8')).toContain('| TASK-001 | Done |');
  expect(readFileSync(join(folder, ref), 'utf8')).toMatch(/^# TASK-001 Combo counter\n\nStatus: Done\n\n## Goal/);
  expect(readFileSync(join(folder, ref), 'utf8')).toMatch(/## Handoff log\n\n### \d{4}-\d{2}-\d{2} \d{2}:\d{2}[+-]\d{4} — AgentHub\n- \*\*Verified by user in AgentHub:\*\* marked Done\./);

  // The board shows the same tasks in four columns.
  await page.getByRole('radio', { name: 'Bảng' }).click();
  await expect(page.getByRole('region', { name: 'Cần làm' })).toContainText('Hiện combo');
  // Long titles wrap inside their card; no card is wider than its column.
  expect(await page.locator('.board-cards').evaluateAll((lists) => lists.some((list) => list.scrollWidth > list.clientWidth + 1))).toBe(false);

  // A new workstream sits beside the others.
  await page.getByRole('button', { name: 'Workstream mới' }).click();
  await page.getByRole('dialog', { name: 'Workstream mới' }).getByLabel('Tên workstream').fill('Shop UI');
  await page.getByRole('dialog', { name: 'Workstream mới' }).getByRole('button', { name: 'Tạo task' }).click();
  expect(existsSync(join(folder, 'Workstreams', 'shop-ui', 'STATUS.md'))).toBe(true);

  // Asking an agent opens an account the usual way; nothing runs in the background.
  await detail.getByRole('button', { name: 'Nhờ agent viết tiêu chí' }).click();
  const ask = detail.getByRole('group', { name: 'Nhờ agent viết tiêu chí' });
  await expect(ask.getByText('Chưa có account nào. Thêm account để mở project này.')).toBeVisible();
});

test('the documents panel shows every Markdown file as a tree, reads, edits and creates them, and shows what an agent writes (ADR-023 item 6)', async () => {
  const page = await launch();
  await addProject(page);
  const folder = await createDocs(page);
  writeFileSync(join(folder, 'README.md'), '# Context\n\n| File | Use |\n|---|---|\n| STATUS | entry |\n\n<script>window.hacked = true</script>\n');

  await openDocuments(page);
  const panel = page.getByRole('complementary', { name: 'Tài liệu của project' });
  const files = panel.getByRole('tree', { name: 'Các file tài liệu' });
  // Folders start closed, except the workstreams; they open and close on a click.
  await expect(files.getByRole('treeitem', { name: 'STATUS.md' })).toBeVisible();
  await files.getByRole('treeitem', { name: 'main' }).getByRole('button').first().click();
  await expect(files.getByRole('treeitem', { name: 'STATUS.md' })).toBeHidden();
  await panel.getByRole('searchbox', { name: 'Lọc file' }).fill('status');
  await expect(files.getByRole('treeitem', { name: 'STATUS.md' })).toBeVisible();
  await expect(files.getByRole('treeitem', { name: 'README.md' })).toBeHidden();
  await panel.getByRole('searchbox', { name: 'Lọc file' }).fill('');

  await files.getByRole('treeitem', { name: 'README.md' }).getByRole('button').click();
  const viewer = panel.getByRole('region', { name: 'Nội dung tài liệu' });
  await expect(viewer.getByRole('heading', { name: 'Context' })).toBeVisible();
  await expect(viewer.getByRole('table')).toContainText('entry');
  // HTML in a document is text, never markup.
  await expect(viewer.getByText('<script>window.hacked = true</script>')).toBeVisible();
  expect(await page.evaluate(() => (globalThis as unknown as { hacked?: boolean }).hacked)).toBeUndefined();

  // An agent writing the file shows up without a click.
  writeFileSync(join(folder, 'README.md'), '# Context v2\n');
  await expect(viewer.getByRole('heading', { name: 'Context v2' })).toBeVisible();

  await viewer.getByRole('button', { name: 'Sửa', exact: true }).click();
  await viewer.getByLabel('Nội dung Markdown').fill('# Context v3\n\nEdited in AgentHub.\n');
  await viewer.getByRole('button', { name: 'Lưu' }).click();
  await expect(viewer.getByText('Edited in AgentHub.')).toBeVisible();
  expect(readFileSync(join(folder, 'README.md'), 'utf8')).toBe('# Context v3\n\nEdited in AgentHub.\n');

  await panel.getByRole('button', { name: 'Tài liệu mới' }).click();
  const dialog = page.getByRole('dialog', { name: 'Tài liệu mới' });
  await dialog.getByLabel('Đường dẫn trong folder tài liệu').fill('Notes/ý tưởng');
  await dialog.getByRole('button', { name: 'Tạo' }).click();
  await expect(viewer.getByTestId('document-path')).toHaveText('Notes/ý tưởng.md');
  expect(readFileSync(join(folder, 'Notes', 'ý tưởng.md'), 'utf8')).toBe('# ý tưởng\n');

  // A name that exists is refused, nothing is overwritten.
  await panel.getByRole('button', { name: 'Tài liệu mới' }).click();
  await dialog.getByLabel('Đường dẫn trong folder tài liệu').fill('README.md');
  await dialog.getByRole('button', { name: 'Tạo' }).click();
  await expect(page.getByRole('alert').first()).toContainText('đã có');
  expect(readFileSync(join(folder, 'README.md'), 'utf8')).toBe('# Context v3\n\nEdited in AgentHub.\n');
  await dialog.getByRole('button', { name: 'Huỷ' }).click();

  // The panel stays on every tab, hides with ⌘⇧E and remembers that.
  await openTab(page, 'Lịch sử');
  await expect(panel).toBeVisible();
  await page.keyboard.press('Meta+Shift+E');
  await expect(panel).toBeHidden();
  const again = await restart();
  await expect(again.getByRole('complementary', { name: 'Tài liệu của project' })).toBeHidden();
});

test('a project without documents keeps pasted handoffs, newest first, and a loose chat can move into it', async () => {
  const page = await launch();
  await addProject(page);

  await openTab(page, 'Task');
  await expect(page.getByRole('button', { name: 'Thiết lập tài liệu' })).toBeVisible();

  await openTab(page, 'Handoff');
  const handoffs = page.getByRole('region', { name: 'Handoff', exact: true });
  await expect(handoffs.getByText('Chưa có handoff nào.')).toBeVisible();
  await handoffs.getByRole('button', { name: 'Copy lời nhắc tóm tắt' }).click();
  await expect(handoffs.getByRole('button', { name: 'Đã copy' })).toBeVisible();
  expect(await app?.evaluate(({ clipboard }) => clipboard.readText())).toContain('context_save_handoff');

  await handoffs.getByRole('button', { name: 'Thêm handoff' }).click();
  await handoffs.getByLabel('Tiêu đề handoff').fill('Đợt 1');
  await handoffs.getByLabel('Nội dung handoff').fill('- **Done:** pasted');
  await handoffs.getByRole('button', { name: 'Lưu handoff' }).click();
  const first = handoffs.getByTestId('project-handoff').first();
  await expect(first).toContainText('Đợt 1');
  await expect(first).toContainText('Mới nhất');
  await first.getByRole('button').click();
  await expect(first).toContainText('- **Done:** pasted');

  // Each loose chat is its own entry in the sidebar (ADR-020 item 2), under its own switch.
  await tree(page).getByRole('radio', { name: 'Chat' }).click();
  await expect(tree(page).getByText('Chưa có chat nào.')).toBeVisible();
  await tree(page).getByRole('button', { name: 'Thêm chat' }).click();
  await page.getByLabel('Tiêu đề chat').fill('Ý tưởng combo');
  await page.getByLabel('Nội dung chat').fill('Combo reset sau 2 giây');
  await page.getByRole('button', { name: 'Lưu chat' }).click();
  const entry = tree(page).getByTestId('loose-chat');
  await expect(entry).toHaveText('Ý tưởng combo');
  await expect(entry).toHaveAttribute('aria-current', 'true');
  await expect(page.getByRole('heading', { name: 'Ý tưởng combo' })).toBeVisible();
  await expect(page.getByText('Combo reset sau 2 giây')).toBeVisible();

  await page.getByRole('button', { name: 'Copy lời nhắc làm tiếp' }).click();
  expect(await app?.evaluate(({ clipboard }) => clipboard.readText())).toContain('context_loose_chats');
  await page.getByLabel('Project đích').click();
  await page.getByRole('menuitemradio', { name: /Dự án/ }).click();
  await page.getByRole('button', { name: 'Chuyển vào project' }).click();

  // The app goes to the project the chat went into.
  await expect(page.locator('#project-path')).toHaveText(projectDir);
  await expect(tree(page).getByRole('radio', { name: 'Project' })).toBeChecked();
  await tree(page).getByRole('radio', { name: 'Chat' }).click();
  await expect(tree(page).getByText('Chưa có chat nào.')).toBeVisible();
  await openTab(page, 'Handoff');
  await expect(handoffs.getByTestId('project-handoff').first()).toContainText('Ý tưởng combo');
  expect(readdirSync(projectDir)).toEqual([]);
});

test('the context documents can live in a folder the user chooses, go back to the default, and stop without losing files', async () => {
  const page = await launch();
  await addProject(page);
  const chosen = join(root, 'Tài liệu chung');
  mkdirSync(chosen);

  expect(await createDocs(page, { folder: chosen })).toBe(chosen);

  await openTab(page, 'Cài đặt');
  const settings = contextSettings(page);
  await expect(settings.getByText('Folder bạn chọn')).toBeVisible();
  await settings.getByRole('button', { name: 'Dùng mặc định' }).click();
  // The layout AgentHub wrote is there, so it asks first; the files stay where they are.
  await page.getByRole('dialog', { name: 'Chuyển tài liệu' }).getByRole('button', { name: 'Không chuyển' }).click();
  await expect(settings.getByTestId('context-path')).not.toHaveText(chosen);
  const defaultFolder = (await settings.getByTestId('context-path').textContent()) ?? '';
  expect(defaultFolder.startsWith(join(userData, 'projects'))).toBe(true);

  await answerFolderDialog(chosen);
  await settings.getByRole('button', { name: 'Chọn folder khác' }).click();
  await expect(settings.getByTestId('context-path')).toHaveText(chosen);

  writeFileSync(join(chosen, 'README.md'), '# Context');
  page.once('dialog', (dialog) => void dialog.accept());
  await settings.getByRole('button', { name: 'Ngừng dùng tài liệu' }).click();
  await expect(settings.getByTestId('context-path')).toBeHidden();
  await openTab(page, 'Tổng quan');
  await expect(docsCard(page).getByRole('button', { name: 'Thiết lập tài liệu' })).toBeVisible();
  expect(readdirSync(chosen).sort()).toEqual(['PROJECT_CONTEXT.md', 'README.md', 'Workstreams']);
});

test('changing where the documents live asks first, moves them, and puts AgentHub\'s copy in the Trash', async () => {
  const page = await launch();
  await addProject(page);
  const defaultFolder = await createDocs(page);
  writeFileSync(join(defaultFolder, 'README.md'), '# Context');
  const chosen = join(root, 'Tài liệu chung');
  mkdirSync(chosen);

  await openTab(page, 'Cài đặt');
  await answerFolderDialog(chosen);
  await contextSettings(page).getByRole('button', { name: 'Chọn folder khác' }).click();
  const ask = page.getByRole('dialog', { name: 'Chuyển tài liệu' });
  await expect(ask).toContainText(/có \d+ file/);
  await ask.getByRole('button', { name: 'Chuyển', exact: true }).click();

  await expect(contextSettings(page).getByTestId('context-path')).toHaveText(chosen);
  await expect(contextSettings(page).getByRole('status')).toContainText('Thùng rác');
  expect(readFileSync(join(chosen, 'README.md'), 'utf8')).toBe('# Context');
  expect(existsSync(defaultFolder)).toBe(false);
  expect(readdirSync(trashDir)).toHaveLength(1);
});

test('a project folder that moved can be relinked without losing its context settings', async () => {
  let page = await launch();
  await addProject(page);
  await createDocs(page);

  await quit();
  const moved = join(root, 'đã chuyển chỗ');
  renameSync(projectDir, moved);
  page = await launch();

  await expect(page.getByText('Không tìm thấy folder của project')).toBeVisible();
  await answerFolderDialog(moved);
  await page.getByRole('button', { name: 'Chọn lại folder' }).click();

  await expect(page.locator('#project-path')).toHaveText(moved);
  await expect(page.getByText('Không tìm thấy folder của project')).toBeHidden();
  await expect(docsCard(page).getByRole('button', { name: 'Nhờ agent điền tài liệu' })).toBeVisible();
});

test('the same folder cannot be added twice', async () => {
  const page = await launch();
  await addProject(page);

  await answerFolderDialog(projectDir);
  await page.getByRole('button', { name: 'Thêm project', exact: true }).click();

  await expect(addDialog(page).getByRole('alert')).toContainText('đã được thêm');
  await expect(addDialog(page).getByRole('button', { name: 'Thêm project', exact: true })).toBeDisabled();
  await expect(tree(page).getByRole('button', { name: /Dự án/ })).toHaveCount(1);
});

test('renaming and removing a project leaves its folder alone', async () => {
  const page = await launch();
  await addProject(page);

  await openTab(page, 'Cài đặt');
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

const accounts = (page: Page) => page.getByRole('region', { name: 'Account', exact: true });
// One per account: each row also lists its usage windows, which are list items too.
const accountRows = (page: Page) => accounts(page).locator('.settings-list > li');

async function addAccount(page: Page, kind: 'Claude' | 'Codex'): Promise<void> {
  await settings(page, 'Account');
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
  await settings(page, 'Nâng cao');
  const field = page.getByLabel(label);
  await field.fill(path);
  await field.blur();
  await expect(field).toHaveValue(path);
  await closeSettings(page);
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
# The user-scope MCP config, written where the real CLI keeps it for an account's own folder.
if [ "$1" = "mcp" ] && [ "$2" = "add-json" ]; then printf '{"mcpServers":{"%s":%s}}' "$5" "$6" > "$state/.claude.json"; exit 0; fi
if [ "$1" = "mcp" ] && [ "$2" = "remove" ]; then printf '{"mcpServers":{}}' > "$state/.claude.json"; exit 0; fi
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
  await closeSettings(page);
  await tree(page).getByRole('radio', { name: 'Project' }).click();
  await tree(page).getByRole('button', { name: /Dự án/ }).click();
}

test('a machine login is only used after asking, and accounts go by their email', async () => {
  let page = await launch();
  await setCli(page, 'Claude CLI', fakeClaude());

  await settings(page, 'Account');
  await accounts(page).getByRole('button', { name: 'Thêm account' }).click();
  await page.getByRole('menuitem', { name: 'Claude', exact: true }).click();
  const offer = accounts(page).getByRole('group', { name: 'Thêm account nào?' });
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
  // ADR-024 item 5: every account is a row with its limits and one button.
  const launchList = page.getByRole('list', { name: 'Mở project bằng account' });
  await expect(launchList.getByRole('listitem').filter({ hasText: 'someone@example.com' })).toContainText('Claude · App chính');
  await expect(launchList.getByRole('button', { name: 'Mở someone@example.com bằng Desktop' })).toBeVisible();

  page = await restart();
  await settings(page, 'Account');
  await expect(accounts(page).getByTestId('account-identity')).toHaveText('someone@example.com');
});

test('another account signs in through a private window and shows up under its own email', async () => {
  const page = await launch();
  await setCli(page, 'Claude CLI', fakeClaude());

  await settings(page, 'Account');
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
  await expect(tree(page).getByTestId('usage-chip')).toHaveText('Tuần 91%');

  writeFileSync(join(root, 'machine-claude', 'used'), '100');
  await usage.getByRole('button', { name: 'Làm mới' }).click();
  await expect(usage.getByRole('meter', { name: 'Phiên 5 giờ: đã dùng 100%' })).toBeVisible();
  await expect(usage.getByRole('status')).toContainText('đã hết hạn mức');
});

test('cancelling a sign-in cancels adding the account', async () => {
  const page = await launch();
  await setCli(page, 'Claude CLI', fakeClaude(null));

  await settings(page, 'Account');
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

  await settings(page, 'Account');
  await accounts(page).getByRole('button', { name: 'Thêm account' }).click();
  await page.getByRole('menuitem', { name: 'Claude', exact: true }).click();
  await expect(accounts(page).getByRole('group', { name: 'Đang đăng nhập' })).toBeVisible();

  await openProject(page);
  await settings(page, 'Account');

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

  await openWithTerminal(page);
  const decision = page.getByRole('dialog', { name: 'Trước khi mở' });
  await expect(decision.getByText('Agent của account này sẽ đọc được source code')).toBeVisible();

  await decision.getByRole('button', { name: 'Không cho phép' }).click();
  await expect(decision.getByText('không được phép dùng project')).toBeVisible();
  await expect(decision.getByRole('button', { name: 'Mở', exact: true })).toHaveCount(0);

  await decision.getByRole('button', { name: 'Đổi thành cho phép' }).click();
  await expect(decision.getByText('không được phép dùng project')).toBeHidden();

  await decision.getByRole('button', { name: 'Huỷ' }).click();
  await expect(decision).toBeHidden();
});

test('opening never installs tools into the main account; the plan points to Agent tools instead (ADR-020 item 1)', async () => {
  const page = await launch();
  await setCli(page, 'Claude CLI', fakeClaude());
  await addAccount(page, 'Claude');
  await addProject(page);
  await createDocs(page);

  await openWithTerminal(page);
  const decision = page.getByRole('dialog', { name: 'Trước khi mở' });
  await decision.getByRole('button', { name: 'Cho phép', exact: true }).click();

  // Skills already linked by an earlier run on this machine are not named again; MCP always is.
  await expect(decision).toContainText(/chưa có .*MCP "agenthub".*Công cụ agent/);
  await expect(decision.getByRole('checkbox')).toHaveCount(0);
  await expect(decision.getByRole('button', { name: 'Mở mà không cài' })).toHaveCount(0);
  await expect(decision.getByRole('button', { name: 'Mở', exact: true })).toBeEnabled();

  // This test stops before opening, and never installs into the machine's real config.
  await decision.getByRole('button', { name: 'Mở Công cụ agent' }).click();
  const tools = page.getByRole('region', { name: 'Công cụ agent' });
  await expect(tools).toBeInViewport();
  await expect(tools.getByRole('checkbox', { name: 'Tự cài khi mở cho someone@example.com' })).not.toBeChecked();
});

// ADR-024 item 7: an account opens the way it was opened last; the arrow offers the other way.
async function openWithTerminal(page: Page): Promise<void> {
  const list = page.getByRole('list', { name: 'Mở project bằng account' });
  const main = list.getByRole('button', { name: /^Mở .* bằng Terminal$/ }).first();
  await expect(list.getByRole('button', { name: /^Cách mở khác cho / }).first()).toBeVisible();
  if (await main.isVisible()) {
    await main.click();
    return;
  }
  await list.getByRole('button', { name: /^Cách mở khác cho / }).first().click();
  await page.getByRole('menuitem', { name: 'Mở bằng Terminal' }).click();
}

async function addSeparateClaude(page: Page, email: string): Promise<string> {
  await settings(page, 'Account');
  await accounts(page).getByRole('button', { name: 'Thêm account' }).click();
  await page.getByRole('menuitem', { name: 'Claude', exact: true }).click();
  await accounts(page).getByRole('button', { name: 'Đăng nhập account khác' }).click();
  await expect(accountRows(page).first().getByRole('group', { name: 'Đang đăng nhập' })).toBeVisible();
  approveLogin(email);
  await expect(accountRows(page).first().getByTestId('account-identity')).toHaveText(email);
  const [id] = readdirSync(join(userData, 'accounts'));
  return join(userData, 'accounts', id as string, 'cli');
}

test('agent tools are installed and removed per account, and a skill of your own goes to the accounts you pick (ADR-020 item 1)', async () => {
  let page = await launch();
  await setCli(page, 'Claude CLI', fakeClaude());
  const email = 'second@example.com';
  const folder = await addSeparateClaude(page, email);
  await settings(page, 'Công cụ agent');
  // Read from the current page, as a restart opens a new one.
  const toolsOf = () => page.getByRole('region', { name: 'Công cụ agent' });
  // ADR-023 item 8: a state is words beside the tool, the action a button, removing in the menu.
  const cell = (tool: string) => toolsOf().getByLabel(`${tool} · ${email}:`);
  const more = (tool: string) => toolsOf().getByRole('button', { name: `Thao tác khác cho ${tool} · ${email}` });
  const remove = async (tool: string): Promise<void> => {
    await more(tool).click();
    await page.getByRole('menuitem', { name: `Gỡ ${tool} khỏi ${email}` }).click();
  };
  let tools = toolsOf();

  await expect(cell('context-init')).toContainText('Chưa cài');
  await expect(tools.getByRole('checkbox', { name: `Tự cài khi mở cho ${email}` })).toBeChecked();

  await tools.getByRole('button', { name: `Cài context-init cho ${email}` }).click();
  await expect(cell('context-init')).toContainText('Đã cài');
  await expect(cell('context-resume')).toContainText('Chưa cài');
  expect(realpathSync(join(folder, 'skills', 'context-init'))).toBe(join(userData, 'skills', 'context-init'));

  await tools.getByRole('button', { name: `Cài MCP "agenthub" cho ${email}` }).click();
  await expect(cell('MCP "agenthub"')).toContainText('Đã cài');
  expect(readFileSync(join(folder, '.claude.json'), 'utf8')).toContain('agenthub-mcp');
  await remove('MCP "agenthub"');
  await expect(cell('MCP "agenthub"')).toContainText('Chưa cài');

  await remove('context-init');
  await expect(cell('context-init')).toContainText('Chưa cài');
  expect(existsSync(join(folder, 'skills', 'context-init'))).toBe(false);

  // A folder of the user's own under the same name is shown, never touched.
  mkdirSync(join(folder, 'skills', 'context-resume'), { recursive: true });
  // Saved first, then shown: the box changes once Main answers.
  await tools.getByRole('checkbox', { name: `Tự cài khi mở cho ${email}` }).click();
  await expect(tools.getByRole('checkbox', { name: `Tự cài khi mở cho ${email}` })).not.toBeChecked();
  page = await restart();
  await settings(page, 'Công cụ agent');
  tools = toolsOf();
  await expect(tools.getByRole('checkbox', { name: `Tự cài khi mở cho ${email}` })).not.toBeChecked();
  await expect(cell('context-resume')).toContainText('Trùng tên');
  await expect(more('context-resume')).toHaveCount(0);

  // A folder without SKILL.md is refused with the reason.
  mkdirSync(join(root, 'not-a-skill'));
  await answerFolderDialog(join(root, 'not-a-skill'));
  await tools.getByRole('button', { name: 'Thêm skill riêng…' }).click();
  await expect(page.getByRole('alert')).toContainText('không có SKILL.md');

  const mine = join(root, 'skills của tôi', 'review-scene');
  mkdirSync(mine, { recursive: true });
  writeFileSync(join(mine, 'SKILL.md'), '---\nname: review-scene\ndescription: Kiểm tra scene Unity trước khi commit.\n---\n# Review\n');
  await answerFolderDialog(mine);
  await tools.getByRole('button', { name: 'Thêm skill riêng…' }).click();
  await expect(tools.getByRole('listitem').filter({ hasText: 'review-scene' })).toContainText('Kiểm tra scene Unity');
  await tools.getByRole('button', { name: `Cài review-scene cho ${email}` }).click();
  await expect(cell('review-scene')).toContainText('Đã cài');
  expect(readFileSync(join(folder, 'skills', 'review-scene', 'SKILL.md'), 'utf8')).toContain('name: review-scene');

  await more('review-scene').click();
  await page.getByRole('menuitem', { name: 'Xoá review-scene khỏi AgentHub' }).click();
  await expect(tools.getByRole('listitem').filter({ hasText: 'review-scene' })).toHaveCount(0);
  expect(existsSync(join(folder, 'skills', 'review-scene'))).toBe(false);
  expect(existsSync(mine)).toBe(true);
});

test('a skill can be read in the app, shows what an app update changed, and a skill of your own updates from its folder (ADR-026)', async () => {
  // The copy an older app left behind, before context-resume changed.
  mkdirSync(join(userData, 'skills', 'context-resume'), { recursive: true });
  writeFileSync(join(userData, 'skills', 'context-resume', 'SKILL.md'), '---\nname: context-resume\ndescription: Old.\n---\n# context-resume\nOld rule.\n');
  let page = await launch();
  await setCli(page, 'Claude CLI', fakeClaude());
  const email = 'second@example.com';
  const folder = await addSeparateClaude(page, email);
  await settings(page, 'Công cụ agent');
  const toolsOf = () => page.getByRole('region', { name: 'Công cụ agent' });
  const rowOf = (name: string) => toolsOf().getByRole('listitem').filter({ hasText: name });
  const viewer = (name: string) => page.getByRole('dialog', { name: `Skill ${name}` });

  await expect(rowOf('context-resume')).toContainText('Đã cập nhật');
  await expect(rowOf('context-init')).not.toContainText('Đã cập nhật');
  await toolsOf().getByRole('button', { name: 'Xem skill context-resume' }).click();
  await expect(viewer('context-resume').getByRole('tab', { name: 'Thay đổi' })).toHaveAttribute('aria-selected', 'true');
  await expect(viewer('context-resume').getByRole('tabpanel', { name: 'Thay đổi' })).toContainText('- Old rule.');
  await expect(viewer('context-resume').getByRole('button', { name: /references\/document-layout\.md/ })).toContainText('mới');
  await page.screenshot({ path: join(process.env['AGENTHUB_E2E_SHOTS'] ?? root, 'skill-viewer-update.png'), animations: 'disabled' });
  await viewer('context-resume').getByRole('button', { name: 'Đánh dấu đã xem' }).click();
  await expect(viewer('context-resume')).toBeHidden();
  await expect(rowOf('context-resume')).not.toContainText('Đã cập nhật');

  // A shipped skill read as the account gets it: its own steps and the shared rules.
  await toolsOf().getByRole('button', { name: 'Xem skill context-recover' }).click();
  await expect(viewer('context-recover').getByRole('button', { name: /scripts\/transcript-digest\.sh/ })).toBeVisible();
  await expect(viewer('context-recover')).toContainText('context-recover');
  // Escape closes the viewer only, not Settings under it.
  await page.keyboard.press('Escape');
  await expect(viewer('context-recover')).toBeHidden();
  await expect(toolsOf()).toBeVisible();

  const mine = join(root, 'skills của tôi', 'review-scene');
  mkdirSync(mine, { recursive: true });
  writeFileSync(join(mine, 'SKILL.md'), '---\nname: review-scene\ndescription: Kiểm tra scene.\n---\n# Review\nStep one.\n');
  await answerFolderDialog(mine);
  await toolsOf().getByRole('button', { name: 'Thêm skill riêng…' }).click();
  await toolsOf().getByRole('button', { name: `Cài review-scene cho ${email}` }).click();
  await expect(toolsOf().getByLabel(`review-scene · ${email}:`)).toContainText('Đã cài');

  writeFileSync(join(mine, 'SKILL.md'), '---\nname: review-scene\ndescription: Kiểm tra scene.\n---\n# Review\nStep one.\nStep two.\n');
  page = await restart();
  await settings(page, 'Công cụ agent');
  await expect(rowOf('review-scene')).toContainText('Folder gốc đã đổi');
  await toolsOf().getByRole('button', { name: 'Xem skill review-scene' }).click();
  await expect(viewer('review-scene').getByRole('tabpanel', { name: 'Thay đổi' })).toContainText('+ Step two.');
  await page.screenshot({ path: join(process.env['AGENTHUB_E2E_SHOTS'] ?? root, 'skill-viewer-source.png'), animations: 'disabled' });
  await viewer('review-scene').getByRole('button', { name: 'Cập nhật từ folder gốc' }).click();
  await expect(rowOf('review-scene')).not.toContainText('Folder gốc đã đổi');
  expect(readFileSync(join(folder, 'skills', 'review-scene', 'SKILL.md'), 'utf8')).toContain('Step two.');
});

test('the MCP page shows how the server runs, installs it per account and checks the connection the way the account would', async () => {
  const page = await launch();
  await setCli(page, 'Claude CLI', fakeClaude());
  const email = 'second@example.com';
  const folder = await addSeparateClaude(page, email);
  await settings(page, 'Công cụ agent');
  await page.getByRole('region', { name: 'Công cụ agent' }).getByRole('button', { name: 'Chi tiết MCP server agenthub' }).click();
  await expect(page.getByRole('heading', { name: 'MCP server agenthub' })).toBeVisible();

  const tools = page.getByRole('region', { name: 'Tool agent dùng được' });
  await expect(tools).toContainText('context_projects');
  await expect(tools).toContainText('Ghi cả một tài liệu');
  await expect(page.getByTestId('mcp-command')).toHaveText(join(userData, 'bin', 'agenthub-mcp'));

  const account = page.getByRole('region', { name: 'Theo account' }).getByRole('listitem', { name: email });
  await expect(account).toContainText('Chưa cài');
  await account.getByRole('button', { name: 'Cài', exact: true }).click();
  await expect(account).toContainText('Đã cài');
  await expect(account).toContainText('thoát rồi mở lại');
  expect(readFileSync(join(folder, '.claude.json'), 'utf8')).toContain('agenthub-mcp');

  // The real shim, run with the app binary in Node mode, as the account's client would.
  await account.getByRole('button', { name: `Thử kết nối cho ${email}` }).click();
  await expect(account.getByRole('status')).toContainText('Kết nối được · 8 tool', { timeout: 15_000 });
  await expect(account.getByRole('status')).toContainText('Chưa thấy project nào');
  await expect(page.getByTestId('mcp-log')).toContainText('agenthub-check');

  await account.getByRole('button', { name: 'Gỡ', exact: true }).click();
  await expect(account).toContainText('Chưa cài');
  await settings(page, 'Công cụ agent');
  await expect(page.getByRole('region', { name: 'Công cụ agent' })).toBeVisible();
});

test('the overview says whether the work is saved, and switching accounts takes one dialog (ADR-024)', async () => {
  const page = await launch();
  await setCli(page, 'Claude CLI', fakeClaude());
  await addAccount(page, 'Claude');
  await addProject(page);
  const folder = await createDocs(page);
  const row = page.getByTestId('progress-row');
  await expect(row).toContainText('Chưa có checkpoint');

  // An agent writes a checkpoint; the row reads it back when the window regains focus.
  writeFileSync(join(folder, 'Workstreams', 'main', 'Tasks', 'TASK-001-combo.md'), '# TASK-001 Combo\n\nStatus: In progress\n\n## Handoff log\n\n### 2026-11-09 17:40+0700 — Claude B / Claude Code\n- **Done:** counter\n');
  await page.evaluate('window.dispatchEvent(new Event("focus"))');
  await expect(row).toContainText('Đã lưu');
  await expect(row).toContainText('Claude B / Claude Code · TASK-001 Combo');

  // The accounts list their limits; the fake CLI reports 40% of the week.
  const launchList = page.getByRole('list', { name: 'Mở project bằng account' });
  await expect(launchList.getByRole('listitem').filter({ hasText: 'someone@example.com' })).toContainText('Sẵn sàng');
  await page.screenshot({ path: join(process.env['AGENTHUB_E2E_SHOTS'] ?? root, 'progress-overview.png'), animations: 'disabled' });

  await row.getByRole('button', { name: 'Chuyển sang account khác' }).click();
  const dialog = page.getByRole('dialog', { name: 'Chuyển sang account khác' });
  await expect(dialog).toContainText('Mọi thứ đã được lưu');
  await expect(dialog.getByRole('radio', { name: /someone@example\.com/ })).toBeChecked();
  await page.screenshot({ path: join(process.env['AGENTHUB_E2E_SHOTS'] ?? root, 'switch-dialog.png'), animations: 'disabled' });
  await dialog.getByRole('button', { name: 'Mở someone@example.com' }).click();
  await expect(dialog).toBeHidden();
  // The first launch of an account in a project still asks; nothing opens in this test.
  const decision = page.getByRole('dialog', { name: 'Trước khi mở' });
  await expect(decision).toContainText('Agent của account này sẽ đọc được source code');
  await decision.getByRole('button', { name: 'Huỷ' }).click();

  // ADR-024 item 4: the answer about transcripts is kept per project.
  await openTab(page, 'Cài đặt');
  const consent = page.getByRole('radiogroup', { name: 'Transcript của phiên trước' });
  await expect(consent.getByRole('radio', { name: 'Hỏi mỗi lần' })).toBeChecked();
  await consent.getByRole('radio', { name: 'Luôn cho phép trong cùng provider' }).click();
  await openTab(page, 'Tổng quan');
  await openTab(page, 'Cài đặt');
  await expect(consent.getByRole('radio', { name: 'Luôn cho phép trong cùng provider' })).toBeChecked();
});

test('a missing CLI blocks the Terminal launch with a clear reason', async () => {
  const page = await launch();
  await addProject(page);
  await setCli(page, 'Claude CLI', join(root, 'không có claude'));
  await addAccount(page, 'Claude');
  await openProject(page);

  await openWithTerminal(page);
  const decision = page.getByRole('dialog', { name: 'Trước khi mở' });
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
  await settings(page, 'Nâng cao');
  await expect(page.locator('#schema-version')).toHaveText('7');
  await settings(page, 'Chung');

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
  await settings(page, 'Chung');
  await expect(page.getByRole('radiogroup', { name: 'Giao diện' }).getByRole('radio', { name: 'Tối' })).toBeChecked();
});

test('the interface language changes every text at once and survives a restart; prompts follow the chat language (ADR-020 item 6)', async () => {
  let page = await launch();
  await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
  await addProject(page);
  await openTab(page, 'Handoff');
  const copyPrompt = async (label: string): Promise<string> => {
    await page.getByRole('button', { name: label }).click();
    return (await app?.evaluate(({ clipboard }) => clipboard.readText())) ?? '';
  };
  // Chat follows the interface until chosen.
  expect(await copyPrompt('Copy lời nhắc tóm tắt')).toMatch(/^Viết handoff .*Hãy trả lời tôi bằng tiếng Việt\.$/s);

  await settings(page, 'Chung');
  await page.getByRole('radiogroup', { name: 'Ngôn ngữ giao diện' }).getByRole('radio', { name: 'English' }).click();
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  // The sidebar and every other screen switch with it, without a reload.
  await expect(page.getByRole('navigation', { name: 'Navigation' }).getByRole('button', { name: 'Add project' })).toBeVisible();
  // An error from Main is shown in the interface language too.
  const reply = await page.evaluate(() =>
    (globalThis as unknown as { agentHub: { removeProject(input: { id: string }): Promise<unknown> } }).agentHub.removeProject({ id: '00000000-0000-4000-8000-000000000000' }),
  );
  expect(reply).toMatchObject({ ok: false, error: { code: 'NOT_FOUND', detail: { key: 'error.projectNotFound' } } });

  const chat = page.getByRole('radiogroup', { name: 'Chat language' });
  await chat.getByRole('radio', { name: '한국어' }).click();
  await expect(chat.getByRole('radio', { name: '한국어' })).toBeChecked();
  await page.getByRole('dialog', { name: 'Settings' }).getByRole('button', { name: 'Close' }).click();
  await page.getByRole('navigation', { name: 'Navigation' }).getByRole('button', { name: /Dự án/ }).click();
  await page.getByRole('tablist', { name: 'Project page' }).getByRole('tab', { name: 'Handoff', exact: true }).click();
  expect(await copyPrompt('Copy summary prompt')).toMatch(/^다른 계정이 이어갈 수 있도록.*한국어로 답해 주세요\.$/s);

  // A project can speak its own language.
  await page.getByRole('tablist', { name: 'Project page' }).getByRole('tab', { name: 'Settings', exact: true }).click();
  await page.getByRole('radiogroup', { name: 'Chat language' }).getByRole('radio', { name: 'English' }).click();
  await page.getByRole('tablist', { name: 'Project page' }).getByRole('tab', { name: 'Handoff', exact: true }).click();
  expect(await copyPrompt('Copy summary prompt')).toMatch(/^Write a handoff .*paste it into AgentHub\.$/s);

  page = await restart();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('button', { name: 'Settings' })).toBeVisible();
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

  const picker = page.getByRole('button', { name: 'Cách mở khác cho someone@example.com' });
  await picker.click();
  const menu = page.getByRole('menu', { name: 'Cách mở khác cho someone@example.com' });
  await expect(menu.getByRole('menuitem', { name: 'Mở bằng Terminal' })).toBeFocused();
  await page.waitForTimeout(200);
  const anchor = await picker.boundingBox();
  const panel = await menu.boundingBox();
  if (!anchor || !panel) throw new Error('Menu not laid out');
  expect(panel.y - (anchor.y + anchor.height)).toBeGreaterThanOrEqual(4);
  expect(panel.y - (anchor.y + anchor.height)).toBeLessThanOrEqual(8);
  // Aligned to the end of the arrow, as the row's last control.
  expect(Math.abs(panel.x + panel.width - (anchor.x + anchor.width))).toBeLessThanOrEqual(1);
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
