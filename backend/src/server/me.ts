import { getSessionUser } from './session';

export async function handleMe(req: Request, env: NodeJS.ProcessEnv = process.env): Promise<Response> {
  const user = await getSessionUser(req, env);
  const headers = { 'content-type': 'application/json', 'cache-control': 'no-store' };
  if (!user) return new Response('{"error":"unauthorized"}', { status: 401, headers });
  return new Response(JSON.stringify(user), { status: 200, headers });
}
