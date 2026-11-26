import React, { useCallback, useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import type { User } from 'firebase/auth';
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  KeyRound,
  LogIn,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import {
  verifyAndLogTurnstileScan,
  type LiveAccessLog,
  type LiveGymMember,
  type TurnstileScanOutcome,
} from '../services/liveGymService';

import { BOOTSTRAPPED_OWNER_EMAIL, OFFICIAL_GYM_EMAIL } from '../firebase';

interface TurnstileScannerViewProps {
  authUser: User | null;
  isLiveAdmin: boolean;
  onSignInGoogle: (loginHintEmail?: string) => Promise<void>;
  liveMembers: LiveGymMember[];
  localFallbackMembers: LiveGymMember[];
  liveAccessLogs: LiveAccessLog[];
  onLocalScanRecorded?: (outcome: TurnstileScanOutcome) => void;
  onExitScanner: () => void;
}

function playTurnstileTone(kind: 'granted' | 'denied' | 'unknown', enabled: boolean): void {
  if (!enabled || typeof window === 'undefined') return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    if (kind === 'granted') {
      // Crisp welcoming double chime (880Hz -> 1320Hz)
      [880, 1320].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.12);
        gain.gain.setValueAtTime(0.001, now + idx * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.28, now + idx * 0.12 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.12 + 0.22);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.12);
        osc.stop(now + idx * 0.12 + 0.24);
      });
    } else if (kind === 'denied') {
      // Urgent 3-pulse low alarm buzzer (230Hz sawtooth)
      [0, 0.2, 0.4].forEach((offset) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(230, now + offset);
        gain.gain.setValueAtTime(0.001, now + offset);
        gain.gain.exponentialRampToValueAtTime(0.24, now + offset + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.15);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + offset);
        osc.stop(now + offset + 0.16);
      });
    } else {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(420, now);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.26);
    }

    window.setTimeout(() => {
      void ctx.close().catch(() => {});
    }, 900);
  } catch {
    // Ignore audio context autoplay restrictions until user taps
  }
}

export const TurnstileScannerView: React.FC<TurnstileScannerViewProps> = ({
  authUser,
  isLiveAdmin,
  onSignInGoogle,
  liveMembers,
  localFallbackMembers,
  liveAccessLogs,
  onLocalScanRecorded,
  onExitScanner,
}) => {
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [manualCode, setManualCode] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [lastOutcome, setLastOutcome] = useState<TurnstileScanOutcome | null>(null);
  const [localScans, setLocalScans] = useState<TurnstileScanOutcome[]>([]);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastScannedRef = useRef<{ code: string; at: number }>({ code: '', at: 0 });
  const outcomeTimerRef = useRef<number | null>(null);

  const stopCamera = useCallback(() => {
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }, []);

  const processQrString = useCallback(
    async (rawQr: string) => {
      const trimmed = rawQr.trim();
      if (!trimmed || isValidating) return;

      const nowMs = Date.now();
      if (lastScannedRef.current.code === trimmed && nowMs - lastScannedRef.current.at < 3000) {
        return;
      }
      lastScannedRef.current = { code: trimmed, at: nowMs };
      setIsValidating(true);

      try {
        const outcome = await verifyAndLogTurnstileScan({
          rawQr: trimmed,
          scannerLabel: facingMode === 'user' ? 'Móvil Torno (Frontal)' : 'Móvil Torno (Trasera)',
          scannerUser: authUser,
          isLiveAdmin,
          localFallbackMembers: liveMembers.length > 0 ? liveMembers : localFallbackMembers,
        });

        setLastOutcome(outcome);
        setLocalScans((prev) => [outcome, ...prev].slice(0, 8));
        onLocalScanRecorded?.(outcome);

        playTurnstileTone(
          outcome.allowed
            ? 'granted'
            : outcome.status === 'blocked_fee_overdue'
              ? 'denied'
              : 'unknown',
          soundEnabled
        );

        if (outcomeTimerRef.current !== null) {
          window.clearTimeout(outcomeTimerRef.current);
        }
        outcomeTimerRef.current = window.setTimeout(() => {
          setLastOutcome(null);
        }, 4200);
      } finally {
        setIsValidating(false);
      }
    },
    [
      authUser,
      facingMode,
      isLiveAdmin,
      isValidating,
      liveMembers,
      localFallbackMembers,
      onLocalScanRecorded,
      soundEnabled,
    ]
  );

  const startCamera = useCallback(
    async (targetFacing: 'environment' | 'user') => {
      stopCamera();
      setCameraError(null);

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraError(
          'Este navegador no permite acceso directo a la cámara. Usa la validación manual por código abajo.'
        );
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: targetFacing },
            width: { ideal: 720 },
            height: { ideal: 720 },
          },
          audio: false,
        });
        streamRef.current = stream;
        setCameraActive(true);

        window.setTimeout(() => {
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            void videoRef.current.play().catch(() => {});
          }
        }, 60);
      } catch {
        setCameraError(
          'Permite el acceso a la cámara en tu móvil (HTTPS) o prueba ahora mismo usando el código manual de abajo.'
        );
      }
    },
    [stopCamera]
  );

  // Continuous QR frame scanning loop (~12fps) when camera is active
  useEffect(() => {
    if (!cameraActive) return;

    let lastTick = 0;
    const scanLoop = (timestamp: number) => {
      if (timestamp - lastTick >= 85) {
        lastTick = timestamp;
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA && video.videoWidth > 0) {
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (ctx) {
            const w = Math.min(480, video.videoWidth);
            const h = Math.round((video.videoHeight / video.videoWidth) * w);
            canvas.width = w;
            canvas.height = h;
            ctx.drawImage(video, 0, 0, w, h);
            const imageData = ctx.getImageData(0, 0, w, h);
            const decoded = jsQR(imageData.data, imageData.width, imageData.height, {
              inversionAttempts: 'dontInvert',
            });
            if (decoded?.data) {
              void processQrString(decoded.data);
            }
          }
        }
      }
      rafRef.current = window.requestAnimationFrame(scanLoop);
    };

    rafRef.current = window.requestAnimationFrame(scanLoop);
    return () => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [cameraActive, processQrString]);

  useEffect(() => {
    return () => {
      stopCamera();
      if (outcomeTimerRef.current !== null) {
        window.clearTimeout(outcomeTimerRef.current);
      }
    };
  }, [stopCamera]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    void processQrString(manualCode.trim());
    setManualCode('');
  };

  const quickTestMembers = (liveMembers.length > 0 ? liveMembers : localFallbackMembers).slice(0, 4);

  const outerRingClass =
    lastOutcome === null
      ? 'border-white/10'
      : lastOutcome.allowed
        ? 'border-emerald-400 shadow-[0_0_50px_rgba(16,185,129,0.28)]'
        : lastOutcome.status === 'blocked_fee_overdue'
          ? 'border-red-500 shadow-[0_0_50px_rgba(239,68,68,0.35)]'
          : 'border-amber-400';

  return (
    <div className="min-h-screen bg-[#06080D] text-[#F1F5F9] flex flex-col">
      {/* Top Kiosk Bar */}
      <header className="sticky top-0 z-30 h-16 bg-[#06080D]/95 backdrop-blur-md border-b border-white/10 px-4 sm:px-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={() => {
              stopCamera();
              onExitScanner();
            }}
            aria-label="Salir del Lector QR"
            className="min-h-[40px] px-2.5 sm:px-3 rounded-xl bg-[#0D121B] hover:bg-white/10 border border-white/12 text-xs font-semibold text-slate-200 flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Salir del Lector</span>
          </button>
          <div className="sm:hidden shrink-0">
            <BrandLogo variant="mark" size={34} />
          </div>
          <div className="hidden sm:flex items-center gap-2 shrink-0">
            <BrandLogo variant="navbar" size={32} />
            <span className="hidden md:inline text-xs font-semibold text-[#33C1FF]">
              · Modo Lector QR del Torno
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span
            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 border whitespace-nowrap ${
              isLiveAdmin
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                : 'bg-amber-500/15 border-amber-500/40 text-amber-200'
            }`}
          >
            {isLiveAdmin ? <Wifi className="w-3.5 h-3.5 shrink-0" /> : <WifiOff className="w-3.5 h-3.5 shrink-0" />}
            <span className="sm:hidden">{isLiveAdmin ? 'En vivo' : 'Prueba local'}</span>
            <span className="hidden sm:inline">
              {isLiveAdmin ? 'Sincronizado PC' : 'Modo prueba local'}
            </span>
          </span>

          <button
            type="button"
            onClick={() => setSoundEnabled((prev) => !prev)}
            aria-label={soundEnabled ? 'Silenciar sonido del torno' : 'Activar sonido del torno'}
            className="min-h-[40px] min-w-[40px] rounded-xl bg-[#0D121B] border border-white/12 flex items-center justify-center text-slate-200 hover:border-[#00A8FF] cursor-pointer"
          >
            {soundEnabled ? (
              <Volume2 className="w-4 h-4 text-[#33C1FF]" />
            ) : (
              <VolumeX className="w-4 h-4 text-slate-500" />
            )}
          </button>
        </div>
      </header>

      <main className="flex-1 w-full max-w-4xl mx-auto px-4 py-5 space-y-5">
        {/* Auth Prompt for Live Sync with Reception PC */}
        {!isLiveAdmin && (
          <div className="rounded-2xl bg-[#0D121B] border border-[#00A8FF]/45 p-4 flex flex-col gap-3">
            <div className="space-y-0.5">
              <p className="text-xs font-bold text-[#33C1FF]">
                Conecta este móvil con el ordenador de recepción
              </p>
              <p className="text-xs text-slate-300">
                Elige cualquiera de las dos cuentas autorizadas del gimnasio: ambas comparten la misma
                base de datos en vivo y registran cada entrada al instante en el PC.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void onSignInGoogle(OFFICIAL_GYM_EMAIL)}
                className="min-h-[42px] px-4 rounded-xl bg-[#00A8FF] hover:bg-[#33C1FF] text-[#04070D] text-xs font-bold flex items-center justify-center gap-2 cursor-pointer"
              >
                <LogIn className="w-4 h-4 shrink-0" />
                Entrar: {OFFICIAL_GYM_EMAIL}
              </button>
              <button
                type="button"
                onClick={() => void onSignInGoogle(BOOTSTRAPPED_OWNER_EMAIL)}
                className="min-h-[42px] px-4 rounded-xl bg-[#111927] hover:bg-[#19253A] border border-[#00A8FF]/40 text-[#E2F3FF] text-xs font-bold flex items-center justify-center gap-2 cursor-pointer"
              >
                <LogIn className="w-4 h-4 shrink-0 text-[#33C1FF]" />
                Entrar: {BOOTSTRAPPED_OWNER_EMAIL}
              </button>
            </div>
          </div>
        )}

        {/* Main Scanner Kiosk Frame */}
        <div
          className={`rounded-3xl bg-[#0D121B] border-2 p-4 sm:p-6 space-y-5 transition-all ${outerRingClass}`}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-[#33C1FF]">
                FitnessDreams Benidorm · Acceso Inteligente
              </p>
              <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-[0.01em]">
                Lector QR del Torno
              </h1>
            </div>

            <div className="flex items-center gap-2">
              {cameraActive ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      const next = facingMode === 'environment' ? 'user' : 'environment';
                      setFacingMode(next);
                      void startCamera(next);
                    }}
                    className="min-h-[42px] px-3.5 rounded-xl bg-[#131B28] hover:bg-white/10 border border-white/15 text-xs font-semibold text-white flex items-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw className="w-4 h-4 text-[#33C1FF]" />
                    {facingMode === 'environment' ? 'Usar frontal' : 'Usar trasera'}
                  </button>
                  <button
                    type="button"
                    onClick={stopCamera}
                    className="min-h-[42px] px-3.5 rounded-xl bg-white/8 hover:bg-white/15 text-xs font-semibold text-slate-300 cursor-pointer"
                  >
                    Pausar cámara
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => void startCamera(facingMode)}
                  className="min-h-[44px] px-4 rounded-xl bg-[#00A8FF] hover:bg-[#33C1FF] text-[#04070D] text-xs font-bold flex items-center gap-2 cursor-pointer"
                >
                  <Camera className="w-4 h-4" />
                  Activar Cámara Lector QR
                </button>
              )}
            </div>
          </div>

          {/* High-Contrast Access Result Banner (GREEN ALLOWED / RED OVERDUE ALARM) */}
          {lastOutcome && (
            <div
              role="status"
              aria-live="assertive"
              data-testid="turnstile-scan-result"
              className={`rounded-2xl p-5 border-2 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                lastOutcome.allowed
                  ? 'bg-emerald-950/80 border-emerald-400 text-emerald-50'
                  : lastOutcome.status === 'blocked_fee_overdue'
                    ? 'bg-red-950/85 border-red-500 text-red-50'
                    : 'bg-amber-950/75 border-amber-400 text-amber-50'
              }`}
            >
              <div className="flex items-start gap-3.5">
                {lastOutcome.allowed ? (
                  <CheckCircle2 className="w-10 h-10 text-emerald-400 shrink-0" />
                ) : (
                  <ShieldAlert
                    className={`w-10 h-10 shrink-0 ${
                      lastOutcome.status === 'blocked_fee_overdue'
                        ? 'text-red-400'
                        : 'text-amber-300'
                    }`}
                  />
                )}
                <div className="space-y-1">
                  <p className="text-lg sm:text-xl font-black tracking-wide leading-tight">
                    {lastOutcome.title}
                  </p>
                  <p className="text-sm font-semibold text-white">
                    {lastOutcome.memberName}{' '}
                    <span className="font-mono text-xs opacity-80">· {lastOutcome.memberCode}</span>
                    {lastOutcome.tier ? ` · ${lastOutcome.tier}` : ''}
                  </p>
                  <p className="text-xs opacity-90 leading-relaxed">{lastOutcome.message}</p>
                </div>
              </div>
              <div className="text-right font-mono text-xs shrink-0 opacity-85">
                <p>{lastOutcome.scannedAtLabel}</p>
                {lastOutcome.allowed && typeof lastOutcome.streakDays === 'number' && (
                  <p className="text-emerald-300 font-bold mt-0.5">
                    Racha: {lastOutcome.streakDays} días
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Camera Viewport */}
          <div
            className={`relative rounded-2xl bg-[#06080D] border border-white/10 overflow-hidden w-full flex items-center justify-center ${
              cameraActive ? 'aspect-[4/3] sm:aspect-[16/9] max-h-[380px]' : 'min-h-[260px]'
            }`}
          >
            {cameraActive ? (
              <>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                {/* Crisp Scanning Reticle */}
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="w-56 h-56 sm:w-64 sm:h-64 rounded-2xl border-2 border-[#00A8FF] shadow-[0_0_0_9999px_rgba(6,8,13,0.45)] relative">
                    <span className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-[#33C1FF] rounded-tl-lg" />
                    <span className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-[#33C1FF] rounded-tr-lg" />
                    <span className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-[#33C1FF] rounded-bl-lg" />
                    <span className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-[#33C1FF] rounded-br-lg" />
                  </div>
                </div>
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-lg bg-black/75 text-xs text-white font-medium">
                  Acerca el Pase QR del móvil del socio al recuadro azul
                </div>
              </>
            ) : (
              <div className="text-center p-6 space-y-3 max-w-md">
                <div className="w-14 h-14 rounded-2xl bg-[#00A8FF]/15 border border-[#00A8FF]/40 mx-auto flex items-center justify-center">
                  <Camera className="w-7 h-7 text-[#33C1FF]" />
                </div>
                <p className="text-base font-bold text-white">
                  Cámara lista para escanear Pases QR
                </p>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Coloca este móvil en un soporte junto a la entrada, pulsa{' '}
                  <strong className="text-white">Activar Cámara Lector QR</strong> y elige{' '}
                  <strong className="text-white">cámara frontal</strong> si mira hacia el socio o{' '}
                  <strong className="text-white">trasera</strong> si lo sujetas tú.
                </p>
                <div className="flex flex-wrap justify-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setFacingMode('user');
                      void startCamera('user');
                    }}
                    className="min-h-[42px] px-4 rounded-xl bg-[#00A8FF] hover:bg-[#33C1FF] text-[#04070D] text-xs font-bold cursor-pointer"
                  >
                    Cámara Frontal (Soporte Torno)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFacingMode('environment');
                      void startCamera('environment');
                    }}
                    className="min-h-[42px] px-4 rounded-xl bg-[#131B28] hover:bg-white/10 border border-white/15 text-white text-xs font-semibold cursor-pointer"
                  >
                    Cámara Trasera (En mano)
                  </button>
                </div>
                {cameraError && (
                  <p role="alert" className="text-xs text-amber-300 pt-1">
                    {cameraError}
                  </p>
                )}
              </div>
            )}
            <canvas ref={canvasRef} className="hidden" />
          </div>

          {/* Manual Fallback + Quick Test Validation */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start pt-1">
            <form onSubmit={handleManualSubmit} className="md:col-span-7 flex gap-2">
              <div className="relative flex-1">
                <KeyRound className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                  aria-label="Código manual del socio o texto QR"
                  placeholder="Validar código manual (ej. FD-0042 o FD:MEMBER:...)"
                  className="w-full min-h-[44px] pl-9 pr-3 rounded-xl bg-[#06080D] border border-white/12 text-xs font-mono text-white placeholder:text-slate-500 focus:outline-none focus:border-[#00A8FF]"
                />
              </div>
              <button
                type="submit"
                disabled={isValidating}
                className="min-h-[44px] px-4 rounded-xl bg-[#00A8FF] hover:bg-[#33C1FF] disabled:opacity-50 text-[#04070D] text-xs font-bold cursor-pointer whitespace-nowrap"
              >
                Validar código
              </button>
            </form>

            {/* Quick 1-Tap Test Buttons (works on PC or phone without webcam) */}
            <div className="md:col-span-5 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-slate-400 mr-1">Prueba rápida:</span>
              {quickTestMembers.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => void processQrString(`FD:MEMBER:${m.id}|${m.memberCode}`)}
                  className={`min-h-[34px] px-2.5 rounded-lg text-[11px] font-semibold border cursor-pointer transition-colors ${
                    m.feeStatus === 'pendiente'
                      ? 'bg-red-500/15 border-red-500/40 text-red-300 hover:bg-red-500/25'
                      : 'bg-emerald-500/10 border-emerald-500/35 text-emerald-300 hover:bg-emerald-500/20'
                  }`}
                >
                  {m.name.split(' ')[0]} ({m.feeStatus === 'pendiente' ? 'Pendiente' : 'Al día'})
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Live Scan History Strip */}
        <div className="rounded-2xl bg-[#0D121B] border border-white/10 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#00A8FF]" />
              Últimos pasos por el lector ({liveAccessLogs.length > 0 ? liveAccessLogs.length : localScans.length})
            </h2>
            <span className="text-[11px] text-slate-400">
              {isLiveAdmin ? 'Guardado en vivo en el ordenador del gym' : 'Historial local de prueba'}
            </span>
          </div>

          {liveAccessLogs.length > 0 ? (
            <div className="divide-y divide-white/8">
              {liveAccessLogs.slice(0, 6).map((log) => (
                <div key={log.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <p className="font-semibold text-white truncate">
                      {log.memberName}{' '}
                      <span className="font-mono text-slate-400">· {log.memberCode}</span>
                    </p>
                    <p className="text-[11px] text-slate-400">{log.scannerLabel}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <span
                      className={`font-bold ${
                        log.allowed ? 'text-emerald-400' : 'text-red-400'
                      }`}
                    >
                      {log.allowed ? 'PERMITIDO' : 'BLOQUEADO · CUOTA'}
                    </span>
                    <p className="text-[11px] font-mono text-slate-500">{log.createdAtLabel}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : localScans.length > 0 ? (
            <div className="divide-y divide-white/8">
              {localScans.map((scan, idx) => (
                <div
                  key={`${scan.memberCode}-${idx}`}
                  className="py-2.5 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-white truncate">
                      {scan.memberName}{' '}
                      <span className="font-mono text-slate-400">· {scan.memberCode}</span>
                    </p>
                    <p className="text-[11px] text-slate-400">{scan.title}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <span
                      className={`font-bold ${
                        scan.allowed ? 'text-emerald-400' : 'text-red-400'
                      }`}
                    >
                      {scan.allowed ? 'PERMITIDO' : 'DENEGADO'}
                    </span>
                    <p className="text-[11px] font-mono text-slate-500">{scan.scannedAtLabel}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400 py-3">
              Aún no se ha escaneado ningún Pase QR. Activa la cámara o pulsa un botón de prueba
              rápida arriba.
            </p>
          )}
        </div>
      </main>
    </div>
  );
};
