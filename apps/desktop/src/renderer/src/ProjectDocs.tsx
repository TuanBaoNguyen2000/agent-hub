import type { ContextLanguageDto, ProjectContextDto, ProjectDto } from '@agenthub/contracts';
import { useState } from 'react';
import { api, unwrap } from './api';
import { CopyButton } from './CopyButton';
import { LANGUAGE_OPTIONS } from './ProjectSettings';
import { Dialog, Segmented } from './ui';

function gitText(git: ProjectContextDto['git']): string {
  if (git.state === 'not_repo') return 'Folder project không phải Git repo.';
  if (git.state === 'unknown') return 'Không đọc được Git.';
  const parts = [git.branch ? `Branch ${git.branch}` : 'Detached HEAD'];
  if (git.head) parts.push(git.head.slice(0, 7));
  if (git.dirty) parts.push('có thay đổi chưa commit');
  return parts.join(' · ');
}

// An agent compares the documents with the code; AgentHub only checks their layout (ADR-020 item 3).
const reconcilePrompt = (path: string): string =>
  `Compare the AgentHub context documents in ${path} with the current code and Git state of this project. List what is out of date, missing or contradicted by the code. Do not change any file until I confirm.`;

const timeText = (date: Date): string => date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

interface Props {
  project: ProjectDto;
  context: ProjectContextDto | undefined;
  onChanged: (project: ProjectDto) => void;
  onCreate: () => void;
  // Reads the documents and Git again.
  onCheck: () => Promise<void>;
  onShowTasks: () => void;
  onError: (message: string | undefined) => void;
}

// The documents card on the overview: buttons instead of an on/off switch (ADR-020 item 3).
export function ProjectDocs({ project, context, onChanged, onCreate, onCheck, onShowTasks, onError }: Props) {
  const [checkedAt, setCheckedAt] = useState<Date>();
  const [checking, setChecking] = useState(false);
  const settings = project.context;

  async function cancelCreate(): Promise<void> {
    onError(undefined);
    try {
      onChanged(await unwrap(api.updateProjectContext({ id: project.id, enabled: false })));
    } catch (reason) {
      onError((reason as Error).message);
    }
  }

  async function check(): Promise<void> {
    setChecking(true);
    await onCheck();
    setChecking(false);
    setCheckedAt(new Date());
  }

  async function openFolder(): Promise<void> {
    onError(undefined);
    try {
      await unwrap(api.openContextFolder({ id: project.id }));
    } catch (reason) {
      onError((reason as Error).message);
    }
  }

  if (!settings.enabled) {
    return (
      <section className="settings-group" aria-label="Tài liệu context">
        <div className="settings-group-header">
          <div className="grow settings-row-text">
            <h2>Tài liệu context</h2>
            <p className="hint">
              Chưa dùng. Ngữ cảnh đi qua handoff tóm tắt (tab Handoff). Với tài liệu, agent ghi brief, workstream, task và handoff vào một bộ file mà
              account và provider nào cũng đọc được.
            </p>
          </div>
          <button type="button" className="primary" onClick={onCreate}>
            Tạo tài liệu context
          </button>
        </div>
      </section>
    );
  }

  if (!context) return null;
  const { overview, warnings, git } = context;

  if (!overview.initialized) {
    return (
      <section className="settings-group" aria-label="Tài liệu context">
        <div className="settings-group-header">
          <div className="grow settings-row-text">
            <h2>Tài liệu context</h2>
            <p className="hint">Mở một account ở trên; agent dùng context-init, khảo sát code rồi hỏi bạn brief trước khi viết tài liệu.</p>
            <span className="path" data-testid="context-path">
              {settings.path}
            </span>
            {settings.pathStatus !== 'directory' && <span className="warning-text">Không tìm thấy folder này trên máy.</span>}
          </div>
          <div className="row nowrap">
            <button type="button" disabled={checking} onClick={() => void check()}>
              Kiểm tra tài liệu
            </button>
            <button type="button" onClick={() => void cancelCreate()}>
              Huỷ tạo
            </button>
          </div>
        </div>
      </section>
    );
  }

  const tasks = overview.workstreams.reduce((count, workstream) => count + workstream.tasks.length, 0);
  const projectWarnings = warnings.filter((warning) => warning.taskRef === null);
  const taskWarnings = warnings.length - projectWarnings.length;

  return (
    <section className="settings-group" aria-label="Tài liệu context">
      <div className="settings-group-header">
        <div className="grow settings-row-text">
          <h2>Tài liệu context</h2>
          <p className="hint" data-testid="context-summary">
            {overview.workstreams.length} workstream · {tasks} task
          </p>
          <span className="path" data-testid="context-path">
            {settings.path}
          </span>
        </div>
        <div className="row nowrap">
          <button type="button" disabled={checking} onClick={() => void check()}>
            Kiểm tra tài liệu
          </button>
          <button type="button" onClick={() => void openFolder()}>
            Mở folder
          </button>
        </div>
      </div>
      <div className="settings-row">
        <p className="hint grow" data-testid="git-observation">
          {gitText(git)}
        </p>
      </div>
      {(projectWarnings.length > 0 || taskWarnings > 0) && (
        <div className="settings-row">
          <div className="stack grow">
            {projectWarnings.length > 0 && (
              <ul className="warning-list" aria-label="Cảnh báo">
                {projectWarnings.map((warning) => (
                  <li key={warning.message} className="warning-text">
                    {warning.message}
                  </li>
                ))}
              </ul>
            )}
            {taskWarnings > 0 && (
              <p className="hint">
                {taskWarnings} cảnh báo ở từng task.{' '}
                <button type="button" className="link" onClick={onShowTasks}>
                  Xem ở tab Task
                </button>
              </p>
            )}
          </div>
        </div>
      )}
      {checkedAt && (
        <div className="settings-row">
          <p className="hint grow" role="status">
            Đã đọc lại tài liệu lúc {timeText(checkedAt)}: {warnings.length === 0 ? 'không thấy vấn đề.' : `${warnings.length} cảnh báo.`}
          </p>
        </div>
      )}
      <div className="settings-row">
        <p className="hint grow">AgentHub chỉ kiểm tra cấu trúc. Để agent đối chiếu nội dung với code, dán lời nhắc này vào một phiên đang mở.</p>
        <CopyButton text={reconcilePrompt(settings.path)} label="Copy lời nhắc đối chiếu" />
      </div>
    </section>
  );
}

interface CreateProps {
  project: ProjectDto;
  onClose: () => void;
  onCreated: (project: ProjectDto) => void;
  onError: (message: string | undefined) => void;
}

const PLACES = [
  { value: 'agenthub', label: 'Dữ liệu AgentHub' },
  { value: 'folder', label: 'Folder khác' },
] as const;

// Chooses where the documents go and their language; the next launch runs context-init.
export function CreateDocsDialog({ project, onClose, onCreated, onError }: CreateProps) {
  const [place, setPlace] = useState<'agenthub' | 'folder'>(project.context.custom ? 'folder' : 'agenthub');
  const [folder, setFolder] = useState<string | null>(project.context.custom ? project.context.path : null);
  const [language, setLanguage] = useState<ContextLanguageDto>(project.context.language);
  const [saving, setSaving] = useState(false);

  async function chooseFolder(): Promise<void> {
    try {
      const path = await unwrap(api.pickProjectFolder());
      if (path) setFolder(path);
    } catch (reason) {
      onError((reason as Error).message);
    }
  }

  async function create(): Promise<void> {
    setSaving(true);
    onError(undefined);
    try {
      const customPath = place === 'folder' ? folder : null;
      onCreated(await unwrap(api.updateProjectContext({ id: project.id, enabled: true, language, customPath })));
    } catch (reason) {
      onError((reason as Error).message);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      label="Tạo tài liệu context"
      title="Tạo tài liệu context"
      onClose={onClose}
      actions={
        <>
          <button type="button" onClick={onClose}>
            Huỷ
          </button>
          <button type="button" className="primary" disabled={saving || (place === 'folder' && !folder)} onClick={() => void create()}>
            Tạo tài liệu
          </button>
        </>
      }
    >
      <p className="hint">AgentHub chỉ chuẩn bị folder. Lần mở account tiếp theo, agent khảo sát code, hỏi bạn brief rồi viết tài liệu.</p>
      <div className="field">
        <span className="field-label">Nơi lưu</span>
        <Segmented label="Nơi lưu" value={place} options={PLACES} onChange={setPlace} />
        <span className="hint">
          {place === 'agenthub'
            ? 'Trong dữ liệu của AgentHub: không vào repo và không đổi theo branch.'
            : 'Một folder bạn chọn. Nếu nằm trong repo, tài liệu đi theo branch, hiện trong git status, và bạn quyết định có commit hay không.'}
        </span>
        {place === 'folder' && (
          <div className="row">
            <span className="path grow" data-testid="create-docs-folder">
              {folder ?? 'Chưa chọn folder'}
            </span>
            <button type="button" onClick={() => void chooseFolder()}>
              Chọn folder…
            </button>
          </div>
        )}
      </div>
      <div className="field">
        <span className="field-label">Ngôn ngữ tài liệu</span>
        <Segmented label="Ngôn ngữ tài liệu" value={language} options={LANGUAGE_OPTIONS} onChange={setLanguage} />
      </div>
    </Dialog>
  );
}

export type DocsNotice = { kind: 'applied'; path: string } | { kind: 'choose'; found: string[] };

const inside = (path: string, folder: string | null): boolean => folder !== null && (path === folder || path.startsWith(`${folder}/`));

interface NoticeProps {
  project: ProjectDto;
  notice: DocsNotice;
  onChanged: (project: ProjectDto) => void;
  onElsewhere: () => void;
  onCreate: () => void;
  onClose: () => void;
  onError: (message: string | undefined) => void;
}

// ADR-020 item 4: documents found in the project folder. One set is used at once and only
// announced; several are listed for the user to pick.
export function DocsFoundNotice({ project, notice, onChanged, onElsewhere, onCreate, onClose, onError }: NoticeProps) {
  async function use(path: string): Promise<void> {
    onError(undefined);
    try {
      onChanged(await unwrap(api.updateProjectContext({ id: project.id, enabled: true, customPath: path })));
      onClose();
    } catch (reason) {
      onError((reason as Error).message);
    }
  }

  if (notice.kind === 'applied') {
    return (
      <div className="banner notice" role="status" aria-label="Tài liệu có sẵn">
        <p>
          Đã dùng bộ tài liệu có sẵn trong folder project: <span className="path">{notice.path}</span>
        </p>
        <p className="hint">
          Agent sẽ đọc và ghi vào folder này.
          {inside(notice.path, project.path) && ' Folder nằm trong repo, nên thay đổi của agent sẽ hiện trong git status.'}
        </p>
        <div className="row">
          <button type="button" onClick={onElsewhere}>
            Dùng nơi khác
          </button>
          <button type="button" onClick={onClose}>
            Đóng
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="banner notice" role="group" aria-label="Tài liệu có sẵn">
      <p>Folder project có {notice.found.length} bộ tài liệu cùng khuôn với AgentHub. Chọn bộ project này dùng:</p>
      <ul className="found-list">
        {notice.found.map((path) => (
          <li key={path} className="row nowrap">
            <span className="path grow">{path}</span>
            <button type="button" onClick={() => void use(path)}>
              Dùng folder này
            </button>
          </li>
        ))}
      </ul>
      <div className="row">
        <button type="button" onClick={onCreate}>
          Tạo bộ mới
        </button>
        <button type="button" onClick={onClose}>
          Bỏ qua
        </button>
      </div>
    </div>
  );
}
