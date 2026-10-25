/** Wraps a handler with CORS for exactly one origin (the frontend), with credentials. */
export function withCors(handler: (req: Request) => Promise<Response>, allowedOrigin: string): (req: Request) => Promise<Response> {
  return async (req) => {
    const allowed = req.headers.get('origin') === allowedOrigin;
    if (req.method === 'OPTIONS') {
      const headers = new Headers({ vary: 'Origin' });
      if (allowed) {
        headers.set('access-control-allow-origin', allowedOrigin);
        headers.set('access-control-allow-credentials', 'true');
        headers.set('access-control-allow-methods', 'GET, POST, OPTIONS');
        headers.set('access-control-allow-headers', 'content-type');
        headers.set('access-control-max-age', '600');
      }
      return new Response(null, { status: 204, headers });
    }
    const res = await handler(req);
    if (!allowed) return res;
    const headers = new Headers(res.headers);
    headers.set('access-control-allow-origin', allowedOrigin);
    headers.set('access-control-allow-credentials', 'true');
    headers.set('access-control-expose-headers', 'content-disposition, x-warnings');
    headers.append('vary', 'Origin');
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  };
}
