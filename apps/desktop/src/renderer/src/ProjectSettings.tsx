import type { ContextLanguageDto, ProjectDto, UiLanguageDto } from '@agenthub/contracts';
import { LANGUAGE_LABELS, LOCALES } from '@agenthub/i18n';
import { useState } from 'react';
import { api, unwrap } from './api';
import { useI18n } from './i18n';
import { Dialog, PathText, Segmented } from './ui';

// Each language by its own name, whatever the interface language.
export const LANGUAGE_OPTIONS: readonly { value: ContextLanguageDto; label: string }[] = LOCALES.map((value) => ({ value, label: LANGUAGE_LABELS[value] }));

interface Props {
  project: ProjectDto;
  onChanged: (project: ProjectDto) => void;
  onCreateDocs: () => void;
  onError: (message: string | undefined) => void;
}

// Where the project's context documents live (ADR-019). Agents write them; the user reads them in
// their own editor, so AgentHub only keeps the settings. Stopping never deletes the files.
export function ProjectSettings({ project, onChanged, onCreateDocs, onError }: Props) {
  const { t } = useI18n();
  const { context } = project;
  // A new place waiting for the user to say whether the files move with it (ADR-020 item 5).
  const [asking, setAsking] = useState<{ customPath: string | null; files: number }>();
  const [result, setResult] = useState<string>();
  const [name, setName] = useState(project.name);

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
        const files = change.conflicts.length > 10 ? t('settings.docs.conflictMore', { listed, more: change.conflicts.length - 10 }) : listed;
        onError(t('settings.docs.conflict', { files }));
        return;
      }
      onChanged(change.project);
      if (change.moved > 0) {
        setResult(
          change.kept
            ? t('settings.docs.movedKept', { count: change.moved, path: change.kept })
            : t('settings.docs.movedTrashed', { count: change.moved }),
        );
      }
    } catch (reason) {
      onError((reason as Error).message);
    }
  }

  async function update(input: { enabled?: boolean; language?: ContextLanguageDto; customPath?: string | null; chatLanguage?: UiLanguageDto | null }): Promise<void> {
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
    const accepted = window.confirm(t('settings.docs.stopConfirm', { project: project.name, path: context.path }));
    if (accepted) void update({ enabled: false });
  }

  const chatOptions: { value: UiLanguageDto | 'app'; label: string }[] = [
    { value: 'app', label: t('settings.chat.followApp') },
    ...LOCALES.map((value) => ({ value, label: LANGUAGE_LABELS[value] })),
  ];

  async function rename(): Promise<void> {
    const next = name.trim();
    if (next === project.name) {
      setName(project.name);
      return;
    }
    onError(undefined);
    try {
      const updated = await unwrap(api.updateProject({ id: project.id, name }));
      onChanged(updated);
      setName(updated.name);
    } catch (reason) {
      setName(project.name);
      onError((reason as Error).message);
    }
  }

  return (
    <>
    <section className="settings-group" aria-label={t('settings.chat.projectRegion')}>
      <label className="settings-row">
        <span className="grow settings-row-label">{t('field.projectName')}</span>
        <input
          className="name-input"
          aria-label={t('field.projectName')}
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={() => void rename()}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
        />
      </label>
      <div className="settings-row">
        <div className="grow settings-row-text">
          <span className="settings-row-label">{t('settings.chat.label')}</span>
          <span className="hint">{t('settings.chat.projectHint')}</span>
        </div>
        <Segmented
          label={t('settings.chat.label')}
          value={project.chatLanguage ?? 'app'}
          options={chatOptions}
          onChange={(value) => void update({ chatLanguage: value === 'app' ? null : value })}
        />
      </div>
    </section>
    <section className="settings-group" aria-label={t('settings.docs.region')}>
      <div className="settings-group-header">
        <div className="grow settings-row-text">
          <h2>{t('settings.docs.title')}</h2>
          <p className="hint">{t('settings.docs.hint')}</p>
        </div>
      </div>
      {!context.enabled && (
        <div className="settings-row">
          <p className="hint grow">{t('settings.docs.off')}</p>
          <button type="button" onClick={onCreateDocs}>
            {t('docs.create')}
          </button>
        </div>
      )}
      {context.enabled && (
        <>
          <div className="settings-row">
            <div className="grow settings-row-text">
              <span className="settings-row-label">{t('settings.docs.place')}</span>
              <span className="hint">{t(context.custom ? 'settings.docs.placeCustom' : 'settings.docs.placeDefault')}</span>
              <span className="path" data-testid="context-path">
                <PathText path={context.path} />
              </span>
              {context.pathStatus !== 'directory' && context.custom && <span className="warning-text">{t('settings.docs.folderGone')}</span>}
              {result && (
                <span className="hint" role="status">
                  {result}
                </span>
              )}
            </div>
            <div className="row">
              <button type="button" onClick={() => void chooseFolder()}>
                {t('settings.docs.chooseOther')}
              </button>
              {context.custom && (
                <button type="button" onClick={() => void changePlace(null)}>
                  {t('settings.docs.useDefault')}
                </button>
              )}
            </div>
          </div>
          <div className="settings-row">
            <div className="grow">
              <span className="settings-row-label">{t('settings.docs.language')}</span>
            </div>
            <Segmented label={t('settings.docs.language')} value={context.language} options={LANGUAGE_OPTIONS} onChange={(language) => void update({ language })} />
          </div>
          <div className="settings-row">
            <p className="hint grow">{t('settings.docs.openHint')}</p>
            <button type="button" onClick={() => void openFolder()}>
              {t('settings.docs.open')}
            </button>
          </div>
          <div className="settings-row">
            <p className="hint grow">{t('settings.docs.stopHint')}</p>
            <button type="button" onClick={stop}>
              {t('settings.docs.stop')}
            </button>
          </div>
        </>
      )}
      {asking && (
        <Dialog
          label={t('settings.docs.moveLabel')}
          title={t('settings.docs.moveTitle')}
          onClose={() => setAsking(undefined)}
          actions={
            <>
              <button type="button" onClick={() => setAsking(undefined)}>
                {t('common.cancel')}
              </button>
              <button type="button" onClick={() => void changePlace(asking.customPath, 'leave')}>
                {t('settings.docs.leave')}
              </button>
              <button type="button" className="primary" onClick={() => void changePlace(asking.customPath, 'move')}>
                {t('settings.docs.move')}
              </button>
            </>
          }
        >
          <p>
            {t(context.custom ? 'settings.docs.moveBodyKeep' : 'settings.docs.moveBodyTrash', {
              count: asking.files,
              target: asking.customPath ?? t('settings.docs.agentHubData'),
            })}
          </p>
          <p className="hint">{t('settings.docs.leaveHint')}</p>
        </Dialog>
      )}
    </section>
    </>
  );
}
