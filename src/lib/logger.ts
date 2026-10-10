/**
 * Minimal structured logger (one JSON line per event) that works on Vercel and locally.
 * Callers must pass only non-sensitive context: never tokens, keys, passwords or email bodies.
 * Known-sensitive keys are redacted defensively.
 */
type Level = "debug" | "info" | "warn" | "error";
type Context = Record<string, unknown>;

const REDACT = /token|secret|password|api[_-]?key|authorization|cookie/i;

function redact(context: Context): Context {
  const out: Context = {};
  for (const [key, value] of Object.entries(context)) {
    out[key] = REDACT.test(key) ? "[redacted]" : value;
  }
  return out;
}

function serialiseError(err: unknown): Context {
  if (err instanceof Error) return { errorName: err.name, errorMessage: err.message.slice(0, 300) };
  return { errorMessage: String(err).slice(0, 300) };
}

function emit(level: Level, event: string, context: Context = {}) {
  if (process.env.NODE_ENV === "test") return;
  const line = JSON.stringify({ level, event, time: new Date().toISOString(), ...redact(context) });
  (level === "error" ? console.error : level === "warn" ? console.warn : console.log)(line);
}

export const logger = {
  debug: (event: string, context?: Context) => emit("debug", event, context),
  info: (event: string, context?: Context) => emit("info", event, context),
  warn: (event: string, context?: Context) => emit("warn", event, context),
  /** Pass the caught error as `err`; only its name and a truncated message are logged (no stack). */
  error: (event: string, context: Context & { err?: unknown } = {}) => {
    const { err, ...rest } = context;
    emit("error", event, { ...rest, ...(err !== undefined ? serialiseError(err) : {}) });
  },
};
