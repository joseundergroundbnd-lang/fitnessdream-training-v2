import { handleSendPushRequest, type SendPushRequestBody } from '../../src/server/webPushHandler';

interface ApiRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
}

interface ApiResponse {
  status(code: number): { json(body: unknown): void };
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  const result = await handleSendPushRequest({
    authHeader: typeof req.headers.authorization === 'string' ? req.headers.authorization : undefined,
    body: (req.body || {}) as SendPushRequestBody,
  });

  res.status(result.status).json(result.payload);
}
