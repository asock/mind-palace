/**
 * Tests for graceful shutdown handlers.
 */

import { installShutdownHandlers } from './shutdown';

describe('Shutdown Handlers', () => {
  let exitSpy: jest.SpyInstance;

  beforeEach(() => {
    exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => {}) as any);
  });

  afterEach(() => {
    exitSpy.mockRestore();
  });

  test('runs registered handlers in order on SIGTERM', async () => {
    const order: number[] = [];
    const uninstall = installShutdownHandlers(
      [
        async () => { order.push(1); },
        async () => { order.push(2); },
        async () => { order.push(3); },
      ],
      { timeoutMs: 1000 }
    );

    process.emit('SIGTERM');
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(order).toEqual([1, 2, 3]);
    expect(exitSpy).toHaveBeenCalledWith(0);
    uninstall();
  });

  test('continues after a handler throws', async () => {
    const order: number[] = [];
    const uninstall = installShutdownHandlers(
      [
        async () => { order.push(1); },
        async () => { throw new Error('boom'); },
        async () => { order.push(3); },
      ],
      { timeoutMs: 1000 }
    );

    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});

    process.emit('SIGTERM');
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(order).toEqual([1, 3]);

    warn.mockRestore();
    error.mockRestore();
    uninstall();
  });

  test('uninstall removes handlers', async () => {
    let called = false;
    const uninstall = installShutdownHandlers(
      [async () => { called = true; }],
      { timeoutMs: 1000 }
    );
    uninstall();

    process.emit('SIGTERM');
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(called).toBe(false);
    expect(exitSpy).not.toHaveBeenCalled();
  });

  test('idempotent — double signal does not re-run handlers', async () => {
    let count = 0;
    const uninstall = installShutdownHandlers(
      [async () => { count++; }],
      { timeoutMs: 1000 }
    );

    process.emit('SIGTERM');
    process.emit('SIGTERM');
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(count).toBe(1);
    uninstall();
  });
});
