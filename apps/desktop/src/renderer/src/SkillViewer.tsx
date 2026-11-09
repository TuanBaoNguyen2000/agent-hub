import type { AgentToolsDto, SkillDetailDto, SkillFileDto } from '@agenthub/contracts';
import { useEffect, useMemo, useState } from 'react';
import type { MessageKey } from '@agenthub/i18n';
import { api, unwrap } from './api';
import { useI18n } from './i18n';
import { type FileChange, fileChanges, foldUnchanged, lineDiff } from './lineDiff';
import { Markdown } from './Markdown';
import { Dialog, TabPanel, Tabs } from './ui';

type Mode = 'content' | 'changes';

const CHANGE_LABELS: Record<Exclude<FileChange, 'same'>, MessageKey> = {
  added: 'skillView.added',
  removed: 'skillView.removed',
  changed: 'skillView.changed',
};

interface Props {
  name: string;
  sourcePath: string | null;
  onClose: () => void;
  // The skill list after the user acknowledged an update or copied a skill again.
  onChanged: (tools: AgentToolsDto) => void;
  onError: (message: string | undefined) => void;
}

// ADR-026 items 7, 8: everything a skill holds, read-only, and what changed since the user last
// looked (a builtin skill after an app update) or against its own folder (a skill of the user's).
export function SkillViewer({ name, sourcePath, onClose, onChanged, onError }: Props) {
  const { t, tr } = useI18n();
  const [detail, setDetail] = useState<SkillDetailDto>();
  const [mode, setMode] = useState<Mode>('content');
  const [path, setPath] = useState('SKILL.md');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    unwrap(api.getSkill({ name }))
      .then((loaded) => {
        if (!live) return;
        setDetail(loaded);
        if (loaded.compare) setMode('changes');
      })
      .catch((reason: Error) => onError(reason.message));
    return () => {
      live = false;
    };
  }, [name, onError]);

  // Before and after: the copy before an update and the current one, or AgentHub's copy and the folder.
  const versions = useMemo(() => {
    if (!detail?.compare) return null;
    return detail.compare.kind === 'previous' ? { before: detail.compare.files, after: detail.files } : { before: detail.files, after: detail.compare.files };
  }, [detail]);
  const changes = useMemo(() => (versions ? fileChanges(versions.before, versions.after) : []), [versions]);
  const listed: { path: string; change: FileChange | null }[] =
    mode === 'changes' && versions ? changes : (detail?.files ?? []).map((file) => ({ path: file.path, change: null }));
  const current = listed.some((file) => file.path === path) ? path : (listed.find((file) => file.change !== 'same')?.path ?? listed[0]?.path ?? '');

  async function act(action: () => Promise<AgentToolsDto>): Promise<void> {
    setBusy(true);
    onError(undefined);
    try {
      onChanged(await action());
      onClose();
    } catch (reason) {
      onError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const body = detail && (
    <>
      <ul className="skill-view-files" aria-label={t('skillView.files')}>
        {listed.map((file) => (
          <li key={file.path}>
            <button type="button" className={file.path === current ? 'skill-file selected' : 'skill-file'} aria-current={file.path === current} onClick={() => setPath(file.path)}>
              <span className="truncate">{file.path}</span>
              {file.change && file.change !== 'same' && <span className={`badge change-${file.change}`}>{t(CHANGE_LABELS[file.change])}</span>}
            </button>
          </li>
        ))}
      </ul>
      <div className="skill-view-content">
        {mode === 'changes' && versions ? (
          <FileDiff before={versions.before.find((file) => file.path === current)} after={versions.after.find((file) => file.path === current)} />
        ) : (
          <FileContent file={detail.files.find((file) => file.path === current)} />
        )}
      </div>
    </>
  );

  const compareKind = detail?.compare?.kind;
  const actions = (
    <>
      {compareKind === 'previous' && (
        <button type="button" className="primary" disabled={busy} onClick={() => void act(() => unwrap(api.acknowledgeSkill({ name })))}>
          {t('skillView.acknowledge')}
        </button>
      )}
      {compareKind === 'source' && (
        <button type="button" className="primary" disabled={busy} onClick={() => void act(() => unwrap(api.updateSkill({ name })))}>
          {t('skillView.update')}
        </button>
      )}
      <button type="button" onClick={onClose}>
        {t('common.close')}
      </button>
    </>
  );

  return (
    <Dialog wide label={t('skillView.title', { name })} title={<code>{name}</code>} onClose={onClose} actions={actions}>
      {!detail ? (
        <p className="hint">{t('tools.checking')}</p>
      ) : (
        <div className="skill-view">
          <p className="hint">
            {detail.installedIn.length > 0 ? t('skillView.installedIn', { accounts: detail.installedIn.map(tr).join(', ') }) : t('skillView.installedNone')}
          </p>
          {detail.compare && (
            <>
              <p className="hint">{detail.compare.kind === 'previous' ? t('skillView.previousHint') : t('skillView.sourceHint', { path: sourcePath ?? '' })}</p>
              <Tabs
                label={t('skillView.title', { name })}
                idBase="skill-view"
                value={mode}
                options={[
                  { value: 'changes', label: t('skillView.changes') },
                  { value: 'content', label: t('skillView.content') },
                ]}
                onChange={setMode}
              />
            </>
          )}
          {detail.compare ? (
            <TabPanel idBase="skill-view" value={mode} selected={mode} className="skill-view-body">
              {body}
            </TabPanel>
          ) : (
            <div className="skill-view-body">{body}</div>
          )}
        </div>
      )}
    </Dialog>
  );
}

function FileContent({ file }: { file: SkillFileDto | undefined }) {
  const { t } = useI18n();
  if (!file) return null;
  if (file.text === null) return <p className="hint">{t('skillView.binary')}</p>;
  return file.path.endsWith('.md') ? <Markdown source={file.text} /> : <pre className="skill-code">{file.text}</pre>;
}

function FileDiff({ before, after }: { before: SkillFileDto | undefined; after: SkillFileDto | undefined }) {
  const { t } = useI18n();
  if ((before && before.text === null) || (after && after.text === null)) return <p className="hint">{t('skillView.binary')}</p>;
  const lines = foldUnchanged(lineDiff(before?.text ?? '', after?.text ?? ''));
  if (!lines.some((line) => line.kind === 'add' || line.kind === 'del')) return <p className="hint">{t('skillView.noChanges')}</p>;
  return (
    <pre className="skill-diff">
      {lines.map((line, index) =>
        line.kind === 'skip' ? (
          <span key={index} className="diff-skip">
            {t('skillView.unchangedLines', { count: line.count })}
            {'\n'}
          </span>
        ) : (
          <span key={index} className={`diff-${line.kind}`}>
            {line.kind === 'add' ? '+ ' : line.kind === 'del' ? '- ' : '  '}
            {line.text}
            {'\n'}
          </span>
        ),
      )}
    </pre>
  );
}
