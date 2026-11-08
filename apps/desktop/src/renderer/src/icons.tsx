import type { ReactElement, SVGProps } from 'react';

// Stroke icons drawn on a 16px grid, coloured by currentColor.
function Icon({ children, ...props }: SVGProps<SVGSVGElement>): ReactElement {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

export const ChevronRight = () => (
  <Icon>
    <path d="M6 3.5 10.5 8 6 12.5" />
  </Icon>
);

export const ChevronDown = () => (
  <Icon>
    <path d="M3.5 6 8 10.5 12.5 6" />
  </Icon>
);

export const ChevronUpDown = () => (
  <Icon>
    <path d="M5 6 8 3l3 3M5 10l3 3 3-3" />
  </Icon>
);

export const Plus = () => (
  <Icon>
    <path d="M8 3v10M3 8h10" />
  </Icon>
);

export const Check = () => (
  <Icon>
    <path d="m3.5 8.5 3 3 6-7" />
  </Icon>
);

export const Folder = () => (
  <Icon>
    <path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h2.6l1.4 1.5h5A1.5 1.5 0 0 1 14 6v5.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 11.5z" />
  </Icon>
);

export const Gear = () => (
  <Icon>
    <circle cx="8" cy="8" r="2" />
    <path d="M8 1.8v1.6M8 12.6v1.6M14.2 8h-1.6M3.4 8H1.8M12.4 3.6l-1.1 1.1M4.7 11.3l-1.1 1.1M12.4 12.4l-1.1-1.1M4.7 4.7 3.6 3.6" />
  </Icon>
);

export const Monitor = () => (
  <Icon>
    <rect x="2" y="2.5" width="12" height="8.5" rx="1.5" />
    <path d="M6 13.5h4M8 11v2.5" />
  </Icon>
);

export const Terminal = () => (
  <Icon>
    <rect x="2" y="2.5" width="12" height="11" rx="1.5" />
    <path d="m5 6.5 2 1.75L5 10M8.5 10.5H11" />
  </Icon>
);

export const More = () => (
  <Icon strokeWidth="2">
    <path d="M3.5 8h.01M8 8h.01M12.5 8h.01" />
  </Icon>
);

export const Close = () => (
  <Icon>
    <path d="m4 4 8 8M12 4l-8 8" />
  </Icon>
);

export const Chat = () => (
  <Icon>
    <path d="M3 3.5h10v7H7.5L4.5 13v-2.5H3z" />
  </Icon>
);

export const Sidebar = () => (
  <Icon>
    <rect x="2" y="3" width="12" height="10" rx="2" />
    <path d="M6.5 3v10" />
  </Icon>
);

export const Puzzle = () => (
  <Icon>
    <path d="M6 2.5h4v2a1 1 0 0 0 2 0V4h1.5v4H12a1 1 0 0 0 0 2h1.5v3.5h-4V12a1 1 0 0 0-2 0v1.5H3V10h1.5a1 1 0 0 0 0-2H3V4h3z" />
  </Icon>
);

export const Plug = () => (
  <Icon>
    <path d="M6 2v3M10 2v3M4.5 5h7v2.5a3.5 3.5 0 0 1-7 0zM8 11v3" />
  </Icon>
);

export const Person = () => (
  <Icon>
    <circle cx="8" cy="5.5" r="2.5" />
    <path d="M3 13.5c.8-2.4 2.7-3.5 5-3.5s4.2 1.1 5 3.5" />
  </Icon>
);

export const Sliders = () => (
  <Icon>
    <path d="M3 4.5h10M3 11.5h10" />
    <circle cx="6" cy="4.5" r="1.5" />
    <circle cx="10.5" cy="11.5" r="1.5" />
  </Icon>
);

export const Wrench = () => (
  <Icon>
    <path d="M10.5 2.5a3 3 0 0 0-2.8 4L3 11.2 4.8 13l4.7-4.7a3 3 0 0 0 4-2.8l-1.7 1.7-1.8-.5-.5-1.8z" />
  </Icon>
);

export const Doc = () => (
  <Icon>
    <path d="M4 2.5h5L12 5.5v8a.5.5 0 0 1-.5.5h-7.5a.5.5 0 0 1-.5-.5v-10.5a.5.5 0 0 1 .5-.5z" />
    <path d="M9 2.5v3h3" />
  </Icon>
);

// The documents panel on the right, like the Files pane of Claude and Codex Desktop (ADR-023 item 6).
export const PanelRight = () => (
  <Icon>
    <rect x="2" y="3" width="12" height="10" rx="1.5" />
    <path d="M10 3v10" />
  </Icon>
);

export const Refresh = () => (
  <Icon>
    <path d="M13 8a5 5 0 1 1-1.5-3.55" />
    <path d="M13 2.5v3h-3" />
  </Icon>
);
