import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  DoorOpen,
  Nfc,
  ShieldAlert,
  ShieldCheck,
  Wifi,
  X,
} from 'lucide-react';
import type { FeeStatus, MemberProfile } from '../types/gym';
import { evaluateTurnstileAccess } from '../utils/gymLogic';
import { buildMemberQrPayload, sanitizeMemberCode } from '../utils/qrPass';
import { BrandLogo } from './BrandLogo';
import { RealQrCode } from './RealQrCode';

interface AccessPassModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: MemberProfile;
  onCheckIn: () => void;
  onSetFeeStatus: (status: FeeStatus) => void;
  isCloudSynced?: boolean;
  canSimulateFee?: boolean;
}

export const AccessPassModal: React.FC<AccessPassModalProps> = ({
  isOpen,
  onClose,
  profile,
  onCheckIn,
  onSetFeeStatus,
  isCloudSynced = false,
  canSimulateFee = true,
}) => {
  const [alarmTriggered, setAlarmTriggered] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setAlarmTriggered(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (profile.feeStatus === 'al-dia') {
      setAlarmTriggered(false);
    }
  }, [profile.feeStatus]);

  if (!isOpen) return null;

  const memberCode = sanitizeMemberCode(profile.founderNumber);
  const memberUid = profile.memberId || 'current-user';
  const qrPayload = buildMemberQrPayload(memberUid, memberCode);
  const isOverdue = profile.feeStatus === 'pendiente';
  const accessEvaluation = evaluateTurnstileAccess(profile.feeStatus);

  const handleScanTurnstile = () => {
    if (!accessEvaluation.allowed) {
      setAlarmTriggered(true);
      return;
    }
    setAlarmTriggered(false);
    onCheckIn();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="access-pass-title"
    >
      <div
        className={`w-full max-w-md rounded-2xl bg-[#0D121B] overflow-hidden border-2 transition-colors ${
          alarmTriggered || isOverdue ? 'border-red-500' : 'border-white/12'
        }`}
      >
        {/* Top bar */}
        <div
          className={`flex items-center justify-between px-5 py-4 border-b ${
            alarmTriggered || isOverdue
              ? 'bg-red-950/80 border-red-500/40'
              : 'border-white/8'
          }`}
        >
          <div className="flex items-center gap-3">
            <BrandLogo variant="mark" size={44} />
            <div>
              <h2
                id="access-pass-title"
                className="text-xl font-bold tracking-[0.01em] text-white leading-none"
              >
                Control de Acceso
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                FitnessDreams Benidorm · Pase QR Escaneable
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar pase de acceso"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-white/6 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Member identity with registered photo */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <img
                src={profile.avatarUrl}
                alt={`Foto de ${profile.name}`}
                referrerPolicy="no-referrer"
                className={`w-11 h-11 rounded-full object-cover border-2 shrink-0 ${
                  isOverdue ? 'border-red-500' : 'border-[#00A8FF]'
                }`}
              />
              <div className="min-w-0">
                <p className="font-semibold text-white text-sm truncate">{profile.name}</p>
                <p className="text-xs text-[#33C1FF] font-mono tabular-nums">
                  {profile.tier} · {memberCode}
                </p>
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="text-[11px] text-slate-400">Estado cuota</p>
              <p
                className={`text-xs font-bold ${
                  isOverdue ? 'text-red-400' : 'text-emerald-400'
                }`}
              >
                {isOverdue ? 'Pendiente de pago' : 'Al día'}
              </p>
            </div>
          </div>

          {/* Cloud sync badge OR Demo fee toggle */}
          {isCloudSynced && !canSimulateFee ? (
            <div className="rounded-xl bg-[#06080D] border border-white/10 px-3 py-2 flex items-center justify-between gap-2 text-[11px]">
              <span className="text-slate-300 flex items-center gap-1.5">
                <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                Cuota validada en directo con recepción
              </span>
              <span className="font-mono text-[#33C1FF]">{memberCode}</span>
            </div>
          ) : (
            <div className="rounded-xl bg-[#06080D] border border-white/10 p-2 flex items-center justify-between gap-2">
              <span className="text-[11px] text-slate-400 pl-2">Simular estado cuota:</span>
              <div className="inline-flex gap-1">
                <button
                  type="button"
                  onClick={() => {
                    onSetFeeStatus('al-dia');
                    setAlarmTriggered(false);
                  }}
                  aria-pressed={!isOverdue}
                  className={`min-h-[34px] px-2.5 rounded-lg text-[11px] font-semibold cursor-pointer transition-colors ${
                    !isOverdue
                      ? 'bg-[#00A8FF] text-[#04070D]'
                      : 'bg-white/5 text-slate-400 hover:text-white'
                  }`}
                >
                  Al día
                </button>
                <button
                  type="button"
                  onClick={() => onSetFeeStatus('pendiente')}
                  aria-pressed={isOverdue}
                  className={`min-h-[34px] px-2.5 rounded-lg text-[11px] font-semibold cursor-pointer transition-colors ${
                    isOverdue
                      ? 'bg-red-600 text-white'
                      : 'bg-white/5 text-slate-400 hover:text-white'
                  }`}
                >
                  Cuota impagada
                </button>
              </div>
            </div>
          )}

          {/* RED ALARM BANNER WHEN TURNSTILE BLOCKS OVERDUE MEMBER */}
          {(alarmTriggered || isOverdue) && (
            <div
              role="alert"
              className="rounded-xl bg-red-600/20 border-2 border-red-500 p-4 space-y-2"
            >
              <div className="flex items-center gap-2 text-red-400 font-bold text-sm">
                <ShieldAlert className="w-5 h-5 shrink-0" />
                <span>{accessEvaluation.title}</span>
              </div>
              <p className="text-xs text-red-100 leading-relaxed">
                {accessEvaluation.message}
              </p>
              {canSimulateFee && (
                <button
                  type="button"
                  onClick={() => {
                    onSetFeeStatus('al-dia');
                    setAlarmTriggered(false);
                  }}
                  className="w-full min-h-[40px] mt-1 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition-colors cursor-pointer"
                >
                  Ponerme al día en mostrador de información
                </button>
              )}
            </div>
          )}

          {/* Real ISO-Standard Scannable QR Container */}
          <div
            className={`rounded-2xl bg-white p-4 flex flex-col items-center border-4 transition-colors ${
              alarmTriggered || isOverdue ? 'border-red-500' : 'border-emerald-400'
            }`}
          >
            <RealQrCode
              value={qrPayload}
              size={200}
              fgColor={alarmTriggered || isOverdue ? '#991B1B' : '#06080D'}
              label={`Código QR de acceso ${memberCode}`}
            />

            <div className="mt-2.5 flex items-center gap-2 text-xs text-slate-700 font-mono tabular-nums">
              <span className="font-bold">{memberCode}</span>
              <span aria-hidden="true">·</span>
              <span>Listo para el móvil lector</span>
            </div>
          </div>

          {/* NFC & Hours */}
          <div className="flex items-center justify-between text-xs text-slate-400 px-1">
            <span className="flex items-center gap-1.5">
              <Nfc className="w-4 h-4 text-[#00A8FF]" />
              Muestra este QR al lector del torno
            </span>
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-[#00A8FF]" />
              Aforo: 42 / 140
            </span>
          </div>

          {/* Turnstile Scan Action */}
          {profile.checkedInToday && !isOverdue ? (
            <div className="rounded-xl bg-[#00A8FF]/12 border border-[#00A8FF]/30 px-4 py-3.5 flex items-center gap-2.5">
              <Check className="w-5 h-5 text-[#33C1FF] shrink-0" />
              <div>
                <p className="text-sm font-semibold text-white">Entrada validada en torno</p>
                <p className="text-xs text-slate-300">
                  Hoy a las {profile.lastCheckInTime} · Racha activa: {profile.streakDays} días
                </p>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleScanTurnstile}
              className={`w-full min-h-[48px] rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                isOverdue
                  ? 'bg-red-600 hover:bg-red-500 text-white'
                  : 'bg-[#00A8FF] hover:bg-[#33C1FF] text-[#04070D]'
              }`}
            >
              {isOverdue ? (
                <>
                  <AlertTriangle className="w-4 h-4" />
                  Pasar QR por el lector (probar alarma)
                </>
              ) : (
                <>
                  <DoorOpen className="w-4 h-4" />
                  Pasar QR por el lector y sumar hábito
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
