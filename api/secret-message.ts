import {
  MAX_MESSAGE_LENGTH,
  dispatchSecretMessage,
  resolveRecipientEmail,
} from './_deliver.js';

interface ApiRequest {
  method?: string;
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
  on?: (event: string, listener: (chunk: Uint8Array | string) => void) => void;
}

interface ApiResponse {
  status: (statusCode: number) => ApiResponse;
  json: (body: unknown) => void;
  end?: () => void;
}

async function readJsonBody(req: ApiRequest): Promise<Record<string, unknown>> {
  if (req.body && typeof req.body === 'object' && !(req.body instanceof Uint8Array)) {
    return req.body as Record<string, unknown>;
  }

  if (typeof req.body === 'string') {
    return (JSON.parse(req.body) as Record<string, unknown>) || {};
  }

  if (req.body instanceof Uint8Array) {
    const decoded = new TextDecoder().decode(req.body);
    return decoded.trim() ? ((JSON.parse(decoded) as Record<string, unknown>) || {}) : {};
  }

  if (!req.on) {
    return {};
  }

  const decoder = new TextDecoder();
  const raw = await new Promise<string>((resolve, reject) => {
    let text = '';
    req.on?.('data', (chunk) => {
      text += typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });
    });
    req.on?.('end', () => {
      text += decoder.decode();
      resolve(text);
    });
    req.on?.('error', (err) => reject(err));
  });

  if (!raw.trim()) {
    return {};
  }

  return (JSON.parse(raw) as Record<string, unknown>) || {};
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method === 'OPTIONS') {
    res.status(204).end?.();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed.' });
    return;
  }

  let body: Record<string, unknown>;
  try {
    body = await readJsonBody(req);
  } catch {
    res.status(400).json({ ok: false, error: 'Invalid request body.' });
    return;
  }

  const rawMessage = typeof body.message === 'string' ? body.message : '';
  const trimmedMessage = rawMessage.trim();

  if (!trimmedMessage) {
    res.status(400).json({ ok: false, error: 'Please write a message before sending.' });
    return;
  }

  if (trimmedMessage.length > MAX_MESSAGE_LENGTH) {
    res.status(400).json({
      ok: false,
      error: `Message must be ${MAX_MESSAGE_LENGTH} characters or fewer.`,
    });
    return;
  }

  try {
    const outcome = await dispatchSecretMessage(trimmedMessage);
    if (!outcome.ok) {
      res.status(outcome.status).json({
        ok: false,
        ...(outcome.code ? { code: outcome.code } : {}),
        ...(outcome.recipientEmail ? { recipientEmail: outcome.recipientEmail } : {}),
        error: outcome.error || 'Could not send right now. Please try again in a moment.',
      });
      return;
    }

    res.status(200).json({
      ok: true,
      provider: outcome.provider,
      ...(outcome.id ? { id: outcome.id } : {}),
    });
  } catch {
    res.status(502).json({
      ok: false,
      recipientEmail: resolveRecipientEmail(),
      error: 'Could not send right now. Please try again in a moment.',
    });
  }
}
