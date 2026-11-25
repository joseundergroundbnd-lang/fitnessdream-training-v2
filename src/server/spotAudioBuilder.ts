import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { GoogleGenAI } from '@google/genai';

const execFileAsync = promisify(execFile);

export type SpotVoiceName = 'Enceladus' | 'Erinome';

export interface SpotNarrationCue {
  id: string;
  startSec: number;
  maxDurationSec: number;
  text: string;
}

export const FITNESSDREAMS_SPOT_CUES: SpotNarrationCue[] = [
  {
    id: 'act1_socios_entreno',
    startSec: 0.35,
    maxDurationSec: 24.5,
    text: '¡Bienvenido a FitnessDreams App! Todo tu gimnasio en la palma de tu mano. Crea tu perfil con foto directa desde el móvil y entra a tu pantalla de Inicio, con tu frase diaria de superación, tu Aro de Constancia y tus hábitos. Accede por el torno QR inteligente: luz verde si estás al día, alerta roja si hay cuota pendiente. En sala, registra series, descansos y discos exactos, recibe rutinas oficiales de tus coaches Javi Busta y Joel, y habla con ellos por mensaje o nota de voz.',
  },
  {
    id: 'act2_libre_clases_club',
    startSec: 25.3,
    maxDurationSec: 26.2,
    text: '¿Prefieres entrenar por libre? Explora cuarenta y una máquinas Telju, mancuernas y cardio. Reserva Jiu-Jitsu, Boxeo o Jumping Fitness en un toque, y recorre el mapa interactivo de ocho zonas con el render tres D exclusivo de nuestra sala. En Club, compite en los rankings y en la Mancuerna de setenta kilos, hazte amigo de tus Gym Bros para lanzar retos uno contra uno y compartir entrenamientos, y disfruta tu cuota de Socio Fundador y el Fit Café.',
  },
  {
    id: 'act3_direccion_cierre',
    startSec: 52.2,
    maxDurationSec: 14.3,
    text: 'Y para dirección: Panel total para Javi y Joel. Detecta socios sin entrenar antes de perder cuotas, analiza horas punta y clases llenas, envía rutinas y responde audios al instante. FitnessDreams. Work Your Dreams.',
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

async function getAudioDurationSeconds(filePath: string): Promise<number> {
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
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 3.0;
}

/**
 * Generates an energetic, modern commercial electronic fitness spot soundtrack (48kHz stereo WAV)
 * in D minor at 124 BPM with warm obsidian synth chords, driving sub-bass, punchy kick/hat groove,
 * smooth chapter risers, and a clean commercial fade-out.
 */
export function synthesizeCommercialFitnessTrack(outputWavPath: string, totalSeconds: number): void {
  const sampleRate = 48000;
  const numChannels = 2;
  const totalSamples = Math.ceil(totalSeconds * sampleRate);
  const dataBytes = totalSamples * numChannels * 2;
  const buffer = Buffer.alloc(44 + dataBytes);

  // RIFF/WAV header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * numChannels * 2, 28);
  buffer.writeUInt16LE(numChannels * 2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataBytes, 40);

  const bpm = 124;
  const beatDur = 60 / bpm;
  const barDur = beatDur * 4;

  // Uplifting dark-obsidian electronic chord progression: Dm -> Bb -> F -> C
  const chords: Array<{ bass: number; pad: number[]; arp: number[] }> = [
    { bass: 73.42, pad: [146.83, 220.0, 261.63, 349.23], arp: [293.66, 349.23, 440.0, 523.25] },
    { bass: 58.27, pad: [116.54, 174.61, 233.08, 293.66], arp: [233.08, 293.66, 349.23, 466.16] },
    { bass: 87.31, pad: [174.61, 220.0, 261.63, 349.23], arp: [261.63, 349.23, 440.0, 523.25] },
    { bass: 65.41, pad: [130.81, 196.0, 261.63, 329.63], arp: [261.63, 329.63, 392.0, 523.25] },
  ];

  // Deterministic pseudo-noise generator for crisp hats & clap transient
  let noiseSeed = 133791;
  const nextNoise = () => {
    noiseSeed = (noiseSeed * 1664525 + 1013904223) >>> 0;
    return (noiseSeed / 0xffffffff) * 2 - 1;
  };

  let lpStateL = 0;
  let lpStateR = 0;

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const beatPos = t / beatDur;
    const beatFrac = beatPos - Math.floor(beatPos);
    const step16 = Math.floor(beatPos * 4);
    const stepFrac = beatPos * 4 - step16;
    const barIdx = Math.floor(t / barDur);
    const chord = chords[barIdx % chords.length];

    // Smooth energy arc: punchy intro -> steady groove -> big panel lift at 50s -> clean outro swell
    let masterEnv = 1.0;
    if (t < 0.8) masterEnv = t / 0.8;
    if (t > totalSeconds - 2.6) {
      masterEnv *= Math.max(0, (totalSeconds - t) / 2.6);
    }
    const sectionEnergy = t < 3.6 ? 0.72 : t >= 50.0 ? 1.0 : 0.86;

    // 1. Punchy 4-on-the-floor electronic kick (starts cleanly at t >= 1.6s)
    let kick = 0;
    if (t >= 1.6 && t < totalSeconds - 1.8) {
      const kickEnv = Math.exp(-beatFrac * 18);
      const kickFreq = 46 + 115 * Math.exp(-beatFrac * 34);
      kick = Math.sin(2 * Math.PI * kickFreq * beatFrac * beatDur) * kickEnv * 0.42 * sectionEnergy;
    }

    // Sidechain pump synced to quarter-note kick
    const sidechain = t >= 1.6 ? 0.45 + 0.55 * Math.min(1, beatFrac * 2.2) : 1.0;

    // 2. Crisp offbeat hi-hat & subtle snare clap on beats 2 and 4
    const n = nextNoise();
    let perc = 0;
    if (t >= 3.8 && t < totalSeconds - 2.0) {
      // Off-beat 8th hi-hat
      const hatPos = (beatPos + 0.5) % 1;
      const hatEnv = Math.exp(-hatPos * 48);
      perc += n * hatEnv * 0.09 * sectionEnergy;

      // Subtle soft snap on beats 2 & 4
      const barBeat = Math.floor(beatPos) % 4;
      if (barBeat === 1 || barBeat === 3) {
        const clapEnv = Math.exp(-beatFrac * 26);
        perc += n * clapEnv * 0.08 * sectionEnergy;
      }
    }

    // 3. Driving pumping sub-bass on 8th-note groove
    const eighthPos = (beatPos * 2) % 1;
    const bassEnv = Math.exp(-eighthPos * 4.2) * sidechain;
    const bassFreq = chord.bass;
    const bassWave =
      Math.sin(2 * Math.PI * bassFreq * t) * 0.75 +
      Math.sin(2 * Math.PI * bassFreq * 2 * t) * 0.25;
    const bass = bassWave * bassEnv * 0.28 * sectionEnergy;

    // 4. Warm wide obsidian synth pad (slight stereo detune)
    let padL = 0;
    let padR = 0;
    for (let p = 0; p < chord.pad.length; p++) {
      const f = chord.pad[p];
      padL += Math.sin(2 * Math.PI * (f * 0.9985) * t + p * 0.7) * 0.22;
      padR += Math.sin(2 * Math.PI * (f * 1.0015) * t + p * 1.1) * 0.22;
    }
    padL *= 0.2 * sidechain;
    padR *= 0.2 * sidechain;

    // 5. Electric-blue plucky synth arpeggio (16th notes with gentle stereo pan)
    const arpFreq = chord.arp[step16 % chord.arp.length];
    const arpEnv = Math.exp(-stepFrac * 7.5) * sidechain;
    const arpVal =
      (Math.sin(2 * Math.PI * arpFreq * t) * 0.7 +
        Math.sin(2 * Math.PI * arpFreq * 2 * t) * 0.3) *
      arpEnv *
      0.11 *
      sectionEnergy;
    const pan = 0.5 + 0.32 * Math.sin(step16 * 0.9);
    const arpL = arpVal * (1 - pan);
    const arpR = arpVal * pan;

    // Gentle low-pass smoothing on stereo synths so they sit warmly behind voice
    const rawL = padL + arpL;
    const rawR = padR + arpR;
    lpStateL += 0.22 * (rawL - lpStateL);
    lpStateR += 0.22 * (rawR - lpStateR);

    let outL = (kick + bass + perc * 0.85 + lpStateL) * masterEnv;
    let outR = (kick + bass + perc * 1.0 + lpStateR) * masterEnv;

    // Soft limiter
    outL = Math.tanh(outL * 1.15) * 0.85;
    outR = Math.tanh(outR * 1.15) * 0.85;

    const offset = 44 + i * 4;
    buffer.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(outL * 32767))), offset);
    buffer.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(outR * 32767))), offset + 2);
  }

  fs.writeFileSync(outputWavPath, buffer);
}

async function generateVoiceClip(
  ai: GoogleGenAI,
  voiceName: SpotVoiceName,
  cue: SpotNarrationCue,
  outPath: string
): Promise<{ durationSec: number }> {
  const voiceStyle =
    voiceName === 'Erinome'
      ? 'Energetic, warm, bright female Spanish TV commercial announcer for a premium fitness gym. Clear Castilian Spanish pronunciation, confident, motivating, upbeat commercial pacing.'
      : 'Energetic, deep, modern male Spanish TV commercial announcer for a premium fitness gym. Clear Castilian Spanish pronunciation, confident, motivating, upbeat commercial pacing.';

  const response = await ai.models.generateContent({
    model: 'gemini-3.8-flash-lite-tts',
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: cue.text,
            speechMetadata: {
              style: voiceStyle,
            },
          },
        ],
      },
    ],
    config: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName },
        },
      },
    },
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) {
    throw new Error(`No audio data returned by ${voiceName} TTS for cue ${cue.id}`);
  }

  const wavBuffer = Buffer.from(base64Audio, 'base64');
  fs.writeFileSync(outPath, wavBuffer);

  // Trim trailing/leading dead silence lightly so timing hits every screen beat cleanly
  const trimmedPath = outPath.replace(/\.wav$/, '.trim.wav');
  await execFileAsync('ffmpeg', [
    '-y',
    '-i',
    outPath,
    '-af',
    'silenceremove=start_periods=1:start_duration=0.05:start_threshold=-45dB:detection=peak,areverse,silenceremove=start_periods=1:start_duration=0.08:start_threshold=-45dB:detection=peak,areverse',
    trimmedPath,
  ]);

  const rawDur = await getAudioDurationSeconds(trimmedPath);
  let finalPath = trimmedPath;

  // If Enceladus spoke slightly longer than the screen slot, apply gentle natural tempo compression (max 1.28x)
  if (rawDur > cue.maxDurationSec) {
    const tempo = Math.min(1.32, rawDur / cue.maxDurationSec);
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
  const finalDur = await getAudioDurationSeconds(outPath);
  return { durationSec: finalDur };
}

export async function buildNarratedSpotVideo(
  projectRoot: string,
  voiceName: SpotVoiceName = 'Enceladus',
  forceRegenerateClips = false
): Promise<{
  voice: SpotVoiceName;
  outputPath: string;
  artifactPath: string;
  durationSec: number;
  sizeBytes: number;
  cuesGenerated: number;
}> {
  const voiceKey = voiceName.toLowerCase();
  const outputFileName =
    voiceName === 'Erinome'
      ? 'Video-Demo-Movil-FitnessDreams-Erinome.webm'
      : 'Video-Demo-Movil-FitnessDreams.webm';

  const silentVideoPath = path.join(projectRoot, '.playwright-cli', 'Video-Demo-Movil-Silent.webm');
  const publicOutputPath = path.join(projectRoot, 'public', 'dossier', outputFileName);
  const artifactOutputPath = path.join(
    projectRoot,
    '.aistudio',
    'artifacts',
    'computer_use',
    outputFileName
  );

  if (!fs.existsSync(silentVideoPath)) {
    throw new Error('No se encontró el vídeo base silencioso para mezclar.');
  }

  const baseWorkDir = path.join(projectRoot, '.playwright-cli', 'spot-audio');
  const voiceWorkDir = path.join(baseWorkDir, voiceKey);
  fs.mkdirSync(voiceWorkDir, { recursive: true });

  const videoDurationSec = await getAudioDurationSeconds(silentVideoPath);

  // 1. Reuse cached clips if already generated (or generate with Gemini TTS)
  let ai: GoogleGenAI | null = null;
  const clipPaths: Array<{ cue: SpotNarrationCue; filePath: string; durationSec: number }> = [];

  for (const cue of FITNESSDREAMS_SPOT_CUES) {
    const filePath = path.join(voiceWorkDir, `${cue.id}.wav`);
    const legacyEnceladusPath =
      voiceName === 'Enceladus' ? path.join(baseWorkDir, `${cue.id}.wav`) : null;

    if (!forceRegenerateClips && fs.existsSync(filePath)) {
      const durationSec = await getAudioDurationSeconds(filePath);
      clipPaths.push({ cue, filePath, durationSec });
      continue;
    }

    if (!forceRegenerateClips && legacyEnceladusPath && fs.existsSync(legacyEnceladusPath)) {
      fs.copyFileSync(legacyEnceladusPath, filePath);
      const durationSec = await getAudioDurationSeconds(filePath);
      clipPaths.push({ cue, filePath, durationSec });
      continue;
    }

    if (!ai) {
      ai = createGeminiClient();
    }
    const { durationSec } = await generateVoiceClip(ai, voiceName, cue, filePath);
    clipPaths.push({ cue, filePath, durationSec });
  }

  // 2. Synthesize custom 48kHz stereo commercial fitness soundtrack
  const musicPath = path.join(baseWorkDir, 'spot-music.wav');
  synthesizeCommercialFitnessTrack(musicPath, videoDurationSec + 0.5);

  // 3. Mix voice clips at exact cue timestamps -> single clean stereo voice stem
  const voiceStemPath = path.join(voiceWorkDir, 'voice-stem.wav');
  const voiceInputs: string[] = [];
  const voiceFilters: string[] = [];
  const voiceMixTags: string[] = [];

  let prevEndSec = 0;
  clipPaths.forEach((item, idx) => {
    voiceInputs.push('-i', item.filePath);
    const effectiveStartSec =
      idx === 0 ? item.cue.startSec : Math.max(item.cue.startSec, prevEndSec + 0.35);
    prevEndSec = effectiveStartSec + item.durationSec;
    const delayMs = Math.round(effectiveStartSec * 1000);
    voiceFilters.push(
      `[${idx}:a]aresample=48000,aformat=channel_layouts=stereo,highpass=f=80,equalizer=f=3200:t=q:w=1.2:g=2.5,acompressor=threshold=-18dB:ratio=3:attack=10:release=120,volume=1.55,adelay=${delayMs}|${delayMs}[v${idx}]`
    );
    voiceMixTags.push(`[v${idx}]`);
  });

  voiceFilters.push(
    `${voiceMixTags.join('')}amix=inputs=${clipPaths.length}:duration=longest:dropout_transition=0:normalize=0,apad=whole_dur=${videoDurationSec.toFixed(
      3
    )},atrim=0:${videoDurationSec.toFixed(3)}[voicestem]`
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

  // 4. Sidechain-duck the commercial fitness music under voice & mux directly into .webm
  const tempOutputPath = path.join(voiceWorkDir, outputFileName);
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
      `[1:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,volume=0.36,atrim=0:${videoDurationSec.toFixed(3)}[mus]`,
      `[mus][vsc]sidechaincompress=threshold=0.02:ratio=6:attack=25:release=320:makeup=1[musduck]`,
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
  if (fs.existsSync(path.dirname(artifactOutputPath))) {
    fs.copyFileSync(tempOutputPath, artifactOutputPath);
  }

  const stats = fs.statSync(publicOutputPath);
  const finalDuration = await getAudioDurationSeconds(publicOutputPath);

  return {
    voice: voiceName,
    outputPath: publicOutputPath,
    artifactPath: artifactOutputPath,
    durationSec: finalDuration,
    sizeBytes: stats.size,
    cuesGenerated: clipPaths.length,
  };
}
