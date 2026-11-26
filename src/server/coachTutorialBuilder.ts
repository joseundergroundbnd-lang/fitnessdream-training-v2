import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { GoogleGenAI } from '@google/genai';
import { synthesizeCommercialFitnessTrack } from './spotAudioBuilder';

const execFileAsync = promisify(execFile);

export interface CoachTutorialCue {
  id: string;
  slides: string[];
  text: string;
}

export const COACH_TUTORIAL_CUES: CoachTutorialCue[] = [
  {
    id: 'step1_enlaces_y_portal',
    slides: ['slide1.png', 'slide2.png'],
    text: '¡Hola equipo de FitnessDreams! Vamos a ver paso a paso desde el móvil cómo cualquier entrenador prepara y envía una rutina exclusiva a un socio. Lo primero: los entrenadores entráis con vuestro propio enlace de Portal Coaches, distinto al del socio. Tanto Javi Busta, Joel como cualquier coach autorizado podéis conectar la cuenta de Google del gimnasio y tener acceso completo.',
  },
  {
    id: 'step2_socio_y_periodo',
    slides: ['slide3.png', 'slide4.png'],
    text: 'Paso uno: en la base de datos de socios buscas al cliente por nombre o código y lo seleccionas para que la rutina le llegue en exclusiva solo a él. Paso dos: eliges si la planificación es diaria, semanal, mensual o trimestral, y escribes el título y el objetivo del bloque.',
  },
  {
    id: 'step3_musculo_y_equipamiento',
    slides: ['slide5.png'],
    text: 'Paso tres: pulsas el grupo muscular que quieres trabajar, por ejemplo Pecho, Espalda, Hombro, Brazos, Cuádriceps o Glúteo. Dentro de cada grupo puedes elegir ejercicios en maquinaria Telju oficial de la sala, en mancuernas y barra, o en polea.',
  },
  {
    id: 'step4_series_piramide_peso',
    slides: ['slide6.png'],
    text: 'Paso cuatro: al pinchar un ejercicio se abre su ficha de configuración. Aquí seleccionas de una a diez series, eliges repeticiones fijas o modo pirámide ascendente, descendente o doble, ajustas el peso orientativo, la intensidad y el descanso exacto entre series.',
  },
  {
    id: 'step5_cardio_y_envio',
    slides: ['slide7.png', 'slide8.png'],
    text: 'Paso cinco: puedes añadir un bloque de cardio en máquinas Telju con minutos e intensidad, revisar el resumen completo de toda la rutina y pulsar Enviar rutina exclusiva al socio.',
  },
  {
    id: 'step6_recepcion_en_movil_socio',
    slides: ['slide9.png'],
    text: 'Y al instante, solo ese socio recibe su rutina en su móvil dentro de la pestaña Entreno, Coaches, con la foto del entrenador, sus pirámides, descansos y cardio listos para cargar y entrenar. ¡Así de rápido y profesional en FitnessDreams Benidorm!',
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
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 6.0;
}

async function generateCoachVoiceClip(
  ai: GoogleGenAI,
  cue: CoachTutorialCue,
  outPath: string
): Promise<{ durationSec: number }> {
  const ttsModels = [
    'gemini-3.8-flash-tts',
    'gemini-3.8-flash-lite-tts',
    'gemini-2.5-flash-preview-tts',
  ];
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
                        'Warm, authoritative, clear Castilian Spanish male fitness coach explaining step by step on a smartphone how to build and assign an exclusive gym workout routine. Natural, confident, energetic tutorial pacing.',
                    },
                  }
                : {
                    text: `Habla en español de España claro, cercano y profesional como entrenador personal explicando un tutorial paso a paso desde el móvil: ${cue.text}`,
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
      : new Error(`No audio data returned by Gemini TTS for coach cue ${cue.id}`);
  }

  const rawBuf = Buffer.from(base64Audio, 'base64');
  const isRiffWav = rawBuf.length > 12 && rawBuf.subarray(0, 4).toString('ascii') === 'RIFF';
  if (isRiffWav || audioMimeType.includes('wav')) {
    fs.writeFileSync(outPath, rawBuf);
  } else {
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

  fs.copyFileSync(trimmedPath, outPath);
  const durationSec = await getMediaDurationSeconds(outPath);
  return { durationSec };
}

export async function buildCoachTutorialVideo(
  projectRoot: string,
  forceRegenerateClips = false
): Promise<{
  outputPath: string;
  artifactPath: string;
  durationSec: number;
  sizeBytes: number;
  cuesGenerated: number;
}> {
  const outputFileName = 'Video-Tutorial-Coach-Rutina-Movil-Enceladus.webm';
  const slidesDir = path.join(projectRoot, '.playwright-cli', 'coach-video-slides');
  const publicOutputPath = path.join(projectRoot, 'public', 'dossier', outputFileName);
  const artifactOutputPath = path.join(
    projectRoot,
    '.aistudio',
    'artifacts',
    'computer_use',
    outputFileName
  );

  for (const cue of COACH_TUTORIAL_CUES) {
    for (const slideName of cue.slides) {
      const fullSlidePath = path.join(slidesDir, slideName);
      if (!fs.existsSync(fullSlidePath)) {
        throw new Error(`Falta el fotograma del tutorial móvil: ${slideName}`);
      }
    }
  }

  const workDir = path.join(projectRoot, '.playwright-cli', 'coach-tutorial-audio');
  fs.mkdirSync(workDir, { recursive: true });

  let ai: GoogleGenAI | null = null;
  const clipItems: Array<{
    cue: CoachTutorialCue;
    filePath: string;
    durationSec: number;
    startSec: number;
    slotDurationSec: number;
  }> = [];

  let cursorSec = 0.45;
  for (const cue of COACH_TUTORIAL_CUES) {
    const filePath = path.join(workDir, `${cue.id}.wav`);
    let durationSec: number;
    if (!forceRegenerateClips && fs.existsSync(filePath)) {
      durationSec = await getMediaDurationSeconds(filePath);
    } else {
      if (!ai) {
        ai = createGeminiClient();
      }
      const res = await generateCoachVoiceClip(ai, cue, filePath);
      durationSec = res.durationSec;
    }

    const pauseAfterSec = cue.id === 'step6_recepcion_en_movil_socio' ? 1.4 : 0.65;
    const slotDurationSec = durationSec + pauseAfterSec;
    clipItems.push({
      cue,
      filePath,
      durationSec,
      startSec: cursorSec,
      slotDurationSec,
    });
    cursorSec += slotDurationSec;
  }

  const totalDurationSec = cursorSec + 0.35;

  // Step 1: Assemble exact-timed HD vertical 720x1280 video from mobile tutorial slides
  // Each slide duration matches its parent Enceladus cue so audio & screen are 100% synchronized.
  const slidePlan: Array<{ filePath: string; durationSec: number }> = [];
  clipItems.forEach((item, idx) => {
    const count = item.cue.slides.length;
    const baseDur = idx === 0 ? item.slotDurationSec + 0.45 : item.slotDurationSec;
    const extraTail = idx === clipItems.length - 1 ? 0.35 : 0;
    const totalCueVisual = baseDur + extraTail;
    item.cue.slides.forEach((slideName, sIdx) => {
      const share =
        count === 1
          ? totalCueVisual
          : sIdx === 0
            ? totalCueVisual * 0.48
            : totalCueVisual * 0.52;
      slidePlan.push({
        filePath: path.join(slidesDir, slideName),
        durationSec: Math.max(2.2, share),
      });
    });
  });

  const fadeSec = 0.35;
  const silentVideoPath = path.join(workDir, 'Video-Tutorial-Coach-Movil-Silent.webm');
  const videoInputs: string[] = [];
  const videoFilters: string[] = [];

  slidePlan.forEach((entry, idx) => {
    // Extend non-last clips by fadeSec so xfade overlap keeps exact total timeline
    const clipDur = idx < slidePlan.length - 1 ? entry.durationSec + fadeSec : entry.durationSec;
    videoInputs.push('-loop', '1', '-t', clipDur.toFixed(3), '-i', entry.filePath);
    videoFilters.push(
      `[${idx}:v]scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2:color=#06080D,fps=30,format=yuv420p,setsar=1[v${idx}]`
    );
  });

  let currentLabel = '[v0]';
  let offsetAccum = 0;
  for (let i = 0; i < slidePlan.length - 1; i++) {
    offsetAccum += slidePlan[i].durationSec;
    const nextLabel = i === slidePlan.length - 2 ? '[vout]' : `[vx${i}]`;
    videoFilters.push(
      `${currentLabel}[v${i + 1}]xfade=transition=fade:duration=${fadeSec.toFixed(2)}:offset=${offsetAccum.toFixed(3)}${nextLabel}`
    );
    currentLabel = nextLabel;
  }

  await execFileAsync('ffmpeg', [
    '-y',
    ...videoInputs,
    '-filter_complex',
    videoFilters.join(';'),
    '-map',
    '[vout]',
    '-c:v',
    'libvpx-vp9',
    '-crf',
    '30',
    '-b:v',
    '0',
    '-deadline',
    'realtime',
    '-cpu-used',
    '6',
    '-pix_fmt',
    'yuv420p',
    silentVideoPath,
  ]);

  const actualVideoDurationSec = await getMediaDurationSeconds(silentVideoPath);

  // Step 2: Synthesize gentle subtle commercial fitness background music bed
  const musicPath = path.join(workDir, 'coach-tutorial-music.wav');
  synthesizeCommercialFitnessTrack(musicPath, Math.max(actualVideoDurationSec, totalDurationSec) + 1.5);

  // Step 3: Mix Enceladus voice clips onto stereo stem at exact cue start positions
  const voiceStemPath = path.join(workDir, 'coach-voice-stem.wav');
  const voiceInputs: string[] = [];
  const voiceFilters: string[] = [];
  const voiceMixTags: string[] = [];

  clipItems.forEach((item, idx) => {
    voiceInputs.push('-i', item.filePath);
    const delayMs = Math.round(item.startSec * 1000);
    voiceFilters.push(
      `[${idx}:a]aresample=48000,aformat=channel_layouts=stereo,highpass=f=80,equalizer=f=3000:t=q:w=1.2:g=2.2,acompressor=threshold=-18dB:ratio=3:attack=10:release=120,volume=1.65,adelay=${delayMs}|${delayMs}[v${idx}]`
    );
    voiceMixTags.push(`[v${idx}]`);
  });

  const targetTotalDur = Math.max(actualVideoDurationSec, totalDurationSec);
  voiceFilters.push(
    `${voiceMixTags.join('')}amix=inputs=${clipItems.length}:duration=longest:dropout_transition=0:normalize=0,apad=whole_dur=${targetTotalDur.toFixed(
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

  // Step 4: Mux vertical mobile video + sidechain-ducked background music + Enceladus voiceover
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
      `[1:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,volume=0.18,atrim=0:${actualVideoDurationSec.toFixed(3)}[mus]`,
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
    cuesGenerated: clipItems.length,
  };
}
