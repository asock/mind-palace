/**
 * Lightweight structured logger for Mind Palace.
 * Respects MIND_PALACE_LOG_LEVEL env var (debug|info|warn|error|silent).
 * Defaults to 'warn' to keep output quiet in production.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 99,
};

function currentLevel(): LogLevel {
  const raw = (process.env.MIND_PALACE_LOG_LEVEL || 'warn').toLowerCase() as LogLevel;
  return raw in LEVEL_PRIORITY ? raw : 'warn';
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[currentLevel()];
}

function format(level: LogLevel, msg: string, meta?: Record<string, unknown>): string {
  const base = `[mind-palace] ${level.toUpperCase()} ${new Date().toISOString()} ${msg}`;
  if (!meta || Object.keys(meta).length === 0) return base;
  return `${base} ${JSON.stringify(meta)}`;
}

export const logger = {
  debug(msg: string, meta?: Record<string, unknown>): void {
    if (shouldLog('debug')) console.debug(format('debug', msg, meta));
  },
  info(msg: string, meta?: Record<string, unknown>): void {
    if (shouldLog('info')) console.info(format('info', msg, meta));
  },
  warn(msg: string, meta?: Record<string, unknown>): void {
    if (shouldLog('warn')) console.warn(format('warn', msg, meta));
  },
  error(msg: string, meta?: Record<string, unknown>): void {
    if (shouldLog('error')) console.error(format('error', msg, meta));
  },
};
