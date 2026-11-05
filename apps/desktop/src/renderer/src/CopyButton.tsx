import { useEffect, useState } from 'react';
import { api, unwrap } from './api';

// Main writes the clipboard: the renderer has no permission of its own.
export function CopyButton({ text, label, className }: { text: string; label: string; className?: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  // Back to the label after a moment. Not on blur: the label changing width under the pointer
  // would move the layout while the next click is still on its way.
  useEffect(() => {
    if (state === 'idle') return;
    const timer = setTimeout(() => setState('idle'), 2000);
    return () => clearTimeout(timer);
  }, [state]);
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        unwrap(api.copyText({ text })).then(
          () => setState('copied'),
          () => setState('failed'),
        );
      }}
    >
      {state === 'copied' ? 'Đã copy' : state === 'failed' ? 'Không copy được' : label}
    </button>
  );
}
