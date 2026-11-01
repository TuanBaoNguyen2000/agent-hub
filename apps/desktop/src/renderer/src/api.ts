import type { IpcResult } from '@agenthub/contracts';

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
  if (!result.ok) throw new ApiError(result.error.code, result.error.message);
  return result.data;
}

export const api = window.agentHub;
