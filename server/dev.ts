import { createServer, type Server } from 'node:http';
import { pathToFileURL } from 'node:url';
import { authHandler } from './auth';
import { handleMe } from './me';
import { sendWebResponse, toWebRequest } from './node-adapter';

const PORT = 3001;

/** Local stand-in for Vercel: mounts the same handlers that live under /api. */
export function createDevServer(): Server {
  return createServer(async (req, res) => {
    try {
      const request = toWebRequest(req, process.env.AUTH_URL || 'http://localhost:3000');
      const { pathname } = new URL(request.url);
      if (pathname.startsWith('/api/auth/')) return await sendWebResponse(res, await authHandler(request));
      if (pathname === '/api/me') return await sendWebResponse(res, await handleMe(request));
      res.writeHead(404, { 'content-type': 'application/json' }).end('{"error":"not found"}');
    } catch (err) {
      console.error(err);
      if (!res.headersSent) res.writeHead(500, { 'content-type': 'application/json' });
      res.end('{"error":"server error"}');
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await import('dotenv/config');
  createDevServer().listen(PORT, () => console.log(`api dev server on http://localhost:${PORT}`));
}
