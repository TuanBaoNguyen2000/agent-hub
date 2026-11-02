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
