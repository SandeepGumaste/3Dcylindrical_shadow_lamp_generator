import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleMe } from '../server/me';
import { sendWebResponse, toWebRequest } from '../server/node-adapter';

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  await sendWebResponse(res, await handleMe(toWebRequest(req, process.env.AUTH_URL || 'http://localhost:3000')));
}
