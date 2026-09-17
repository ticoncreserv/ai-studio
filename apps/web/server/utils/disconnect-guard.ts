const BENIGN_CODES = new Set([
  "ECONNRESET",
  "EPIPE",
  "ECONNABORTED",
  "ERR_STREAM_PREMATURE_CLOSE",
  "UND_ERR_SOCKET",
]);

const BENIGN_MESSAGE = /ECONNRESET|EPIPE|ECONNABORTED|ERR_STREAM_PREMATURE_CLOSE|UND_ERR_SOCKET/;

export function isBenignSocketError(reason: unknown): boolean {
  let current: unknown = reason;
  for (let depth = 0; depth < 4 && current; depth += 1) {
    if (typeof current === "string") return BENIGN_MESSAGE.test(current);
    if (typeof current !== "object") return false;
    const err = current as NodeJS.ErrnoException & { cause?: unknown };
    if (err.code && BENIGN_CODES.has(err.code)) return true;
    if (typeof err.message === "string" && BENIGN_MESSAGE.test(err.message)) return true;
    current = err.cause;
  }
  return false;
}

export function ignoreBenignSocketError(error: NodeJS.ErrnoException): void {
  if (isBenignSocketError(error)) return;
}

type RejectionListener = (reason: unknown, promise: Promise<unknown>) => void;

export function installDisconnectGuard(): void {
  if (process.env.VITEST) return;
  if (globalThis.__atelierDisconnectGuard) return;
  globalThis.__atelierDisconnectGuard = true;

  const forwarded: RejectionListener[] = [];
  const originalOn = process.on.bind(process);
  const originalOnce = process.once.bind(process);
  const originalAddListener = process.addListener.bind(process);
  const originalPrependListener = process.prependListener.bind(process);
  const originalPrependOnce = process.prependOnceListener.bind(process);

  function stash(listener: RejectionListener, once: boolean, prepend: boolean) {
    const wrapped: RejectionListener = (reason, promise) => {
      if (once) {
        const index = forwarded.indexOf(wrapped);
        if (index >= 0) forwarded.splice(index, 1);
      }
      listener(reason, promise);
    };
    if (prepend) forwarded.unshift(wrapped);
    else forwarded.push(wrapped);
    return process;
  }

  function intercept(
    event: string | symbol,
    listener: (...args: unknown[]) => void,
    once: boolean,
    prepend: boolean,
    fallback: typeof process.on,
  ) {
    if (event === "unhandledRejection") return stash(listener as RejectionListener, once, prepend);
    return fallback(event, listener as never);
  }

  process.on = ((event: string | symbol, listener: (...args: unknown[]) => void) =>
    intercept(event, listener, false, false, originalOn)) as typeof process.on;
  process.addListener = ((event: string | symbol, listener: (...args: unknown[]) => void) =>
    intercept(event, listener, false, false, originalAddListener)) as typeof process.addListener;
  process.once = ((event: string | symbol, listener: (...args: unknown[]) => void) =>
    intercept(event, listener, true, false, originalOnce)) as typeof process.once;
  process.prependListener = ((event: string | symbol, listener: (...args: unknown[]) => void) =>
    intercept(event, listener, false, true, originalPrependListener)) as typeof process.prependListener;
  process.prependOnceListener = ((event: string | symbol, listener: (...args: unknown[]) => void) =>
    intercept(event, listener, true, true, originalPrependOnce)) as typeof process.prependOnceListener;

  for (const listener of process.listeners("unhandledRejection")) {
    forwarded.push(listener as RejectionListener);
  }
  process.removeAllListeners("unhandledRejection");
  originalOn("unhandledRejection", (reason: unknown, promise: Promise<unknown>) => {
    if (isBenignSocketError(reason)) return;
    if (forwarded.length === 0) {
      console.error("[unhandledRejection]", reason);
      return;
    }
    for (const listener of [...forwarded]) listener(reason, promise);
  });
}

declare global {
  // eslint-disable-next-line no-var
  var __atelierDisconnectGuard: boolean | undefined;
}

installDisconnectGuard();
