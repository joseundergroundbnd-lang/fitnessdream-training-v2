import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { GoogleGenAI } from '@google/genai';
import { synthesizeCommercialFitnessTrack } from './spotAudioBuilder';

const execFileAsync = promisify(execFile);

export interface SetupTutorialCue {
  id: string;
  startSec: number;
  maxDurationSec: number;
  text: string;
}

export const SETUP_TUTORIAL_CUES: SetupTutorialCue[] = [
  {
    id: 'step1_enlace_y_arquitectura',
    startSec: 0.4,
    maxDurationSec: 16.5,
    text: '¡Hola! Vamos a conectar FitnessDreams en cinco minutos para abrir hoy con pruebas reales. Primero, un detalle clave: nunca compartas el enlace de ai punto studio, porque muestra una pantalla previa. Usa siempre el enlace directo limpio de tu aplicación en el ordenador de recepción, en el móvil lector y en el cartel A tres.',
  },
  {
    id: 'step2_pc_recepcion',
    startSec: 17.5,
    maxDurationSec: 16.5,
    text: 'Paso uno, en el ordenador del gimnasio: abre Google Chrome con el enlace directo y entra en Panel Dirección, pestaña Recepción. Pulsa Conectar Google del Gimnasio con tu cuenta principal. Desde aquí das de alta clientes en mostrador, cambias cualquier cuota entre Al día y Pendiente en un clic, y ves cada entrada en tiempo real.',
  },
  {
    id: 'step3_movil_lector_qr',
    startSec: 34.6,
    maxDurationSec: 17.0,
    text: 'Paso dos: como todavía no tienes lector físico de torno, convierte cualquier móvil viejo o secundario en tu lector Q R. Escanea con ese móvil el código Q R azul del panel de recepción, inicia sesión con tu misma cuenta de Google, ponlo en un soporte en la entrada conectado al cargador y activa la cámara frontal con sonido.',
  },
  {
    id: 'step4_prueba_verde_y_roja',
    startSec: 52.2,
    maxDurationSec: 15.0,
    text: 'Mira cómo responde al instante: cuando un socio al día acerca su Pase Q R, suena el pitido verde de Acceso Permitido y queda registrado en el ordenador. Si en el ordenador le marcas Cuota Pendiente y vuelve a pasar su Q R, salta al segundo la alarma roja de bloqueo.',
  },
  {
    id: 'step5_cartel_a3_y_clientes',
    startSec: 67.8,
    maxDurationSec: 14.5,
    text: 'Paso tres, para tus clientes reales: imprime el Cartel A tres de la Mancuerna en el Pedestal y ponlo en la puerta. Al escanearlo, tanto en Android como en iPhone les pedirá instalar la app en su pantalla de inicio con el icono del pedestal llamado Training. ¡Listos para abrir FitnessDreams hoy mismo!',
  },
];

function createGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY no está configurada en el servidor.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function getMediaDurationSeconds(filePath: string): Promise<number> {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'default=noprint_wrappers=1:nokey=1',
    filePath,
  ]);
  const parsed = Number.parseFloat(stdout.trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 5.0;
}

async function generateSetupVoiceClip(
  ai: GoogleGenAI,
  cue: SetupTutorialCue,
  outPath: string
): Promise<{ durationSec: number }> {
  const ttsModels = ['gemini-3.8-flash-tts', 'gemini-3.8-flash-lite-tts', 'gemini-2.5-flash-preview-tts'];
  let base64Audio: string | undefined;
  let audioMimeType = 'audio/wav';
  let lastError: unknown;

  for (const model of ttsModels) {
    try {
      const useSpeechMetadata = model.startsWith('gemini-3.8');
      const response = await ai.models.generateContent({
        model,
        contents: [
          {
            role: 'user',
            parts: [
              useSpeechMetadata
                ? {
                    text: cue.text,
                    speechMetadata: {
                      style:
                        'Warm, clear, practical Castilian Spanish male instructor explaining step by step how to set up a gym app on a reception PC and spare phone QR scanner. Natural, friendly, confident pacing.',
                    },
                  }
                : {
                    text: `Habla en español de España claro, cercano y práctico como un instructor profesional: ${cue.text}`,
                  },
            ],
          },
        ],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Enceladus' },
            },
          },
        },
      });
      const inlineData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData;
      if (inlineData?.data) {
        base64Audio = inlineData.data;
        audioMimeType = inlineData.mimeType || 'audio/wav';
        break;
      }
    } catch (err) {
      lastError = err;
    }
  }

  if (!base64Audio) {
    throw lastError instanceof Error
      ? lastError
      : new Error(`No audio data returned by Gemini TTS for setup cue ${cue.id}`);
  }

  const rawBuf = Buffer.from(base64Audio, 'base64');
  const isRiffWav = rawBuf.length > 12 && rawBuf.subarray(0, 4).toString('ascii') === 'RIFF';
  if (isRiffWav || audioMimeType.includes('wav')) {
    fs.writeFileSync(outPath, rawBuf);
  } else {
    // Wrap headerless 24kHz 16-bit mono PCM into a standard WAV file
    const rawPcmPath = outPath.replace(/\.wav$/, '.pcm');
    fs.writeFileSync(rawPcmPath, rawBuf);
    await execFileAsync('ffmpeg', [
      '-y',
      '-f',
      's16le',
      '-ar',
      '24000',
      '-ac',
      '1',
      '-i',
      rawPcmPath,
      outPath,
    ]);
  }

  const trimmedPath = outPath.replace(/\.wav$/, '.trim.wav');
  await execFileAsync('ffmpeg', [
    '-y',
    '-i',
    outPath,
    '-af',
    'silenceremove=start_periods=1:start_duration=0.05:start_threshold=-45dB:detection=peak,areverse,silenceremove=start_periods=1:start_duration=0.08:start_threshold=-45dB:detection=peak,areverse',
    trimmedPath,
  ]);

  const rawDur = await getMediaDurationSeconds(trimmedPath);
  let finalPath = trimmedPath;

  if (rawDur > cue.maxDurationSec) {
    const tempo = Math.min(1.26, rawDur / cue.maxDurationSec);
    const fitPath = outPath.replace(/\.wav$/, '.fit.wav');
    await execFileAsync('ffmpeg', [
      '-y',
      '-i',
      trimmedPath,
      '-af',
      `atempo=${tempo.toFixed(3)}`,
      fitPath,
    ]);
    finalPath = fitPath;
  }

  fs.copyFileSync(finalPath, outPath);
  const durationSec = await getMediaDurationSeconds(outPath);
  return { durationSec };
}

export async function buildSetupTutorialVideo(
  projectRoot: string,
  forceRegenerateClips = false
): Promise<{
  outputPath: string;
  artifactPath: string;
  durationSec: number;
  sizeBytes: number;
  cuesGenerated: number;
}> {
  const outputFileName = 'Video-Tutorial-Conexion-PC-y-Movil-Lector-QR.webm';
  const silentVideoPath = path.join(
    projectRoot,
    '.playwright-cli',
    'Video-Tutorial-PC-Lector-Silent.webm'
  );
  const publicOutputPath = path.join(projectRoot, 'public', 'dossier', outputFileName);
  const artifactOutputPath = path.join(
    projectRoot,
    '.aistudio',
    'artifacts',
    'computer_use',
    outputFileName
  );

  if (!fs.existsSync(silentVideoPath)) {
    throw new Error('No se encontró el vídeo base silencioso del tutorial de conexión.');
  }

  const workDir = path.join(projectRoot, '.playwright-cli', 'setup-tutorial-audio');
  fs.mkdirSync(workDir, { recursive: true });

  const videoDurationSec = await getMediaDurationSeconds(silentVideoPath);

  let ai: GoogleGenAI | null = null;
  const clipPaths: Array<{ cue: SetupTutorialCue; filePath: string; durationSec: number }> = [];

  for (const cue of SETUP_TUTORIAL_CUES) {
    const filePath = path.join(workDir, `${cue.id}.wav`);
    if (!forceRegenerateClips && fs.existsSync(filePath)) {
      const durationSec = await getMediaDurationSeconds(filePath);
      clipPaths.push({ cue, filePath, durationSec });
      continue;
    }

    if (!ai) {
      ai = createGeminiClient();
    }
    const { durationSec } = await generateSetupVoiceClip(ai, cue, filePath);
    clipPaths.push({ cue, filePath, durationSec });
  }

  // Synthesize gentle subtle background music bed
  const musicPath = path.join(workDir, 'tutorial-music.wav');
  synthesizeCommercialFitnessTrack(musicPath, videoDurationSec + 1.0);

  // Mix voice clips onto stereo stem at cue start positions
  const voiceStemPath = path.join(workDir, 'voice-stem.wav');
  const voiceInputs: string[] = [];
  const voiceFilters: string[] = [];
  const voiceMixTags: string[] = [];

  let prevEndSec = 0;
  clipPaths.forEach((item, idx) => {
    voiceInputs.push('-i', item.filePath);
    const effectiveStartSec =
      idx === 0 ? item.cue.startSec : Math.max(item.cue.startSec, prevEndSec + 0.45);
    prevEndSec = effectiveStartSec + item.durationSec;
    const delayMs = Math.round(effectiveStartSec * 1000);
    voiceFilters.push(
      `[${idx}:a]aresample=48000,aformat=channel_layouts=stereo,highpass=f=80,equalizer=f=3000:t=q:w=1.2:g=2.2,acompressor=threshold=-18dB:ratio=3:attack=10:release=120,volume=1.6,adelay=${delayMs}|${delayMs}[v${idx}]`
    );
    voiceMixTags.push(`[v${idx}]`);
  });

  const targetTotalDur = Math.max(videoDurationSec, prevEndSec + 1.2);
  voiceFilters.push(
    `${voiceMixTags.join('')}amix=inputs=${clipPaths.length}:duration=longest:dropout_transition=0:normalize=0,apad=whole_dur=${targetTotalDur.toFixed(
      3
    )},atrim=0:${targetTotalDur.toFixed(3)}[voicestem]`
  );

  await execFileAsync('ffmpeg', [
    '-y',
    ...voiceInputs,
    '-filter_complex',
    voiceFilters.join(';'),
    '-map',
    '[voicestem]',
    '-ar',
    '48000',
    '-ac',
    '2',
    voiceStemPath,
  ]);

  // Mux video + sidechain-ducked background music + clear voiceover
  const tempOutputPath = path.join(workDir, outputFileName);
  await execFileAsync('ffmpeg', [
    '-y',
    '-i',
    silentVideoPath,
    '-i',
    musicPath,
    '-i',
    voiceStemPath,
    '-filter_complex',
    [
      `[2:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,asplit=2[vsc][vmix]`,
      `[1:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,volume=0.20,atrim=0:${videoDurationSec.toFixed(3)}[mus]`,
      `[mus][vsc]sidechaincompress=threshold=0.015:ratio=7:attack=25:release=340:makeup=1[musduck]`,
      `[musduck][vmix]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95[aout]`,
    ].join(';'),
    '-map',
    '0:v:0',
    '-map',
    '[aout]',
    '-c:v',
    'copy',
    '-c:a',
    'libopus',
    '-b:a',
    '128k',
    '-shortest',
    tempOutputPath,
  ]);

  fs.mkdirSync(path.dirname(publicOutputPath), { recursive: true });
  fs.copyFileSync(tempOutputPath, publicOutputPath);
  fs.mkdirSync(path.dirname(artifactOutputPath), { recursive: true });
  fs.copyFileSync(tempOutputPath, artifactOutputPath);

  const stats = fs.statSync(publicOutputPath);
  const finalDuration = await getMediaDurationSeconds(publicOutputPath);

  return {
    outputPath: publicOutputPath,
    artifactPath: artifactOutputPath,
    durationSec: finalDuration,
    sizeBytes: stats.size,
    cuesGenerated: clipPaths.length,
  };
}
