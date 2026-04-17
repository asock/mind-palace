import http, { IncomingMessage, ServerResponse } from 'http';
import crypto from 'crypto';
import { MindPalace } from '../index';
import { logger } from '../logger';

/**
 * Minimal HTTP API for Mind Palace. Uses only Node built-ins.
 *
 * Security defaults:
 *   - Binds to 127.0.0.1 (localhost) only
 *   - Requires bearer token auth (MIND_PALACE_TOKEN env var or explicit option)
 *   - JSON bodies capped at 1 MiB
 *   - Constant-time token comparison
 */

export interface ServerOptions {
  host?: string;
  port?: number;
  token?: string; // Bearer token for auth; defaults to MIND_PALACE_TOKEN env var
  maxBodyBytes?: number;
}

export interface ServerHandle {
  close(): Promise<void>;
  address(): { host: string; port: number };
}

const DEFAULT_MAX_BODY = 1024 * 1024; // 1 MiB

function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store',
  });
  res.end(payload);
}

function readBody(req: IncomingMessage, maxBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;

    req.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error(`Request body exceeds ${maxBytes} bytes`));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function authorize(req: IncomingMessage, token: string): boolean {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return false;
  const presented = header.slice(7);

  const a = Buffer.from(presented);
  const b = Buffer.from(token);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Start the HTTP API. Returns a handle for graceful shutdown.
 */
export async function startServer(
  mp: MindPalace,
  options: ServerOptions = {}
): Promise<ServerHandle> {
  const host = options.host || '127.0.0.1';
  const port = options.port ?? 0;
  const maxBody = options.maxBodyBytes ?? DEFAULT_MAX_BODY;
  const token = options.token || process.env.MIND_PALACE_TOKEN;

  if (!token) {
    throw new Error(
      'Server requires an auth token. Set MIND_PALACE_TOKEN env var or pass options.token.'
    );
  }

  await mp.initialize();

  const server = http.createServer(async (req, res) => {
    try {
      // Health check is unauthenticated
      if (req.method === 'GET' && req.url === '/health') {
        return json(res, 200, { status: 'ok', version: '1.1.0' });
      }

      if (!authorize(req, token)) {
        res.setHeader('WWW-Authenticate', 'Bearer realm="mind-palace"');
        return json(res, 401, { error: 'unauthorized' });
      }

      const url = new URL(req.url || '/', `http://${host}`);

      if (req.method === 'POST' && url.pathname === '/capture') {
        const body = await readBody(req, maxBody);
        const payload = JSON.parse(body.toString('utf-8'));
        if (typeof payload.content !== 'string') {
          return json(res, 400, { error: 'content must be a string' });
        }
        const thought = await mp.capture(payload.content, payload.options || {});
        return json(res, 201, { thought });
      }

      if (req.method === 'GET' && url.pathname === '/search') {
        const keyword = url.searchParams.get('keyword') || undefined;
        const semantic = url.searchParams.get('semantic') || undefined;
        const limit = Number(url.searchParams.get('limit') || 10);
        const results = await mp.search({ keyword, semantic, limit });
        return json(res, 200, results);
      }

      if (req.method === 'GET' && url.pathname.startsWith('/thoughts/')) {
        const id = url.pathname.substring('/thoughts/'.length);
        const thought = await mp.getThought(id);
        if (!thought) return json(res, 404, { error: 'not found' });
        return json(res, 200, { thought });
      }

      if (req.method === 'GET' && url.pathname === '/thoughts') {
        const limit = Number(url.searchParams.get('limit') || 50);
        const offset = Number(url.searchParams.get('offset') || 0);
        const thoughts = await mp.getAllThoughts(limit, offset);
        return json(res, 200, { thoughts, count: thoughts.length });
      }

      if (req.method === 'GET' && url.pathname === '/metrics') {
        const m = await mp.metrics();
        return json(res, 200, m);
      }

      if (req.method === 'GET' && url.pathname === '/count') {
        return json(res, 200, { count: await mp.count() });
      }

      return json(res, 404, { error: 'not found' });
    } catch (err) {
      logger.error('http handler error', {
        err: err instanceof Error ? err.message : String(err),
        url: req.url,
      });
      return json(res, 500, { error: 'internal error' });
    }
  });

  await new Promise<void>((resolve) => server.listen(port, host, resolve));
  const addr = server.address();
  const resolvedPort = typeof addr === 'object' && addr ? addr.port : port;

  logger.info('mind-palace server listening', { host, port: resolvedPort });

  return {
    async close() {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    },
    address() {
      return { host, port: resolvedPort };
    },
  };
}
