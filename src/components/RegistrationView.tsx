import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Camera,
  Check,
  FileText,
  PlayCircle,
  QrCode,
  ShieldCheck,
  Upload,
  UserCheck,
  X,
} from 'lucide-react';
import { BULL_AVATAR_URL, CHALLENGE_PEDESTAL_IMG, TELJU_LOGO_URL } from '../data/seedData';
import type { MemberProfile } from '../types/gym';
import { BrandLogo } from './BrandLogo';
import type { PresentationKitTab } from './PresentationKitModal';
import { PWAInstallButton } from './PWAInstallPrompt';

import type { User } from 'firebase/auth';

interface RegistrationViewProps {
  initialProfile: MemberProfile;
  authUser?: User | null;
  onSignInGoogle?: () => Promise<void>;
  onCompleteRegistration: (data: {
    name: string;
    email: string;
    phone: string;
    goal: string;
    tier: 'Socio Fundador' | 'Socio Club';
    avatarUrl: string;
  }) => void;
  onQuickDemoEnter: () => void;
  onEnterOwnerPanel?: () => void;
  onOpenTurnstileScanner?: () => void;
  onOpenPresentationKit?: (tab: PresentationKitTab) => void;
}

const GOALS = [
  'Hipertrofia y Fuerza',
  'Perder Grasa y Recomposición',
  'Crear Hábito y Constancia',
  'Jiu-Jitsu, Boxeo y Rendimiento',
];

export const RegistrationView: React.FC<RegistrationViewProps> = ({
  initialProfile,
  authUser,
  onSignInGoogle,
  onCompleteRegistration,
  onQuickDemoEnter,
  onEnterOwnerPanel,
  onOpenTurnstileScanner,
  onOpenPresentationKit,
}) => {
  const [name, setName] = useState(initialProfile.isRegistered ? initialProfile.name : '');
  const [email, setEmail] = useState(initialProfile.isRegistered ? initialProfile.email : '');
  const [phone, setPhone] = useState(initialProfile.isRegistered ? initialProfile.phone : '');
  const [goal, setGoal] = useState(GOALS[0]);
  const [tier, setTier] = useState<'Socio Fundador' | 'Socio Club'>('Socio Fundador');
  const [avatarUrl, setAvatarUrl] = useState<string>(BULL_AVATAR_URL);
  const [formError, setFormError] = useState<string | null>(null);
  const [heroVideoVoice, setHeroVideoVoice] = useState<'Enceladus' | 'Erinome'>('Enceladus');

  useEffect(() => {
    if (!authUser) return;
    if (!name && authUser.displayName) setName(authUser.displayName);
    if (!email && authUser.email) setEmail(authUser.email);
  }, [authUser, name, email]);

  // Live phone/webcam selfie capture state
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const handleStartCamera = async () => {
    setCameraError(null);
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      // Fallback directly to native mobile camera file picker
      fileInputRef.current?.click();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 480 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraActive(true);
      window.setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      }, 60);
    } catch {
      setCameraError('No pudimos abrir la cámara directa. Puedes hacer o subir tu foto desde el botón.');
      fileInputRef.current?.click();
    }
  };

  const handleCaptureFrame = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    const size = 360;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const vw = videoRef.current.videoWidth || size;
    const vh = videoRef.current.videoHeight || size;
    const minDim = Math.min(vw, vh);
    const sx = (vw - minDim) / 2;
    const sy = (vh - minDim) / 2;
    ctx.drawImage(videoRef.current, sx, sy, minDim, minDim, 0, 0, size, size);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
    setAvatarUrl(dataUrl);
    stopCamera();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setAvatarUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setFormError('Introduce tu nombre y apellidos para crear tu perfil de socio.');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setFormError('Introduce un correo electrónico válido para guardar tus progresos.');
      return;
    }
    setFormError(null);
    stopCamera();
    onCompleteRegistration({
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim() || '600 000 000',
      goal,
      tier,
      avatarUrl,
    });
  };

  return (
    <div className="min-h-screen bg-[#06080D] text-[#F1F5F9] flex flex-col justify-center px-4 py-8 sm:px-6 lg:px-10">
      <div className="w-full max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        {/* Left Brand Showcase Column: Original Logo + Challenge Pedestal + Bull Avatar */}
        <div className="lg:col-span-6 rounded-2xl bg-[#0D121B] border border-white/10 p-6 sm:p-8 flex flex-col justify-between gap-6 overflow-hidden">
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-4">
              <BrandLogo variant="lockup" className="h-20 sm:h-24 w-auto -ml-2" />
              <img
                src={TELJU_LOGO_URL}
                alt="Telju Fitness — Equipamiento Oficial"
                referrerPolicy="no-referrer"
                className="h-14 w-auto rounded-lg object-contain border border-white/10"
              />
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-medium text-[#33C1FF]">
                  FitnessDreams Benidorm · Acceso de Socios
                </p>
                <PWAInstallButton compact />
              </div>
              <h1 className="text-3xl sm:text-5xl font-bold tracking-[0.01em] text-white leading-[1.06] text-balance">
                Regístrate y guarda cada progreso de tu sueño
              </h1>
              <p className="text-sm text-slate-300 leading-relaxed">
                Tu perfil unifica tu pase QR de torno, tus rutinas enviadas por el Coach Javi, tu
                Aro de Constancia diario y tu foto oficial en los rankings de Mancuerna 70 kg,
                Press Banca y Sentadilla.
              </p>
            </div>

            {/* Inline Explanatory Video: How FitnessDreams App Works */}
            <div className="rounded-xl bg-[#06080D] border border-[#00A8FF]/45 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-bold text-[#33C1FF]">
                    Vídeo explicativo · Cómo funciona la App
                  </p>
                  <p className="text-[11px] text-slate-400">
                    Míralo en 60 segundos con audio antes de empezar a entrenar.
                  </p>
                </div>
                <div
                  className="inline-flex items-center gap-1 p-0.5 rounded-lg bg-[#0D121B] border border-white/10"
                  role="group"
                  aria-label="Cambiar voz del vídeo explicativo"
                >
                  {(['Enceladus', 'Erinome'] as const).map((voice) => (
                    <button
                      key={voice}
                      type="button"
                      onClick={() => setHeroVideoVoice(voice)}
                      aria-pressed={heroVideoVoice === voice}
                      className={`min-h-[30px] px-2.5 rounded-md text-[11px] font-semibold cursor-pointer transition-colors ${
                        heroVideoVoice === voice
                          ? 'bg-[#00A8FF] text-[#04070D]'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      {voice}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-xl overflow-hidden border border-white/10 bg-black flex items-center justify-center">
                <video
                  key={heroVideoVoice}
                  controls
                  playsInline
                  preload="metadata"
                  poster={CHALLENGE_PEDESTAL_IMG}
                  src={
                    heroVideoVoice === 'Erinome'
                      ? '/dossier/Video-Demo-Movil-FitnessDreams-Erinome.webm'
                      : '/dossier/Video-Demo-Movil-FitnessDreams.webm'
                  }
                  className="w-full max-h-[260px] object-contain bg-black"
                />
              </div>

              {onOpenPresentationKit && (
                <div className="flex flex-wrap gap-2 pt-0.5">
                  <button
                    type="button"
                    onClick={() => onOpenPresentationKit('poster')}
                    className="min-h-[38px] px-3 rounded-lg bg-[#00A8FF] hover:bg-[#33C1FF] text-[#04070D] text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    <QrCode className="w-3.5 h-3.5 shrink-0" />
                    Cartel A3 QR
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenPresentationKit('setup-pdf')}
                    className="min-h-[38px] px-3 rounded-lg bg-[#0D121B] hover:border-[#00A8FF] border border-[#00A8FF]/45 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    <FileText className="w-3.5 h-3.5 text-[#33C1FF] shrink-0" />
                    Guía PC + Lector QR
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenPresentationKit('setup-video')}
                    className="min-h-[38px] px-3 rounded-lg bg-[#0D121B] hover:border-[#00A8FF] border border-white/15 text-slate-200 hover:text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    <PlayCircle className="w-3.5 h-3.5 text-[#00A8FF] shrink-0" />
                    Vídeo Conexión PC
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Real Pedestal & Toro Avatar showcase */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-xl overflow-hidden border border-white/10 bg-[#06080D]">
              <img
                src={CHALLENGE_PEDESTAL_IMG}
                alt="Pedestal de la Mancuerna del Desafío FitnessDreams"
                referrerPolicy="no-referrer"
                className="w-full h-36 object-cover"
              />
              <div className="p-3">
                <p className="text-xs font-semibold text-white">La Mancuerna del Desafío</p>
                <p className="text-[11px] text-slate-400">Voluntad · Constancia · 70 kg</p>
              </div>
            </div>

            <div className="rounded-xl overflow-hidden border border-white/10 bg-[#06080D]">
              <img
                src={BULL_AVATAR_URL}
                alt="Avatar oficial Toro FitnessDreams — Fusión FitnessDreams y Telju"
                referrerPolicy="no-referrer"
                className="w-full h-36 object-contain bg-black p-1"
              />
              <div className="p-3">
                <p className="text-xs font-semibold text-white">Avatar Oficial Toro Dream</p>
                <p className="text-[11px] text-slate-400">Fusión FitnessDreams × Telju</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Registration Form with Live Camera Photo Capture */}
        <div className="lg:col-span-6 rounded-2xl bg-[#0D121B] border border-white/10 p-6 sm:p-8 flex flex-col justify-between">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-2xl font-bold text-white tracking-[0.01em]">
                  Crear perfil de socio
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Hazte una foto desde tu teléfono para tu pase QR y los rankings del club.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={onQuickDemoEnter}
                  className="min-h-[38px] px-3 rounded-lg bg-white/6 hover:bg-white/12 text-xs font-medium text-slate-300 hover:text-white transition-colors whitespace-nowrap cursor-pointer"
                >
                  Entrar demo
                </button>
                {onEnterOwnerPanel && (
                  <button
                    type="button"
                    onClick={onEnterOwnerPanel}
                    className="min-h-[38px] px-3 rounded-lg bg-[#00A8FF]/15 hover:bg-[#00A8FF]/25 border border-[#00A8FF]/40 text-xs font-semibold text-[#33C1FF] transition-colors whitespace-nowrap cursor-pointer"
                  >
                    Panel Dirección
                  </button>
                )}
                {onOpenTurnstileScanner && (
                  <button
                    type="button"
                    onClick={onOpenTurnstileScanner}
                    className="min-h-[38px] px-3 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-xs font-semibold text-emerald-300 transition-colors whitespace-nowrap cursor-pointer"
                  >
                    Lector QR
                  </button>
                )}
              </div>
            </div>

            {/* Real Multi-Device Google Login Bar */}
            {onSignInGoogle && (
              <div className="rounded-xl bg-[#06080D] border border-[#00A8FF]/40 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-0.5 min-w-0">
                  <p className="text-xs font-bold text-white">
                    {authUser
                      ? `Conectado con Google: ${authUser.email}`
                      : 'Acceso Real de Socio (Sincronizado con el Torno)'}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    {authUser
                      ? 'Completa tus datos abajo para activar tu Pase QR real en el gimnasio.'
                      : 'Inicia sesión con tu cuenta de Google para conectar tu Pase QR con recepción.'}
                  </p>
                </div>
                {!authUser && (
                  <button
                    type="button"
                    onClick={() => {
                      void onSignInGoogle().then(() => {
                        // Auth state will sync name/email automatically
                      });
                    }}
                    className="min-h-[40px] px-3.5 rounded-lg bg-white hover:bg-slate-100 text-[#04070D] text-xs font-bold whitespace-nowrap cursor-pointer shrink-0"
                  >
                    Entrar con Google
                  </button>
                )}
              </div>
            )}

            {/* Selfie / Photo Capture Block */}
            <div className="rounded-xl bg-[#06080D] border border-white/10 p-4 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-[#00A8FF] shrink-0 bg-[#0D121B]">
                  <img
                    src={avatarUrl}
                    alt="Foto de perfil del socio"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                </div>

                <div className="flex-1 space-y-2">
                  <p className="text-xs font-semibold text-white">
                    Tu foto para el Perfil y Rankings
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleStartCamera}
                      className="min-h-[40px] px-3.5 rounded-lg bg-[#00A8FF] hover:bg-[#33C1FF] text-[#04070D] text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      Hacer foto con cámara
                    </button>

                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="min-h-[40px] px-3.5 rounded-lg bg-[#131B28] hover:bg-white/10 text-slate-200 border border-white/10 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5 text-[#00A8FF]" />
                      Subir de galería
                    </button>

                    <button
                      type="button"
                      onClick={() => setAvatarUrl(BULL_AVATAR_URL)}
                      className="min-h-[40px] px-3.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 text-xs transition-colors cursor-pointer"
                    >
                      Usar Toro Avatar
                    </button>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    aria-label="Seleccionar foto de perfil desde la galería del teléfono"
                    className="hidden"
                  />
                </div>
              </div>

              {cameraError && <p className="text-xs text-amber-300">{cameraError}</p>}

              {cameraActive && (
                <div className="space-y-3 pt-2 border-t border-white/8">
                  <div className="relative rounded-xl overflow-hidden bg-black aspect-square max-w-[240px] mx-auto border border-[#00A8FF]/50">
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex justify-center gap-2">
                    <button
                      type="button"
                      onClick={handleCaptureFrame}
                      className="min-h-[40px] px-4 rounded-lg bg-[#00A8FF] text-[#04070D] text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      <Check className="w-4 h-4" />
                      Capturar foto
                    </button>
                    <button
                      type="button"
                      onClick={stopCamera}
                      className="min-h-[40px] px-3 rounded-lg bg-white/8 text-slate-300 text-xs flex items-center gap-1 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>

            {formError && (
              <p role="alert" className="text-xs text-rose-400 font-medium">
                {formError}
              </p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label htmlFor="reg-name" className="block text-xs text-slate-400 mb-1.5">
                  Nombre y apellidos
                </label>
                <input
                  id="reg-name"
                  type="text"
                  placeholder="Ej. Laura García"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full min-h-[44px] rounded-xl bg-[#06080D] border border-white/12 px-3.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-[#00A8FF]"
                />
              </div>

              <div>
                <label htmlFor="reg-email" className="block text-xs text-slate-400 mb-1.5">
                  Correo electrónico
                </label>
                <input
                  id="reg-email"
                  type="email"
                  placeholder="tu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full min-h-[44px] rounded-xl bg-[#06080D] border border-white/12 px-3.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-[#00A8FF]"
                />
              </div>

              <div>
                <label htmlFor="reg-phone" className="block text-xs text-slate-400 mb-1.5">
                  Teléfono móvil
                </label>
                <input
                  id="reg-phone"
                  type="tel"
                  placeholder="600 123 456"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full min-h-[44px] rounded-xl bg-[#06080D] border border-white/12 px-3.5 text-sm font-mono text-white placeholder:text-slate-600 focus:outline-none focus:border-[#00A8FF]"
                />
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="reg-goal" className="block text-xs text-slate-400 mb-1.5">
                  Objetivo principal
                </label>
                <select
                  id="reg-goal"
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  className="w-full min-h-[44px] rounded-xl bg-[#06080D] border border-white/12 px-3.5 text-sm text-white focus:outline-none focus:border-[#00A8FF]"
                >
                  {GOALS.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Plan selector */}
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setTier('Socio Fundador')}
                aria-pressed={tier === 'Socio Fundador'}
                className={`p-3.5 rounded-xl border text-left transition-colors cursor-pointer ${
                  tier === 'Socio Fundador'
                    ? 'bg-[#00A8FF]/15 border-[#00A8FF] text-white'
                    : 'bg-[#06080D] border-white/10 text-slate-400 hover:text-white'
                }`}
              >
                <p className="text-xs font-bold text-[#33C1FF]">Socio Fundador</p>
                <p className="text-sm font-mono tabular-nums font-bold text-white mt-0.5">
                  34,90 €/mes
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">-15% Fit Café · Blindada</p>
              </button>

              <button
                type="button"
                onClick={() => setTier('Socio Club')}
                aria-pressed={tier === 'Socio Club'}
                className={`p-3.5 rounded-xl border text-left transition-colors cursor-pointer ${
                  tier === 'Socio Club'
                    ? 'bg-[#00A8FF]/15 border-[#00A8FF] text-white'
                    : 'bg-[#06080D] border-white/10 text-slate-400 hover:text-white'
                }`}
              >
                <p className="text-xs font-bold text-slate-200">Socio Club</p>
                <p className="text-sm font-mono tabular-nums font-bold text-white mt-0.5">
                  46,90 €/mes
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">Acceso total 06:00–23:00</p>
              </button>
            </div>

            <button
              type="submit"
              className="w-full min-h-[48px] rounded-xl bg-[#00A8FF] hover:bg-[#33C1FF] text-[#04070D] font-bold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <UserCheck className="w-4 h-4" />
              Registrarme y entrar a mi perfil
              <ArrowRight className="w-4 h-4" />
            </button>

            <p className="text-[11px] text-slate-500 flex items-center justify-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-[#00A8FF]" />
              Tus progresos, rutinas y marcas se guardan automáticamente en tu perfil.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
};
