import type { ContextLanguage } from '@agenthub/domain';

// ADR-021: AgentHub edits task files and the STATUS table that agents write. The files are
// free-form Markdown, so editing works on spans of the original text: whatever the user does not
// touch stays byte for byte, including sections AgentHub does not know.

export type TaskSectionKind = 'goal' | 'criteria' | 'notes' | 'handoff' | 'other';

export interface TaskSection {
  // Position among the sections; what an edit refers to.
  id: number;
  heading: string;
  level: number;
  kind: TaskSectionKind;
  body: string;
}

export interface TaskDocument {
  title: string;
  sections: TaskSection[];
}

interface Span {
  start: number;
  end: number;
}

interface ParsedSection extends TaskSection {
  headingLine: Span;
  bodySpan: Span;
}

interface Parsed {
  title: string;
  titleLine: Span | null;
  sections: ParsedSection[];
}

const KINDS: [TaskSectionKind, RegExp][] = [
  // "Handoff log (newest first)" too: agents often add a note after the name (ADR-023).
  ['handoff', /^handoff log(?:[ \t]*(?:\([^)\n]*\)|[-–—:][^\n]*))?$/i],
  ['criteria', /acceptance|criteria|tiêu chí|điều kiện hoàn thành|완료 조건|수락 기준|인수 조건/i],
  ['goal', /^(goal|goals|objective|mục tiêu|목표)(?![\p{L}\p{N}])/iu],
  ['notes', /^(notes?|ghi chú|메모|참고)(?![\p{L}\p{N}])/iu],
];

export const sectionKind = (heading: string): TaskSectionKind => KINDS.find(([, pattern]) => pattern.test(heading.trim()))?.[0] ?? 'other';

const HEADING = /^(#{1,6})[ \t]+(.+?)[ \t#]*$/;

function lines(text: string): { text: string; start: number; end: number }[] {
  const result: { text: string; start: number; end: number }[] = [];
  let start = 0;
  while (start <= text.length) {
    const newline = text.indexOf('\n', start);
    const end = newline < 0 ? text.length : newline + 1;
    result.push({ text: text.slice(start, newline < 0 ? text.length : newline).replace(/\r$/, ''), start, end });
    if (newline < 0) break;
    start = end;
  }
  return result;
}

function parse(text: string): Parsed {
  const all = lines(text);
  let fence = false;
  const headings: { level: number; text: string; line: (typeof all)[number] }[] = [];
  for (const line of all) {
    if (/^\s*(```|~~~)/.test(line.text)) fence = !fence;
    if (fence) continue;
    const match = HEADING.exec(line.text);
    if (match) headings.push({ level: (match[1] as string).length, text: (match[2] as string).trim(), line });
  }
  const titleHeading = headings.find((heading) => heading.level === 1) ?? null;
  const rest = headings.filter((heading) => heading !== titleHeading && (!titleHeading || heading.line.start > titleHeading.line.start));
  // Sections are the top level below the title; deeper headings belong to them (handoff entries).
  const sectionLevel = rest.length > 0 ? Math.min(...rest.map((heading) => heading.level)) : 2;
  const tops = rest.filter((heading) => heading.level === sectionLevel);
  const sections = tops.map((heading, index): ParsedSection => {
    const bodyStart = heading.line.end;
    const bodyEnd = tops[index + 1]?.line.start ?? text.length;
    return {
      id: index,
      heading: heading.text,
      level: heading.level,
      kind: sectionKind(heading.text),
      body: text.slice(bodyStart, bodyEnd).replace(/^\s*\n/, '').replace(/\s+$/, ''),
      headingLine: { start: heading.line.start, end: heading.line.end },
      bodySpan: { start: bodyStart, end: bodyEnd },
    };
  });
  return {
    title: titleHeading?.text ?? '',
    titleLine: titleHeading ? { start: titleHeading.line.start, end: titleHeading.line.end } : null,
    sections,
  };
}

export function parseTaskDocument(text: string): TaskDocument {
  const { title, sections } = parse(text);
  return { title, sections: sections.map(({ id, heading, level, kind, body }) => ({ id, heading, level, kind, body })) };
}

export interface TaskEdit {
  title: string;
  // Bodies of existing sections, by id; the handoff log is never changed here.
  bodies: { id: number; body: string }[];
  // Sections the task did not have yet, such as Notes; added before the handoff log.
  added: { kind: Exclude<TaskSectionKind, 'handoff' | 'other'>; body: string }[];
}

const block = (body: string): string => (body.trim() === '' ? '\n' : `\n${body.trim()}\n\n`);

export function applyTaskEdit(text: string, edit: TaskEdit, language: ContextLanguage): string {
  const parsed = parse(text);
  const replacements: { span: Span; text: string }[] = [];
  const title = edit.title.replace(/\s+/g, ' ').trim();
  if (title !== '' && title !== parsed.title) {
    if (parsed.titleLine) {
      const newline = text.slice(parsed.titleLine.start, parsed.titleLine.end).endsWith('\n') ? '\n' : '';
      replacements.push({ span: parsed.titleLine, text: `# ${title}${newline}` });
    } else {
      replacements.push({ span: { start: 0, end: 0 }, text: `# ${title}\n\n` });
    }
  }
  for (const { id, body } of edit.bodies) {
    const section = parsed.sections.find((item) => item.id === id);
    if (!section || section.kind === 'handoff' || body.trim() === section.body.trim()) continue;
    const isLast = section.bodySpan.end === text.length;
    replacements.push({ span: section.bodySpan, text: isLast ? `\n${body.trim()}\n` : block(body) });
  }
  const additions = edit.added.filter((item) => !parsed.sections.some((section) => section.kind === item.kind));
  if (additions.length > 0) {
    const level = parsed.sections[0]?.level ?? 2;
    const added = additions.map((item) => `${'#'.repeat(level)} ${SECTION_HEADINGS[language][item.kind]}\n${block(item.body)}`).join('');
    const handoff = parsed.sections.find((section) => section.kind === 'handoff');
    if (handoff) replacements.push({ span: { start: handoff.headingLine.start, end: handoff.headingLine.start }, text: added });
    else replacements.push({ span: { start: text.length, end: text.length }, text: `${text === '' || text.endsWith('\n\n') ? '' : text.endsWith('\n') ? '\n' : '\n\n'}${added.replace(/\n+$/, '\n')}` });
  }
  let result = text;
  for (const { span, text: replacement } of replacements.sort((a, b) => b.span.start - a.span.start)) {
    result = result.slice(0, span.start) + replacement + result.slice(span.end);
  }
  return result;
}

// Headings of a new task, in the documents' language. "Handoff log" stays English: the skills,
// the MCP server and the overview all look for it by that name.
const SECTION_HEADINGS: Record<ContextLanguage, Record<'goal' | 'criteria' | 'notes', string>> = {
  en: { goal: 'Goal', criteria: 'Acceptance criteria', notes: 'Notes' },
  vi: { goal: 'Mục tiêu', criteria: 'Tiêu chí hoàn thành (acceptance criteria)', notes: 'Ghi chú' },
  ko: { goal: '목표', criteria: '완료 조건 (acceptance criteria)', notes: '메모' },
};

export function newTaskDocument(input: { id: string; title: string; goal: string; language: ContextLanguage }): string {
  const headings = SECTION_HEADINGS[input.language];
  return [
    `# ${input.id} ${input.title.replace(/\s+/g, ' ').trim()}`,
    '',
    `Status: ${STATE_WORDS[input.language].todo}`,
    '',
    `## ${headings.goal}`,
    '',
    input.goal.trim(),
    '',
    `## ${headings.criteria}`,
    '',
    `## ${headings.notes}`,
    '',
    '## Handoff log',
    '',
  ].join('\n');
}

// --- Task states (ADR-021 item 4, review added 2026-11-09): five fixed values, written in the documents' language. ---

export const TASK_STATES = ['todo', 'active', 'blocked', 'review', 'done'] as const;
export type TaskState = (typeof TASK_STATES)[number];

export const STATE_WORDS: Record<ContextLanguage, Record<TaskState, string>> = {
  en: { todo: 'To do', active: 'In progress', blocked: 'Blocked', review: 'In review', done: 'Done' },
  vi: { todo: 'Cần làm', active: 'Đang làm', blocked: 'Bị chặn', review: 'Chờ duyệt', done: 'Xong' },
  ko: { todo: '대기', active: '진행 중', blocked: '막힘', review: '검토 중', done: '완료' },
};

// Whole words only; \b would not see Vietnamese or Korean letters.
const word = (alternatives: string): RegExp => new RegExp(`(?<![\\p{L}\\p{N}])(?:${alternatives})(?![\\p{L}\\p{N}])`, 'iu');
const DONE = word('done|xong|complete|completed|hoàn thành|closed|cancell?ed|huỷ|hủy|archived|완료|종료');
const BLOCKED = word('blocked|blocker|on hold|bị chặn|chặn|tạm dừng|막힘|보류|차단');
// Before ACTIVE: "đang review" is a review, not work in progress.
const REVIEW = word('in[ -]review|review|reviewing|needs review|chờ duyệt|duyệt|đang review|chờ review|검토 중|검토|리뷰');
const ACTIVE = word('in[ -]progress|doing|active|wip|đang làm|đang|진행 중|진행');

// The nearest of the four for whatever words an agent wrote; null when STATUS has no state.
export function stateGroup(state: string | null): TaskState | null {
  if (state === null || state.trim() === '') return null;
  if (DONE.test(state)) return 'done';
  if (BLOCKED.test(state)) return 'blocked';
  if (REVIEW.test(state)) return 'review';
  if (ACTIVE.test(state)) return 'active';
  return 'todo';
}

function escapeCell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
}

// Rewrites only the state cell of the task's row; adds a row, or a table, when there is none.
export function setStatusState(status: string | null, task: { id: string; title: string }, word: string, workstreamTitle: string): string {
  const text = status ?? `# ${workstreamTitle}\n`;
  const all = lines(text);
  const idPattern = new RegExp(`(?<![\\w-])${task.id}(?![\\d])`, 'i');
  for (const line of all) {
    if (!line.text.trim().startsWith('|')) continue;
    const cells = line.text.split('|');
    // cells[0] is before the first pipe; the task id is in the first real cell.
    if (cells.length < 4 || !idPattern.test(cells[1] ?? '')) continue;
    const cell = cells[2] ?? '';
    const leading = /^\s*/.exec(cell)?.[0] ?? ' ';
    const trailing = /\s*$/.exec(cell)?.[0] ?? ' ';
    cells[2] = `${leading || ' '}${escapeCell(word)}${trailing || ' '}`;
    const newline = text.slice(line.start, line.end).endsWith('\n') ? (text.slice(line.start, line.end).endsWith('\r\n') ? '\r\n' : '\n') : '';
    return text.slice(0, line.start) + cells.join('|') + newline + text.slice(line.end);
  }
  const row = `| ${escapeCell(`${task.id} ${task.title.replace(new RegExp(`^${task.id}\\s*`, 'i'), '')}`)} | ${escapeCell(word)} |`;
  // After the last row of a table that already lists tasks.
  const taskRows = all.filter((line) => line.text.trim().startsWith('|') && /TASK-\d+/i.test(line.text));
  const lastRow = taskRows.at(-1);
  if (lastRow) {
    const insertAt = lastRow.end;
    const prefix = text.slice(lastRow.start, lastRow.end).endsWith('\n') ? '' : '\n';
    return `${text.slice(0, insertAt)}${prefix}${row}\n${text.slice(insertAt)}`;
  }
  const base = text.replace(/\s*$/, '');
  return `${base}\n\n## Tasks\n\n| Task | Status |\n|---|---|\n${row}\n`;
}

// The next free TASK number across every workstream, so ids never repeat in a project.
export function nextTaskId(existing: readonly string[]): string {
  const highest = existing.reduce((max, id) => Math.max(max, Number(/TASK-(\d+)/i.exec(id)?.[1] ?? 0)), 0);
  return `TASK-${String(highest + 1).padStart(3, '0')}`;
}

export function taskSlug(title: string): string {
  const slug = title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
  return slug || 'task';
}

export const VERIFIED_LINES: Record<ContextLanguage, string> = {
  en: '- **Verified by user in AgentHub:** marked Done.',
  vi: '- **Người dùng xác nhận trong AgentHub (verified):** chuyển sang Xong.',
  ko: '- **AgentHub에서 사용자가 확인함 (verified):** 완료로 변경.',
};

const pad = (value: number): string => String(value).padStart(2, '0');

// "+0700" for the machine's offset at that moment, as `date +%z` prints it (ADR-026 item 4).
export function utcOffset(at: Date): string {
  const minutes = -at.getTimezoneOffset();
  const sign = minutes < 0 ? '-' : '+';
  return `${sign}${pad(Math.floor(Math.abs(minutes) / 60))}${pad(Math.abs(minutes) % 60)}`;
}

// A handoff entry with an absolute local time and its offset, in the shape the overview reads back.
export function verifiedHandoff(at: Date, language: ContextLanguage): string {
  const stamp = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} ${pad(at.getHours())}:${pad(at.getMinutes())}${utcOffset(at)}`;
  return `### ${stamp} — AgentHub\n${VERIFIED_LINES[language]}`;
}

// --- ADR-023 item 4: the task file's own "Status:" line. ---

// Rewrites the "Status:" line between the title and the first section, or adds one under the title.
export function setTaskFileState(text: string, word: string): string {
  const all = lines(text);
  let seenTitle = false;
  let titleLine: (typeof all)[number] | null = null;
  for (const line of all) {
    if (/^#[ \t]/.test(line.text)) {
      if (seenTitle) break;
      seenTitle = true;
      titleLine = line;
      continue;
    }
    if (/^#{2,6}[ \t]/.test(line.text)) break;
    const match = /^([ \t]*(?:[-*][ \t]+)?(?:\*\*|__)?(?:Status|Trạng thái|상태)(?:\*\*|__)?[ \t]*:(?:\*\*|__)?[ \t]*)(.*?)([ \t]*)$/iu.exec(line.text);
    if (!match) continue;
    const newline = text.slice(line.start, line.end).endsWith('\r\n') ? '\r\n' : text.slice(line.start, line.end).endsWith('\n') ? '\n' : '';
    // Keeps the agent's bold markers around the word.
    const value = match[2] ?? '';
    const bold = /^(\*\*|__)(.*?)(\*\*|__)$/.exec(value);
    const replaced = bold ? `${bold[1]}${word}${bold[3]}` : word;
    return text.slice(0, line.start) + (match[1] ?? '') + replaced + newline + text.slice(line.end);
  }
  if (!titleLine) return `Status: ${word}\n\n${text}`;
  const rest = text.slice(titleLine.end).replace(/^(?:[ \t]*\r?\n)+/, '');
  const titleText = text.slice(0, titleLine.end);
  return `${titleText}${titleText.endsWith('\n') ? '' : '\n'}\nStatus: ${word}\n${rest === '' ? '' : `\n${rest}`}`;
}

// --- ADR-027: tasks created under a lock, renumbered when two share a number. ---

// A task an agent wrote the body of (context_create_task): AgentHub sets the title and the
// "Status:" line, and adds the "Handoff log" section when the body has none.
export function taskDocumentFromBody(input: { id: string; title: string; body: string; language: ContextLanguage }): string {
  // An agent may repeat the title or the state line; they are AgentHub's to write here.
  const body = input.body
    .replace(/^\s*#[ \t].*\r?\n/, '')
    .replace(/^\s*(?:[-*][ \t]+)?(?:\*\*|__)?(?:Status|Trạng thái|상태)(?:\*\*|__)?[ \t]*:.*\r?\n/iu, '')
    .trim();
  const handoffLog = /^#{1,6}[ \t]+Handoff log\b/im.test(body) ? '' : '\n\n## Handoff log\n';
  return `# ${input.id} ${input.title.replace(/\s+/g, ' ').trim()}\n\nStatus: ${STATE_WORDS[input.language].todo}\n\n${body}${handoffLog}`.replace(/\s*$/, '\n');
}

const idPatternOf = (id: string): RegExp => new RegExp(`(?<![\\w-])${id}(?![\\d])`, 'i');

// The title line gets the new number; a note under the state line keeps the old one findable.
export function renumberTaskDocument(text: string, oldId: string, newId: string): string {
  const all = lines(text);
  const title = all.find((line) => /^#[ \t]/.test(line.text));
  let result = text;
  if (title && idPatternOf(oldId).test(title.text)) {
    result = text.slice(0, title.start) + text.slice(title.start, title.end).replace(idPatternOf(oldId), newId) + text.slice(title.end);
  }
  const note = `Renumbered from ${oldId}.`;
  const after = lines(result);
  let anchor: (typeof after)[number] | null = null;
  let seenTitle = false;
  for (const line of after) {
    if (/^#[ \t]/.test(line.text)) {
      if (seenTitle) break;
      seenTitle = true;
      anchor = line;
      continue;
    }
    if (/^#{2,6}[ \t]/.test(line.text)) break;
    if (/^[ \t]*(?:[-*][ \t]+)?(?:\*\*|__)?(?:Status|Trạng thái|상태)(?:\*\*|__)?[ \t]*:/iu.test(line.text)) {
      anchor = line;
      break;
    }
  }
  if (!anchor) return `${note}\n\n${result}`;
  const newline = result.slice(anchor.start, anchor.end).endsWith('\n') ? '' : '\n';
  return `${result.slice(0, anchor.end)}${newline}${note}\n${result.slice(anchor.end)}`;
}

// The STATUS row of the renumbered task: the row naming the old number and the task's title. When
// none names the title, the row belongs to the other task, so a new row is added instead.
export function renumberStatusRow(status: string, task: { oldId: string; newId: string; title: string }, word: string, workstreamTitle: string): string {
  const titleText = task.title
    .replace(new RegExp(`^${task.oldId}[\\s:.-]*`, 'i'), '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  for (const line of lines(status)) {
    if (!line.text.trim().startsWith('|')) continue;
    const cells = line.text.split('|');
    const first = cells[1] ?? '';
    if (cells.length < 4 || !idPatternOf(task.oldId).test(first)) continue;
    if (titleText === '' || !first.replace(/\s+/g, ' ').toLowerCase().includes(titleText)) continue;
    cells[1] = first.replace(idPatternOf(task.oldId), task.newId);
    const original = status.slice(line.start, line.end);
    const newline = original.endsWith('\r\n') ? '\r\n' : original.endsWith('\n') ? '\n' : '';
    return status.slice(0, line.start) + cells.join('|') + newline + status.slice(line.end);
  }
  return setStatusState(status, { id: task.newId, title: task.title.replace(new RegExp(`^${task.oldId}[\\s:.-]*`, 'i'), '') }, word, workstreamTitle);
}

// --- ADR-023 item 2: the empty layout AgentHub writes when the user creates documents. ---

export const DEFAULT_WORKSTREAM = 'Workstreams/main';

const SCAFFOLD_TEXT: Record<ContextLanguage, { readme: string; projectContext: string; workstream: string; tasks: string }> = {
  en: {
    readme: [
      '# Project context',
      '',
      'Shared context for the agents working on this project, kept by AgentHub and the agents (skills context-init, context-resume, context-checkpoint).',
      '',
      '- `PROJECT_CONTEXT.md`: environment, glossary and pitfalls for the whole project.',
      '- `Workstreams/<name>/STATUS.md`: what is in progress, blockers, next steps and the task table.',
      '- `Workstreams/<name>/Tasks/TASK-NNN-<slug>.md`: goal, acceptance criteria, notes, a `Status:` line and the handoff log (newest first).',
      '',
      'Write absolute dates. Keep reported, observed and verified apart.',
      '',
    ].join('\n'),
    projectContext: '# Project context\n\n## Environment\n\n## Glossary\n\n## Pitfalls\n',
    workstream: 'Main',
    tasks: 'Tasks',
  },
  vi: {
    readme: [
      '# Tài liệu context của project',
      '',
      'Ngữ cảnh dùng chung cho các agent làm việc trên project này, do AgentHub và agent duy trì (skill context-init, context-resume, context-checkpoint).',
      '',
      '- `PROJECT_CONTEXT.md`: môi trường, thuật ngữ, pitfalls của cả project.',
      '- `Workstreams/<tên>/STATUS.md`: đang làm gì, blocker, bước tiếp theo và bảng task.',
      '- `Workstreams/<tên>/Tasks/TASK-NNN-<slug>.md`: mục tiêu, tiêu chí hoàn thành, ghi chú, dòng `Status:` và Handoff log (mới nhất ở trên).',
      '',
      'Ghi ngày tuyệt đối. Tách rõ reported, observed và verified.',
      '',
    ].join('\n'),
    projectContext: '# Ngữ cảnh project\n\n## Môi trường\n\n## Thuật ngữ\n\n## Pitfalls\n',
    workstream: 'Chung',
    tasks: 'Task',
  },
  ko: {
    readme: [
      '# 프로젝트 컨텍스트',
      '',
      '이 프로젝트에서 일하는 에이전트가 함께 쓰는 컨텍스트로, AgentHub와 에이전트가 관리합니다 (스킬 context-init, context-resume, context-checkpoint).',
      '',
      '- `PROJECT_CONTEXT.md`: 프로젝트 전체의 환경, 용어, 주의 사항.',
      '- `Workstreams/<이름>/STATUS.md`: 진행 중인 일, 블로커, 다음 단계, 태스크 표.',
      '- `Workstreams/<이름>/Tasks/TASK-NNN-<slug>.md`: 목표, 완료 조건, 메모, `Status:` 줄, Handoff log (최신이 위).',
      '',
      '날짜는 절대 날짜로 쓰고, reported, observed, verified를 구분합니다.',
      '',
    ].join('\n'),
    projectContext: '# 프로젝트 컨텍스트\n\n## 환경\n\n## 용어\n\n## 주의 사항\n',
    workstream: '기본',
    tasks: '태스크',
  },
};

export function workstreamStatusDocument(title: string, language: ContextLanguage): string {
  return `# ${title.replace(/\s+/g, ' ').trim()}\n\n## ${SCAFFOLD_TEXT[language].tasks}\n\n| Task | Status |\n|---|---|\n`;
}

// Files of an empty set of documents, relative to its folder; folders end with "/".
export function contextScaffold(language: ContextLanguage): { path: string; content: string | null }[] {
  const text = SCAFFOLD_TEXT[language];
  return [
    { path: 'README.md', content: text.readme },
    { path: 'PROJECT_CONTEXT.md', content: text.projectContext },
    { path: `${DEFAULT_WORKSTREAM}/STATUS.md`, content: workstreamStatusDocument(text.workstream, language) },
    { path: `${DEFAULT_WORKSTREAM}/Tasks/`, content: null },
  ];
}
