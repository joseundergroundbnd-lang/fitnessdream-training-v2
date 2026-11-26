import React, { useState } from 'react';
import {
  Check,
  Download,
  Dumbbell,
  ExternalLink,
  FileText,
  Monitor,
  PlayCircle,
  QrCode,
  Smartphone,
  Volume2,
  X,
} from 'lucide-react';
import { POSTER_A3_PDF_URL, PosterA3Preview } from './PosterA3Preview';

export type PresentationKitTab =
  | 'coach-pdf'
  | 'coach-video'
  | 'poster'
  | 'setup-pdf'
  | 'setup-video'
  | 'video'
  | 'pdf';
export type SpotVoiceOption = 'Enceladus' | 'Erinome';

interface PresentationKitModalProps {
  initialTab: PresentationKitTab;
  onClose: () => void;
}

export const COACH_PDF_URL = '/dossier/Guia-Coach-Crear-Rutina-Socio.pdf';
export const COACH_PDF_NAME = 'Guia-Coach-Crear-Rutina-Socio.pdf';

export const COACH_VIDEO_URL = '/dossier/Video-Tutorial-Coach-Rutina-Movil-Enceladus.webm';
export const COACH_VIDEO_NAME = 'Video-Tutorial-Coach-Rutina-Movil-Enceladus.webm';

export const PDF_FILE_URL = '/dossier/Guia-Oficial-FitnessDreams-App.pdf';
export const PDF_FILE_NAME = 'Guia-Oficial-FitnessDreams-App.pdf';

export const SETUP_PDF_URL = '/dossier/Guia-Conexion-PC-y-Movil-Lector-QR.pdf';
export const SETUP_PDF_NAME = 'Guia-Conexion-PC-y-Movil-Lector-QR.pdf';

export const SETUP_VIDEO_URL = '/dossier/Video-Tutorial-Conexion-PC-y-Movil-Lector-QR.webm';
export const SETUP_VIDEO_NAME = 'Video-Tutorial-Conexion-PC-y-Movil-Lector-QR.webm';

const VIDEO_BY_VOICE: Record<
  SpotVoiceOption,
  { url: string; filename: string; subtitle: string }
> = {
  Enceladus: {
    url: '/dossier/Video-Demo-Movil-FitnessDreams.webm',
    filename: 'Video-Demo-Movil-FitnessDreams-Enceladus.webm',
    subtitle: 'Voz masculina profunda y comercial + música electrónica',
  },
  Erinome: {
    url: '/dossier/Video-Demo-Movil-FitnessDreams-Erinome.webm',
    filename: 'Video-Demo-Movil-FitnessDreams-Erinome.webm',
    subtitle: 'Voz femenina clara y energética + música electrónica',
  },
};

async function triggerBlobDownload(url: string, filename: string): Promise<boolean> {
  try {
    const response = await fetch(url);
    if (!response.ok) return false;
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);
    return true;
  } catch {
    return false;
  }
}

export const PresentationKitModal: React.FC<PresentationKitModalProps> = ({
  initialTab,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<PresentationKitTab>(initialTab);
  const [selectedVoice, setSelectedVoice] = useState<SpotVoiceOption>('Enceladus');
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const activeVideo = VIDEO_BY_VOICE[selectedVoice];

  const handleDownloadFile = async (url: string, filename: string) => {
    setDownloadingKey(filename);
    setStatusMessage(null);
    const ok = await triggerBlobDownload(url, filename);
    setDownloadingKey(null);
    if (ok) {
      setStatusMessage(
        `Descarga iniciada: ${filename}. Si el navegador bloquea descargas en vista embebida, pulsa «Abrir archivo directo».`
      );
    } else {
      setStatusMessage(
        'No se pudo iniciar la descarga directa. Usa «Abrir archivo directo» para guardarlo desde tu navegador.'
      );
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-label="Centro de Descargas · Cartel A3 QR, Guías PDF y Vídeos FitnessDreams"
    >
      <div className="w-full max-w-5xl rounded-2xl bg-[#0D121B] border border-[#00A8FF]/45 p-4 sm:p-6 space-y-4 max-h-[94vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-[#33C1FF]">
              Kit de Apertura y Pruebas Reales · FitnessDreams Benidorm
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-white mt-0.5">
              Cartel A3 QR, Guía PC + Móvil Lector y Vídeos con Audio
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar centro de descargas"
            className="min-w-[40px] min-h-[40px] rounded-xl bg-[#06080D] border border-white/10 text-slate-300 hover:text-white flex items-center justify-center cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs for all Deliverables */}
        <div
          className="flex flex-wrap items-center gap-1.5 p-1.5 rounded-xl bg-[#06080D] border border-white/10"
          role="tablist"
          aria-label="Elegir recurso del kit de apertura"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'coach-pdf'}
            onClick={() => setActiveTab('coach-pdf')}
            className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === 'coach-pdf'
                ? 'bg-[#00A8FF] text-[#04070D]'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Dumbbell className="w-3.5 h-3.5 shrink-0" />
            PDF Rutinas Coach
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'coach-video'}
            onClick={() => setActiveTab('coach-video')}
            className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === 'coach-video'
                ? 'bg-[#00A8FF] text-[#04070D]'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5 shrink-0" />
            Vídeo Coach Móvil (Enceladus)
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'poster'}
            onClick={() => setActiveTab('poster')}
            className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === 'poster'
                ? 'bg-[#00A8FF] text-[#04070D]'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <QrCode className="w-3.5 h-3.5 shrink-0" />
            Cartel A3 QR
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'setup-pdf'}
            onClick={() => setActiveTab('setup-pdf')}
            className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === 'setup-pdf'
                ? 'bg-[#00A8FF] text-[#04070D]'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Monitor className="w-3.5 h-3.5 shrink-0" />
            PDF PC + Lector
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'setup-video'}
            onClick={() => setActiveTab('setup-video')}
            className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === 'setup-video'
                ? 'bg-[#00A8FF] text-[#04070D]'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Volume2 className="w-3.5 h-3.5 shrink-0" />
            Vídeo PC + Lector
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'video'}
            onClick={() => setActiveTab('video')}
            className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === 'video'
                ? 'bg-[#00A8FF] text-[#04070D]'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <PlayCircle className="w-3.5 h-3.5 shrink-0" />
            Vídeo App
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'pdf'}
            onClick={() => setActiveTab('pdf')}
            className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === 'pdf'
                ? 'bg-[#00A8FF] text-[#04070D]'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <FileText className="w-3.5 h-3.5 shrink-0" />
            Guía Oficial App
          </button>
        </div>

        {statusMessage && (
          <div
            role="status"
            className="rounded-xl bg-[#00A8FF]/14 border border-[#00A8FF]/40 px-3.5 py-2.5 text-xs text-white flex items-start gap-2"
          >
            <Check className="w-4 h-4 text-[#33C1FF] shrink-0 mt-0.5" />
            <span>{statusMessage}</span>
          </div>
        )}

        {/* TAB 0A: PDF GUÍA PASO A PASO PARA COACHES (CAPTURAS REALES DE LA APP) */}
        {activeTab === 'coach-pdf' && (
          <div className="rounded-2xl bg-[#06080D] border border-white/10 p-4 sm:p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-[#33C1FF]">
                  Manual Oficial para Entrenadores · Con Capturas Reales de la App en Cada Paso
                </p>
                <h3 className="text-xl font-bold text-white mt-0.5">
                  Cómo Preparar y Enviar una Rutina Exclusiva a un Socio
                </h3>
                <p className="text-xs text-slate-300 mt-1">
                  Explica los enlaces exclusivos para coaches, la selección del socio en la base de
                  datos, grupos musculares (Telju, Mancuernas/Barra, Polea), series 1–10, pirámides,
                  peso, intensidad, descanso, cardio y duración diaria/semanal/mensual/trimestral.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => void handleDownloadFile(COACH_PDF_URL, COACH_PDF_NAME)}
                  disabled={downloadingKey === COACH_PDF_NAME}
                  className="min-h-[42px] px-4 rounded-lg bg-[#00A8FF] hover:bg-[#33C1FF] text-[#04070D] text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Download className="w-4 h-4 shrink-0" />
                  {downloadingKey === COACH_PDF_NAME ? 'Preparando PDF...' : 'Descargar PDF Coach'}
                </button>
                <a
                  href={COACH_PDF_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[42px] px-3.5 rounded-lg bg-[#0D121B] hover:border-[#00A8FF] border border-white/15 text-xs font-semibold text-slate-200 hover:text-white flex items-center gap-1.5 whitespace-nowrap"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-[#33C1FF]" />
                  Abrir PDF directo
                </a>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-xl overflow-hidden border border-white/10 bg-[#0D121B]">
                <img
                  src="/dossier/coach-pdf-preview-p1.png"
                  alt="Página 1 — Enlaces exclusivos de Coach y selección de socio en base de datos"
                  referrerPolicy="no-referrer"
                  className="w-full h-56 object-cover object-top"
                />
                <div className="px-3 py-2 border-t border-white/8">
                  <p className="text-xs font-semibold text-white">Pág. 01 · Enlaces y Base de Socios</p>
                  <p className="text-[11px] text-slate-400">Acceso Coach distinto al socio + envío exclusivo</p>
                </div>
              </div>
              <div className="rounded-xl overflow-hidden border border-white/10 bg-[#0D121B]">
                <img
                  src="/dossier/coach-pdf-preview-p3.png"
                  alt="Página 3 — Grupos musculares, máquinas Telju, barra/mancuernas, polea y pirámides"
                  referrerPolicy="no-referrer"
                  className="w-full h-56 object-cover object-top"
                />
                <div className="px-3 py-2 border-t border-white/8">
                  <p className="text-xs font-semibold text-white">Pág. 03 · Músculos, Series y Pirámide</p>
                  <p className="text-[11px] text-slate-400">Telju, Mancuernas/Barra, Polea y descanso</p>
                </div>
              </div>
              <div className="rounded-xl overflow-hidden border border-white/10 bg-[#0D121B]">
                <img
                  src="/dossier/coach-pdf-preview-p5.png"
                  alt="Página 5 — Bloque de Cardio, envío exclusivo y vista en el móvil del socio"
                  referrerPolicy="no-referrer"
                  className="w-full h-56 object-cover object-top"
                />
                <div className="px-3 py-2 border-t border-white/8">
                  <p className="text-xs font-semibold text-white">Pág. 05 · Cardio y Vista del Socio</p>
                  <p className="text-[11px] text-slate-400">Recepción exclusiva en el móvil del cliente</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 0B: VÍDEO TUTORIAL DESDE EL MÓVIL CON VOZ ENCELADUS */}
        {activeTab === 'coach-video' && (
          <div className="rounded-2xl bg-[#06080D] border border-white/10 p-4 sm:p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-[#33C1FF]">
                  Vídeo Tutorial desde el Móvil · Locución Voz Enceladus (Español)
                </p>
                <h3 className="text-xl font-bold text-white mt-0.5">
                  Cómo Crear y Enviar una Rutina Exclusiva a un Socio desde el Móvil
                </h3>
                <p className="text-xs text-slate-300 mt-0.5">
                  Recorrido móvil real paso a paso: enlace Coach, elegir socio, periodo, grupo
                  muscular, Telju / mancuernas / polea, series 1–10, pirámide, intensidad, descanso y cardio.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => void handleDownloadFile(COACH_VIDEO_URL, COACH_VIDEO_NAME)}
                  disabled={downloadingKey === COACH_VIDEO_NAME}
                  className="min-h-[42px] px-4 rounded-lg bg-[#00A8FF] hover:bg-[#33C1FF] text-[#04070D] text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Download className="w-4 h-4 shrink-0" />
                  {downloadingKey === COACH_VIDEO_NAME ? 'Preparando vídeo...' : 'Descargar Vídeo Enceladus'}
                </button>
                <a
                  href={COACH_VIDEO_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[42px] px-3.5 rounded-lg bg-[#0D121B] hover:border-[#00A8FF] border border-white/15 text-xs font-semibold text-slate-200 hover:text-white flex items-center gap-1.5 whitespace-nowrap"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-[#33C1FF]" />
                  Abrir directo
                </a>
              </div>
            </div>

            <div className="flex flex-col items-center justify-center gap-2">
              <video
                controls
                playsInline
                preload="metadata"
                poster="/dossier/coach-video-poster.png"
                src={COACH_VIDEO_URL}
                className="mx-auto max-h-[60vh] w-auto rounded-xl border border-[#00A8FF]/40 bg-black"
              />
              <p className="text-[11px] text-slate-400">
                Formato móvil vertical HD con locución profesional en español (<strong className="text-[#33C1FF]">Voz Enceladus</strong>). Sube el volumen para seguir cada paso.
              </p>
            </div>
          </div>
        )}

        {/* TAB 1: CARTEL A3 QR (PEDESTAL + LOGO + QR) */}
        {activeTab === 'poster' && (
          <PosterA3Preview
            onDownloadFile={(url, filename) => void handleDownloadFile(url, filename)}
          />
        )}

        {/* TAB 2: PDF CONEXIÓN ORDENADOR GYM + MÓVIL COMO LECTOR QR */}
        {activeTab === 'setup-pdf' && (
          <div className="rounded-2xl bg-[#06080D] border border-white/10 p-4 sm:p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-[#33C1FF]">
                  Manual Práctico de Instalación Hoy · 5 Páginas
                </p>
                <h3 className="text-xl font-bold text-white mt-0.5">
                  Cómo Conectar el Ordenador del Gym y Usar un Móvil como Lector QR
                </h3>
                <p className="text-xs text-slate-300 mt-1">
                  Incluye por qué evitar el enlace de AI Studio, cómo conectar Google en recepción,
                  cómo poner un móvil secundario en el torno y la prueba paso a paso con clientes reales.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => void handleDownloadFile(SETUP_PDF_URL, SETUP_PDF_NAME)}
                  disabled={downloadingKey === SETUP_PDF_NAME}
                  className="min-h-[42px] px-4 rounded-lg bg-[#00A8FF] hover:bg-[#33C1FF] text-[#04070D] text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Download className="w-4 h-4 shrink-0" />
                  {downloadingKey === SETUP_PDF_NAME ? 'Preparando PDF...' : 'Descargar PDF Conexión'}
                </button>
                <a
                  href={SETUP_PDF_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[42px] px-3.5 rounded-lg bg-[#0D121B] hover:border-[#00A8FF] border border-white/15 text-xs font-semibold text-slate-200 hover:text-white flex items-center gap-1.5 whitespace-nowrap"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-[#33C1FF]" />
                  Abrir archivo directo
                </a>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-xl overflow-hidden border border-white/10 bg-[#0D121B]">
                <img
                  src="/dossier/setup-pdf-preview-p1.png"
                  alt="Página 1 — Arquitectura de los 3 dispositivos conectados en tiempo real"
                  referrerPolicy="no-referrer"
                  className="w-full h-56 object-cover object-top"
                />
                <div className="px-3 py-2 border-t border-white/8">
                  <p className="text-xs font-semibold text-white">Pág. 01 · Portada y 3 Dispositivos</p>
                  <p className="text-[11px] text-slate-400">PC Recepción + Móvil Lector + Socios</p>
                </div>
              </div>
              <div className="rounded-xl overflow-hidden border border-white/10 bg-[#0D121B]">
                <img
                  src="/dossier/setup-pdf-preview-p3.png"
                  alt="Página 3 — Conexión en el ordenador de recepción y control de cuotas"
                  referrerPolicy="no-referrer"
                  className="w-full h-56 object-cover object-top"
                />
                <div className="px-3 py-2 border-t border-white/8">
                  <p className="text-xs font-semibold text-white">Pág. 03 · Ordenador del Gym</p>
                  <p className="text-[11px] text-slate-400">Google del Gym y cuotas en 1 clic</p>
                </div>
              </div>
              <div className="rounded-xl overflow-hidden border border-white/10 bg-[#0D121B]">
                <img
                  src="/dossier/setup-pdf-preview-p4.png"
                  alt="Página 4 — Cómo usar un móvil secundario como Lector QR sin hardware extra"
                  referrerPolicy="no-referrer"
                  className="w-full h-56 object-cover object-top"
                />
                <div className="px-3 py-2 border-t border-white/8">
                  <p className="text-xs font-semibold text-white">Pág. 04 · Móvil Lector QR</p>
                  <p className="text-[11px] text-slate-400">Soporte, cámara frontal y pitidos</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pt-2 border-t border-white/8 text-xs text-slate-300">
              <span>
                <strong className="text-[#33C1FF]">01.</strong> Esquema PC + Móvil Lector + Móviles Socios
              </span>
              <span>
                <strong className="text-[#33C1FF]">02.</strong> Enlace limpio vs AI Studio (adiós pantalla rara)
              </span>
              <span>
                <strong className="text-[#33C1FF]">03.</strong> Configuración del Ordenador de Recepción
              </span>
              <span>
                <strong className="text-[#33C1FF]">04.</strong> Móvil viejo/secundario como Lector QR Torno
              </span>
              <span>
                <strong className="text-[#33C1FF]">05.</strong> Cartel A3, icono «Training» y checklist hoy
              </span>
            </div>
          </div>
        )}

        {/* TAB 3: VÍDEO TUTORIAL CON AUDIO (CONEXIÓN PC + MÓVIL LECTOR QR) */}
        {activeTab === 'setup-video' && (
          <div className="rounded-2xl bg-[#06080D] border border-white/10 p-4 sm:p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-[#33C1FF]">
                  Vídeo Tutorial con Voz en Español + Demostración Real
                </p>
                <h3 className="text-xl font-bold text-white mt-0.5">
                  Cómo Conectar el PC del Gym y Montar el Móvil Lector QR
                </h3>
                <p className="text-xs text-slate-300 mt-0.5">
                  Explicación guiada paso a paso con audio para abrir hoy y probar con gente real.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => void handleDownloadFile(SETUP_VIDEO_URL, SETUP_VIDEO_NAME)}
                  disabled={downloadingKey === SETUP_VIDEO_NAME}
                  className="min-h-[42px] px-4 rounded-lg bg-[#00A8FF] hover:bg-[#33C1FF] text-[#04070D] text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Download className="w-4 h-4 shrink-0" />
                  {downloadingKey === SETUP_VIDEO_NAME ? 'Preparando vídeo...' : 'Descargar Vídeo Tutorial'}
                </button>
                <a
                  href={SETUP_VIDEO_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[42px] px-3.5 rounded-lg bg-[#0D121B] hover:border-[#00A8FF] border border-white/15 text-xs font-semibold text-slate-200 hover:text-white flex items-center gap-1.5 whitespace-nowrap"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-[#33C1FF]" />
                  Abrir directo
                </a>
              </div>
            </div>

            <div className="flex flex-col items-center justify-center gap-2">
              <video
                controls
                playsInline
                preload="metadata"
                poster="/dossier/setup-video-poster.png"
                src={SETUP_VIDEO_URL}
                className="w-full max-w-3xl aspect-video max-h-[56vh] rounded-xl border border-[#00A8FF]/40 bg-black"
              />
              <p className="text-[11px] text-slate-400">
                Sube el volumen para escuchar la locución paso a paso en español · Formato WebM HD con audio.
              </p>
            </div>
          </div>
        )}

        {/* TAB 4: VÍDEO EXPLICATIVO DE CÓMO FUNCIONA LA APP (ENCELADUS / ERINOME) */}
        {activeTab === 'video' && (
          <div className="rounded-2xl bg-[#06080D] border border-white/10 p-4 sm:p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-[#33C1FF]">
                  Vídeo Explicativo Oficial · Voz {selectedVoice}
                </p>
                <h3 className="text-xl font-bold text-white mt-0.5">
                  Cómo Funciona FitnessDreams App (Para Socios y Dirección)
                </h3>
                <p className="text-xs text-slate-400">{activeVideo.subtitle}</p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div
                  className="inline-flex items-center gap-1 p-1 rounded-lg bg-[#0D121B] border border-white/10"
                  role="group"
                  aria-label="Elegir voz de locución del vídeo explicativo"
                >
                  {(['Enceladus', 'Erinome'] as SpotVoiceOption[]).map((voice) => {
                    const isCurrent = selectedVoice === voice;
                    return (
                      <button
                        key={voice}
                        type="button"
                        onClick={() => setSelectedVoice(voice)}
                        aria-pressed={isCurrent}
                        className={`min-h-[34px] px-2.5 rounded-md text-xs font-semibold flex items-center gap-1 cursor-pointer transition-colors ${
                          isCurrent
                            ? 'bg-[#00A8FF] text-[#04070D]'
                            : 'text-slate-300 hover:text-white'
                        }`}
                      >
                        <Volume2 className="w-3.5 h-3.5 shrink-0" />
                        <span>{voice}</span>
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={() => void handleDownloadFile(activeVideo.url, activeVideo.filename)}
                  disabled={downloadingKey === activeVideo.filename}
                  className="min-h-[40px] px-3.5 rounded-lg bg-[#00A8FF] hover:bg-[#33C1FF] text-[#04070D] text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Download className="w-4 h-4 shrink-0" />
                  Descargar ({selectedVoice})
                </button>
              </div>
            </div>

            <div className="flex flex-col items-center justify-center gap-2">
              <video
                key={activeVideo.url}
                controls
                playsInline
                preload="metadata"
                src={activeVideo.url}
                className="mx-auto max-h-[56vh] w-auto rounded-xl border border-[#00A8FF]/35 bg-black"
              />
              <p className="text-[11px] text-slate-400">
                Reproduciendo versión con <strong className="text-[#33C1FF]">Voz {selectedVoice}</strong> · También disponible directamente en la pantalla de bienvenida.
              </p>
            </div>
          </div>
        )}

        {/* TAB 5: GUÍA OFICIAL APP 12 PÁGINAS */}
        {activeTab === 'pdf' && (
          <div className="rounded-2xl bg-[#06080D] border border-white/10 p-4 sm:p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-[#33C1FF]">
                  Dossier Comercial Completo · 12 Páginas
                </p>
                <h3 className="text-xl font-bold text-white mt-0.5">
                  Guía Oficial FitnessDreams App
                </h3>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => void handleDownloadFile(PDF_FILE_URL, PDF_FILE_NAME)}
                  disabled={downloadingKey === PDF_FILE_NAME}
                  className="min-h-[40px] px-3.5 rounded-lg bg-[#00A8FF] hover:bg-[#33C1FF] text-[#04070D] text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Download className="w-4 h-4 shrink-0" />
                  Descargar PDF (12 págs.)
                </button>
                <a
                  href={POSTER_A3_PDF_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[40px] px-3 rounded-lg bg-[#0D121B] hover:border-[#00A8FF] border border-white/15 text-xs font-semibold text-slate-200 hover:text-white flex items-center gap-1.5 whitespace-nowrap"
                >
                  <QrCode className="w-3.5 h-3.5 text-[#33C1FF]" />
                  Cartel A3 PDF
                </a>
                <a
                  href={PDF_FILE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[40px] px-3 rounded-lg bg-[#0D121B] hover:border-[#00A8FF] border border-white/15 text-xs font-semibold text-slate-200 hover:text-white flex items-center gap-1.5 whitespace-nowrap"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-[#33C1FF]" />
                  Abrir directo
                </a>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-xl overflow-hidden border border-white/10 bg-[#0D121B]">
                <img
                  src="/dossier/pdf-preview-p1.png"
                  alt="Portada de la Guía Oficial FitnessDreams App"
                  referrerPolicy="no-referrer"
                  className="w-full h-56 object-cover object-top"
                />
                <div className="px-3 py-2 border-t border-white/8">
                  <p className="text-xs font-semibold text-white">Pág. 01 · Portada Oficial</p>
                  <p className="text-[11px] text-slate-400">Identidad FitnessDreams × Telju</p>
                </div>
              </div>
              <div className="rounded-xl overflow-hidden border border-white/10 bg-[#0D121B]">
                <img
                  src="/dossier/pdf-preview-p5.png"
                  alt="Página 5 — Entreno por libre, con Coach y Chat de texto y audio"
                  referrerPolicy="no-referrer"
                  className="w-full h-56 object-cover object-top"
                />
                <div className="px-3 py-2 border-t border-white/8">
                  <p className="text-xs font-semibold text-white">Pág. 05 · Entreno y Chat Coach</p>
                  <p className="text-[11px] text-slate-400">Libre, con Coach y notas de voz</p>
                </div>
              </div>
              <div className="rounded-xl overflow-hidden border border-white/10 bg-[#0D121B]">
                <img
                  src="/dossier/pdf-preview-p10.png"
                  alt="Página 10 — Panel de Dirección y Coaches Javi Busta y Joel"
                  referrerPolicy="no-referrer"
                  className="w-full h-56 object-cover object-top"
                />
                <div className="px-3 py-2 border-t border-white/8">
                  <p className="text-xs font-semibold text-white">Pág. 10 · Panel de Dirección</p>
                  <p className="text-[11px] text-slate-400">Retención +10d, Aforo y Coaches</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
