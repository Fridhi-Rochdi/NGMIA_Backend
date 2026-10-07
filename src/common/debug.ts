/**
 * Verbose development tracing.
 *
 * These call sites dump full prompts, payloads and DTOs — useful while tuning
 * prompts, but noisy and unsafe to leave on in production. Enable explicitly
 * with DEBUG_AI=true; never active when NODE_ENV=production.
 */
const enabled =
  process.env.NODE_ENV !== 'production' && process.env.DEBUG_AI === 'true';

export function isDebugEnabled(): boolean {
  return enabled;
}

export function debugLog(...args: unknown[]): void {
  if (enabled) console.log(...args);
}
