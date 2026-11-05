import type { IpcResult } from '@agenthub/contracts';
import { translate } from '@agenthub/i18n';
import { currentLocale } from './i18n';

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function unwrap<T>(reply: Promise<IpcResult<T>>): Promise<T> {
  const result = await reply;
  // Shown in the interface language; the English message is only for logs.
  if (!result.ok) throw new ApiError(result.error.code, translate(currentLocale(), result.error.detail));
  return result.data;
}

export const api = window.agentHub;
