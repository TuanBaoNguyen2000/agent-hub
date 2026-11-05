import type { ContextLanguageDto, ProjectDto } from '@agenthub/contracts';
import { useState } from 'react';
import { api, unwrap } from './api';
import { Dialog, Segmented } from './ui';

export const LANGUAGE_OPTIONS: readonly { value: ContextLanguageDto; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'vi', label: 'Tiếng Việt' },
];

interface Props {
  project: ProjectDto;
  onChanged: (project: ProjectDto) => void;
  onCreateDocs: () => void;
  onError: (message: string | undefined) => void;
}

// Where the project's context documents live (ADR-019). Agents write them; the user reads them in
// their own editor, so AgentHub only keeps the settings. Stopping never deletes the files.
export function ProjectSettings({ project, onChanged, onCreateDocs, onError }: Props) {
  const { context } = project;
  // A new place waiting for the user to say whether the files move with it (ADR-020 item 5).
  const [asking, setAsking] = useState<{ customPath: string | null; files: number }>();
  const [result, setResult] = useState<string>();

  // Every change of place goes through here: Main asks back when the old folder has files.
  async function changePlace(customPath: string | null, move: 'ask' | 'move' | 'leave' = 'ask'): Promise<void> {
    onError(undefined);
    setResult(undefined);
    setAsking(undefined);
    try {
      const change = await unwrap(api.moveProjectContext({ id: project.id, customPath, move }));
      if (change.status === 'needs_decision') {
        setAsking({ customPath, files: change.files });
        return;
      }
      if (change.status === 'conflict') {
        const listed = change.conflicts.slice(0, 10).join(', ');
        const more = change.conflicts.length > 10 ? ` và ${change.conflicts.length - 10} file khác` : '';
        onError(`Không chuyển: folder mới đã có ${listed}${more}. AgentHub không ghi đè file nào; nơi lưu chưa đổi.`);
        return;
      }
      onChanged(change.project);
      if (change.moved > 0) {
        setResult(
          change.kept
            ? `Đã chuyển ${change.moved} file. Folder cũ vẫn còn ở ${change.kept}; bạn tự xoá nếu không cần.`
            : `Đã chuyển ${change.moved} file. Folder cũ trong dữ liệu AgentHub đã vào Thùng rác.`,
        );
      }
    } catch (reason) {
      onError((reason as Error).message);
    }
  }

  async function update(input: { enabled?: boolean; language?: ContextLanguageDto; customPath?: string | null }): Promise<void> {
    onError(undefined);
    try {
      onChanged(await unwrap(api.updateProjectContext({ id: project.id, ...input })));
    } catch (reason) {
      onError((reason as Error).message);
    }
  }

  async function chooseFolder(): Promise<void> {
    try {
      const path = await unwrap(api.pickProjectFolder());
      if (path) await changePlace(path);
    } catch (reason) {
      onError((reason as Error).message);
    }
  }

  async function openFolder(): Promise<void> {
    onError(undefined);
    try {
      await unwrap(api.openContextFolder({ id: project.id }));
    } catch (reason) {
      onError((reason as Error).message);
    }
  }

  function stop(): void {
    const accepted = window.confirm(
      `Ngừng dùng tài liệu context cho "${project.name}"?\n\nCác file trong ${context.path} vẫn còn nguyên. Lần mở account sau sẽ không đọc chúng nữa; ngữ cảnh đi qua handoff tóm tắt.`,
    );
    if (accepted) void update({ enabled: false });
  }

  return (
    <section className="settings-group" aria-label="Cài đặt tài liệu context">
      <div className="settings-group-header">
        <div className="grow settings-row-text">
          <h2>Tài liệu context</h2>
          <p className="hint">
            Agent ghi ngữ cảnh của project vào bộ tài liệu này, để account và provider nào cũng đọc được cùng một bản. AgentHub không sửa tài liệu.
          </p>
        </div>
      </div>
      {!context.enabled && (
        <div className="settings-row">
          <p className="hint grow">Project này chưa dùng tài liệu context.</p>
          <button type="button" onClick={onCreateDocs}>
            Tạo tài liệu context
          </button>
        </div>
      )}
      {context.enabled && (
        <>
          <div className="settings-row">
            <div className="grow settings-row-text">
              <span className="settings-row-label">Nơi lưu</span>
              <span className="hint">
                {context.custom
                  ? 'Folder bạn chọn. Nếu nằm trong repo, tài liệu đi theo branch và bạn quyết định có commit hay không.'
                  : 'Trong dữ liệu của AgentHub, không vào repo và không đổi theo branch.'}
              </span>
              <span className="path" data-testid="context-path">
                {context.path}
              </span>
              {context.pathStatus !== 'directory' && context.custom && <span className="warning-text">Không tìm thấy folder này trên máy.</span>}
              {result && (
                <span className="hint" role="status">
                  {result}
                </span>
              )}
            </div>
            <div className="row">
              <button type="button" onClick={() => void chooseFolder()}>
                Chọn folder khác
              </button>
              {context.custom && (
                <button type="button" onClick={() => void changePlace(null)}>
                  Dùng mặc định
                </button>
              )}
            </div>
          </div>
          <div className="settings-row">
            <div className="grow">
              <span className="settings-row-label">Ngôn ngữ tài liệu</span>
            </div>
            <Segmented label="Ngôn ngữ tài liệu" value={context.language} options={LANGUAGE_OPTIONS} onChange={(language) => void update({ language })} />
          </div>
          <div className="settings-row">
            <p className="hint grow">Mở folder trong Finder hoặc editor của bạn để đọc tài liệu.</p>
            <button type="button" onClick={() => void openFolder()}>
              Mở folder tài liệu
            </button>
          </div>
          <div className="settings-row">
            <p className="hint grow">Ngừng dùng không xoá file nào; bạn tạo lại hoặc trỏ lại folder này sau được.</p>
            <button type="button" onClick={stop}>
              Ngừng dùng tài liệu
            </button>
          </div>
        </>
      )}
      {asking && (
        <Dialog
          label="Chuyển tài liệu"
          title="Chuyển tài liệu sang nơi mới?"
          onClose={() => setAsking(undefined)}
          actions={
            <>
              <button type="button" onClick={() => setAsking(undefined)}>
                Huỷ
              </button>
              <button type="button" onClick={() => void changePlace(asking.customPath, 'leave')}>
                Không chuyển
              </button>
              <button type="button" className="primary" onClick={() => void changePlace(asking.customPath, 'move')}>
                Chuyển
              </button>
            </>
          }
        >
          <p>
            Folder hiện tại có {asking.files} file. Chuyển: AgentHub copy chúng sang {asking.customPath ?? 'dữ liệu AgentHub'}, không ghi đè file đã có
            {context.custom ? ', và để nguyên folder cũ.' : ', rồi đưa folder cũ vào Thùng rác.'}
          </p>
          <p className="hint">Không chuyển: project dùng folder mới, các file cũ vẫn ở chỗ cũ.</p>
        </Dialog>
      )}
    </section>
  );
}
