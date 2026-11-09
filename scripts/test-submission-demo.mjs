// Offline smoke tests against the same renderer shipped in Electron.
// Requires Google Chrome locally, or AGENTHUB_DEMO_BROWSER=chromium with Playwright's browser installed.
/* global window, document, getComputedStyle */
import console from 'node:console';
import { Buffer } from 'node:buffer';
import { chromium, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { URL, fileURLToPath } from 'node:url';
const target = new URL('../submission/agenthub-demo.html', import.meta.url);
const browser = await chromium.launch({ headless: true, ...(process.env.AGENTHUB_DEMO_BROWSER === 'chromium' ? {} : { channel: 'chrome' }) });
try {
  const context = await browser.newContext({ offline: true, viewport: { width: 1440, height: 960 } });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const errors = [], externalRequests = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('request', request => { if (/^https?:/.test(request.url())) externalRequests.push(request.url()); });
  await page.goto(target.href);
  const frame = page.frameLocator('#demo');
  const app = () => page.frames().find(item => item.url() === 'about:srcdoc');
  const tabs = () => frame.getByRole('tablist', { name: 'Trang project' });
  const tab = name => tabs().getByRole('tab', { name, exact: true }).click();
  await expect(frame.locator('#project-path')).toHaveText('/Projects/orbit-studio');
  // Original app tokens: warm neutral surfaces, orange accent, system fonts.
  const styles = await app().evaluate(() => ({ font: getComputedStyle(document.documentElement).fontFamily, accent: getComputedStyle(document.documentElement).getPropertyValue('--accent') }));
  expect(styles.font).toContain('-apple-system');
  expect(styles.accent).toContain('#c2603d');
  console.log('Checking task workflow');
  await tab('Task');
  await expect(frame.getByTestId('context-task')).toHaveCount(4); // Done is collapsed, like the real app.
  await frame.getByRole('radio', { name: 'Bảng', exact: true }).click();
  await expect(frame.getByTestId('context-task')).toHaveCount(6);
  await frame.getByTestId('context-task').filter({ hasText: 'TASK-002' }).click();
  const detail = frame.getByRole('complementary', { name: 'Chi tiết task' });
  await expect(detail).toBeVisible();
  await detail.getByRole('checkbox', { name: 'Kiểm tra dữ liệu sau khi mở lại' }).check();
  await expect(detail.getByRole('checkbox', { name: 'Kiểm tra dữ liệu sau khi mở lại' })).toBeChecked();
  // The original custom status selector, not the old demo's four invented buttons.
  await detail.getByRole('button', { name: 'Trạng thái', exact: true }).click();
  await frame.getByRole('menuitemradio', { name: 'Xong', exact: true }).click();
  await expect(detail).toContainText('chuyển sang Xong');
  await detail.getByRole('button', { name: 'Thêm handoff', exact: true }).click();
  await detail.getByLabel('Nội dung handoff').fill('### 2026-11-09 11:00 — User / demo\n- **Done:** Checked the real renderer.\n- **Remaining:** Review handoff.');
  await detail.getByRole('button', { name: 'Thêm handoff', exact: true }).last().click();
  await expect(detail.getByRole('status')).toHaveText('Đã thêm vào TASK-002.');
  await detail.getByRole('button', { name: 'Mở agent với task này', exact: true }).click();
  const launch = detail.getByRole('group', { name: 'Mở agent với task này', exact: true });
  await launch.getByRole('button', { name: 'Account', exact: true }).click();
  await frame.getByRole('menuitemradio', { name: /studio@example.com/ }).click();
  await launch.getByRole('button', { name: 'Mở trong Terminal', exact: true }).click();
  await expect(launch).toContainText('Mô phỏng trong trình duyệt');
  await launch.getByRole('button', { name: 'Mở', exact: true }).click();
  await expect(launch.getByRole('status', { name: 'Kết quả lần mở' })).toContainText('context-resume cho TASK-002');
  await tab('Lịch sử');
  await expect(frame.locator('.history-item').first()).toContainText('studio@example.com');
  await expect(frame.locator('.history-item').first()).toContainText('Terminal');
  await tab('Task');
  await detail.getByRole('button', { name: 'Đóng chi tiết task' }).click();
  await frame.getByRole('button', { name: 'Tạo task', exact: true }).click();
  let dialog = frame.getByRole('dialog', { name: 'Tạo task', exact: true });
  await dialog.getByLabel('Tên task').fill('Test actual UI');
  await dialog.getByLabel('Mục tiêu').fill('Keep the native workflow.');
  await dialog.getByRole('button', { name: 'Tạo task', exact: true }).click();
  await expect(detail).toContainText('Test actual UI');
  await detail.getByRole('button', { name: 'Đóng chi tiết task' }).click();
  await frame.getByRole('button', { name: 'Workstream mới' }).click();
  dialog = frame.getByRole('dialog', { name: 'Workstream mới' });
  await dialog.getByLabel('Tên workstream').fill('Quality');
  await dialog.getByRole('button', { name: 'Tạo task', exact: true }).click();
  console.log('Checking documents');
  // Real documents panel, file tree and editor.
  await frame.getByRole('button', { name: 'Tài liệu', exact: true }).click();
  const docs = frame.getByRole('complementary', { name: 'Tài liệu của project' });
  await expect(docs.getByRole('treeitem').filter({ hasText: 'Workstreams' }).first()).toBeVisible();
  await docs.getByRole('button', { name: 'PROJECT_CONTEXT.md', exact: true }).click();
  await docs.getByRole('button', { name: 'Sửa', exact: true }).click();
  await docs.getByRole('textbox', { name: 'Nội dung Markdown' }).fill('# Browser demo\n\nPersisted edit.\n<script>window.demoInjected=true</script>');
  await docs.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(docs).toContainText('Persisted edit.');
  expect(await app().evaluate(() => window.demoInjected)).toBeUndefined();
  // Check conflict handling at the real preload boundary.
  const conflict = await app().evaluate(async () => {
    const a = window.agentHub;
    const read = await a.readDocument({ id: 'orbit', path: 'PROJECT_CONTEXT.md' });
    if (!read.ok) throw Error(read.error.message);
    const one = await a.writeDocument({ id: 'orbit', path: read.data.path, content: read.data.content + '\nFirst writer\n', baseSha256: read.data.sha256 });
    const stale = await a.writeDocument({ id: 'orbit', path: read.data.path, content: 'Stale writer', baseSha256: read.data.sha256 });
    return { one: one.ok, stale: stale.ok };
  });
  expect(conflict).toEqual({ one: true, stale: false });
  await docs.getByRole('button', { name: 'Ẩn tài liệu' }).click();
  console.log('Checking native settings');
  // Native Settings UI owns language and theme controls.
  await frame.getByRole('button', { name: 'Cài đặt', exact: true }).click();
  let settings = frame.getByRole('dialog', { name: 'Cài đặt', exact: true });
  await settings.getByRole('tab', { name: 'Công cụ agent', exact: true }).click();
  await expect(settings).toContainText('context-resume');
  await settings.getByRole('tab', { name: 'MCP server', exact: true }).click();
  await expect(settings).toContainText('context_projects');
  await settings.getByRole('button', { name: /Thử kết nối cho/ }).first().click();
  await expect(settings).toContainText('0.0.0 · demo');
  await settings.getByRole('tab', { name: 'Chung', exact: true }).click();
  await settings.getByRole('radio', { name: 'Tối', exact: true }).click();
  expect(await app().evaluate(() => document.documentElement.style.colorScheme)).toBe('dark');
  await settings.getByRole('radio', { name: 'English', exact: true }).first().click();
  await expect(frame.locator('html')).toHaveAttribute('lang', 'en');
  settings = frame.getByRole('dialog', { name: 'Settings', exact: true });
  await settings.getByRole('radio', { name: '한국어', exact: true }).first().click();
  await expect(frame.locator('html')).toHaveAttribute('lang', 'ko');
  settings = frame.getByRole('dialog', { name: '설정', exact: true });
  await settings.getByRole('radio', { name: 'Tiếng Việt', exact: true }).first().click();
  settings = frame.getByRole('dialog', { name: 'Cài đặt', exact: true });
  await settings.getByRole('button', { name: 'Đóng', exact: true }).click();
  console.log('Checking persistence and project setup');
  await page.reload();
  await expect(frame.locator('#project-path')).toHaveText('/Projects/orbit-studio');
  const persisted = await app().evaluate(() => window.agentHub.readDocument({ id: 'orbit', path: 'PROJECT_CONTEXT.md' }));
  expect(persisted.ok && persisted.data.content).toContain('First writer');
  // Adding a project uses the original setup dialog; folder selection alone is mocked.
  await frame.getByRole('button', { name: 'Thêm project', exact: true }).click();
  dialog = frame.getByRole('dialog', { name: 'Thêm project', exact: true });
  await expect(dialog.getByTestId('add-project-path')).toHaveText('/Projects/Demo Project 1');
  await dialog.getByLabel('Tên project').fill('Demo Project');
  await dialog.getByRole('button', { name: 'Thêm project', exact: true }).click();
  await expect(frame.locator('.titlebar-name')).toHaveText('Demo Project');
  await expect(frame.getByTestId('context-summary')).toHaveText('1 workstream · 0 task');
  await page.getByRole('button', { name: 'Khôi phục demo' }).click();
  await page.locator('#reset-confirm').click();
  await expect(frame.locator('#project-path')).toHaveText('/Projects/orbit-studio');
  await expect(frame.getByRole('button', { name: 'Demo Project', exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
  expect(externalRequests).toEqual([]);
  const size = Buffer.byteLength(await readFile(fileURLToPath(target)));
  expect(size).toBeLessThan(10_000_000);
  console.log(JSON.stringify({ pass: true, bytes: size, errors, externalRequests, renderer: 'actual React components and CSS', coverage: 'task board/detail/checklist/status/handoff/launch/history/create/workstream/documents/conflict/settings/languages/theme/MCP/persistence/project/reset' }, null, 2));
} finally { await browser.close(); }
