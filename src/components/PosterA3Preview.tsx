import React, { useMemo, useState } from 'react';
import { Check, Copy, Download, ExternalLink, Printer, RotateCcw } from 'lucide-react';
import { CHALLENGE_PEDESTAL_IMG, TELJU_LOGO_URL } from '../data/seedData';
import {
  DIRECT_SHARED_APP_URL,
  resolveDirectPublicUrl,
  sanitizeCustomPosterUrl,
} from '../utils/pwaUtils';
import { BrandLogo } from './BrandLogo';
import { RealQrCode } from './RealQrCode';

export const POSTER_A3_PDF_URL = '/dossier/Cartel-A3-FitnessDreams-QR.pdf';
export const POSTER_A3_PNG_URL = '/dossier/Cartel-A3-FitnessDreams-QR.png';

interface PosterA3PreviewProps {
  onDownloadFile?: (url: string, filename: string) => void;
}

export const PosterA3Preview: React.FC<PosterA3PreviewProps> = ({ onDownloadFile }) => {
  const defaultDirectUrl = useMemo(() => {
    if (typeof window === 'undefined') return DIRECT_SHARED_APP_URL;
    return resolveDirectPublicUrl(window.location.origin);
  }, []);

  const [customUrlInput, setCustomUrlInput] = useState(defaultDirectUrl);
  const [copiedUrl, setCopiedUrl] = useState(false);

  const activeQrUrl = useMemo(
    () => sanitizeCustomPosterUrl(customUrlInput, defaultDirectUrl),
    [customUrlInput, defaultDirectUrl]
  );

  const isCustomUrlModified = activeQrUrl !== DIRECT_SHARED_APP_URL;

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(activeQrUrl);
      setCopiedUrl(true);
      window.setTimeout(() => setCopiedUrl(false), 2200);
    } catch {
      // Ignore clipboard restriction
    }
  };

  return (
    <div className="space-y-4">
      {/* Direct Link Explanation & Custom URL Field */}
      <div className="rounded-xl bg-[#06080D] border border-[#00A8FF]/35 p-4 space-y-3">
        <div className="space-y-1">
          <p className="text-xs font-bold text-[#33C1FF]">
            Enlace directo limpio en el QR (sin pantalla intermedia rara de AI Studio)
          </p>
          <p className="text-xs text-slate-300 leading-relaxed">
            No compartas <span className="font-mono text-slate-400">ai.studio/apps/...</span> porque
            abre primero la pantalla de Google AI Studio. Usa siempre este enlace directo limpio (o
            tu dominio de Vercel si lo publicas allí): el código QR se actualiza al instante.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="url"
            value={customUrlInput}
            onChange={(e) => setCustomUrlInput(e.target.value)}
            aria-label="Enlace directo codificado en el QR del Cartel A3"
            placeholder={DIRECT_SHARED_APP_URL}
            className="flex-1 min-h-[40px] rounded-lg bg-[#0D121B] border border-white/15 px-3 text-xs font-mono text-white placeholder:text-slate-500 focus:outline-none focus:border-[#00A8FF]"
          />
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void handleCopyUrl()}
              className="min-h-[40px] px-3 rounded-lg bg-[#131B28] hover:border-[#00A8FF] border border-white/15 text-xs font-semibold text-white flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              {copiedUrl ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  Copiado
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-[#33C1FF]" />
                  Copiar enlace
                </>
              )}
            </button>
            {isCustomUrlModified && (
              <button
                type="button"
                onClick={() => setCustomUrlInput(DIRECT_SHARED_APP_URL)}
                aria-label="Restaurar enlace directo oficial"
                className="min-h-[40px] px-2.5 rounded-lg bg-white/6 hover:bg-white/12 text-xs text-slate-300 flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Restaurar
              </button>
            )}
          </div>
        </div>

        {/* Download & Print Buttons */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {onDownloadFile ? (
            <>
              <button
                type="button"
                onClick={() =>
                  onDownloadFile(POSTER_A3_PDF_URL, 'Cartel-A3-FitnessDreams-QR.pdf')
                }
                className="min-h-[42px] px-4 rounded-lg bg-[#00A8FF] hover:bg-[#33C1FF] text-[#04070D] text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <Download className="w-4 h-4 shrink-0" />
                Descargar Cartel A3 (PDF Imprenta)
              </button>
              <button
                type="button"
                onClick={() =>
                  onDownloadFile(POSTER_A3_PNG_URL, 'Cartel-A3-FitnessDreams-QR.png')
                }
                className="min-h-[42px] px-3.5 rounded-lg bg-[#0D121B] hover:border-[#00A8FF] border border-[#00A8FF]/45 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <Download className="w-4 h-4 text-[#33C1FF] shrink-0" />
                Descargar PNG Alta Res.
              </button>
            </>
          ) : null}
          <a
            href={POSTER_A3_PDF_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-[42px] px-3.5 rounded-lg bg-[#0D121B] hover:border-[#00A8FF] border border-white/15 text-slate-200 hover:text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap"
          >
            <ExternalLink className="w-3.5 h-3.5 text-[#33C1FF]" />
            Abrir PDF A3
          </a>
          <button
            type="button"
            onClick={() => window.print()}
            className="min-h-[42px] px-3 rounded-lg bg-white/6 hover:bg-white/12 text-slate-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <Printer className="w-3.5 h-3.5 text-[#33C1FF]" />
            Imprimir
          </button>
        </div>
      </div>

      {/* True A3 Aspect Ratio Live Preview (297:420 -> ~0.707) */}
      <div className="mx-auto w-full max-w-[540px] aspect-[297/420] rounded-2xl overflow-hidden bg-[#06080D] border-2 border-[#00A8FF]/55 shadow-2xl flex flex-col justify-between p-5 sm:p-7 relative">
        {/* Top Brand Row */}
        <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3">
          <BrandLogo variant="lockup" className="h-14 sm:h-16 w-auto -ml-2" />
          <div className="text-right space-y-1">
            <img
              src={TELJU_LOGO_URL}
              alt="Telju Fitness — Equipamiento Oficial"
              referrerPolicy="no-referrer"
              className="h-9 w-auto rounded ml-auto object-contain border border-white/10"
            />
            <p className="text-[10px] font-mono text-[#33C1FF] tracking-wider uppercase">
              BENIDORM · APP OFICIAL
            </p>
          </div>
        </div>

        {/* Hero Dumbbell on the Pedestal */}
        <div className="my-3 space-y-2.5">
          <div className="relative rounded-xl overflow-hidden border border-[#00A8FF]/45 bg-black">
            <img
              src={CHALLENGE_PEDESTAL_IMG}
              alt="La Mancuerna del Desafío en el pedestal FitnessDreams"
              referrerPolicy="no-referrer"
              className="w-full h-44 sm:h-56 object-cover"
            />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#06080D] via-[#06080D]/60 to-transparent px-4 pt-8 pb-3">
              <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#33C1FF]">
                LA MANCUERNA DEL DESAFÍO · 70 KG
              </p>
              <h3 className="text-2xl sm:text-3xl font-display font-extrabold text-white tracking-wide leading-none mt-0.5">
                ESCANEA Y DESCARGA LA APP
              </h3>
            </div>
          </div>
        </div>

        {/* Center QR Block + Home Screen Icon Preview */}
        <div className="grid grid-cols-12 gap-3.5 items-center rounded-2xl bg-[#0D121B] border border-[#00A8FF]/40 p-3.5 sm:p-4">
          <div className="col-span-6 flex flex-col items-center">
            <div className="rounded-xl bg-white p-2.5 shadow-lg">
              <RealQrCode
                value={activeQrUrl}
                size={146}
                label="Código QR oficial para descargar e instalar la app FitnessDreams Training"
              />
            </div>
            <p className="mt-1.5 text-[9px] font-mono text-[#33C1FF] text-center truncate w-full">
              APUNTA CON TU CÁMARA
            </p>
          </div>

          <div className="col-span-6 space-y-2.5 text-left">
            <div className="flex items-center gap-2.5">
              <div className="flex flex-col items-center shrink-0">
                <img
                  src="/pwa-192x192.png"
                  alt="Icono Training del pedestal"
                  referrerPolicy="no-referrer"
                  className="w-11 h-11 rounded-xl border border-[#00A8FF]/70 object-cover"
                />
                <span className="text-[9px] font-bold text-white mt-0.5">Training</span>
              </div>
              <div>
                <p className="text-xs font-bold text-white leading-tight">
                  Android & iPhone
                </p>
                <p className="text-[10px] text-slate-300 leading-snug mt-0.5">
                  Instálala en tu pantalla de inicio en 10 segundos.
                </p>
              </div>
            </div>

            <ul className="space-y-1 text-[10px] sm:text-[11px] text-slate-200 leading-snug">
              <li>
                <strong className="text-[#33C1FF]">1.</strong> Tu Pase QR de acceso al torno
              </li>
              <li>
                <strong className="text-[#33C1FF]">2.</strong> Rutinas de Coach Javi y Joel + 41 máquinas Telju
              </li>
              <li>
                <strong className="text-[#33C1FF]">3.</strong> Rankings Mancuerna 70 kg, Clases y Fit Café
              </li>
            </ul>
          </div>
        </div>

        {/* Footer Motto */}
        <div className="pt-3 mt-2 border-t border-white/10 flex items-center justify-between gap-2 text-[10px] text-slate-400">
          <span className="font-display text-sm font-bold tracking-wider text-white">
            FITNESS<span className="text-[#00A8FF]">DREAMS</span> · WORK YOUR DREAMS
          </span>
          <span className="font-mono text-[9px] text-[#33C1FF] truncate max-w-[180px]">
            {activeQrUrl.replace(/^https?:\/\//, '')}
          </span>
        </div>
      </div>
    </div>
  );
};
