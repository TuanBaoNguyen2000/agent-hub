import type { ContextLanguageDto, ProjectDto } from '@agenthub/contracts';
import { api, unwrap } from './api';
import { Segmented } from './ui';

const LANGUAGE_OPTIONS: readonly { value: ContextLanguageDto; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'vi', label: 'Tiếng Việt' },
];

const ENABLED_OPTIONS = [
  { value: 'off', label: 'Tắt' },
  { value: 'on', label: 'Bật' },
] as const;

interface Props {
  project: ProjectDto;
  onChanged: (project: ProjectDto) => void;
  onError: (message: string | undefined) => void;
}

// Where the project's context documents live (ADR-019). Agents write them; the user reads
// them in their own editor, so AgentHub only keeps the settings.
export function ProjectContext({ project, onChanged, onError }: Props) {
  const { context } = project;

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
      if (path) await update({ customPath: path });
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

  return (
    <section className="settings-group" aria-label="Tài liệu context">
      <div className="settings-group-header">
        <div className="grow settings-row-text">
          <h2>Tài liệu context</h2>
          <p className="hint">
            Agent ghi ngữ cảnh của project vào bộ tài liệu này qua skill và MCP, để account và provider nào cũng đọc được cùng một bản. Tuỳ chọn.
          </p>
        </div>
        <Segmented
          label="Tài liệu context"
          value={context.enabled ? 'on' : 'off'}
          options={ENABLED_OPTIONS}
          onChange={(value) => void update({ enabled: value === 'on' })}
        />
      </div>
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
              {context.pathStatus !== 'directory' && context.custom && (
                <span className="warning-text">Không tìm thấy folder này trên máy.</span>
              )}
            </div>
            <div className="row">
              <button type="button" onClick={() => void chooseFolder()}>
                Chọn folder khác
              </button>
              {context.custom && (
                <button type="button" onClick={() => void update({ customPath: null })}>
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
            <p className="hint grow">AgentHub không sửa tài liệu. Mở folder trong Finder hoặc editor của bạn để đọc.</p>
            <button type="button" onClick={() => void openFolder()}>
              Mở folder tài liệu
            </button>
          </div>
        </>
      )}
    </section>
  );
}
