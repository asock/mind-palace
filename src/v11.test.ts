/**
 * Tests for v1.1 HTTP server API.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import http from 'http';
import {
  MindPalace,
  resetStorageManager,
  resetConfigManager,
  startServer,
  ServerHandle,
} from './index';

const TOKEN = 'test-token-' + Math.random().toString(36).slice(2);

function request(
  handle: ServerHandle,
  method: string,
  pathPart: string,
  options: { body?: any; token?: string } = {}
): Promise<{ status: number; body: any }> {
  const addr = handle.address();
  return new Promise((resolve, reject) => {
    const bodyStr = options.body ? JSON.stringify(options.body) : undefined;
    const headers: Record<string, string> = {};
    if (options.token) headers['Authorization'] = `Bearer ${options.token}`;
    if (bodyStr) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(bodyStr).toString();
    }

    const req = http.request(
      { host: addr.host, port: addr.port, method, path: pathPart, headers },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf-8');
          try {
            resolve({ status: res.statusCode || 0, body: raw ? JSON.parse(raw) : null });
          } catch {
            resolve({ status: res.statusCode || 0, body: raw });
          }
        });
      }
    );
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

describe('HTTP Server API', () => {
  let mindPalace: MindPalace;
  let tempDir: string;
  let handle: ServerHandle;

  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-v11-'));
    resetConfigManager(tempDir);
    resetStorageManager();
    mindPalace = new MindPalace();
    await mindPalace.initialize();
    handle = await startServer(mindPalace, { port: 0, token: TOKEN });
  });

  afterAll(async () => {
    await handle.close();
    mindPalace.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('requires token for protected endpoints', async () => {
    const res = await request(handle, 'GET', '/count');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('unauthorized');
  });

  test('rejects wrong token with 401', async () => {
    const res = await request(handle, 'GET', '/count', { token: 'wrong' });
    expect(res.status).toBe(401);
  });

  test('health is unauthenticated and reports status ok', async () => {
    const res = await request(handle, 'GET', '/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  test('POST /capture persists a thought', async () => {
    const res = await request(handle, 'POST', '/capture', {
      token: TOKEN,
      body: { content: 'HTTP API test thought' },
    });
    expect(res.status).toBe(201);
    expect(res.body.thought.id).toBeTruthy();
    expect(res.body.thought.content).toBe('HTTP API test thought');
  });

  test('POST /capture rejects non-string content', async () => {
    const res = await request(handle, 'POST', '/capture', {
      token: TOKEN,
      body: { content: 12345 },
    });
    expect(res.status).toBe(400);
  });

  test('GET /thoughts/:id returns the thought', async () => {
    const captured = await request(handle, 'POST', '/capture', {
      token: TOKEN,
      body: { content: 'fetchable thought' },
    });
    const id = captured.body.thought.id;

    const res = await request(handle, 'GET', `/thoughts/${id}`, { token: TOKEN });
    expect(res.status).toBe(200);
    expect(res.body.thought.content).toBe('fetchable thought');
  });

  test('GET /thoughts/:id returns 404 for missing id', async () => {
    const res = await request(handle, 'GET', '/thoughts/nonexistent-id', { token: TOKEN });
    expect(res.status).toBe(404);
  });

  test('GET /search returns relevant thoughts', async () => {
    await request(handle, 'POST', '/capture', {
      token: TOKEN,
      body: { content: 'searchable content about gradient descent' },
    });

    const res = await request(
      handle,
      'GET',
      '/search?semantic=gradient%20descent&limit=5',
      { token: TOKEN }
    );
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.thoughts)).toBe(true);
  });

  test('GET /metrics returns observability snapshot', async () => {
    const res = await request(handle, 'GET', '/metrics', { token: TOKEN });
    expect(res.status).toBe(200);
    expect(typeof res.body.thoughts.total).toBe('number');
  });

  test('GET /count returns thought count', async () => {
    const res = await request(handle, 'GET', '/count', { token: TOKEN });
    expect(res.status).toBe(200);
    expect(typeof res.body.count).toBe('number');
  });

  test('unknown routes return 404', async () => {
    const res = await request(handle, 'GET', '/nonexistent', { token: TOKEN });
    expect(res.status).toBe(404);
  });
});

describe('HTTP Server — security', () => {
  test('refuses to start without a token', async () => {
    const prev = process.env.MIND_PALACE_TOKEN;
    delete process.env.MIND_PALACE_TOKEN;

    const mp = new MindPalace();
    await expect(startServer(mp, { port: 0 })).rejects.toThrow(/token/i);
    mp.close();

    if (prev !== undefined) process.env.MIND_PALACE_TOKEN = prev;
  });

  test('binds to localhost by default', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-v11b-'));
    resetConfigManager(tmp);
    resetStorageManager();
    const mp = new MindPalace();
    await mp.initialize();

    const h = await startServer(mp, { port: 0, token: 'tok' });
    expect(h.address().host).toBe('127.0.0.1');

    await h.close();
    mp.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});
