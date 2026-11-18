import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import path from 'node:path';
import {
  MAX_MESSAGE_LENGTH,
  dispatchSecretMessage,
  resolveRecipientEmail,
} from './api/_deliver.ts';

function resolvePort(): number {
  const portFlagIdx = process.argv.indexOf('--port');
  if (portFlagIdx !== -1 && process.argv[portFlagIdx + 1]) {
    const parsed = Number(process.argv[portFlagIdx + 1]);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  const envPort = Number(process.env.PORT);
  return Number.isFinite(envPort) && envPort > 0 ? envPort : 3000;
}

const PORT = resolvePort();

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '32kb' }));

  app.post('/api/secret-message', async (req: Request, res: Response) => {
    const rawMessage = typeof req.body?.message === 'string' ? req.body.message : '';
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
  });

  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const disableHmr = process.env.DISABLE_HMR === 'true';
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        ...(disableHmr ? { hmr: false, ws: false } : {}),
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
