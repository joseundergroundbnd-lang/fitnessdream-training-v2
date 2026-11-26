import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';
import { buildCoachTutorialVideo } from './src/server/coachTutorialBuilder';
import { buildSetupTutorialVideo } from './src/server/setupTutorialBuilder';
import { buildNarratedSpotVideo } from './src/server/spotAudioBuilder';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT) || 3000;

async function startServer() {
  const app = express();
  app.use(express.json());

  app.get('/api/spot/status', (_req, res) => {
    const videoPath = path.join(__dirname, 'public', 'dossier', 'Video-Demo-Movil-FitnessDreams.webm');
    const setupVideoPath = path.join(
      __dirname,
      'public',
      'dossier',
      'Video-Tutorial-Conexion-PC-y-Movil-Lector-QR.webm'
    );
    const coachVideoPath = path.join(
      __dirname,
      'public',
      'dossier',
      'Video-Tutorial-Coach-Rutina-Movil-Enceladus.webm'
    );
    res.json({
      hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
      videoExists: fs.existsSync(videoPath),
      videoSizeBytes: fs.existsSync(videoPath) ? fs.statSync(videoPath).size : 0,
      setupVideoExists: fs.existsSync(setupVideoPath),
      setupVideoSizeBytes: fs.existsSync(setupVideoPath) ? fs.statSync(setupVideoPath).size : 0,
      coachVideoExists: fs.existsSync(coachVideoPath),
      coachVideoSizeBytes: fs.existsSync(coachVideoPath) ? fs.statSync(coachVideoPath).size : 0,
    });
  });

  app.post('/api/spot/build-audio-video', async (req, res) => {
    try {
      const requestedVoice = req.body?.voice === 'Erinome' ? 'Erinome' : 'Enceladus';
      const forceRegenerate = Boolean(req.body?.forceRegenerate);
      const result = await buildNarratedSpotVideo(__dirname, requestedVoice, forceRegenerate);
      res.json({ ok: true, ...result });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ ok: false, error: message });
    }
  });

  app.post('/api/setup-video/build', async (req, res) => {
    try {
      const forceRegenerate = Boolean(req.body?.forceRegenerate);
      const result = await buildSetupTutorialVideo(__dirname, forceRegenerate);
      res.json({ ok: true, ...result });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ ok: false, error: message });
    }
  });

  app.post('/api/coach-video/build', async (req, res) => {
    try {
      const forceRegenerate = Boolean(req.body?.forceRegenerate);
      const result = await buildCoachTutorialVideo(__dirname, forceRegenerate);
      res.json({ ok: true, ...result });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ ok: false, error: message });
    }
  });

  // Always serve /dossier directly with proper MIME types & byte-range video streaming
  app.use('/dossier', express.static(path.join(__dirname, 'public', 'dossier')));

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`FitnessDreams server running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
