import { en } from './locales/en';
import { ko } from './locales/ko';
import { vi } from './locales/vi';

// ADR-020 item 6: every text AgentHub shows, by key, in each interface language. No internal
// imports, so every layer can use it; backends pass Messages and the renderer translates them.

export const LOCALES = ['en', 'vi', 'ko'] as const;
export type Locale = (typeof LOCALES)[number];

export type MessageKey = keyof typeof vi;

// A parameter may itself be a message, translated in the same language.
export type Param = string | number | Message;
export type Params = { readonly [name: string]: Param };

export interface Message {
  readonly key: MessageKey;
  readonly params?: Params;
}

export const TABLES: Record<Locale, Record<MessageKey, string>> = { en, vi, ko };

// What the language is called in each interface language, and in English for prompts.
export const LANGUAGE_LABELS: Record<Locale, string> = { en: 'English', vi: 'Tiếng Việt', ko: '한국어' };
export const LANGUAGE_NAMES_EN: Record<Locale, string> = { en: 'English', vi: 'Vietnamese', ko: 'Korean' };

export function msg(key: MessageKey, params?: Params): Message {
  return params === undefined ? { key } : { key, params };
}

// Text that needs no translation, such as an email or a CLI's own words.
export const raw = (text: string): Message => msg('common.raw', { text });

export function isMessage(value: unknown): value is Message {
  return typeof value === 'object' && value !== null && typeof (value as { key?: unknown }).key === 'string';
}

export const isLocale = (value: unknown): value is Locale => typeof value === 'string' && (LOCALES as readonly string[]).includes(value);

// 'vi-VN' → 'vi'; anything outside the three languages falls back to English.
export function resolveLocale(tag: string | null | undefined): Locale {
  const base = (tag ?? '').toLowerCase().split(/[-_]/)[0];
  return isLocale(base) ? base : 'en';
}

function render(locale: Locale, template: string, params: Params | undefined): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const value = params[name];
    if (value === undefined) return whole;
    return isMessage(value) ? translate(locale, value) : String(value);
  });
}

// Unknown keys (an older or newer backend) show the key itself rather than nothing.
export function translate(locale: Locale, message: Message | MessageKey | string, params?: Params): string {
  const { key, params: own } = typeof message === 'string' ? { key: message, params } : message;
  const template = (TABLES[locale] as Record<string, string>)[key] ?? (TABLES.en as Record<string, string>)[key] ?? key;
  return render(locale, template, own);
}

// The {name} placeholders a template uses; the tables must agree on them for every key.
export function placeholders(template: string): string[] {
  return [...new Set([...template.matchAll(/\{(\w+)\}/g)].map((match) => match[1] as string))].sort();
}

const INTL_LOCALES: Record<Locale, string> = { en: 'en-GB', vi: 'vi-VN', ko: 'ko-KR' };

export function formatDateTime(locale: Locale, value: string | number | Date, options: Intl.DateTimeFormatOptions = { dateStyle: 'short', timeStyle: 'short' }): string {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString(INTL_LOCALES[locale], options);
}

export function compareText(locale: Locale, a: string, b: string): number {
  return a.localeCompare(b, INTL_LOCALES[locale]);
}

export function formatList(locale: Locale, items: readonly string[]): string {
  return new Intl.ListFormat(INTL_LOCALES[locale], { style: 'long', type: 'conjunction' }).format(items);
}

// Sentences shown as one, each in the same language; null when there is none.
export function joinMessages(parts: readonly (Message | null | undefined)[]): Message | null {
  const present = parts.filter((part): part is Message => part !== null && part !== undefined);
  if (present.length === 0) return null;
  return present.slice(1).reduce((first, second) => msg('common.pair', { first, second }), present[0] as Message);
}
