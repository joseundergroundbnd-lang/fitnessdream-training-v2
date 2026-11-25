import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
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

interface CoachMessageThreadProps {
  viewerRole: 'member' | 'coach';
  coach: CoachProfile;
  memberId: string;
  memberName: string;
  memberAvatar?: string;
  messages: DirectMessage[];
  onSendMessage: (msg: Omit<DirectMessage, 'id' | 'timestampLabel'>) => void;
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
}) => {
  const [topicTag, setTopicTag] = useState<MessageTopicTag>(
    viewerRole === 'member' ? 'Solicitud de rutina' : 'Seguimiento'
  );
  const [draftText, setDraftText] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  // Voice audio recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSec, setRecordingSec] = useState(0);
  const [recordingMode, setRecordingMode] = useState<'mic' | 'simulado'>('mic');
  const [audioCaption, setAudioCaption] = useState('');
  const [pendingAudio, setPendingAudio] = useState<{
    audioUrl: string;
    durationSec: number;
    mode: 'mic' | 'simulado';
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

  // Recording elapsed seconds timer
  useEffect(() => {
    if (!isRecording) return;
    recordingSecRef.current = 0;
    setRecordingSec(0);
    const id = window.setInterval(() => {
      recordingSecRef.current += 1;
      setRecordingSec(recordingSecRef.current);
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

  const playVoiceNote = (msg: DirectMessage) => {
    if (playingMsgId === msg.id) {
      stopPlayback();
      return;
    }
    stopPlayback();
    setPlayingMsgId(msg.id);
    setPlaybackProgress(0);

    const url = msg.audioUrl ?? 'synthetic-voice';
    const isRealAudio =
      url.startsWith('data:audio') || url.startsWith('blob:') || url.startsWith('http');

    if (isRealAudio) {
      try {
        const audio = new Audio(url);
        audioElRef.current = audio;
        audio.ontimeupdate = () => {
          const dur = audio.duration && Number.isFinite(audio.duration) ? audio.duration : msg.audioDurationSec || 5;
          setPlaybackProgress(Math.min(100, Math.round((audio.currentTime / Math.max(1, dur)) * 100)));
        };
        audio.onended = () => {
          stopPlayback();
        };
        audio.onerror = () => {
          runSimulatedPlayback(msg.audioDurationSec ?? 6);
        };
        void audio.play().catch(() => {
          runSimulatedPlayback(msg.audioDurationSec ?? 6);
        });
        return;
      } catch {
        // Fallback below
      }
    }

    runSimulatedPlayback(msg.audioDurationSec ?? 6);
  };

  const runSimulatedPlayback = (durationSec: number) => {
    const safeSec = Math.max(2, Math.min(durationSec, 10));
    const totalMs = safeSec * 1000;
    const startedAt = Date.now();

    // Subtle soft confirmation chime via Web Audio API (safe in headless / muted contexts)
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
    setPendingAudio(null);

    if (
      typeof navigator !== 'undefined' &&
      navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === 'function' &&
      typeof MediaRecorder !== 'undefined'
    ) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaStreamRef.current = stream;
        chunksRef.current = [];
        const recorder = new MediaRecorder(stream);
        mediaRecorderRef.current = recorder;

        recorder.ondataavailable = (ev) => {
          if (ev.data && ev.data.size > 0) {
            chunksRef.current.push(ev.data);
          }
        };

        recorder.onstop = () => {
          const duration = Math.max(1, recordingSecRef.current);
          const blob = new Blob(chunksRef.current, {
            type: recorder.mimeType || 'audio/webm',
          });
          cleanupMediaStream();
          const reader = new FileReader();
          reader.onloadend = () => {
            const dataUrl =
              typeof reader.result === 'string' && reader.result.startsWith('data:')
                ? reader.result
                : 'synthetic-voice';
            setPendingAudio({
              audioUrl: dataUrl,
              durationSec: duration,
              mode: 'mic',
            });
          };
          reader.readAsDataURL(blob);
        };

        recorder.start();
        setRecordingMode('mic');
        setIsRecording(true);
        return;
      } catch {
        // Microphone unavailable or blocked: switch cleanly to timed voice-note mode
      }
    }

    setRecordingMode('simulado');
    setIsRecording(true);
  };

  const handleStopRecording = () => {
    if (!isRecording) return;
    setIsRecording(false);
    if (recordingMode === 'mic' && mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      return;
    }
    const duration = Math.max(2, recordingSecRef.current);
    setPendingAudio({
      audioUrl: 'synthetic-voice',
      durationSec: duration,
      mode: 'simulado',
    });
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

  const handleSendPendingAudio = () => {
    if (!pendingAudio) return;
    const defaultLabel =
      viewerRole === 'member'
        ? `Nota de voz de ${memberName} · ${topicTag}`
        : `Nota de voz de Coach ${coach.name} · ${topicTag}`;

    onSendMessage({
      coachId: coach.id,
      memberId,
      senderRole: viewerRole,
      senderName: viewerRole === 'member' ? memberName : coach.name,
      senderAvatar: viewerRole === 'member' ? memberAvatar : coach.avatarUrl,
      kind: 'audio',
      audioUrl: pendingAudio.audioUrl,
      audioDurationSec: pendingAudio.durationSec,
      audioLabel: audioCaption.trim() || defaultLabel,
      topicTag,
    });

    setPendingAudio(null);
    setAudioCaption('');
    window.setTimeout(() => {
      threadEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 60);
  };

  const handleSendText = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = draftText.trim();
    if (!cleaned) {
      setFormError('Escribe un mensaje o graba una nota de voz antes de enviar.');
      return;
    }
    setFormError(null);
    onSendMessage({
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
    window.setTimeout(() => {
      threadEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 60);
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
      <div className="px-5 py-4 border-b border-white/8 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {viewerRole === 'member' ? (
            <img
              src={coach.avatarUrl}
              alt={`Coach ${coach.name}`}
              referrerPolicy="no-referrer"
              className="w-11 h-12 rounded-xl object-cover object-top border border-[#00A8FF]/60 shrink-0"
            />
          ) : memberAvatar ? (
            <img
              src={memberAvatar}
              alt={memberName}
              className="w-11 h-11 rounded-xl object-cover object-top border border-[#00A8FF]/50 shrink-0"
            />
          ) : (
            <div className="w-11 h-11 rounded-xl bg-[#131B28] border border-white/15 flex items-center justify-center text-xs font-bold font-mono text-[#33C1FF] shrink-0">
              {getInitials(memberName)}
            </div>
          )}

          <div className="min-w-0">
            <p className="text-xs font-medium text-[#33C1FF]">
              {viewerRole === 'member'
                ? `${coach.role} · Canal directo de texto y audio`
                : `Conversación directa · Coach ${coach.name} ↔ Socio`}
            </p>
            <h3 className="text-lg font-bold text-white truncate">
              {viewerRole === 'member' ? `Coach ${coach.name}` : memberName}
            </h3>
          </div>
        </div>

        <span className="text-xs font-mono tabular-nums text-slate-400">
          {threadMessages.length} {threadMessages.length === 1 ? 'mensaje' : 'mensajes'}
        </span>
      </div>

      {/* Messages Feed */}
      <div
        className="p-4 sm:p-5 space-y-3.5 max-h-[420px] overflow-y-auto bg-[#06080D]/60"
        aria-live="polite"
      >
        {threadMessages.length === 0 ? (
          <div className="py-10 text-center space-y-1.5">
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

            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[90%] sm:max-w-[78%] rounded-2xl px-4 py-3 space-y-2 border ${
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

                        <div className="flex-1 min-w-[140px] space-y-1.5">
                          <div
                            className="flex items-end gap-0.5 h-6"
                            aria-hidden="true"
                          >
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
                              {isPlaying ? 'Reproduciendo...' : 'Nota de voz'}
                            </span>
                            <span>{formatSecondsClock(msg.audioDurationSec ?? 5)}</span>
                          </div>
                        </div>
                      </div>

                      {msg.audioLabel && (
                        <p className="text-xs text-slate-300 leading-snug">{msg.audioLabel}</p>
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
      <div className="p-4 sm:p-5 border-t border-white/8 space-y-3.5 bg-[#0D121B]">
        {/* Topic selector & quick prompts */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Motivo del mensaje">
            {topics.map((tag) => {
              const active = topicTag === tag;
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setTopicTag(tag)}
                  aria-pressed={active}
                  className={`min-h-[34px] px-2.5 rounded-lg text-[11px] font-semibold cursor-pointer transition-colors whitespace-nowrap ${
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
                className="min-h-[32px] px-2.5 rounded-lg bg-[#131B28] hover:border-[#00A8FF] border border-white/10 text-[11px] text-slate-300 hover:text-white cursor-pointer whitespace-nowrap"
              >
                + {tpl.label}
              </button>
            ))}
          </div>
        </div>

        {/* Active Recording Strip */}
        {isRecording && (
          <div
            role="status"
            className="rounded-xl bg-rose-950/50 border border-rose-500/45 p-3.5 flex flex-wrap items-center justify-between gap-3"
          >
            <div className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse shrink-0" />
              <div>
                <p className="text-xs font-bold text-white">
                  Grabando nota de voz ·{' '}
                  <span className="font-mono tabular-nums text-rose-300">
                    {formatSecondsClock(recordingSec)}
                  </span>
                </p>
                <p className="text-[11px] text-slate-300">
                  {recordingMode === 'mic'
                    ? 'Micrófono activo · Pulsa Detener para revisar y enviar'
                    : 'Modo nota de voz rápida (sin micrófono) · Pulsa Detener para enviar'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleStopRecording}
                className="min-h-[40px] px-3.5 rounded-xl bg-[#00A8FF] hover:bg-[#33C1FF] text-[#04070D] text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                Detener grabación
              </button>
              <button
                type="button"
                onClick={handleCancelRecording}
                aria-label="Cancelar grabación de audio"
                className="min-h-[40px] px-3 rounded-xl bg-[#06080D] text-slate-300 hover:text-white border border-white/10 text-xs cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Pending Audio Ready-to-Send Box */}
        {pendingAudio && !isRecording && (
          <div className="rounded-xl bg-[#00A8FF]/12 border border-[#00A8FF]/45 p-3.5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-[#33C1FF]" />
                <p className="text-xs font-semibold text-white">
                  Audio listo para enviar ({formatSecondsClock(pendingAudio.durationSec)})
                </p>
              </div>
              <button
                type="button"
                onClick={handleCancelRecording}
                aria-label="Descartar audio grabado"
                className="min-h-[34px] px-2.5 rounded-lg text-xs text-slate-300 hover:text-rose-400 flex items-center gap-1 cursor-pointer"
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
                className="flex-1 min-h-[42px] rounded-xl bg-[#06080D] border border-white/12 px-3 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-[#00A8FF]"
              />
              <button
                type="button"
                onClick={handleSendPendingAudio}
                className="min-h-[42px] px-4 rounded-xl bg-[#00A8FF] hover:bg-[#33C1FF] text-[#04070D] text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <Send className="w-3.5 h-3.5" />
                Enviar audio
              </button>
            </div>
          </div>
        )}

        {formError && (
          <p role="alert" className="text-xs text-rose-400 font-medium">
            {formError}
          </p>
        )}

        {/* Text Message Form + Record Voice Button */}
        <form onSubmit={handleSendText} className="flex flex-col sm:flex-row gap-2.5">
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
                ? `Escribe a Coach ${coach.name} para pedir rutina o consultar una duda...`
                : `Escribe a ${memberName} o graba un audio de seguimiento...`
            }
            className="flex-1 min-h-[46px] rounded-xl bg-[#06080D] border border-white/12 px-3.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#00A8FF]"
          />

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={isRecording ? handleStopRecording : handleStartRecording}
              className={`min-h-[46px] px-3.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap ${
                isRecording
                  ? 'bg-rose-600 hover:bg-rose-500 text-white'
                  : 'bg-[#131B28] hover:border-[#00A8FF] border border-white/12 text-slate-100'
              }`}
            >
              <Mic className="w-4 h-4 text-[#00A8FF]" />
              {isRecording ? 'Parar' : 'Grabar audio'}
            </button>

            <button
              type="submit"
              className="flex-1 sm:flex-initial min-h-[46px] px-4 rounded-xl bg-[#00A8FF] hover:bg-[#33C1FF] text-[#04070D] text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap"
            >
              <Send className="w-4 h-4" />
              Enviar mensaje
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
