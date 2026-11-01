import type { ContextDocumentDto, ContextReferenceDto } from '@agenthub/contracts';
import { type KeyboardEvent, useEffect, useState } from 'react';
import { ApiError, api, unwrap } from './api';
import { useDirtyForm } from './unsaved';

interface Props {
  reference: ContextReferenceDto;
  label: string;
  hint: string;
}

// The parent gives each document its own key, so edits never carry over to another one.
export function ContextEditor({ reference, label, hint }: Props) {
  const [loaded, setLoaded] = useState<ContextDocumentDto>();
  const [draft, setDraft] = useState('');
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const isDirty = loaded !== undefined && draft !== loaded.content;
  useDirtyForm(isDirty);

  useEffect(() => {
    let current = true;
    unwrap(api.getContext({ reference })).then(
      (document) => {
        if (!current) return;
        setLoaded(document);
        setDraft(document.content);
      },
      (reason: unknown) => {
        if (current) setError(String((reason as Error).message));
      },
    );
    return () => {
      current = false;
    };
    // The parent rebuilds `reference` on each render; its key already covers the identity.
  }, []);

  async function save(expectedRevision: string | null): Promise<void> {
    setSaving(true);
    setError(undefined);
    try {
      const saved = await unwrap(api.saveContext({ reference, content: draft, expectedRevision }));
      setLoaded(saved);
      setDraft(saved.content);
      setConflict(false);
      setJustSaved(true);
    } catch (reason) {
      if (reason instanceof ApiError && reason.code === 'CONTEXT_CONFLICT') setConflict(true);
      else setError((reason as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function reload(): Promise<void> {
    const latest = await unwrap(api.getContext({ reference }));
    setLoaded(latest);
    setDraft(latest.content);
    setConflict(false);
  }

  async function overwrite(): Promise<void> {
    const latest = await unwrap(api.getContext({ reference }));
    await save(latest.revision);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if ((event.metaKey || event.ctrlKey) && event.key === 's') {
      event.preventDefault();
      if (isDirty && !saving && !conflict && loaded) void save(loaded.revision);
    }
  }

  return (
    <section className="editor">
      <label className="field">
        <span className="field-label">{label}</span>
        <span className="hint">{hint}</span>
        <textarea
          rows={10}
          value={draft}
          disabled={loaded === undefined}
          spellCheck={false}
          onKeyDown={onKeyDown}
          onChange={(event) => {
            setDraft(event.target.value);
            setJustSaved(false);
          }}
        />
      </label>
      {conflict && (
        <div className="banner warning" role="alert">
          <p>Tài liệu đã bị thay đổi ở nơi khác kể từ lần mở gần nhất.</p>
          <div className="row">
            <button type="button" onClick={() => void reload()}>
              Tải lại, bỏ nội dung đang sửa
            </button>
            <button type="button" onClick={() => void overwrite()}>
              Ghi đè bằng nội dung đang sửa
            </button>
          </div>
        </div>
      )}
      {error && (
        <p className="banner error" role="alert">
          {error}
        </p>
      )}
      <div className="row">
        <button
          type="button"
          className="primary"
          disabled={!isDirty || saving || conflict || !loaded}
          onClick={() => loaded && void save(loaded.revision)}
        >
          Lưu
        </button>
        <span className="hint" role="status">
          {isDirty ? 'Chưa lưu' : justSaved ? 'Đã lưu' : ''}
        </span>
      </div>
    </section>
  );
}
