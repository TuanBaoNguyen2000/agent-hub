import { describe, expect, it } from 'vitest';
import { IpcChannel, ipcInput } from '../src/index';

const id = '6f1c2b7e-3a44-4c1d-9a55-0d6f3a7b8c91';

describe('ipcInput', () => {
  it('has a schema for every channel', () => {
    for (const channel of Object.values(IpcChannel)) {
      expect(ipcInput[channel], channel).toBeDefined();
    }
  });

  it('accepts only the known ways to add an account and open a sign-in page', () => {
    expect(ipcInput[IpcChannel.profilesAdd].safeParse({ provider: 'claude', source: 'separate' }).success).toBe(true);
    expect(ipcInput[IpcChannel.profilesAdd].safeParse({ provider: 'claude' }).success).toBe(false);
    expect(ipcInput[IpcChannel.profilesAdd].safeParse({ provider: 'claude', source: '/tmp/x' }).success).toBe(false);
    expect(ipcInput[IpcChannel.profilesLoginReopen].safeParse({ id, browser: 'private' }).success).toBe(true);
    expect(ipcInput[IpcChannel.profilesLoginReopen].safeParse({ id, browser: 'https://evil.example' }).success).toBe(false);
  });

  it('accepts a path with Unicode, spaces and quotes', () => {
    const path = "/Users/a/Dự án 'nháy' $(x)";
    expect(ipcInput[IpcChannel.projectsAdd].parse({ path })).toEqual({ path });
  });

  it.each([
    ['missing path', {}],
    ['non-string path', { path: 42 }],
    ['empty path', { path: '' }],
    ['NUL byte in path', { path: '/a\0b' }],
    ['unknown field', { path: '/a', shell: 'rm -rf /' }],
    ['null payload', null],
  ])('rejects projects:add with %s', (_case, payload) => {
    expect(ipcInput[IpcChannel.projectsAdd].safeParse(payload).success).toBe(false);
  });

  it.each(['../../etc', 'not-a-uuid', ''])('rejects the id %j, which could reach an artifact path', (badId) => {
    const reference = { scope: 'task', taskId: badId, document: 'task' };
    expect(ipcInput[IpcChannel.contextGet].safeParse({ reference }).success).toBe(false);
  });

  it('rejects a context document outside the allowed names', () => {
    const reference = { scope: 'task', taskId: id, document: '../secret' };
    expect(ipcInput[IpcChannel.contextGet].safeParse({ reference }).success).toBe(false);
  });

  it('rejects an unknown task status', () => {
    expect(ipcInput[IpcChannel.tasksUpdate].safeParse({ id, status: 'synced' }).success).toBe(false);
  });

  it('rejects any payload on a channel that takes none', () => {
    expect(ipcInput[IpcChannel.projectsList].safeParse({ any: 'thing' }).success).toBe(false);
  });
});
