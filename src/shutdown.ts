import { logger } from './logger';

/**
 * Install SIGINT/SIGTERM handlers that run cleanup functions in order.
 * Returns an `uninstall` fn so tests and reloads can detach.
 *
 * Handlers are run sequentially. If a handler throws, it's logged and
 * subsequent handlers still run to completion before exit.
 */
export function installShutdownHandlers(
  handlers: Array<() => Promise<void> | void>,
  opts: { timeoutMs?: number; exitCode?: number } = {}
): () => void {
  const timeoutMs = opts.timeoutMs ?? 5000;
  const exitCode = opts.exitCode ?? 0;
  let shuttingDown = false;

  const onSignal = async (signal: NodeJS.Signals) => {
    if (shuttingDown) return; // Idempotent
    shuttingDown = true;
    logger.info('shutdown signal received', { signal });

    const killer = setTimeout(() => {
      logger.error('shutdown timed out, forcing exit', { timeoutMs });
      process.exit(1);
    }, timeoutMs);
    killer.unref();

    for (const handler of handlers) {
      try {
        await handler();
      } catch (err) {
        logger.error('shutdown handler threw', {
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }

    clearTimeout(killer);
    process.exit(exitCode);
  };

  const sigint = () => onSignal('SIGINT');
  const sigterm = () => onSignal('SIGTERM');

  process.on('SIGINT', sigint);
  process.on('SIGTERM', sigterm);

  return () => {
    process.off('SIGINT', sigint);
    process.off('SIGTERM', sigterm);
  };
}
