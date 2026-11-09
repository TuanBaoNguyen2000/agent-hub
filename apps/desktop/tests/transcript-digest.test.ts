import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// ADR-026 item 5: the digest that context-recover reads instead of a whole transcript. The
// fixtures are made up in the shapes of Claude Code and Codex session files (SPIKE-15).
const SCRIPT = join(__dirname, '..', 'skills', 'context-recover', 'scripts', 'transcript-digest.sh');
const hasJq = spawnSync('sh', ['-c', 'command -v jq']).status === 0;

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'agenthub digest '));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function fixture(name: string, events: unknown[]): string {
  const path = join(root, name);
  writeFileSync(path, `${events.map((event) => JSON.stringify(event)).join('\n')}\nnot json\n`);
  return path;
}

const digest = (file: string, since: string): string => execFileSync('sh', [SCRIPT, file, since], { encoding: 'utf8' });

const claude = (timestamp: string, type: 'user' | 'assistant', content: unknown, extra: object = {}) => ({ type, timestamp, message: { role: type, content }, ...extra });

describe.skipIf(!hasJq)('transcript-digest.sh', () => {
  it('keeps only messages, tool calls and edits after the checkpoint in a Claude transcript', () => {
    const file = fixture('claude.jsonl', [
      claude('2026-11-09T10:00:00.000Z', 'user', 'before the checkpoint'),
      { type: 'custom-title', title: 'x' },
      claude('2026-11-09T10:45:00.000Z', 'user', 'make the axe slash faster'),
      claude('2026-11-09T10:45:05.000Z', 'user', 'meta text', { isMeta: true }),
      claude('2026-11-09T10:46:00.000Z', 'assistant', [
        { type: 'thinking', thinking: 'secret reasoning' },
        { type: 'text', text: 'I will change the timing.' },
        { type: 'tool_use', name: 'Bash', input: { command: 'git status --short' } },
        { type: 'tool_use', name: 'Edit', input: { file_path: '/repo/Assets/Axe.cs', old_string: 'a', new_string: 'b' } },
      ]),
      claude('2026-11-09T10:46:10.000Z', 'user', [{ type: 'tool_result', content: 'FILE CONTENTS THAT MUST NOT APPEAR' }]),
      claude('2026-11-09T10:47:00.000Z', 'user', '<command-name>/clear</command-name>'),
    ]);
    const out = digest(file, '2026-11-09T17:40:00+07:00');
    expect(out).toContain('[10:45:00] USER: make the axe slash faster');
    expect(out).toContain('[10:46:00] AGENT: I will change the timing.');
    expect(out).toContain('TOOL Bash: git status --short');
    expect(out).toContain('EDIT /repo/Assets/Axe.cs');
    expect(out).toContain('## Files edited or created\n- /repo/Assets/Axe.cs');
    for (const hidden of ['before the checkpoint', 'meta text', 'secret reasoning', 'FILE CONTENTS', 'command-name']) {
      expect(out).not.toContain(hidden);
    }
  });

  it('reads Codex rollouts, including files named in apply_patch', () => {
    const file = fixture('rollout.jsonl', [
      { timestamp: '2026-11-09T09:00:00.000Z', type: 'session_meta', payload: { cwd: '/repo' } },
      { timestamp: '2026-11-09T11:00:00.000Z', type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: '<environment_context>cwd</environment_context>' }] } },
      { timestamp: '2026-11-09T11:00:01.000Z', type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'fix the build' }] } },
      { timestamp: '2026-11-09T11:00:02.000Z', type: 'response_item', payload: { type: 'message', role: 'developer', content: [{ type: 'input_text', text: 'developer rules' }] } },
      { timestamp: '2026-11-09T11:00:03.000Z', type: 'response_item', payload: { type: 'function_call', name: 'shell', arguments: '{"command":["npm","test"]}' } },
      { timestamp: '2026-11-09T11:00:04.000Z', type: 'response_item', payload: { type: 'function_call_output', output: 'TEST OUTPUT' } },
      { timestamp: '2026-11-09T11:00:05.000Z', type: 'response_item', payload: { type: 'custom_tool_call', name: 'apply_patch', input: '*** Begin Patch\n*** Update File: src/build.ts\n@@\n-a\n+b\n*** End Patch' } },
      { timestamp: '2026-11-09T11:00:06.000Z', type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Build fixed.' }] } },
    ]);
    const out = digest(file, '2026-11-09T10:40:00Z');
    expect(out).toContain('USER: fix the build');
    expect(out).toContain('TOOL shell: {"command":["npm","test"]}');
    expect(out).toContain('EDIT src/build.ts');
    expect(out).toContain('AGENT: Build fixed.');
    for (const hidden of ['environment_context', 'developer rules', 'TEST OUTPUT', '+b']) expect(out).not.toContain(hidden);
  });

  it('says so when nothing happened after the checkpoint, and caps a long digest at its end', () => {
    const quiet = fixture('quiet.jsonl', [claude('2026-11-09T10:00:00Z', 'user', 'old')]);
    expect(digest(quiet, '2026-11-09T11:00:00Z')).toContain('No user messages, replies or tool calls after');

    const long = fixture(
      'long.jsonl',
      Array.from({ length: 200 }, (_, index) => claude(`2026-11-09T12:${String(Math.floor(index / 60)).padStart(2, '0')}:${String(index % 60).padStart(2, '0')}Z`, 'user', `message ${index} ${'x'.repeat(1400)}`)),
    );
    const out = digest(long, '2026-11-09T11:00:00Z');
    expect(out).toContain('[Earlier part cut');
    expect(out).toContain('message 199');
    expect(out).not.toContain('message 0 ');
    expect(Buffer.byteLength(out)).toBeLessThan(41_000);
  });
});
