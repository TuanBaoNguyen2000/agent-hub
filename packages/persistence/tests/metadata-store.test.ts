import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openMetadataStore } from '../src/index';

const noteTable = { version: 1, up: 'CREATE TABLE note (id INTEGER PRIMARY KEY)' };

describe('openMetadataStore', () => {
  let dir: string;
  let databasePath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "agenthub dữ liệu 'thử' "));
    databasePath = join(dir, 'agenthub.sqlite');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('opens a database at a path with Unicode, spaces and quotes', () => {
    const store = openMetadataStore(databasePath, []);
    const status = store.status();
    store.close();

    expect(status.schemaVersion).toBe(0);
    expect(status.engineVersion).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('keeps the schema version after reopening and does not reapply', () => {
    openMetadataStore(databasePath, [noteTable]).close();

    const store = openMetadataStore(databasePath, [noteTable]);
    const version = store.status().schemaVersion;
    store.close();

    expect(version).toBe(1);
  });

  it('applies pending migrations in version order', () => {
    const second = { version: 2, up: 'ALTER TABLE note ADD COLUMN body TEXT' };

    const store = openMetadataStore(databasePath, [second, noteTable]);
    const version = store.status().schemaVersion;
    store.close();

    expect(version).toBe(2);
  });

  it('rolls back a failing migration and keeps earlier versions', () => {
    const broken = { version: 2, up: 'CREATE TABLE half (id INTEGER); THIS IS NOT SQL' };

    expect(() => openMetadataStore(databasePath, [noteTable, broken])).toThrow();

    const store = openMetadataStore(databasePath, [noteTable, { version: 2, up: 'CREATE TABLE half (id INTEGER)' }]);
    const version = store.status().schemaVersion;
    store.close();

    expect(version).toBe(2);
  });
});
