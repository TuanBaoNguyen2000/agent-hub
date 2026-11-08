import type { ContextLanguageDto, ContextLocationDto, FolderScanDto, ProjectDto } from '@agenthub/contracts';
import { useEffect, useState } from 'react';
import { api, unwrap } from './api';
import { useI18n } from './i18n';
import { LANGUAGE_OPTIONS } from './ProjectSettings';
import { Dialog, PathText, Segmented } from './ui';

// ADR-023 items 1–3: what a project does for documents, asked when it is added (and when the user
// sets documents up later). AgentHub always asks; it never starts using a folder on its own.

export type ContextChoice =
  | { kind: 'none' }
  | { kind: 'existing'; path: string }
  | { kind: 'create'; location: ContextLocationDto; customPath?: string; language: ContextLanguageDto };

const relativeTo = (path: string, base: string): string => (path.startsWith(`${base}/`) ? path.slice(base.length + 1) : path);

export function defaultChoice(scan: FolderScanDto, language: ContextLanguageDto): ContextChoice {
  const first = scan.found[0];
  if (first) return { kind: 'existing', path: first.path };
  return { kind: 'create', location: scan.repoContextTaken ? 'app' : 'repo', language };
}

interface FormProps {
  scan: FolderScanDto;
  choice: ContextChoice;
  onChange: (choice: ContextChoice) => void;
  onError: (message: string | undefined) => void;
  // false when the documents are set up for a project that already has its own way (handoffs).
  offerNone?: boolean;
  language: ContextLanguageDto;
}

export function ContextChoiceForm({ scan, choice, onChange, onError, offerNone = true, language }: FormProps) {
  const { t } = useI18n();
  // Kept while the user looks at another option, so coming back does not lose it.
  const [create, setCreate] = useState<Extract<ContextChoice, { kind: 'create' }>>(
    choice.kind === 'create' ? choice : { kind: 'create', location: scan.repoContextTaken ? 'app' : 'repo', language },
  );

  function changeCreate(next: Partial<Extract<ContextChoice, { kind: 'create' }>>): void {
    const updated = { ...create, ...next };
    setCreate(updated);
    onChange(updated);
  }

  async function chooseFolder(): Promise<void> {
    try {
      const path = await unwrap(api.pickProjectFolder());
      if (path) changeCreate({ location: 'custom', customPath: path });
    } catch (reason) {
      onError((reason as Error).message);
    }
  }

  const locations: { value: ContextLocationDto; label: string }[] = [
    { value: 'repo', label: t('setup.location.repo') },
    { value: 'app', label: t('setup.location.app') },
    { value: 'custom', label: t('setup.location.custom') },
  ];
  const locationHint = {
    repo: scan.repoContextTaken ? t('setup.location.repoTaken', { path: scan.repoContextPath }) : t('setup.location.repoHint', { path: relativeTo(scan.repoContextPath, scan.path) }),
    app: t('setup.location.appHint'),
    custom: t('setup.location.customHint'),
  }[create.location];

  return (
    <fieldset className="setup-choices" aria-label={t('setup.title')}>
      <legend className="field-label">{t('setup.title')}</legend>
      {scan.found.length > 0 && (
        <div className="setup-option">
          <p className="setup-heading">{t(scan.found.length === 1 ? 'setup.foundOne' : 'setup.foundMany', { count: scan.found.length })}</p>
          {scan.found.map((found) => (
            <label key={found.path} className="choice setup-radio">
              <input type="radio" name="context-choice" checked={choice.kind === 'existing' && choice.path === found.path} onChange={() => onChange({ kind: 'existing', path: found.path })} />
              <span className="settings-row-text">
                <span>{t('setup.useExisting', { path: relativeTo(found.path, scan.path) })}</span>
                <span className="hint">{t('setup.foundCounts', { workstreams: found.workstreams, tasks: found.tasks })}</span>
              </span>
            </label>
          ))}
        </div>
      )}
      <div className="setup-option">
        <label className="choice setup-radio">
          <input type="radio" name="context-choice" checked={choice.kind === 'create'} onChange={() => onChange(create)} />
          <span className="settings-row-text">
            <span>{t(scan.found.length > 0 ? 'setup.createNew' : 'setup.create')}</span>
            <span className="hint">{t('setup.createHint')}</span>
          </span>
        </label>
        {choice.kind === 'create' && (
          <div className="setup-details">
            <div className="field">
              <span className="field-label">{t('settings.docs.place')}</span>
              <Segmented label={t('settings.docs.place')} value={create.location} options={locations} onChange={(location) => (location === 'custom' && !create.customPath ? void chooseFolder() : changeCreate({ location }))} />
              <span className={`hint${create.location === 'repo' && scan.repoContextTaken ? ' warning-text' : ''}`}>{locationHint}</span>
              {create.location === 'custom' && (
                <div className="row">
                  <span className="path grow" data-testid="setup-folder">
                    {create.customPath ? <PathText path={create.customPath} /> : t('docs.create.noFolder')}
                  </span>
                  <button type="button" onClick={() => void chooseFolder()}>
                    {t('docs.create.chooseFolder')}
                  </button>
                </div>
              )}
            </div>
            <div className="field">
              <span className="field-label">{t('settings.docs.language')}</span>
              <Segmented label={t('settings.docs.language')} value={create.language} options={LANGUAGE_OPTIONS} onChange={(language) => changeCreate({ language })} />
            </div>
            {scan.others.length > 0 && <p className="hint">{t('setup.others', { docs: scan.others.slice(0, 4).join(', ') + (scan.others.length > 4 ? '…' : '') })}</p>}
          </div>
        )}
      </div>
      {offerNone && (
        <div className="setup-option">
          <label className="choice setup-radio">
            <input type="radio" name="context-choice" checked={choice.kind === 'none'} onChange={() => onChange({ kind: 'none' })} />
            <span className="settings-row-text">
              <span>{t('setup.none')}</span>
              <span className="hint">{t('setup.noneHint')}</span>
            </span>
          </label>
        </div>
      )}
      {!scan.complete && <p className="hint">{t('setup.incomplete')}</p>}
    </fieldset>
  );
}

export const choiceReady = (choice: ContextChoice, scan: FolderScanDto): boolean =>
  choice.kind !== 'create' || (choice.location === 'custom' ? Boolean(choice.customPath) : choice.location !== 'repo' || !scan.repoContextTaken);

interface AddProps {
  path: string;
  defaultLanguage: ContextLanguageDto;
  onClose: () => void;
  onAdded: (project: ProjectDto) => void;
}

// ADR-023 item 1: the folder is scanned as soon as it is picked, then the user decides.
export function AddProjectDialog({ path, defaultLanguage, onClose, onAdded }: AddProps) {
  const { t } = useI18n();
  const [scan, setScan] = useState<FolderScanDto>();
  const [name, setName] = useState('');
  const [choice, setChoice] = useState<ContextChoice>({ kind: 'none' });
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let current = true;
    void (async () => {
      try {
        const result = await unwrap(api.scanFolder({ path }));
        if (!current) return;
        setScan(result);
        setName(result.name);
        setChoice(defaultChoice(result, defaultLanguage));
      } catch (reason) {
        if (current) setError((reason as Error).message);
      }
    })();
    return () => {
      current = false;
    };
  }, [path, defaultLanguage]);

  async function add(): Promise<void> {
    setSaving(true);
    setError(undefined);
    try {
      onAdded(await unwrap(api.addProject({ path, ...(name.trim() ? { name } : {}), context: choice })));
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      label={t('nav.addProject')}
      title={t('nav.addProject')}
      onClose={onClose}
      actions={
        <>
          <button type="button" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="button" className="primary" disabled={!scan || saving || !choiceReady(choice, scan)} onClick={() => void add()}>
            {t('setup.add')}
          </button>
        </>
      }
    >
      <div className="field">
        <span className="field-label">{t('setup.folder')}</span>
        <span className="path" data-testid="add-project-path">
          <PathText path={path} />
        </span>
      </div>
      <label className="field">
        <span className="field-label">{t('field.projectName')}</span>
        <input value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      {error && (
        <p className="banner error" role="alert">
          {error}
        </p>
      )}
      {!scan ? !error && <p className="hint">{t('setup.scanning')}</p> : <ContextChoiceForm scan={scan} choice={choice} onChange={setChoice} onError={setError} language={defaultLanguage} />}
    </Dialog>
  );
}

interface SetupProps {
  project: ProjectDto;
  onClose: () => void;
  onDone: (project: ProjectDto) => void;
}

// The same choice for a project added without documents (ADR-023 item 1).
export function SetUpDocsDialog({ project, onClose, onDone }: SetupProps) {
  const { t } = useI18n();
  const [scan, setScan] = useState<FolderScanDto>();
  const [choice, setChoice] = useState<ContextChoice>({ kind: 'none' });
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!project.path) return;
    let current = true;
    void (async () => {
      try {
        const result = await unwrap(api.scanFolder({ path: project.path as string, projectId: project.id }));
        if (!current) return;
        setScan(result);
        setChoice(defaultChoice(result, project.context.language));
      } catch (reason) {
        if (current) setError((reason as Error).message);
      }
    })();
    return () => {
      current = false;
    };
  }, [project.id, project.path, project.context.language]);

  async function apply(): Promise<void> {
    setSaving(true);
    setError(undefined);
    try {
      if (choice.kind === 'existing') onDone(await unwrap(api.useProjectContext({ id: project.id, path: choice.path })));
      else if (choice.kind === 'create') {
        const { location, customPath, language } = choice;
        onDone(await unwrap(api.createProjectContext({ id: project.id, location, language, ...(customPath ? { customPath } : {}) })));
      } else onClose();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      label={t('docs.create')}
      title={t('docs.create')}
      onClose={onClose}
      actions={
        <>
          <button type="button" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="button" className="primary" disabled={!scan || saving || choice.kind === 'none' || !choiceReady(choice, scan)} onClick={() => void apply()}>
            {t(choice.kind === 'existing' ? 'setup.use' : 'docs.create.submit')}
          </button>
        </>
      }
    >
      {error && (
        <p className="banner error" role="alert">
          {error}
        </p>
      )}
      {!scan ? !error && <p className="hint">{t('setup.scanning')}</p> : <ContextChoiceForm scan={scan} choice={choice} onChange={setChoice} onError={setError} offerNone={false} language={project.context.language} />}
    </Dialog>
  );
}
