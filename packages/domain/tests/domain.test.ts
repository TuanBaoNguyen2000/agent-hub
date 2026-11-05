import { describe, expect, it } from 'vitest';
import { DomainError, folderNameOf, isSamePath, requireLabel } from '../src/index';

describe('requireLabel', () => {
  it('trims the label', () => {
    expect(requireLabel('  QA-024  ', 'field.projectName')).toBe('QA-024');
  });

  it.each(['', '   ', 'x'.repeat(201)])('rejects %j', (value) => {
    expect(() => requireLabel(value, 'field.projectName')).toThrow(DomainError);
  });
});

describe('folderNameOf', () => {
  it.each([
    ['/Users/a/Dự án thử', 'Dự án thử'],
    ['/Users/a/game/', 'game'],
    ['C:\\Work\\game', 'game'],
  ])('reads the folder name of %s', (path, name) => {
    expect(folderNameOf(path)).toBe(name);
  });
});

describe('isSamePath', () => {
  it('treats composed and decomposed Unicode as the same path', () => {
    expect(isSamePath('/a/Dự án', '/a/Dự án'.normalize('NFD'))).toBe(true);
  });

  it('keeps different paths apart', () => {
    expect(isSamePath('/a/b', '/a/c')).toBe(false);
  });
});
