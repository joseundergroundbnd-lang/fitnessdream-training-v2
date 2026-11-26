import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Bell,
  BellOff,
  Check,
  Cloud,
  CloudOff,
  Mic,
  Pause,
  Play,
  Send,
  Square,
  Trash2,
  Volume2,
} from 'lucide-react';
import type { CoachProfile, DirectMessage, MessageTopicTag } from '../types/gym';
import { formatSecondsClock, getConversationMessages } from '../utils/gymLogic';
import {
  MAX_AUDIO_RECORDING_SECONDS,
  selectBestAudioMimeType,
  validateAudioPayload,
} from '../utils/messaging';
import type { NotificationPermissionState } from '../utils/notifications';

export interface SendDirectMessageResult {
  savedToCloud: boolean;
  error?: string;
}

interface CoachMessageThreadProps {
  viewerRole: 'member' | 'coach';
  coach: CoachProfile;
  memberId: string;
  memberName: string;
  memberAvatar?: string;
  messages: DirectMessage[];
  onSendMessage: (
    msg: Omit<DirectMessage, 'id' | 'timestampLabel'>
  ) => Promise<SendDirectMessageResult | void> | SendDirectMessageResult | void;
  isCloudConnected?: boolean;
  cloudStatusHint?: string;
  onConnectGoogle?: () => Promise<void> | void;
  notificationPermission?: NotificationPermissionState;
  onRequestNotificationPermission?: () => Promise<void> | void;
  onTestNotification?: () => Promise<void> | void;
  compact?: boolean;
}

const MEMBER_TOPICS: MessageTopicTag[] = [
  'Solicitud de rutina',
  'Duda técnica',
  'Seguimiento',
  'Mensaje directo',
];

const COACH_TOPICS: MessageTopicTag[] = [
  'Seguimiento',
  'Solicitud de rutina',
  'Duda técnica',
  'Mensaje directo',
];

const WAVEFORM_BARS = [35, 65, 90, 50, 80, 100, 60, 40, 85, 70, 55, 95, 65, 45, 75, 50];

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? parts[0]?.[1] ?? '')).toUpperCase();
}

export const CoachMessageThread: React.FC<CoachMessageThreadProps> = ({
  viewerRole,
  coach,
  memberId,
  memberName,
  memberAvatar,
  messages,
  onSendMessage,
  isCloudConnected,
  cloudStatusHint,
  onConnectGoogle,
  notificationPermission,
  onRequestNotificationPermission,
  onTestNotification,
  compact = false,
}) => {
  const [topicTag, setTopicTag] = useState<MessageTopicTag>(
    viewerRole === 'member' ? 'Solicitud de rutina' : 'Seguimiento'
  );
  const [draftText, setDraftText] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [deliveryNotice, setDeliveryNotice] = useState<{
    tone: 'success' | 'warning';
    text: string;
  } | null>(null);
  const [isSending, setIsSending] = useState(false);

  // Voice audio recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSec, setRecordingSec] = useState(0);
  const [recordingMode, setRecordingMode] = useState<'mic' | 'simulado'>('mic');
  const [audioCaption, setAudioCaption] = useState('');
  const [pendingAudio, setPendingAudio] = useState<{
    audioUrl: string;
    durationSec: number;
    mode: 'mic' | 'simulado';
    sizeKb?: number;
  } | null>(null);

  // Audio playback state
  const [playingMsgId, setPlayingMsgId] = useState<string | null>(null);
  const [playbackProgress, setPlaybackProgress] = useState<number>(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingSecRef = useRef<number>(0);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const synthTimerRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const threadEndRef = useRef<HTMLDivElement | null>(null);

  const threadMessages = useMemo(
    () => getConversationMessages(messages, coach.id, memberId),
    [messages, coach.id, memberId]
  );

  // Recording elapsed seconds timer with automatic 45s cap so Firestore payload always succeeds
  useEffect(() => {
    if (!isRecording) return;
    recordingSecRef.current = 0;
    setRecordingSec(0);
    const id = window.setInterval(() => {
      recordingSecRef.current += 1;
      setRecordingSec(recordingSecRef.current);
      if (recordingSecRef.current >= MAX_AUDIO_RECORDING_SECONDS) {
        if (
          mediaRecorderRef.current &&
          mediaRecorderRef.current.state !== 'inactive'
        ) {
          mediaRecorderRef.current.stop();
        }
        setIsRecording(false);
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [isRecording]);

  // Cleanup audio streams & playback on unmount
  useEffect(() => {
    return () => {
      stopPlayback();
      cleanupMediaStream();
    };
  }, []);

  const cleanupMediaStream = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    mediaRecorderRef.current = null;
  };

  const stopPlayback = () => {
    if (audioElRef.current) {
      audioElRef.current.pause();
      audioElRef.current = null;
    }
    if (synthTimerRef.current !== null) {
      window.clearInterval(synthTimerRef.current);
      synthTimerRef.current = null;
    }
    if (audioCtxRef.current) {
      try {
        void audioCtxRef.current.close();
      } catch {
        // Ignore AudioContext close error
      }
      audioCtxRef.current = null;
    }
    setPlayingMsgId(null);
    setPlaybackProgress(0);
  };

  const playAudioUrl = (playId: string, url: string, fallbackDurationSec: number) => {
    if (playingMsgId === playId) {
      stopPlayback();
      return;
    }
    stopPlayback();
    setPlayingMsgId(playId);
    setPlaybackProgress(0);

    const isRealAudio =
      url.startsWith('data:audio') || url.startsWith('blob:') || url.startsWith('http');

    if (isRealAudio) {
      try {
        const audio = new Audio(url);
        audioElRef.current = audio;
        audio.ontimeupdate = () => {
          const dur =
            audio.duration && Number.isFinite(audio.duration)
              ? audio.duration
              : fallbackDurationSec || 5;
          setPlaybackProgress(
            Math.min(100, Math.round((audio.currentTime / Math.max(1, dur)) * 100))
          );
        };
        audio.onended = () => {
          stopPlayback();
        };
        audio.onerror = () => {
          setFormError(
            'Este navegador no pudo reproducir el formato de este audio. Prueba desde Chrome o Safari.'
          );
          stopPlayback();
        };
        void audio.play().catch(() => {
          setFormError(
            'Pulsa de nuevo para permitir la reproducción de audio en tu dispositivo.'
          );
          stopPlayback();
        });
        return;
      } catch {
        // Fallback below
      }
    }

    runSimulatedPlayback(fallbackDurationSec || 5);
  };

  const playVoiceNote = (msg: DirectMessage) => {
    playAudioUrl(msg.id, msg.audioUrl ?? 'synthetic-voice', msg.audioDurationSec ?? 5);
  };

  const runSimulatedPlayback = (durationSec: number) => {
    const safeSec = Math.max(2, Math.min(durationSec, 10));
    const totalMs = safeSec * 1000;
    const startedAt = Date.now();

    try {
      const AudioContextCtor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioContextCtor) {
        const ctx = new AudioContextCtor();
        audioCtxRef.current = ctx;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(340, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(420, ctx.currentTime + 0.18);
        gain.gain.setValueAtTime(0.03, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.28);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.3);
      }
    } catch {
      // Ignore Web Audio restriction
    }

    synthTimerRef.current = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const pct = Math.min(100, Math.round((elapsed / totalMs) * 100));
      setPlaybackProgress(pct);
      if (elapsed >= totalMs) {
        stopPlayback();
      }
    }, 120);
  };

  const handleStartRecording = async () => {
    setFormError(null);
    setDeliveryNotice(null);
    setPendingAudio(null);

    if (
      typeof navigator !== 'undefined' &&
      navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === 'function' &&
      typeof MediaRecorder !== 'undefined'
    ) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        mediaStreamRef.current = stream;
        chunksRef.current = [];

        const preferredMime = selectBestAudioMimeType(
          typeof MediaRecorder.isTypeSupported === 'function'
            ? (m) => MediaRecorder.isTypeSupported(m)
            : undefined
        );
        const recorderOptions: MediaRecorderOptions = {
          audioBitsPerSecond: 24000,
        };
        if (preferredMime) {
          recorderOptions.mimeType = preferredMime;
        }

        let recorder: MediaRecorder;
        try {
          recorder = new MediaRecorder(stream, recorderOptions);
        } catch {
          recorder = new MediaRecorder(stream);
        }
        mediaRecorderRef.current = recorder;

        recorder.ondataavailable = (ev) => {
          if (ev.data && ev.data.size > 0) {
            chunksRef.current.push(ev.data);
          }
        };

        recorder.onstop = () => {
          const duration = Math.max(1, recordingSecRef.current);
          const mimeType = recorder.mimeType || preferredMime || 'audio/webm';
          const blob = new Blob(chunksRef.current, { type: mimeType });
          cleanupMediaStream();

          if (blob.size === 0) {
            setFormError(
              'El micrófono no captó sonido. Mantén la grabación al menos 2 segundos e inténtalo de nuevo.'
            );
            return;
          }

          const reader = new FileReader();
          reader.onloadend = () => {
            const dataUrl = typeof reader.result === 'string' ? reader.result : '';
            const check = validateAudioPayload(dataUrl);
            if (!check.valid) {
              setFormError(check.error ?? 'Error al procesar el audio grabado.');
              return;
            }
            setPendingAudio({
              audioUrl: dataUrl,
              durationSec: duration,
              mode: 'mic',
              sizeKb: Math.max(1, Math.round(dataUrl.length / 1024)),
            });
          };
          reader.readAsDataURL(blob);
        };

        recorder.start(250);
        setRecordingMode('mic');
        setIsRecording(true);
        return;
      } catch (err) {
        cleanupMediaStream();
        const errName = err instanceof Error ? err.name : '';
        if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
          setFormError(
            'Permiso de micrófono denegado. Activa el micrófono en el candado de la barra del navegador o en Ajustes del móvil y pulsa Grabar audio de nuevo.'
          );
          return;
        }
        if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
          setFormError(
            'No se ha detectado ningún micrófono en este dispositivo. Puedes enviar mensajes escritos o conectar un micrófono.'
          );
          return;
        }
        setFormError(
          'No se pudo iniciar el micrófono en este navegador. Asegúrate de entrar por HTTPS y conceder permiso de micrófono.'
        );
        return;
      }
    }

    setFormError(
      'Este navegador no soporta grabación de micrófono directa. Usa Chrome en Android o Safari en iPhone.'
    );
  };

  const handleStopRecording = () => {
    if (!isRecording) return;
    setIsRecording(false);
    if (
      recordingMode === 'mic' &&
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== 'inactive'
    ) {
      mediaRecorderRef.current.stop();
    }
  };

  const handleCancelRecording = () => {
    setIsRecording(false);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
    }
    cleanupMediaStream();
    setPendingAudio(null);
    setAudioCaption('');
  };

  const handleSendPendingAudio = async () => {
    if (!pendingAudio || isSending) return;
    const validation = validateAudioPayload(pendingAudio.audioUrl);
    if (!validation.valid) {
      setFormError(validation.error ?? 'Audio no válido.');
      return;
    }

    const defaultLabel =
      viewerRole === 'member'
        ? `Nota de voz de ${memberName} · ${topicTag}`
        : `Nota de voz de Coach ${coach.name} · ${topicTag}`;
    const caption = audioCaption.trim() || defaultLabel;

    setIsSending(true);
    setFormError(null);
    setDeliveryNotice(null);
    try {
      const result = await onSendMessage({
        coachId: coach.id,
        memberId,
        senderRole: viewerRole,
        senderName: viewerRole === 'member' ? memberName : coach.name,
        senderAvatar: viewerRole === 'member' ? memberAvatar : coach.avatarUrl,
        kind: 'audio',
        text: caption,
        audioUrl: pendingAudio.audioUrl,
        audioDurationSec: pendingAudio.durationSec,
        audioLabel: caption,
        topicTag,
      });

      setPendingAudio(null);
      setAudioCaption('');

      if (result && result.savedToCloud) {
        setDeliveryNotice({
          tone: 'success',
          text: 'Audio enviado en tiempo real a la nube.',
        });
      } else if (result && result.error) {
        setFormError(result.error);
      } else if (result && !result.savedToCloud) {
        setDeliveryNotice({
          tone: 'warning',
          text: 'Audio guardado solo en este dispositivo. Conecta tu cuenta de Google para enviarlo en directo.',
        });
      }
      window.setTimeout(() => {
        threadEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 60);
    } finally {
      setIsSending(false);
    }
  };

  const handleSendText = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSending) return;
    const cleaned = draftText.trim();
    if (!cleaned) {
      setFormError('Escribe un mensaje o graba una nota de voz antes de enviar.');
      return;
    }
    setIsSending(true);
    setFormError(null);
    setDeliveryNotice(null);
    try {
      const result = await onSendMessage({
        coachId: coach.id,
        memberId,
        senderRole: viewerRole,
        senderName: viewerRole === 'member' ? memberName : coach.name,
        senderAvatar: viewerRole === 'member' ? memberAvatar : coach.avatarUrl,
        kind: 'text',
        text: cleaned,
        topicTag,
      });
      setDraftText('');
      if (result && result.savedToCloud) {
        setDeliveryNotice({
          tone: 'success',
          text: 'Mensaje enviado en tiempo real a la nube.',
        });
      } else if (result && result.error) {
        setFormError(result.error);
      } else if (result && !result.savedToCloud) {
        setDeliveryNotice({
          tone: 'warning',
          text: 'Guardado solo en este dispositivo. Conecta Google para que llegue al otro móvil/PC.',
        });
      }
      window.setTimeout(() => {
        threadEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 60);
    } finally {
      setIsSending(false);
    }
  };

  const topics = viewerRole === 'member' ? MEMBER_TOPICS : COACH_TOPICS;

  const quickTemplates =
    viewerRole === 'member'
      ? [
          {
            label: 'Pedir rutina nueva',
            tag: 'Solicitud de rutina' as MessageTopicTag,
            text: `Hola ${coach.name}, ¿me puedes preparar una rutina nueva para esta semana combinando Telju y mancuernas?`,
          },
          {
            label: 'Duda técnica',
            tag: 'Duda técnica' as MessageTopicTag,
            text: `Hola ${coach.name}, tengo una duda sobre el peso y la postura en el primer ejercicio de mi rutina de hoy.`,
          },
        ]
      : [
          {
            label: 'Rutina en camino',
            tag: 'Solicitud de rutina' as MessageTopicTag,
            text: `¡Recibido ${memberName.split(' ')[0]}! Hoy mismo te dejo subida tu nueva rutina en la pestaña Entreno.`,
          },
          {
            label: 'Seguimiento semanal',
            tag: 'Seguimiento' as MessageTopicTag,
            text: `¿Qué tal te has sentido esta semana con las cargas, ${memberName.split(' ')[0]}? Si notas fatiga o quieres subir kilos, mándame un audio.`,
          },
        ];

  return (
    <div className="rounded-2xl bg-[#0D121B] border border-white/10 overflow-hidden flex flex-col">
      {/* Conversation Header */}
      <div className="px-4 sm:px-5 py-3.5 border-b border-white/8 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-3 min-w-0">
          {viewerRole === 'member' ? (
            <img
              src={coach.avatarUrl}
              alt={`Coach ${coach.name}`}
              referrerPolicy="no-referrer"
              className="w-10 h-11 rounded-xl object-cover object-top border border-[#00A8FF]/60 shrink-0"
            />
          ) : memberAvatar ? (
            <img
              src={memberAvatar}
              alt={memberName}
              className="w-10 h-10 rounded-xl object-cover object-top border border-[#00A8FF]/50 shrink-0"
            />
          ) : (
            <div className="w-10 h-10 rounded-xl bg-[#131B28] border border-white/15 flex items-center justify-center text-xs font-bold font-mono text-[#33C1FF] shrink-0">
              {getInitials(memberName)}
            </div>
          )}

          <div className="min-w-0">
            <p className="text-[11px] font-medium text-[#33C1FF] truncate">
              {viewerRole === 'member'
                ? `${coach.role} · Canal directo de texto y audio`
                : `Chat directo · Coach ${coach.name} ↔ Socio`}
            </p>
            <h3 className="text-base sm:text-lg font-bold text-white truncate">
              {viewerRole === 'member' ? `Coach ${coach.name}` : memberName}
            </h3>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Notification Permission Controls for BOTH Member & Coach */}
          {onRequestNotificationPermission && notificationPermission !== 'unsupported' && (
            notificationPermission === 'granted' ? (
              <div className="inline-flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-950/60 border border-emerald-500/40 text-[11px] font-semibold text-emerald-300">
                  <Bell className="w-3 h-3" />
                  Avisos activos
                </span>
                {onTestNotification && (
                  <button
                    type="button"
                    onClick={() => void onTestNotification()}
                    className="min-h-[30px] px-2 rounded-lg bg-[#131B28] hover:border-[#00A8FF] border border-white/12 text-[11px] font-semibold text-slate-200 hover:text-white cursor-pointer"
                  >
                    Probar
                  </button>
                )}
              </div>
            ) : notificationPermission === 'denied' ? (
              <span
                title="Permite las notificaciones en los ajustes del navegador para recibir avisos"
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-950/50 border border-rose-500/40 text-[11px] font-semibold text-rose-200"
              >
                <BellOff className="w-3 h-3" />
                Avisos bloqueados en navegador
              </span>
            ) : (
              <button
                type="button"
                onClick={() => void onRequestNotificationPermission()}
                className="min-h-[34px] px-3 rounded-lg bg-[#00A8FF]/18 hover:bg-[#00A8FF] hover:text-[#04070D] border border-[#00A8FF]/55 text-[11px] font-bold text-[#33C1FF] flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <Bell className="w-3.5 h-3.5 shrink-0" />
                Activar notificaciones
              </button>
            )
          )}

          <span className="text-xs font-mono tabular-nums text-slate-400">
            {threadMessages.length} {threadMessages.length === 1 ? 'mensaje' : 'mensajes'}
          </span>
        </div>
      </div>

      {/* Real-time Cloud Sync Status Strip */}
      {typeof isCloudConnected === 'boolean' && (
        <div
          className={`px-4 sm:px-5 py-2.5 border-b text-xs flex flex-wrap items-center justify-between gap-2 ${
            isCloudConnected
              ? 'bg-emerald-950/35 border-emerald-500/25 text-emerald-200'
              : 'bg-amber-950/45 border-amber-500/35 text-amber-100'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            {isCloudConnected ? (
              <Cloud className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            ) : (
              <CloudOff className="w-3.5 h-3.5 text-amber-300 shrink-0" />
            )}
            <span className="leading-snug">
              {cloudStatusHint ||
                (isCloudConnected
                  ? 'Nube en directo conectada: textos y notas de voz llegan al instante.'
                  : viewerRole === 'member'
                    ? 'Conecta tu cuenta de Google para que tu Coach reciba tus mensajes y audios en directo.'
                    : 'Conecta la cuenta Google autorizada del gimnasio/coach para recibir y responder en directo.')}
            </span>
          </div>
          {!isCloudConnected && onConnectGoogle && (
            <button
              type="button"
              onClick={() => void onConnectGoogle()}
              className="min-h-[32px] px-3 rounded-lg bg-amber-400 hover:bg-amber-300 text-[#04070D] text-[11px] font-bold cursor-pointer whitespace-nowrap shrink-0"
            >
              Conectar Google
            </button>
          )}
        </div>
      )}

      {/* Messages Feed */}
      <div
        className={`p-4 sm:p-5 space-y-3 overflow-y-auto bg-[#06080D]/60 ${
          compact ? 'max-h-[310px]' : 'max-h-[420px]'
        }`}
        aria-live="polite"
      >
        {threadMessages.length === 0 ? (
          <div className="py-8 text-center space-y-1.5">
            <p className="text-sm font-semibold text-white">Aún no hay mensajes en este canal</p>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              {viewerRole === 'member'
                ? `Escribe a Coach ${coach.name} o graba un audio para solicitar tu rutina o resolver cualquier duda de sala.`
                : `Envía un mensaje o nota de voz a ${memberName} para hacer seguimiento o confirmar su nueva rutina.`}
            </p>
          </div>
        ) : (
          threadMessages.map((msg) => {
            const isMine = msg.senderRole === viewerRole;
            const isPlaying = playingMsgId === msg.id;
            const captionText = msg.audioLabel || (msg.kind === 'audio' ? msg.text : undefined);

            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[92%] sm:max-w-[82%] rounded-2xl px-3.5 py-2.5 space-y-2 border ${
                    isMine
                      ? 'bg-[#00A8FF]/16 border-[#00A8FF]/45 text-white'
                      : 'bg-[#0D121B] border-white/10 text-slate-100'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-[11px]">
                    <span className="font-semibold text-[#33C1FF]">
                      {msg.senderRole === 'coach' ? `Coach ${msg.senderName}` : msg.senderName}
                      {msg.topicTag ? ` · ${msg.topicTag}` : ''}
                    </span>
                    <span className="font-mono tabular-nums text-slate-400">
                      {msg.timestampLabel}
                    </span>
                  </div>

                  {msg.kind === 'text' && msg.text && (
                    <p className="text-sm leading-relaxed text-slate-100 whitespace-pre-wrap">
                      {msg.text}
                    </p>
                  )}

                  {msg.kind === 'audio' && (
                    <div className="space-y-2 pt-0.5">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => playVoiceNote(msg)}
                          aria-label={
                            isPlaying
                              ? `Pausar audio de ${msg.senderName}`
                              : `Reproducir audio de ${msg.senderName}`
                          }
                          className="w-10 h-10 rounded-xl bg-[#00A8FF] hover:bg-[#33C1FF] text-[#04070D] flex items-center justify-center shrink-0 cursor-pointer transition-colors"
                        >
                          {isPlaying ? (
                            <Pause className="w-4 h-4 fill-current" />
                          ) : (
                            <Play className="w-4 h-4 fill-current ml-0.5" />
                          )}
                        </button>

                        <div className="flex-1 min-w-[130px] space-y-1.5">
                          <div className="flex items-end gap-0.5 h-6" aria-hidden="true">
                            {WAVEFORM_BARS.map((height, idx) => {
                              const barPct = ((idx + 1) / WAVEFORM_BARS.length) * 100;
                              const activeBar = isPlaying && barPct <= playbackProgress;
                              return (
                                <span
                                  key={idx}
                                  className={`flex-1 rounded-sm transition-colors ${
                                    activeBar ? 'bg-[#33C1FF]' : 'bg-white/25'
                                  }`}
                                  style={{ height: `${height}%` }}
                                />
                              );
                            })}
                          </div>
                          <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-300">
                            <span className="flex items-center gap-1">
                              <Volume2 className="w-3 h-3 text-[#33C1FF]" />
                              {isPlaying
                                ? 'Reproduciendo...'
                                : msg.audioUrl?.startsWith('data:audio')
                                  ? 'Audio real'
                                  : 'Nota de voz'}
                            </span>
                            <span>{formatSecondsClock(msg.audioDurationSec ?? 5)}</span>
                          </div>
                        </div>
                      </div>

                      {captionText && (
                        <p className="text-xs text-slate-300 leading-snug">{captionText}</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={threadEndRef} />
      </div>

      {/* Composer Footer: Topic selector + Quick templates + Text & Voice Recorder */}
      <div className="p-3.5 sm:p-4 border-t border-white/8 space-y-3 bg-[#0D121B]">
        {/* Topic selector & quick prompts */}
        {!compact && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div
              className="flex flex-wrap items-center gap-1.5"
              role="group"
              aria-label="Motivo del mensaje"
            >
              {topics.map((tag) => {
                const active = topicTag === tag;
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setTopicTag(tag)}
                    aria-pressed={active}
                    className={`min-h-[32px] px-2.5 rounded-lg text-[11px] font-semibold cursor-pointer transition-colors whitespace-nowrap ${
                      active
                        ? 'bg-[#00A8FF] text-[#04070D]'
                        : 'bg-[#06080D] text-slate-300 border border-white/10 hover:text-white'
                    }`}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {quickTemplates.map((tpl) => (
                <button
                  key={tpl.label}
                  type="button"
                  onClick={() => {
                    setTopicTag(tpl.tag);
                    setDraftText(tpl.text);
                  }}
                  className="min-h-[30px] px-2.5 rounded-lg bg-[#131B28] hover:border-[#00A8FF] border border-white/10 text-[11px] text-slate-300 hover:text-white cursor-pointer whitespace-nowrap"
                >
                  + {tpl.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Active Recording Strip */}
        {isRecording && (
          <div
            role="status"
            className="rounded-xl bg-rose-950/50 border border-rose-500/45 p-3 flex flex-wrap items-center justify-between gap-3"
          >
            <div className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse shrink-0" />
              <div>
                <p className="text-xs font-bold text-white">
                  Grabando nota de voz ·{' '}
                  <span className="font-mono tabular-nums text-rose-300">
                    {formatSecondsClock(recordingSec)} / {formatSecondsClock(MAX_AUDIO_RECORDING_SECONDS)}
                  </span>
                </p>
                <p className="text-[11px] text-slate-300">
                  Micrófono activo · Pulsa Detener para escuchar y enviar
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleStopRecording}
                className="min-h-[38px] px-3.5 rounded-xl bg-[#00A8FF] hover:bg-[#33C1FF] text-[#04070D] text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                Detener
              </button>
              <button
                type="button"
                onClick={handleCancelRecording}
                aria-label="Cancelar grabación de audio"
                className="min-h-[38px] px-3 rounded-xl bg-[#06080D] text-slate-300 hover:text-white border border-white/10 text-xs cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Pending Audio Ready-to-Send Box (with local preview play button!) */}
        {pendingAudio && !isRecording && (
          <div className="rounded-xl bg-[#00A8FF]/12 border border-[#00A8FF]/45 p-3 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    playAudioUrl('pending-preview', pendingAudio.audioUrl, pendingAudio.durationSec)
                  }
                  aria-label="Escuchar vista previa del audio grabado"
                  className="w-8 h-8 rounded-lg bg-[#00A8FF] text-[#04070D] flex items-center justify-center cursor-pointer shrink-0"
                >
                  {playingMsgId === 'pending-preview' ? (
                    <Pause className="w-3.5 h-3.5 fill-current" />
                  ) : (
                    <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                  )}
                </button>
                <p className="text-xs font-semibold text-white">
                  Audio grabado ({formatSecondsClock(pendingAudio.durationSec)}
                  {pendingAudio.sizeKb ? ` · ${pendingAudio.sizeKb} KB` : ''})
                </p>
              </div>
              <button
                type="button"
                onClick={handleCancelRecording}
                aria-label="Descartar audio grabado"
                className="min-h-[32px] px-2.5 rounded-lg text-xs text-slate-300 hover:text-rose-400 flex items-center gap-1 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Descartar
              </button>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={audioCaption}
                onChange={(e) => setAudioCaption(e.target.value)}
                aria-label="Resumen opcional del audio"
                placeholder="Resumen opcional del audio (ej. Duda sobre peso en Press Banca)"
                className="flex-1 min-h-[40px] rounded-xl bg-[#06080D] border border-white/12 px-3 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-[#00A8FF]"
              />
              <button
                type="button"
                disabled={isSending}
                onClick={() => void handleSendPendingAudio()}
                className="min-h-[40px] px-4 rounded-xl bg-[#00A8FF] hover:bg-[#33C1FF] text-[#04070D] text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap disabled:opacity-60"
              >
                <Send className="w-3.5 h-3.5" />
                {isSending ? 'Enviando...' : 'Enviar audio'}
              </button>
            </div>
          </div>
        )}

        {formError && (
          <div
            role="alert"
            className="rounded-xl bg-rose-950/60 border border-rose-500/45 px-3 py-2 text-xs text-rose-200 flex items-start gap-2"
          >
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{formError}</span>
          </div>
        )}

        {deliveryNotice && !formError && (
          <div
            role="status"
            className={`rounded-xl px-3 py-2 text-xs flex items-center gap-2 border ${
              deliveryNotice.tone === 'success'
                ? 'bg-emerald-950/45 border-emerald-500/35 text-emerald-200'
                : 'bg-amber-950/45 border-amber-500/35 text-amber-200'
            }`}
          >
            <Check className="w-3.5 h-3.5 shrink-0" />
            <span>{deliveryNotice.text}</span>
          </div>
        )}

        {/* Text Message Form + Record Voice Button */}
        <form onSubmit={(e) => void handleSendText(e)} className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
            aria-label={
              viewerRole === 'member'
                ? `Mensaje para Coach ${coach.name}`
                : `Mensaje para ${memberName}`
            }
            placeholder={
              viewerRole === 'member'
                ? `Escribe a Coach ${coach.name} o graba audio...`
                : `Responder a ${memberName} por texto o audio...`
            }
            className="flex-1 min-h-[44px] rounded-xl bg-[#06080D] border border-white/12 px-3.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#00A8FF]"
          />

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={isSending}
              onClick={isRecording ? handleStopRecording : () => void handleStartRecording()}
              className={`min-h-[44px] px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap disabled:opacity-60 ${
                isRecording
                  ? 'bg-rose-600 hover:bg-rose-500 text-white'
                  : 'bg-[#131B28] hover:border-[#00A8FF] border border-white/12 text-slate-100'
              }`}
            >
              <Mic className="w-4 h-4 text-[#00A8FF]" />
              {isRecording ? 'Parar' : 'Audio'}
            </button>

            <button
              type="submit"
              disabled={isSending}
              className="flex-1 sm:flex-initial min-h-[44px] px-4 rounded-xl bg-[#00A8FF] hover:bg-[#33C1FF] text-[#04070D] text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap disabled:opacity-60"
            >
              <Send className="w-4 h-4" />
              {isSending ? 'Enviando...' : 'Enviar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
