export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** One retry on 429 or 5xx-style failures (OpenAI/Anthropic SDK errors expose `status`). */
export function isTransientProviderError(err: unknown): boolean {
  const status = (err as { status?: number })?.status;
  if (status === 429) return true;
  if (typeof status === "number" && status >= 500) return true;
  return false;
}

export async function withOneRetry<T>(fn: () => Promise<T>, backoffMs: number): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (!isTransientProviderError(err)) throw err;
    await sleep(backoffMs);
    return await fn();
  }
}
