import { useEffect } from 'react';

// Every form with unsaved edits registers here, so navigation can ask before discarding them.
const dirtyForms = new Set<symbol>();

window.addEventListener('beforeunload', (event) => {
  if (dirtyForms.size > 0) event.preventDefault();
});

export function useDirtyForm(isDirty: boolean): void {
  useEffect(() => {
    if (!isDirty) return;
    const form = Symbol('form');
    dirtyForms.add(form);
    return () => {
      dirtyForms.delete(form);
    };
  }, [isDirty]);
}

export function confirmDiscard(): boolean {
  if (dirtyForms.size === 0) return true;
  return window.confirm('Bạn có thay đổi chưa lưu. Bỏ các thay đổi này?');
}
