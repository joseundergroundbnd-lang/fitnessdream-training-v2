import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Download,
  ExternalLink,
  MoreVertical,
  PlusSquare,
  Share,
  Smartphone,
  WifiOff,
  X,
} from 'lucide-react';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePWAInstall';
import { resolveDirectPublicUrl } from '../utils/pwaUtils';

interface PWAInstallModalProps {
  isOpen: boolean;
  onClose: () => void;
  isInstallable: boolean;
  initialOsTab: 'android' | 'ios';
  isInAppBrowser: boolean;
  onTriggerNativeInstall: () => Promise<boolean>;
}

export const PWAInstallModal: React.FC<PWAInstallModalProps> = ({
  isOpen,
  onClose,
  isInstallable,
  initialOsTab,
  isInAppBrowser,
  onTriggerNativeInstall,
}) => {
  const [osTab, setOsTab] = useState<'android' | 'ios'>(initialOsTab);
  const [installing, setInstalling] = useState(false);
  const [installFeedback, setInstallFeedback] = useState<string | null>(null);

  useEffect(() => {
    setOsTab(initialOsTab);
  }, [initialOsTab]);

  if (!isOpen) return null;

  const directUrl =
    typeof window !== 'undefined' ? resolveDirectPublicUrl(window.location.origin) : '';

  const handleNativeInstallClick = async () => {
    setInstalling(true);
    setInstallFeedback(null);
    const accepted = await onTriggerNativeInstall();
    setInstalling(false);
    if (accepted) {
      setInstallFeedback('¡App «Training» instalada! Ya verás el icono del pedestal en tu pantalla de inicio.');
    } else {
      setInstallFeedback('Puedes instalarla en cualquier momento pulsando el menú del navegador.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/82 backdrop-blur-sm flex items-center justify-center p-3.5 sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-label="Instalar App FitnessDreams Training en pantalla de inicio"
    >
      <div className="w-full max-w-md rounded-2xl bg-[#0D121B] border border-[#00A8FF]/50 p-5 sm:p-6 space-y-5 shadow-2xl max-h-[92vh] overflow-y-auto">
        {/* Header + Pedestal "Training" Home Screen Icon Preview */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3.5">
            <div className="flex flex-col items-center shrink-0">
              <div className="w-16 h-16 rounded-2xl overflow-hidden border-2 border-[#00A8FF]/70 shadow-lg bg-[#06080D]">
                <img
                  src="/pwa-192x192.png"
                  alt="Icono de pantalla de inicio Training con el pedestal FitnessDreams"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </div>
              <span className="mt-1 text-[11px] font-semibold text-white tracking-tight">
                Training
              </span>
            </div>

            <div className="space-y-1">
              <p className="text-xs font-semibold text-[#33C1FF]">
                FitnessDreams Benidorm · Acceso Directo
              </p>
              <h2 className="text-2xl font-bold text-white leading-tight">
                Instala la App en tu móvil
              </h2>
              <p className="text-xs text-slate-300 leading-relaxed">
                Añade el icono del pedestal <strong className="text-white">«Training»</strong> a tu
                pantalla de inicio para entrar en 1 toque sin barra del navegador.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar aviso de instalación"
            className="min-h-[40px] min-w-[40px] rounded-xl bg-[#06080D] border border-white/10 text-slate-400 hover:text-white flex items-center justify-center cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Warning if inside an embedded browser (WhatsApp / Instagram / AI Studio wrapper) */}
        {isInAppBrowser && (
          <div className="rounded-xl bg-amber-500/12 border border-amber-500/40 p-3 text-xs text-amber-100 space-y-1.5">
            <p className="font-semibold text-amber-200">
              Abre primero en Chrome (Android) o Safari (iPhone)
            </p>
            <p className="text-[11px] text-amber-100/85 leading-relaxed">
              Estás dentro de un visor embebido. Pulsa el menú superior y elige{' '}
              <strong>«Abrir en el navegador»</strong> para que aparezca el botón de instalar en
              pantalla de inicio.
            </p>
          </div>
        )}

        {/* OS Switcher: Android vs iPhone */}
        <div
          className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-[#06080D] border border-white/10"
          role="tablist"
          aria-label="Seleccionar sistema operativo para instalar la app"
        >
          <button
            type="button"
            role="tab"
            aria-selected={osTab === 'android'}
            onClick={() => setOsTab('android')}
            className={`min-h-[40px] rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
              osTab === 'android'
                ? 'bg-[#00A8FF] text-[#04070D]'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Smartphone className="w-4 h-4 shrink-0" />
            Android (Chrome)
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={osTab === 'ios'}
            onClick={() => setOsTab('ios')}
            className={`min-h-[40px] rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
              osTab === 'ios'
                ? 'bg-[#00A8FF] text-[#04070D]'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Smartphone className="w-4 h-4 shrink-0" />
            iPhone / iPad (Safari)
          </button>
        </div>

        {/* Platform-Specific Install Flow */}
        {osTab === 'android' ? (
          <div className="space-y-3.5">
            {isInstallable ? (
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => void handleNativeInstallClick()}
                  disabled={installing}
                  className="w-full min-h-[48px] px-4 rounded-xl bg-[#00A8FF] hover:bg-[#33C1FF] disabled:opacity-60 text-[#04070D] text-sm font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors"
                >
                  <Download className="w-4 h-4" />
                  {installing ? 'Abriendo instalador...' : 'Instalar App «Training» ahora'}
                </button>
                <p className="text-[11px] text-slate-400 text-center">
                  Se creará automáticamente el icono del pedestal con el nombre{' '}
                  <strong className="text-white">Training</strong> en tu escritorio.
                </p>
              </div>
            ) : (
              <div className="rounded-xl bg-[#06080D] border border-white/10 p-4 space-y-3 text-xs text-slate-200">
                <p className="font-semibold text-white">
                  Instala en Android en 2 pasos (10 segundos):
                </p>
                <ol className="space-y-2.5">
                  <li className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-md bg-[#00A8FF]/18 text-[#33C1FF] font-mono text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                      1
                    </span>
                    <span className="leading-relaxed">
                      En Google Chrome, pulsa el menú de 3 puntos{' '}
                      <MoreVertical className="w-3.5 h-3.5 inline text-[#33C1FF] -mt-0.5" /> arriba
                      a la derecha.
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-md bg-[#00A8FF]/18 text-[#33C1FF] font-mono text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                      2
                    </span>
                    <span className="leading-relaxed">
                      Pulsa <strong className="text-white">«Instalar aplicación»</strong> o{' '}
                      <strong className="text-white">«Añadir a pantalla de inicio»</strong> y
                      confirma. Aparecerá el icono del pedestal llamado{' '}
                      <strong className="text-[#33C1FF]">Training</strong>.
                    </span>
                  </li>
                </ol>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-xl bg-[#06080D] border border-white/10 p-4 space-y-3 text-xs text-slate-200">
            <p className="font-semibold text-white">
              Instala en iPhone / iPad con Safari en 3 pasos:
            </p>
            <ol className="space-y-2.5">
              <li className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-md bg-[#00A8FF]/18 text-[#33C1FF] font-mono text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                  1
                </span>
                <span className="leading-relaxed">
                  Abre esta dirección en <strong className="text-white">Safari</strong> (en iPhone
                  solo Safari permite crear el icono nativo).
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-md bg-[#00A8FF]/18 text-[#33C1FF] font-mono text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                  2
                </span>
                <span className="leading-relaxed">
                  Pulsa el botón <strong className="text-white">Compartir</strong>{' '}
                  <Share className="w-3.5 h-3.5 inline text-[#33C1FF] -mt-0.5" /> en la barra
                  inferior de Safari.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-md bg-[#00A8FF]/18 text-[#33C1FF] font-mono text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                  3
                </span>
                <span className="leading-relaxed">
                  Desliza hacia abajo, pulsa{' '}
                  <PlusSquare className="w-3.5 h-3.5 inline text-[#33C1FF] -mt-0.5" />{' '}
                  <strong className="text-white">«Añadir a pantalla de inicio»</strong> y pulsa{' '}
                  <strong className="text-white">«Añadir»</strong>. Verás el icono del pedestal{' '}
                  <strong className="text-[#33C1FF]">Training</strong>.
                </span>
              </li>
            </ol>
          </div>
        )}

        {installFeedback && (
          <div
            role="status"
            className="rounded-xl bg-emerald-500/15 border border-emerald-500/40 px-3.5 py-2.5 text-xs text-emerald-100 flex items-start gap-2"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <span>{installFeedback}</span>
          </div>
        )}

        {/* Footer actions */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-1 border-t border-white/8">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto min-h-[42px] px-4 rounded-xl bg-white/8 hover:bg-white/14 text-xs font-semibold text-slate-200 cursor-pointer"
          >
            Entrar a la app ahora
          </button>
          {directUrl && (
            <a
              href={directUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-[#33C1FF] hover:underline flex items-center gap-1"
            >
              <ExternalLink className="w-3 h-3" />
              Abrir enlace directo limpio
            </a>
          )}
        </div>
      </div>
    </div>
  );
};

interface PWAInstallButtonProps {
  compact?: boolean;
  onClick?: () => void;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ compact = false, onClick }) => {
  const { isInstalled, isInstallable, isIOS, isInAppBrowser, install } = usePWAInstall();
  const [modalOpen, setModalOpen] = useState(false);

  if (isInstalled) return null;

  const handleClick = () => {
    if (onClick) {
      onClick();
      return;
    }
    if (isInstallable) {
      void install();
      return;
    }
    setModalOpen(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className={`min-h-[38px] px-3 py-1.5 rounded-lg bg-[#00A8FF]/18 hover:bg-[#00A8FF]/28 border border-[#00A8FF]/55 text-xs font-bold text-[#33C1FF] hover:text-white flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-colors ${
          compact ? '' : 'px-3.5'
        }`}
      >
        <Download className="w-3.5 h-3.5 shrink-0" />
        <span>Instalar App</span>
      </button>

      <PWAInstallModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        isInstallable={isInstallable}
        initialOsTab={isIOS ? 'ios' : 'android'}
        isInAppBrowser={isInAppBrowser}
        onTriggerNativeInstall={install}
      />
    </>
  );
};

/**
 * Automatic entry install prompt + offline connectivity indicator.
 * Suppresses itself when already running in standalone mode or once dismissed in this session.
 */
export const PWAEntryManager: React.FC<{ forceOpen?: boolean; onForceClose?: () => void }> = ({
  forceOpen = false,
  onForceClose,
}) => {
  const {
    isInstallable,
    isInstalled,
    isIOS,
    isInAppBrowser,
    shouldShowEntryPrompt,
    dismissAutoPrompt,
    install,
  } = usePWAInstall();

  const isOnline = useOnlineStatus();
  const isOpen = forceOpen || shouldShowEntryPrompt;

  const handleClose = () => {
    dismissAutoPrompt();
    onForceClose?.();
  };

  return (
    <>
      {!isInstalled && (
        <PWAInstallModal
          isOpen={isOpen}
          onClose={handleClose}
          isInstallable={isInstallable}
          initialOsTab={isIOS ? 'ios' : 'android'}
          isInAppBrowser={isInAppBrowser}
          onTriggerNativeInstall={install}
        />
      )}

      {!isOnline && (
        <div
          role="status"
          className="fixed bottom-20 md:bottom-4 left-4 z-50 flex items-center gap-2 rounded-xl bg-amber-500 px-3.5 py-2 text-xs font-bold text-[#04070D] shadow-lg"
        >
          <WifiOff className="w-4 h-4 shrink-0" />
          <span>Modo sin conexión — Usando datos guardados</span>
        </div>
      )}
    </>
  );
};
