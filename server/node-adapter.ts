import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';

export function toWebRequest(req: IncomingMessage, baseUrl: string): Request {
  const proto = (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0];
  const host = req.headers['x-forwarded-host'] ?? req.headers.host;
  const origin = host ? `${proto ?? new URL(baseUrl).protocol.replace(':', '')}://${host}` : baseUrl;

  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (Array.isArray(v)) v.forEach((x) => headers.append(k, x));
    else if (v !== undefined) headers.set(k, v);
  }
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  return new Request(new URL(req.url ?? '/', origin), {
    method: req.method,
    headers,
    body: hasBody ? (Readable.toWeb(req) as ReadableStream) : undefined,
    // @ts-expect-error Node-only option required when sending a stream body
    duplex: 'half',
  });
}

export async function sendWebResponse(res: ServerResponse, r: Response): Promise<void> {
  res.statusCode = r.status;
  r.headers.forEach((value, key) => {
    if (key !== 'set-cookie') res.setHeader(key, value);
  });
  const cookies = r.headers.getSetCookie();
  if (cookies.length) res.setHeader('set-cookie', cookies);
  res.end(Buffer.from(await r.arrayBuffer()));
}
