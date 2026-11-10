import type { MessageKey } from '@agenthub/i18n';

// ADR-028 item 7: each everyday request in two forms, the short sentence the agent recognises from
// the skill descriptions and the MCP instructions, and the command that always calls the skill.
// The phrases are the ones the skills and INSTRUCTIONS list; change them together.
export interface QuickCommand {
  id: 'resume' | 'status' | 'checkpoint' | 'capture' | 'recover' | 'init' | 'tidy';
  label: MessageKey;
  phrase: MessageKey | null;
  skill: string;
  argument?: 'task' | 'status';
}

export const QUICK_COMMANDS: readonly QuickCommand[] = [
  { id: 'resume', label: 'quick.resume', phrase: 'quick.phrase.resume', skill: 'context-resume', argument: 'task' },
  { id: 'status', label: 'quick.status', phrase: 'quick.phrase.status', skill: 'context-resume', argument: 'status' },
  { id: 'checkpoint', label: 'quick.checkpoint', phrase: 'quick.phrase.checkpoint', skill: 'context-checkpoint' },
  { id: 'capture', label: 'quick.capture', phrase: 'quick.phrase.capture', skill: 'context-capture' },
  { id: 'recover', label: 'quick.recover', phrase: null, skill: 'context-recover' },
  { id: 'init', label: 'quick.init', phrase: 'quick.phrase.init', skill: 'context-init' },
  { id: 'tidy', label: 'quick.tidy', phrase: 'quick.phrase.tidy', skill: 'context-tidy' },
];

// Claude Code and Codex both take "/<skill>" (the user checked Codex, which also takes "$<skill>",
// 2026-11-10), so one form serves every account.
export function skillCommand(skill: string, argument?: string): string {
  return `/${skill}${argument ? ` ${argument}` : ''}`;
}

// Without a task the commands stay general: the agent continues what is in progress or asks.
export function commandArgument(command: QuickCommand, task: string | null): string | undefined {
  if (command.argument === 'task') return task ?? undefined;
  if (command.argument === 'status') return 'status';
  return undefined;
}
