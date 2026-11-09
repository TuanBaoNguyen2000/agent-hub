import {
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronRight, ChevronUpDown } from './icons';

const GAP = 6;
const EDGE = 8;
// Not visibility: hidden, which would stop the first item taking focus as the menu opens.
const HIDDEN: CSSProperties = { opacity: 0, left: 0, top: 0 };
const ITEM_SELECTOR = '[role^="menuitem"]:not([aria-disabled="true"])';

const MenuContext = createContext<() => void>(() => undefined);

function focusItem(panel: HTMLElement | null, pick: (items: HTMLElement[], current: number) => number): void {
  if (!panel) return;
  const items = [...panel.querySelectorAll<HTMLElement>(ITEM_SELECTOR)];
  if (items.length === 0) return;
  const current = items.indexOf(document.activeElement as HTMLElement);
  items[(pick(items, current) + items.length) % items.length]?.focus();
}

interface MenuProps {
  label: string;
  trigger: ReactNode;
  triggerClassName?: string;
  align?: 'start' | 'end';
  disabled?: boolean;
  children: ReactNode;
  value?: string;
}

// A popup that belongs to the button that opened it: it starts a few pixels below the button,
// is at least as wide, and flips above when there is no room below.
export function Menu({ label, trigger, triggerClassName, align = 'start', disabled, children, value }: MenuProps) {
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<CSSProperties>(HIDDEN);
  const [side, setSide] = useState<'below' | 'above'>('below');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const id = useId();

  const close = useCallback((refocus = true) => {
    setOpen(false);
    setStyle(HIDDEN);
    if (refocus) triggerRef.current?.focus();
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const anchor = triggerRef.current?.getBoundingClientRect();
      const panel = panelRef.current;
      if (!anchor || !panel) return;
      const width = Math.max(panel.offsetWidth, anchor.width);
      const height = panel.offsetHeight;
      const roomBelow = window.innerHeight - anchor.bottom - GAP - EDGE;
      const above = height > roomBelow && anchor.top - GAP - EDGE > roomBelow;
      const left = align === 'start' ? anchor.left : anchor.right - width;
      setSide(above ? 'above' : 'below');
      setStyle({
        minWidth: anchor.width,
        left: Math.min(Math.max(EDGE, left), window.innerWidth - width - EDGE),
        top: above ? Math.max(EDGE, anchor.top - GAP - height) : anchor.bottom + GAP,
        maxHeight: above ? anchor.top - GAP - EDGE : roomBelow,
      });
    };
    place();
    const checked = panelRef.current?.querySelector<HTMLElement>('[aria-checked="true"]');
    if (checked) checked.focus();
    else focusItem(panelRef.current, () => 0);
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open, align]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!panelRef.current?.contains(target) && !triggerRef.current?.contains(target)) close(false);
    };
    const onScroll = (event: Event) => {
      if (!panelRef.current?.contains(event.target as Node)) close(false);
    };
    const onBlur = () => close(false);
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('scroll', onScroll, true);
    window.addEventListener('blur', onBlur);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('blur', onBlur);
    };
  }, [open, close]);

  function onPanelKey(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    } else if (event.key === 'Tab') {
      close(false);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      focusItem(panelRef.current, (_, current) => current + 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      focusItem(panelRef.current, (_, current) => current - 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      focusItem(panelRef.current, () => 0);
    } else if (event.key === 'End') {
      event.preventDefault();
      focusItem(panelRef.current, (items) => items.length - 1);
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={triggerClassName}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        data-value={value}
        disabled={disabled}
        onClick={() => (open ? close() : setOpen(true))}
        onKeyDown={(event) => {
          if (!open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        {trigger}
      </button>
      {open &&
        createPortal(
          <div ref={panelRef} id={id} role="menu" aria-label={label} className="menu" data-side={side} style={style} onKeyDown={onPanelKey}>
            <MenuContext.Provider value={close}>{children}</MenuContext.Provider>
          </div>,
          document.body,
        )}
    </>
  );
}

interface MenuItemProps {
  onSelect: () => void;
  icon?: ReactNode;
  description?: ReactNode;
  checked?: boolean;
  disabled?: boolean;
  tone?: 'danger';
  children: ReactNode;
}

export function MenuItem({ onSelect, icon, description, checked, disabled, tone, children }: MenuItemProps) {
  const close = useContext(MenuContext);
  const id = useId();
  // Named by its label alone; the line under it describes it.
  return (
    <button
      type="button"
      role={checked === undefined ? 'menuitem' : 'menuitemradio'}
      aria-labelledby={`${id}-label`}
      aria-describedby={description ? `${id}-description` : undefined}
      aria-checked={checked}
      aria-disabled={disabled || undefined}
      tabIndex={-1}
      className={`menu-item${tone ? ` ${tone}` : ''}`}
      onClick={() => {
        if (disabled) return;
        close();
        onSelect();
      }}
    >
      {icon && <span className="menu-icon">{icon}</span>}
      <span className="menu-text">
        <span className="menu-label" id={`${id}-label`}>
          {children}
        </span>
        {description && (
          <span className="menu-description" id={`${id}-description`}>
            {description}
          </span>
        )}
      </span>
      {checked !== undefined && <span className="menu-check">{checked && <Check />}</span>}
    </button>
  );
}

export const MenuSeparator = () => <div role="separator" className="menu-separator" />;

export const MenuHeading = ({ children }: { children: ReactNode }) => (
  <div className="menu-heading" role="presentation">
    {children}
  </div>
);

interface SelectProps<T extends string> {
  label: string;
  value: T;
  options: readonly { value: T; label: string; icon?: ReactNode }[];
  onChange: (value: T) => void;
  className?: string;
  align?: 'start' | 'end';
}

export function Select<T extends string>({ label, value, options, onChange, className, align = 'start' }: SelectProps<T>) {
  const current = options.find((option) => option.value === value);
  return (
    <Menu
      label={label}
      value={value}
      align={align}
      triggerClassName={`select-trigger ${className ?? ''}`}
      trigger={
        <>
          {current?.icon}
          <span className="grow truncate">{current?.label}</span>
          <span className="select-chevron">
            <ChevronUpDown />
          </span>
        </>
      }
    >
      {options.map((option) => (
        <MenuItem key={option.value} icon={option.icon} checked={option.value === value} onSelect={() => onChange(option.value)}>
          {option.label}
        </MenuItem>
      ))}
    </Menu>
  );
}

interface SegmentedProps<T extends string> {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}

export function Segmented<T extends string>({ label, value, options, onChange }: SegmentedProps<T>) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          className="segment"
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

// Replaces <details>: the body is indented under the summary text, with room above it.
export function Disclosure({ summary, children, className }: { summary: ReactNode; children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className={`disclosure ${className ?? ''}`}>
      <button type="button" className="disclosure-summary" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
        <span className="disclosure-chevron" data-open={open}>
          <ChevronRight />
        </span>
        {summary}
      </button>
      <div id={id} className="disclosure-body" hidden={!open}>
        {children}
      </div>
    </div>
  );
}

interface DialogProps {
  label: string;
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  actions: ReactNode;
  // A wide dialog holds a file viewer (ADR-026 item 7).
  wide?: boolean;
}

export function Dialog({ label, title, onClose, children, actions, wide = false }: DialogProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('.dialog-actions button:not(:disabled)')?.focus();
    return () => previous?.focus();
  }, []);
  return createPortal(
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={wide ? 'dialog wide' : 'dialog'}
        onKeyDown={(event) => {
          // Events of a portal bubble through React parents, so Escape must not also close Settings.
          if (event.key === 'Escape') {
            event.preventDefault();
            onClose();
          }
        }}
      >
        <h2 className="dialog-title">{title}</h2>
        <div className="dialog-body">{children}</div>
        <div className="dialog-actions">{actions}</div>
      </div>
    </div>,
    document.body,
  );
}

interface TabsProps<T extends string> {
  label: string;
  // Ties each tab to its TabPanel: both build their ids from it.
  idBase: string;
  value: T;
  options: readonly { value: T; label: ReactNode }[];
  onChange: (value: T) => void;
}

const tabId = (idBase: string, value: string): string => `${idBase}-tab-${value}`;
const panelId = (idBase: string, value: string): string => `${idBase}-panel-${value}`;

export function Tabs<T extends string>({ label, idBase, value, options, onChange }: TabsProps<T>) {
  const listRef = useRef<HTMLDivElement>(null);
  function onKey(event: KeyboardEvent<HTMLDivElement>): void {
    const index = options.findIndex((option) => option.value === value);
    const next =
      event.key === 'ArrowRight' ? index + 1 : event.key === 'ArrowLeft' ? index - 1 : event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : null;
    if (next === null) return;
    event.preventDefault();
    const option = options[(next + options.length) % options.length];
    if (!option) return;
    onChange(option.value);
    listRef.current?.querySelector<HTMLElement>(`#${CSS.escape(tabId(idBase, option.value))}`)?.focus();
  }
  return (
    <div ref={listRef} className="tabs" role="tablist" aria-label={label} onKeyDown={onKey}>
      {options.map((option) => (
        <button
          key={option.value}
          id={tabId(idBase, option.value)}
          type="button"
          role="tab"
          className="tab"
          aria-selected={option.value === value}
          aria-controls={panelId(idBase, option.value)}
          tabIndex={option.value === value ? 0 : -1}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

// Every panel stays mounted and the others are only hidden, so a launch waiting for a decision
// keeps its state while the user looks at another tab.
export function TabPanel({ idBase, value, selected, children, className = 'stack' }: { idBase: string; value: string; selected: string; children: ReactNode; className?: string }) {
  return (
    <div id={panelId(idBase, value)} role="tabpanel" aria-labelledby={tabId(idBase, value)} className={`tab-panel ${className}`} hidden={value !== selected}>
      {children}
    </div>
  );
}

// A long path wraps after a slash, never inside a folder name.
export function PathText({ path }: { path: string }) {
  const parts = path.split(/(?<=\/)/);
  return (
    <>
      {parts.map((part, index) => (
        <span key={index}>
          {part}
          {index < parts.length - 1 && <wbr />}
        </span>
      ))}
    </>
  );
}

export type StatusTone = 'ok' | 'warning' | 'neutral' | 'active' | 'info' | 'danger';

// ADR-023 item 8: a state is a coloured dot and words, never something that looks clickable.
export function StatusText({ tone, children, title }: { tone: StatusTone; children: ReactNode; title?: string | undefined }) {
  return (
    <span className={`status-text status-${tone}`} title={title}>
      <span className="status-dot" aria-hidden="true" />
      {children}
    </span>
  );
}
