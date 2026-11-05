import { useEffect, useState } from 'react';
import { api, unwrap } from './api';

const WATCH_MS = 2000;

// ADR-021 item 9: whether the file on disk is no longer the version shown, for example because an
// agent just wrote it. Checked every two seconds and when the window regains focus, only while
// active, so idle tabs read nothing.
export function useExternalChange(projectId: string, path: string | null, sha256: string | null, active: boolean): boolean {
  const [changed, setChanged] = useState(false);

  useEffect(() => {
    setChanged(false);
    if (!active || path === null || sha256 === null) return;
    let stopped = false;
    const check = (): void => {
      unwrap(api.documentChecksum({ id: projectId, path })).then(
        (current) => {
          if (!stopped) setChanged(current !== sha256);
        },
        () => undefined,
      );
    };
    const timer = setInterval(check, WATCH_MS);
    window.addEventListener('focus', check);
    return () => {
      stopped = true;
      clearInterval(timer);
      window.removeEventListener('focus', check);
    };
  }, [projectId, path, sha256, active]);

  return changed;
}
