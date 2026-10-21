import type { IncomingMessage, ServerResponse } from 'node:http';
import { authHandler } from '../../server/auth';
import { sendWebResponse, toWebRequest } from '../../server/node-adapter';

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  await sendWebResponse(res, await authHandler(toWebRequest(req, process.env.AUTH_URL || 'http://localhost:3000')));
}
