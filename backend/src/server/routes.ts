import { createServer as createHttpServer, type Server } from 'node:http';
import { MAX_BODY_BYTES } from '../contracts/api';
import { authHandler } from './auth';
import { withCors } from './cors';
import { handleMe } from './me';
import { sendWebResponse, toWebRequest } from './node-adapter';
import { createRateLimiter, type RateLimiter } from './rateLimit';
import { getSessionUser } from './session';
import { frameResponse } from '../generate/frame';
import { parseRequest, RequestError } from '../generate/request';
import { generate as defaultGenerate } from '../generate/service';

const json = (status: number, body: unknown, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...extra } });

async function readLimited(req: Request, max: number): Promise<string> {
  const declared = Number(req.headers.get('content-length'));
  if (declared > max) throw new RequestError(413, 'The request is too large.');
  if (!req.body) return '';
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      throw new RequestError(413, 'The request is too large.');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export interface GenerateDeps {
  limiter: RateLimiter;
  env?: NodeJS.ProcessEnv;
  generate?: typeof defaultGenerate;
}

export async function handleGenerate(req: Request, deps: GenerateDeps): Promise<Response> {
  if (req.method !== 'POST') return json(405, { error: 'method not allowed' }, { allow: 'POST' });
  const user = await getSessionUser(req, deps.env);
  if (!user) return json(401, { error: 'unauthorized' });

  const limit = await deps.limiter.hit(user.email);
  if (!limit.ok) return json(429, { error: 'Too many requests, try again in a few minutes' }, { 'retry-after': String(limit.retryAfterSec) });

  try {
    let raw: unknown;
    try {
      raw = JSON.parse(await readLimited(req, MAX_BODY_BYTES));
    } catch (e) {
      if (e instanceof RequestError) throw e;
      return json(400, { error: 'The request body is not valid JSON.' });
    }
    const parsed = parseRequest(raw);
    if (!parsed.ok) return json(parsed.status, { error: parsed.errors[0], errors: parsed.errors });

    const result = await (deps.generate ?? defaultGenerate)(parsed.req);
    if (result.kind === 'framed') {
      return new Response(frameResponse(result.meta, result.positions, result.indices), {
        status: 200,
        headers: { 'content-type': 'application/octet-stream', 'cache-control': 'no-store' },
      });
    }
    return new Response(result.body, {
      status: 200,
      headers: {
        'content-type': result.contentType,
        'content-disposition': `attachment; filename="${result.filename}"`,
        'cache-control': 'no-store',
        ...(result.warnings?.length ? { 'x-warnings': encodeURIComponent(JSON.stringify(result.warnings)) } : {}),
      },
    });
  } catch (e) {
    if (e instanceof RequestError) return json(e.status, { error: e.message, errors: e.errors });
    console.error('generation failed', e);
    return json(500, { error: 'generation failed' });
  }
}

/** The whole API as one Node server (Cloud Run, and local development). */
export function createServer(deps: { limiter?: RateLimiter } = {}): Server {
  const origin = process.env.FRONTEND_ORIGIN || 'http://localhost:3000';
  const limiter = deps.limiter ?? createRateLimiter({ limit: 60, windowMs: 10 * 60 * 1000 });

  const route = withCors(async (request) => {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith('/api/auth/')) return authHandler(request);
    if (pathname === '/api/me') return handleMe(request);
    if (pathname === '/api/generate') return handleGenerate(request, { limiter });
    return json(404, { error: 'not found' });
  }, origin);

  return createHttpServer(async (req, res) => {
    try {
      await sendWebResponse(res, await route(toWebRequest(req, process.env.AUTH_URL || 'http://localhost:3001')));
    } catch (err) {
      console.error(err);
      if (!res.headersSent) res.writeHead(500, { 'content-type': 'application/json' });
      res.end('{"error":"server error"}');
    }
  });
}
