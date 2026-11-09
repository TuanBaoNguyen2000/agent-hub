// Browser-only adapter for the real desktop renderer. No Electron, filesystem or provider access.
import type {
  AgentHubApi, AccountToolsDto, AgentToolsDto, ContextOverviewDto, DocumentDto,
  IpcResult, LaunchAttemptDto, LaunchOutcomeDto, LaunchPreviewDto, NoteWithContentDto,
  ProfileDto, ProjectContextDto, ProjectDto, SettingsDto, TaskViewDto,
} from '@agenthub/contracts';
import { raw } from '@agenthub/i18n';
import {
  applyTaskEdit, contextScaffold, newTaskDocument, nextTaskId, parseTaskDocument,
  setStatusState, setTaskFileState, STATE_WORDS, stateGroup, taskSlug,
  verifiedHandoff, workstreamStatusDocument,
} from '../../packages/application/src/task-document';

import { promptIn, documentLanguageName } from '../../packages/application/src/languages';

const KEY = 'agenthub.renderer-demo.v1';
const skills = ['context-init', 'context-resume', 'context-checkpoint', 'context-capture'];
const toolNames = ['context_projects', 'context_read', 'context_write', 'context_append_handoff', 'context_save_handoff', 'context_handoffs', 'context_capture', 'context_loose_chats'];
const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();
const message = (vi: string, en: string, ko: string) => raw(({ vi, en, ko })[db.settings.uiLanguage]);
const demoMessage = () => message('Mô phỏng trong trình duyệt: không mở ứng dụng, không đăng nhập và không gọi model thật.', 'Browser simulation: no real app, sign-in or model is started.', '브라우저 시뮬레이션이에요. 실제 앱, 로그인, 모델을 실행하지 않아요.');
interface DemoState {
  version: 1;
  settings: SettingsDto;
  projects: ProjectDto[];
  files: Record<string, Record<string, string>>;
  profiles: ProfileDto[];
  tools: AccountToolsDto[];
  customSkills: AgentToolsDto['skills'];
  launches: LaunchAttemptDto[];
  notes: Record<string, NoteWithContentDto[]>;
  chats: NoteWithContentDto[];
  permissions: Record<string, boolean>;
}
function projectDto(projectId: string, name: string, enabled = true): ProjectDto {
  const path = `/Projects/${name.toLowerCase().replaceAll(' ', '-')}`;
  return { id: projectId, name, path, pathStatus: 'directory', context: { enabled, language: 'vi', path: `${path}/AgentContext`, custom: true, pathStatus: 'directory', detected: true }, chatLanguage: null, chatLocale: 'vi', createdAt: '2026-11-09T02:00:00.000Z', updatedAt: '2026-11-09T02:00:00.000Z' };
}
function seed(): DemoState {
  const profiles: ProfileDto[] = [
    { id: 'claude-work', provider: 'claude', name: raw('work@example.com'), alias: 'Work', accountEmail: 'work@example.com', cliConfigRoot: '/Demo/accounts/claude-work', desktopDataDir: '/Demo/accounts/claude-work/desktop', createdAt: now() },
    { id: 'claude-personal', provider: 'claude', name: raw('personal@example.com'), alias: 'Personal', accountEmail: 'personal@example.com', cliConfigRoot: '/Demo/accounts/claude-personal', desktopDataDir: '/Demo/accounts/claude-personal/desktop', createdAt: now() },
    { id: 'codex-studio', provider: 'codex', name: raw('studio@example.com'), alias: 'Studio', accountEmail: 'studio@example.com', cliConfigRoot: '/Demo/accounts/codex-studio', desktopDataDir: '/Demo/accounts/codex-studio/desktop', createdAt: now() },
  ];
  const projects = [projectDto('orbit', 'Orbit Studio'), projectDto('luna', 'Luna Explorer'), projectDto('brand', 'Brand Kit', false)];
  const files: DemoState['files'] = {};
  for (const p of projects) {
    files[p.id] = {};
    if (!p.context.enabled) continue;
    for (const item of contextScaffold('vi')) if (item.content !== null) files[p.id]![item.path] = item.content;
    files[p.id]!['PROJECT_CONTEXT.md'] = `# ${p.name}\n\nỨng dụng mẫu để minh hoạ chức năng AgentHub.\n\n## Công nghệ\n${p.id === 'luna' ? 'Unity · C#' : 'React · TypeScript · SQLite'}\n\n## Nguyên tắc\nĐọc task và handoff mới nhất trước khi sửa code.\n`;
  }
  const tasks = [
    ['001', 'Thiết kế luồng onboarding', 'done'], ['002', 'Hoàn thiện màn quản lý project', 'active'],
    ['003', 'Kiểm tra đồng bộ trạng thái task', 'blocked'], ['004', 'Thêm tìm kiếm task', 'todo'],
    ['005', 'Kiểm tra giao diện macOS', 'todo'], ['006', 'Viết hướng dẫn bắt đầu', 'done'],
  ] as const;
  for (const [number, title, state] of tasks) {
    const taskId = `TASK-${number}`;
    files.orbit![`Workstreams/main/Tasks/${taskId}-${taskSlug(title)}.md`] = `# ${taskId} ${title}\n\nStatus: ${STATE_WORDS.vi[state]}\n\n## Mục tiêu\nNgười dùng xem và quản lý project, task và tài liệu trong một nơi.\n\n## Tiêu chí hoàn thành\n- [x] Hiển thị danh sách project đã lưu\n- [${state === 'done' ? 'x' : ' '}] Kiểm tra dữ liệu sau khi mở lại\n\n## Ghi chú\nDữ liệu minh hoạ; chưa phải kết quả kiểm chứng sản phẩm thật.\n\n## Handoff log\n\n### 2026-11-09 09:30 — Claude / Desktop (demo)\n- **Done:** Đã hoàn thiện phần danh sách.\n- **Remaining:** Kiểm tra mở lại project trên bản đóng gói.\n- **Validation:** Dữ liệu giả dùng để trình diễn giao diện.\n`;
  }
  files.orbit!['Workstreams/main/STATUS.md'] = '# Phát triển sản phẩm\n\nBranch: feature/workspace\n\n| Task | State |\n|---|---|\n' + tasks.map(([n, , s]) => `| TASK-${n} | ${STATE_WORDS.vi[s]} |`).join('\n') + '\n';
  files.luna!['Workstreams/main/Tasks/TASK-001-level-selector.md'] = newTaskDocument({ id: 'TASK-001', title: 'Tối ưu màn chọn màn chơi', goal: 'Giảm số thao tác trước khi vào màn chơi.', language: 'vi' });
  return {
    version: 1, settings: { deviceId: 'browser-demo', theme: 'light', uiLanguage: 'vi', chatLanguage: null, dataDirectory: '/Demo/AgentHub', claudeCliPath: '/Demo/bin/claude', codexCliPath: '/Demo/bin/codex' },
    projects, profiles, files, tools: profiles.map((p, i) => ({ profileId: p.id, name: p.name, provider: p.provider, mainConfig: false, autoInstall: i !== 0, skillsDirectory: `${p.cliConfigRoot}/skills`, skills: Object.fromEntries(skills.map(s => [s, 'installed' as const])), mcp: 'installed', mcpDetail: [] })),
    customSkills: [], launches: [], notes: { orbit: [], luna: [], brand: [] },
    chats: [{ id: '20261109T023000000Z-abcdef-onboarding', title: 'Định hướng onboarding', createdAt: '2026-11-09T02:30:00.000Z', source: 'Claude · Demo', content: '# Định hướng onboarding\n\nHỏi người dùng dùng tài liệu có sẵn hay tạo bộ mới sau khi chọn folder.' }], permissions: {},
  };
}
let db = seed();
try { const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as DemoState | null; if (saved?.version === 1 && Array.isArray(saved.projects) && saved.files && Array.isArray(saved.profiles)) db = saved; } catch { /* The renderer still works without storage. */ }
function save(): void { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* Session-only fallback. */ } }
function ok<T>(data: T): IpcResult<T> { return { ok: true, data: structuredClone(data) }; }
function fail<T>(error: unknown): IpcResult<T> { return { ok: false, error: { code: 'VALIDATION_FAILED', message: String(error), detail: raw(error instanceof Error ? error.message : String(error)) } }; }
async function run<T>(action: () => T | Promise<T>): Promise<IpcResult<T>> { try { return ok(await action()); } catch (error) { return fail<T>(error); } }
function project(projectId: string): ProjectDto { const p = db.projects.find(p => p.id === projectId); if (!p) throw Error('Demo project not found.'); return p; }
function fileMap(projectId: string): Record<string, string> { project(projectId); return db.files[projectId] ??= {}; }
function safePath(path: string): void { if (!path.endsWith('.md') || path.startsWith('/') || path.split('/').some(part => part.startsWith('.') || !part)) throw Error('Only relative Markdown paths inside the demo are supported.'); }
// Content revisions are compared exactly as at the real renderer/API boundary.
async function hash(content: string): Promise<string> { const bytes = new TextEncoder().encode(content); const digest = await crypto.subtle.digest('SHA-256', bytes); return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join(''); }
async function read(projectId: string, path: string): Promise<DocumentDto> { safePath(path); const content = fileMap(projectId)[path]; if (content === undefined) throw Error('Demo document not found.'); return { path, content, sha256: await hash(content) }; }
async function write(projectId: string, path: string, content: string, base: string | null): Promise<{ path: string; sha256: string }> { safePath(path); if (new TextEncoder().encode(content).length > 1_000_000) throw Error('Document exceeds the 1 MB limit.'); const files = fileMap(projectId); if ((files[path] === undefined ? null : await hash(files[path]!)) !== base) throw Error('Document changed. Reload before saving.'); files[path] = content; save(); return { path, sha256: await hash(content) }; }
function stateOf(content: string): string | null { return /^(?:Status|Trạng thái|상태):\s*(.+)$/im.exec(content)?.[1]?.trim() ?? null; }
async function taskView(projectId: string, ref: string): Promise<TaskViewDto> { const doc = await read(projectId, ref); const state = stateOf(doc.content); return { ref, id: /TASK-\d+/i.exec(ref)?.[0] ?? ref, workstream: ref.slice(0, ref.lastIndexOf('/Tasks/')), sha256: doc.sha256, content: doc.content, document: parseTaskDocument(doc.content), state, group: stateGroup(state) }; }
function insertHandoff(content: string, entry: string): string { const lines = content.split('\n'); const at = lines.findIndex(line => /^#{1,6}\s+Handoff log(?:\s|$)/i.test(line)); if (at < 0) return `${content.trimEnd()}\n\n## Handoff log\n\n${entry.trim()}\n`; lines.splice(at + 1, 0, '', entry.trim(), ''); return lines.join('\n'); }
function overview(projectId: string): ContextOverviewDto {
  const p = project(projectId), files = fileMap(projectId);
  if (!p.context.enabled) return { initialized: false, filled: false, workstreams: [], issues: [] };
  const groups = [...new Set(Object.keys(files).filter(path => path.endsWith('/STATUS.md') || /\/Tasks\/TASK-\d+.*\.md$/i.test(path)).map(path => path.includes('/Tasks/') ? path.split('/Tasks/')[0]! : path.slice(0, -10)))];
  return { initialized: 'README.md' in files, filled: (files['PROJECT_CONTEXT.md'] ?? '').split('\n').some(line => line.trim() && !line.startsWith('#')), issues: [], workstreams: groups.map(slug => ({ slug, title: /^#\s+(.+)$/m.exec(files[`${slug}/STATUS.md`] ?? '')?.[1] ?? slug.split('/').at(-1)!, branch: /Branch:\s*(\S+)/.exec(files[`${slug}/STATUS.md`] ?? '')?.[1] ?? null,
    tasks: Object.entries(files).filter(([path]) => path.startsWith(`${slug}/Tasks/`) && /TASK-\d+.*\.md$/i.test(path)).sort(([a], [b]) => a.localeCompare(b)).map(([ref, content]) => {
      const parsed = parseTaskDocument(content), criteria = parsed.sections.find(s => s.kind === 'criteria')?.body ?? '', checks = [...criteria.matchAll(/^\s*[-*+]\s+\[([ xX])\]/gm)];
      const heading = /^#{1,6}\s+(.+)$/m.exec(parsed.sections.find(s => s.kind === 'handoff')?.body ?? '')?.[1] ?? null;
      const stamp = heading ? /\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.exec(heading)?.[0] : null;
      return { ref, id: /TASK-\d+/i.exec(ref)![0], title: parsed.title, state: stateOf(content), criteria: checks.length ? { done: checks.filter(c => c[1]?.toLowerCase() === 'x').length, total: checks.length } : null, lastHandoff: heading ? { heading, at: stamp ? new Date(stamp.replace(' ', 'T') + ':00+07:00').toISOString() : null } : null };
    }) })) };
}
function scaffold(projectId: string): ProjectDto { const p = project(projectId), files = fileMap(projectId); p.context.enabled = true; for (const item of contextScaffold(p.context.language)) if (item.content !== null && files[item.path] === undefined) files[item.path] = item.content; save(); return p; }
function pView(p: ProjectDto): ProjectDto { return { ...p, chatLocale: p.chatLanguage ?? db.settings.chatLanguage ?? db.settings.uiLanguage }; }
function context(projectId: string): ProjectContextDto { const p = project(projectId); return { overview: overview(projectId), git: { state: 'repo', branch: p.id === 'orbit' ? 'feature/workspace' : 'main', head: 'a1b2c3d4e5f6789012345678901234567890abcde', headAt: '2026-11-09T02:00:00.000Z', dirty: p.id === 'orbit' }, warnings: p.id === 'orbit' ? [{ kind: 'uncommitted', taskRef: null, workstream: null, message: { key: 'context.warning.uncommitted' } }] : [], handoffs: db.notes[projectId] ?? [], checkpointPrompt: promptIn(pView(p).chatLocale, 'prompt.checkpoint', { project: p.name }) }; }
function prompt(request: { projectId: string; taskRef?: string | null | undefined; purpose?: 'init' | 'refine' | undefined }): string | null {
  const p = pView(project(request.projectId));
  if (!p.context.enabled) {
    const handoff = db.notes[p.id]?.[0];
    return handoff ? promptIn(p.chatLocale, 'prompt.handoff', { file: `/Demo/AgentHub/projects/${p.id}/handoffs/${handoff.id}.md` }) : null;
  }
  if (request.purpose === 'init' || (!request.taskRef && !overview(p.id).filled)) return promptIn(p.chatLocale, 'prompt.init', { folder: p.context.path, language: documentLanguageName(p.context.language) });
  if (!request.taskRef) return promptIn(p.chatLocale, 'prompt.resume', { folder: p.context.path });
  return promptIn(p.chatLocale, request.purpose === 'refine' ? 'prompt.refineTask' : 'prompt.resumeTask', { task: /TASK-\d+/i.exec(request.taskRef)?.[0] ?? request.taskRef, ref: request.taskRef, folder: p.context.path });
}
function profile(profileId: string): ProfileDto { const p = db.profiles.find(p => p.id === profileId); if (!p) throw Error('Demo account not found.'); return p; }
function accountTools(profileId: string): AccountToolsDto { const tools = db.tools.find(t => t.profileId === profileId); if (!tools) throw Error('Demo tools not found.'); return tools; }
function toolOverview(): AgentToolsDto { return { accounts: db.tools, skills: [...skills.map(name => ({ name, kind: 'builtin' as const, description: null, sourcePath: null })), ...db.customSkills], leaked: [] }; }
function preview(request: { projectId: string; profileId: string; mode: 'desktop' | 'cli'; taskRef?: string | null | undefined; purpose?: 'init' | 'refine' | undefined }): LaunchPreviewDto { const p = project(request.projectId), a = profile(request.profileId), tools = accountTools(a.id), missing = skills.filter(s => tools.skills[s] !== 'installed'); return { projectName: p.name, profileAlias: a.name, permission: db.permissions[`${p.id}:${a.id}`] === false ? 'denied' : 'allowed', blocker: null, steps: [{ execution: 'manual', label: demoMessage(), warning: demoMessage() }], requiredConfirmations: [], prompt: prompt(request), transcript: null, missingTools: !tools.autoInstall && (missing.length || tools.mcp !== 'installed') ? { skills: missing, mcp: tools.mcp !== 'installed' } : null }; }
function outcome(): LaunchOutcomeDto { return { appOpened: false, workspace: 'none', sessionStarted: false, warnings: [demoMessage()], userActionRequired: [] }; }
function note(content: string, title?: string): NoteWithContentDto { return { id: `${new Date().toISOString().replace(/[-:.]/g, '')}-${id().slice(0, 6)}`, title: title || /^#\s+(.+)/m.exec(content)?.[1] || 'Handoff', content, source: 'User · browser demo', createdAt: now() }; }
let picked = 0;
async function copy(text: string): Promise<null> { try { await navigator.clipboard.writeText(text); return null; } catch { throw Error(({ vi: 'Không copy được trong trình duyệt này. Hãy chọn và copy văn bản đang hiển thị.', en: 'Clipboard access unavailable. Select and copy the displayed text.', ko: '복사 기능을 사용할 수 없어요. 표시된 텍스트를 선택해 복사하세요.' })[db.settings.uiLanguage]); } }
function browserOnly(): null { window.parent.postMessage({ source: 'agenthub-demo', type: 'notice', text: ({ vi: 'Thao tác này được mô phỏng; không mở file, folder hay ứng dụng trên máy.', en: 'This action is simulated; no real file, folder or application is opened.', ko: '이 동작은 시뮬레이션이에요. 실제 파일, 폴더, 앱을 열지 않아요.' })[db.settings.uiLanguage] }, '*'); return null; }
const api: AgentHubApi = {
  getSystemStatus: () => run(() => ({ appVersion: '0.0.0 · browser demo', storage: { engineVersion: 'in-memory demo', schemaVersion: 7 } })),
  copyText: ({ text }) => run(() => copy(text)),
  listProjects: () => run(() => db.projects.map(pView)),
  pickProjectFolder: () => run(() => { picked += 1; window.parent.postMessage({ source: 'agenthub-demo', type: 'notice', text: ({ vi: 'Folder mẫu được chọn sẵn; không đọc folder thật trên máy.', en: 'A sample folder is selected; no real folder is read.', ko: '샘플 폴더를 선택했어요. 실제 폴더를 읽지 않아요.' })[db.settings.uiLanguage] }, '*'); return `/Projects/Demo Project ${picked}`; }),
  addProject: input => run(() => { if (db.projects.some(p => p.path === input.path)) throw Error('This demo folder is already in use.'); const p = projectDto(id(), input.name ?? input.path.split('/').at(-1)!); p.path = input.path; p.context.path = `${input.path}/AgentContext`; db.projects.push(p); db.files[p.id] = {}; db.notes[p.id] = []; if (input.context?.kind === 'none') p.context.enabled = false; else if (input.context?.kind === 'existing') p.context.path = input.context.path; else { p.context.language = input.context?.language ?? db.settings.uiLanguage; if (input.context?.location === 'app') { p.context.path = `/Demo/AgentHub/projects/${p.id}/context`; p.context.custom = false; } if (input.context?.kind === 'create' && input.context.customPath) p.context.path = input.context.customPath; scaffold(p.id); } save(); return pView(p); }),
  updateProject: input => run(() => { const p = project(input.id); if (input.name !== undefined) p.name = input.name; if (input.path !== undefined) p.path = input.path; p.updatedAt = now(); save(); return pView(p); }),
  removeProject: ({ id: projectId }) => run(() => { db.projects = db.projects.filter(p => p.id !== projectId); save(); return null; }),
  updateProjectContext: input => run(() => { const p = project(input.id); if (input.enabled !== undefined) p.context.enabled = input.enabled; if (input.language !== undefined) p.context.language = input.language; if (input.customPath !== undefined) { p.context.custom = input.customPath !== null; p.context.path = input.customPath ?? `/Demo/AgentHub/projects/${p.id}/context`; } if (input.chatLanguage !== undefined) p.chatLanguage = input.chatLanguage; save(); return pView(p); }),
  openContextFolder: () => run(browserOnly),
  getProjectContext: ({ id: projectId }) => run(() => context(projectId)),
  detectProjectContext: ({ id: projectId }) => run(() => ({ project: pView(project(projectId)), found: [], others: [], applied: null })),
  scanFolder: ({ path, projectId }) => run(() => { const p = projectId ? project(projectId) : null; return { path, name: path.split('/').at(-1)!, found: p?.context.enabled ? [{ path: p.context.path, workstreams: overview(p.id).workstreams.length, tasks: overview(p.id).workstreams.reduce((n, w) => n + w.tasks.length, 0) }] : [], others: [], complete: true, repoContextPath: `${path}/AgentContext`, repoContextTaken: !!p?.context.enabled }; }),
  createProjectContext: input => run(() => { const p = project(input.id); p.context.language = input.language; p.context.custom = input.location !== 'app'; p.context.path = input.location === 'app' ? `/Demo/AgentHub/projects/${p.id}/context` : input.location === 'custom' ? input.customPath! : `${p.path}/AgentContext`; return pView(scaffold(p.id)); }),
  useProjectContext: ({ id: projectId, path }) => run(() => { const p = project(projectId); p.context.path = path; return pView(scaffold(p.id)); }),
  scaffoldProjectContext: ({ id: projectId }) => run(() => pView(scaffold(projectId))),
  moveProjectContext: input => run(() => { const p = project(input.id); p.context.path = input.customPath ?? `/Demo/AgentHub/projects/${p.id}/context`; p.context.custom = input.customPath !== null; save(); return { status: 'done' as const, project: pView(p), moved: Object.keys(fileMap(p.id)).length, kept: null }; }),
  addHandoff: ({ id: projectId, taskRef, entry }) => run(async () => { const doc = await read(projectId, taskRef); await write(projectId, taskRef, insertHandoff(doc.content, entry), doc.sha256); return overview(projectId); }),
  readProjectHandoff: ({ id: projectId, noteId }) => run(() => { const item = db.notes[projectId]?.find(n => n.id === noteId); if (!item) throw Error('Demo handoff not found.'); return item; }),
  saveProjectHandoff: ({ id: projectId, title, content }) => run(() => { const list = db.notes[projectId] ??= []; list.unshift(note(content, title)); save(); return list; }),
  listLooseChats: () => run(() => db.chats),
  readLooseChat: ({ id: noteId }) => run(() => { const item = db.chats.find(n => n.id === noteId); if (!item) throw Error('Demo chat not found.'); return item; }),
  saveLooseChat: ({ title, content }) => run(() => { const item = note(content, title); db.chats.unshift(item); save(); return item; }),
  moveLooseChat: ({ id: noteId, projectId }) => run(() => { const item = db.chats.find(n => n.id === noteId); if (!item) throw Error('Demo chat not found.'); if (project(projectId).context.enabled) fileMap(projectId)[`Inbox/${noteId}.md`] = item.content; else (db.notes[projectId] ??= []).unshift(item); db.chats = db.chats.filter(n => n.id !== noteId); save(); return null; }),
  getSettings: () => run(() => db.settings),
  updateSettings: input => run(() => { Object.assign(db.settings, input); applyTheme(); save(); window.parent.postMessage({ source: 'agenthub-demo', type: 'language', language: db.settings.uiLanguage, theme: db.settings.theme }, '*'); return db.settings; }),
  openDataFolder: () => run(browserOnly),
  listProfiles: () => run(() => db.profiles),
  addAccount: ({ provider }) => run(() => { const profileId = id(), email = `demo-${db.profiles.length + 1}@example.com`; const p: ProfileDto = { id: profileId, provider, name: raw(email), alias: email, accountEmail: email, cliConfigRoot: `/Demo/accounts/${profileId}`, desktopDataDir: `/Demo/accounts/${profileId}/desktop`, createdAt: now() }; db.profiles.push(p); db.tools.push({ profileId, name: p.name, provider, mainConfig: false, autoInstall: true, skillsDirectory: `${p.cliConfigRoot}/skills`, skills: Object.fromEntries(skills.map(s => [s, 'missing' as const])), mcp: 'missing', mcpDetail: [] }); save(); browserOnly(); return p; }),
  updateProfile: input => run(() => { const p = profile(input.id); Object.assign(p, input); save(); return p; }),
  removeProfile: ({ id: profileId }) => run(() => { db.profiles = db.profiles.filter(p => p.id !== profileId); db.tools = db.tools.filter(t => t.profileId !== profileId); save(); return null; }),
  getProfileStatus: ({ id: profileId }) => run(() => { const p = profile(profileId); return { cliPath: `/Demo/bin/${p.provider}`, cliVersion: 'demo', login: 'logged_in' as const, loginDetail: demoMessage(), accountEmail: p.accountEmail, sameAccountAs: [], desktopInstalled: true, desktopVersion: 'demo', desktopVersionHasEvidence: false }; }),
  getProfileUsage: ({ id: profileId }) => run(() => ({ state: 'ok' as const, windows: [{ kind: 'session' as const, label: null, usedPercent: profileId === 'claude-work' ? 78 : profileId === 'codex-studio' ? 36 : 24, windowMinutes: 300, resetsAt: new Date(Date.now() + 2 * 3600000).toISOString(), resetsText: null }, { kind: 'weekly' as const, label: null, usedPercent: 21, windowMinutes: 10080, resetsAt: null, resetsText: null }], plan: 'Sample data', limitReached: false, detail: demoMessage(), checkedAt: now() })),
  getMachineAccount: () => run(() => ({ available: false, cliFound: true, login: 'unknown' as const, accountEmail: null, loginDetail: demoMessage() })),
  openProfileLogin: () => run(() => { browserOnly(); return { phase: 'succeeded' as const, privateBrowser: null }; }),
  getLoginState: () => run(() => ({ phase: 'idle' as const, privateBrowser: null })),
  reopenLogin: () => run(() => { browserOnly(); return { phase: 'succeeded' as const, privateBrowser: null }; }),
  copyLoginLink: () => run(browserOnly), cancelLogin: () => run(() => null),
  setPermission: ({ projectId, profileId, allowed }) => run(() => { db.permissions[`${projectId}:${profileId}`] = allowed; save(); return null; }),
  planLaunch: request => run(() => preview(request)),
  executeLaunch: ({ request }) => run(() => { const p = project(request.projectId), a = profile(request.profileId), tools = accountTools(a.id); if (db.permissions[`${p.id}:${a.id}`] === false) throw Error('Account access denied for this demo project.'); if (tools.autoInstall) { skills.forEach(s => tools.skills[s] = 'installed'); tools.mcp = 'installed'; } const result: LaunchAttemptDto = { id: id(), projectId: p.id, taskRef: request.taskRef ?? null, profileId: a.id, profileAlias: a.name, mode: request.mode, status: 'manual_step', errorCode: null, outcome: outcome(), accountConfirmedAt: null, createdAt: now() }; db.launches.unshift(result); save(); return { ...result, prompt: prompt(request), copied: false }; }),
  listLaunches: ({ projectId }) => run(() => db.launches.filter(h => h.projectId === projectId)),
  confirmLaunchAccount: ({ attemptId }) => run(() => { const attempt = db.launches.find(h => h.id === attemptId); if (attempt) attempt.accountConfirmedAt = now(); save(); return null; }),
  planAccountLaunch: () => run(() => ({ steps: [{ label: demoMessage(), execution: 'manual' as const, warning: demoMessage() }], requiredConfirmations: [], blocker: null })),
  openAccount: () => run(outcome),
  getAgentTools: () => run(toolOverview),
  installTool: ({ profileId, tool }) => run(() => { const tools = accountTools(profileId); if (tool.kind === 'mcp') tools.mcp = 'installed'; else tools.skills[tool.name] = 'installed'; save(); return tools; }),
  uninstallTool: ({ profileId, tool }) => run(() => { const tools = accountTools(profileId); if (tool.kind === 'mcp') tools.mcp = 'missing'; else tools.skills[tool.name] = 'missing'; save(); return tools; }),
  setToolsAutoInstall: ({ profileId, on }) => run(() => { const tools = accountTools(profileId); tools.autoInstall = on; save(); return tools; }),
  addSkill: () => run(() => { const name = `demo-skill-${db.customSkills.length + 1}`; db.customSkills.push({ name, kind: 'custom', description: 'Demo skill', sourcePath: '/Demo/skills' }); for (const tools of db.tools) tools.skills[name] = 'missing'; save(); return toolOverview(); }),
  removeSkill: ({ name }) => run(() => { db.customSkills = db.customSkills.filter(s => s.name !== name); for (const tools of db.tools) delete tools.skills[name]; save(); return toolOverview(); }),
  getMcpServer: () => run(() => ({ name: 'agenthub', version: '0.0.0 · demo', command: '/Demo/AgentHub/bin/agenthub-mcp', args: ['--account', '<account>'], protocolVersions: ['2025-03-26'], tools: toolNames.map((name, i) => ({ name, readOnly: [0, 1, 5, 7].includes(i) })), logFile: '/Demo/AgentHub/logs/mcp.log' })),
  probeMcpServer: ({ profileId }) => run(() => { const installed = accountTools(profileId).mcp === 'installed'; return { ok: installed, durationMs: 12, serverVersion: '0.0.0 · demo', protocolVersion: '2025-03-26', tools: installed ? toolNames : [], projects: installed ? db.projects.map(p => p.name) : null, error: installed ? null : message('MCP chưa được cài trong dữ liệu demo.', 'MCP is not installed in the demo.', '데모에서 MCP가 설치되지 않았어요.') }; }),
  readMcpLog: () => run(() => ({ exists: true, lines: ['[demo] In-memory MCP fixture. No server process is running.'] })),
  revealMcpLog: () => run(browserOnly),
  listDocuments: ({ id: projectId }) => run(() => { const files = fileMap(projectId); const folders = new Set<string>(); for (const name of Object.keys(files)) { const parts = name.split('/'); for (let i = 1; i < parts.length; i++) folders.add(parts.slice(0, i).join('/') + '/'); } return [...[...folders].map(path => ({ path, kind: 'folder' as const })), ...Object.keys(files).map(path => ({ path, kind: 'file' as const }))]; }),
  readDocument: ({ id: projectId, path }) => run(() => read(projectId, path)),
  documentChecksum: ({ id: projectId, path }) => run(async () => { const content = fileMap(projectId)[path]; return content === undefined ? null : hash(content); }),
  writeDocument: ({ id: projectId, path, content, baseSha256 }) => run(() => write(projectId, path, content, baseSha256)),
  openDocument: () => run(browserOnly),
  readTask: ({ id: projectId, ref }) => run(() => taskView(projectId, ref)),
  saveTask: ({ id: projectId, ref, baseSha256, edit }) => run(async () => { const doc = await read(projectId, ref); await write(projectId, ref, applyTaskEdit(doc.content, edit, project(projectId).context.language), baseSha256); return taskView(projectId, ref); }),
  setTaskState: ({ id: projectId, ref, state }) => run(async () => { const p = project(projectId), files = fileMap(p.id), doc = await read(p.id, ref), task = await taskView(p.id, ref), word = STATE_WORDS[p.context.language][state]; let content = setTaskFileState(doc.content, word); if (state === 'done') content = insertHandoff(content, verifiedHandoff(new Date(), p.context.language)); await write(p.id, ref, content, doc.sha256); const path = `${task.workstream}/STATUS.md`; files[path] = setStatusState(files[path] ?? null, { id: task.id, title: task.document.title }, word, task.workstream.split('/').at(-1)!); save(); return taskView(p.id, ref); }),
  createTask: ({ id: projectId, workstream, title, goal }) => run(async () => { const p = project(projectId), files = fileMap(p.id); const taskId = nextTaskId(Object.keys(files)); const ref = `${workstream}/Tasks/${taskId}-${taskSlug(title)}.md`; await write(p.id, ref, newTaskDocument({ id: taskId, title, goal, language: p.context.language }), null); const path = `${workstream}/STATUS.md`; files[path] = setStatusState(files[path] ?? null, { id: taskId, title }, STATE_WORDS[p.context.language].todo, workstream.split('/').at(-1)!); save(); return taskView(p.id, ref); }),
  createWorkstream: ({ id: projectId, title }) => run(() => { const files = fileMap(projectId); let slug = `Workstreams/${taskSlug(title)}`; for (let n = 2; files[`${slug}/STATUS.md`] !== undefined; n++) slug = `Workstreams/${taskSlug(title)}-${n}`; files[`${slug}/STATUS.md`] = workstreamStatusDocument(title, project(projectId).context.language); save(); return overview(projectId); }),
};
function applyTheme(): void { document.documentElement.style.colorScheme = db.settings.theme === 'system' ? 'light dark' : db.settings.theme; }
applyTheme();
window.agentHub = api;
window.parent.postMessage({ source: 'agenthub-demo', type: 'language', language: db.settings.uiLanguage, theme: db.settings.theme }, '*');
window.addEventListener('message', event => { if (event.source !== window.parent || event.data?.source !== 'agenthub-demo-wrapper') return; if (event.data.type === 'reset') { try { localStorage.removeItem(KEY); for (const key of ['agenthub.sidebar', 'agenthub.tasks.view', 'agenthub.documentsPanel.open', 'agenthub.documentsPanel.width']) localStorage.removeItem(key); } catch { /* Reload seeds in-memory data. */ } location.reload(); } });
