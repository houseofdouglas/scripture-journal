// Structured logging: every line is `{ level, message, ...context }` as JSON
// (constitution.md → Coding Standards). The only place in src/ allowed to
// touch `console` — enforced by eslint.config.js.
//
// Never put user content (annotation text, article text) in `context`.

type Level = "info" | "warn" | "error";
type Context = Record<string, unknown>;

function emit(level: Level, message: string, context?: Context): void {
  const line = JSON.stringify({ level, message, ...context });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  info: (message: string, context?: Context): void => emit("info", message, context),
  warn: (message: string, context?: Context): void => emit("warn", message, context),
  error: (message: string, context?: Context): void => emit("error", message, context),
};
