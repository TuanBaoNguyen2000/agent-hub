import { describe, expect, it } from 'vitest';
import { LOCALES, TABLES, formatDateTime, msg, placeholders, raw, resolveLocale, translate } from '../src/index';

describe('translation tables', () => {
  const keys = Object.keys(TABLES.vi).sort();

  it.each(LOCALES)('%s has exactly the same keys as vi', (locale) => {
    expect(Object.keys(TABLES[locale]).sort()).toEqual(keys);
  });

  it.each(LOCALES)('%s uses the same placeholders as vi, and no empty text', (locale) => {
    for (const key of keys) {
      const text = (TABLES[locale] as Record<string, string>)[key] as string;
      expect(text.trim(), `${locale} ${key}`).not.toBe('');
      expect(placeholders(text), `${locale} ${key}`).toEqual(placeholders((TABLES.vi as Record<string, string>)[key] as string));
    }
  });
});

describe('translate', () => {
  it('fills parameters, including a nested message in the same language', () => {
    expect(translate('vi', msg('common.raw', { text: 'a' }))).toBe('a');
    expect(translate('en', msg('account.unnamed', { provider: 'Claude' }))).toBe('Claude (account unknown)');
    expect(translate('vi', msg('common.raw', { text: msg('account.unnamed', { provider: 'Codex' }) }))).toBe('Codex (chưa rõ account)');
  });

  it('shows an unknown key as itself, and leaves a missing parameter visible', () => {
    expect(translate('ko', 'no.such.key')).toBe('no.such.key');
    expect(translate('en', msg('account.unnamed'))).toBe('{provider} (account unknown)');
  });

  it('keeps raw text untouched', () => {
    expect(translate('ko', raw('{text} $1'))).toBe('{text} $1');
  });
});

describe('resolveLocale', () => {
  it('maps a system locale to one of the three languages, English otherwise', () => {
    expect(resolveLocale('vi-VN')).toBe('vi');
    expect(resolveLocale('ko')).toBe('ko');
    expect(resolveLocale('en-US')).toBe('en');
    expect(resolveLocale('fr-FR')).toBe('en');
    expect(resolveLocale(undefined)).toBe('en');
  });

  it('formats dates per language', () => {
    const at = '2026-11-06T09:05:00Z';
    expect(formatDateTime('vi', at, { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'UTC' })).toBe('06/11/2026');
    expect(formatDateTime('ko', at, { year: 'numeric', month: 'long', timeZone: 'UTC' })).toBe('2026년 11월');
    expect(formatDateTime('en', 'not a date')).toBe('not a date');
  });
});
