import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type BrowserWindow, type Rectangle, screen } from 'electron';

// The window opens where and as large as the user left it; a first start fills most of the screen.

export const MIN_WIDTH = 880;
export const MIN_HEIGHT = 560;

interface WindowState {
  bounds: Rectangle;
  maximized: boolean;
}

const fileName = 'window-state.json';

function isRectangle(value: unknown): value is Rectangle {
  if (typeof value !== 'object' || value === null) return false;
  const { x, y, width, height } = value as Record<string, unknown>;
  return [x, y, width, height].every((n) => typeof n === 'number' && Number.isFinite(n));
}

function defaultBounds(): Rectangle {
  const area = screen.getPrimaryDisplay().workArea;
  const width = Math.max(MIN_WIDTH, Math.min(1320, Math.round(area.width * 0.85)));
  const height = Math.max(MIN_HEIGHT, Math.min(900, Math.round(area.height * 0.88)));
  return {
    x: area.x + Math.round((area.width - width) / 2),
    y: area.y + Math.round((area.height - height) / 2),
    width: Math.min(width, area.width),
    height: Math.min(height, area.height),
  };
}

// Saved bounds are kept only while most of the window still lands on a connected display.
function fitsOnScreen(bounds: Rectangle): boolean {
  const area = screen.getDisplayMatching(bounds).workArea;
  const overlapX = Math.min(bounds.x + bounds.width, area.x + area.width) - Math.max(bounds.x, area.x);
  const overlapY = Math.min(bounds.y + bounds.height, area.y + area.height) - Math.max(bounds.y, area.y);
  return overlapX >= Math.min(bounds.width, 200) && overlapY >= Math.min(bounds.height, 120);
}

export function loadWindowState(dataDirectory: string): WindowState {
  try {
    const parsed = JSON.parse(readFileSync(join(dataDirectory, fileName), 'utf8')) as Record<string, unknown>;
    if (isRectangle(parsed['bounds']) && fitsOnScreen(parsed['bounds'])) {
      const bounds = parsed['bounds'];
      return {
        bounds: { ...bounds, width: Math.max(MIN_WIDTH, bounds.width), height: Math.max(MIN_HEIGHT, bounds.height) },
        maximized: parsed['maximized'] === true,
      };
    }
  } catch {
    // No saved state yet, or one that cannot be read: start fresh.
  }
  return { bounds: defaultBounds(), maximized: false };
}

export function trackWindowState(window: BrowserWindow, dataDirectory: string): void {
  let timer: NodeJS.Timeout | undefined;
  const save = (): void => {
    if (timer) clearTimeout(timer);
    timer = undefined;
    if (window.isDestroyed() || window.isMinimized() || window.isFullScreen()) return;
    const state: WindowState = { bounds: window.getNormalBounds(), maximized: window.isMaximized() };
    try {
      const path = join(dataDirectory, fileName);
      const temporary = `${path}.${process.pid}.tmp`;
      writeFileSync(temporary, JSON.stringify(state), { mode: 0o600 });
      renameSync(temporary, path);
    } catch (error) {
      console.error(error);
    }
  };
  const later = (): void => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(save, 400);
  };
  window.on('resize', later);
  window.on('move', later);
  window.on('maximize', save);
  window.on('unmaximize', save);
  window.on('close', save);
}
