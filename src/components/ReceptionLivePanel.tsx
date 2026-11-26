import React, { useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  AlertTriangle,
  Camera,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  FileText,
  KeyRound,
  LogIn,
  LogOut,
  Mail,
  PlayCircle,
  Plus,
  QrCode,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Trash2,
  UserPlus,
  Wifi,
  X,
} from 'lucide-react';
import { BOOTSTRAPPED_OWNER_EMAIL } from '../firebase';
import type { CoachProfile, FeeStatus } from '../types/gym';
import { buildTurnstileScannerUrl, resolveDirectPublicUrl } from '../utils/pwaUtils';
import { buildMemberQrPayload } from '../utils/qrPass';
import {
  getStaffRoleLabel,
  type AuthorizedStaffRecord,
  type AuthorizedStaffRole,
} from '../utils/staffAuth';
import type { LiveAccessLog, LiveGymMember } from '../services/liveGymService';
import type { PresentationKitTab } from './PresentationKitModal';
import { RealQrCode } from './RealQrCode';

interface ReceptionLivePanelProps {
  activeCoach: CoachProfile;
  authUser: User | null;
  isLiveAdmin: boolean;
  isSigningIn: boolean;
  primaryGymEmail: string;
  authorizedStaff: AuthorizedStaffRecord[];
  onAddAuthorizedStaff: (input: {
    email: string;
    label: string;
    role: AuthorizedStaffRole;
  }) => Promise<{ savedToCloud: boolean; record: AuthorizedStaffRecord }>;
  onRemoveAuthorizedStaff: (staffId: string) => Promise<void>;
  onSignInGoogle: () => Promise<void>;
  onSignOutGoogle: () => Promise<void>;
  liveMembers: LiveGymMember[];
  localDemoMembers: LiveGymMember[];
  liveAccessLogs: LiveAccessLog[];
  onToggleMemberFee: (memberId: string, nextStatus: FeeStatus) => Promise<void>;
  onCreateWalkInMember: (input: {
    name: string;
    phone: string;
    email?: string;
    tier: 'Socio Fundador' | 'Socio Club';
    feeStatus: FeeStatus;
    assignedCoach: string;
  }) => Promise<{ savedToCloud: boolean; member: LiveGymMember }>;
  onOpenTurnstileScanner: () => void;
  onOpenPresentationKit?: (tab: PresentationKitTab) => void;
}

const PILOT_STEPS = [
  {
    id: 'step-1',
    title: '1. Inicia sesión con Google en el ordenador de recepción',
    detail: `Usa tu cuenta (${BOOTSTRAPPED_OWNER_EMAIL}) para activar el control real de socios, cuotas y entradas en la nube.`,
  },
  {
    id: 'step-2',
    title: '2. Convierte un móvil secundario en Lector QR del Torno',
    detail:
      'Escanea el QR de "Abrir Lector QR" de abajo con el móvil que dejarás en recepción, inicia sesión con la misma cuenta de Google y activa la cámara frontal.',
  },
  {
    id: 'step-3',
    title: '3. Pasa el enlace de la app a tus primeros clientes de prueba',
    detail:
      'Cada cliente entra con Google desde su móvil, rellena su perfil con foto y obtiene su Pase QR personal y real en 30 segundos.',
  },
  {
    id: 'step-4',
    title: '4. Prueba la luz VERDE (Cuota al día)',
    detail:
      'Acerca el Pase QR del móvil del cliente al móvil lector -> debe sonar el pitido verde, mostrar "ACCESO PERMITIDO" y aparecer la entrada aquí al instante.',
  },
  {
    id: 'step-5',
    title: '5. Prueba la alarma ROJA (Cuota pendiente)',
    detail:
      'Pulsa "Marcar pendiente" en ese cliente desde este ordenador -> vuelve a pasar su QR por el móvil lector -> debe saltar la alarma roja y bloquear el acceso.',
  },
  {
    id: 'step-6',
    title: '6. Valida rutinas, chat/audios y recoge feedback real',
    detail:
      'Envía una rutina desde "Enviar Rutina" y un mensaje/audio desde "Mensajes y Audios", y apunta qué les encanta o qué quieren mejorar antes de abrir.',
  },
];

export const ReceptionLivePanel: React.FC<ReceptionLivePanelProps> = ({
  activeCoach,
  authUser,
  isLiveAdmin,
  isSigningIn,
  primaryGymEmail,
  authorizedStaff,
  onAddAuthorizedStaff,
  onRemoveAuthorizedStaff,
  onSignInGoogle,
  onSignOutGoogle,
  liveMembers,
  localDemoMembers,
  liveAccessLogs,
  onToggleMemberFee,
  onCreateWalkInMember,
  onOpenTurnstileScanner,
  onOpenPresentationKit,
}) => {
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newTier, setNewTier] = useState<'Socio Fundador' | 'Socio Club'>('Socio Fundador');
  const [newFeeStatus, setNewFeeStatus] = useState<FeeStatus>('al-dia');
  const [creating, setCreating] = useState(false);
  const [formNotice, setFormNotice] = useState<{ tone: 'ok' | 'warn' | 'err'; text: string } | null>(
    null
  );
  const [copiedKey, setCopiedKey] = useState<'scanner' | 'client' | null>(null);
  const [previewQrMember, setPreviewQrMember] = useState<LiveGymMember | null>(null);
  const [checkedSteps, setCheckedSteps] = useState<Record<string, boolean>>({});
  const [busyMemberId, setBusyMemberId] = useState<string | null>(null);

  // Authorized Gym & Coach Google Account Manager state
  const [staffEmailInput, setStaffEmailInput] = useState('');
  const [staffLabelInput, setStaffLabelInput] = useState('');
  const [staffRoleInput, setStaffRoleInput] = useState<AuthorizedStaffRole>('gym-main');
  const [savingStaff, setSavingStaff] = useState(false);
  const [staffNotice, setStaffNotice] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const displayedMembers = isLiveAdmin ? liveMembers : localDemoMembers;

  const clientAppUrl = useMemo(() => {
    if (typeof window === 'undefined') return resolveDirectPublicUrl();
    return resolveDirectPublicUrl(window.location.origin);
  }, []);

  const scannerUrl = useMemo(() => buildTurnstileScannerUrl(clientAppUrl), [clientAppUrl]);

  const paidCount = displayedMembers.filter((m) => m.feeStatus === 'al-dia').length;
  const overdueCount = displayedMembers.filter((m) => m.feeStatus === 'pendiente').length;
  const completedStepsCount = Object.values(checkedSteps).filter(Boolean).length;

  const handleCopy = async (text: string, key: 'scanner' | 'client') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey(null), 2200);
    } catch {
      // Fallback ignored
    }
  };

  const handleAddWalkIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) {
      setFormNotice({
        tone: 'err',
        text: 'Escribe al menos el nombre del socio para darlo de alta.',
      });
      return;
    }
    setCreating(true);
    setFormNotice(null);
    try {
      const createdName = newName.trim();
      const result = await onCreateWalkInMember({
        name: createdName,
        phone: newPhone.trim() || '600 000 000',
        email: newEmail.trim(),
        tier: newTier,
        feeStatus: newFeeStatus,
        assignedCoach: activeCoach.name,
      });
      setFormNotice(
        result.savedToCloud
          ? {
              tone: 'ok',
              text: `Socio «${createdName}» (${result.member.memberCode}) guardado EN LA NUBE (${
                newFeeStatus === 'al-dia' ? 'Al día' : 'Cuota pendiente'
              }). Ya aparece automáticamente en la página de Coach Javi y en todos los dispositivos.`,
            }
          : {
              tone: 'warn',
              text: `Socio «${createdName}» guardado en este ordenador (Modo local). Conecta Google arriba y se subirá automáticamente a la nube para Coach Javi.`,
            }
      );
      setNewName('');
      setNewPhone('');
      setNewEmail('');
    } catch (err) {
      setFormNotice({
        tone: 'err',
        text:
          err instanceof Error
            ? err.message
            : 'No se pudo guardar el socio en la nube. Revisa tu conexión e inténtalo de nuevo.',
      });
    } finally {
      setCreating(false);
    }
  };

  const handleAddStaffAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setStaffNotice(null);
    if (!staffEmailInput.trim()) {
      setStaffNotice({
        tone: 'err',
        text: 'Escribe el correo de Google que quieres autorizar (ej. fitnessdream@gmail.com).',
      });
      return;
    }
    setSavingStaff(true);
    try {
      const res = await onAddAuthorizedStaff({
        email: staffEmailInput.trim(),
        label:
          staffLabelInput.trim() ||
          (staffRoleInput === 'gym-main'
            ? 'Correo oficial Gimnasio FitnessDreams'
            : staffRoleInput === 'coach'
              ? 'Coach FitnessDreams'
              : 'Cuenta autorizada'),
        role: staffRoleInput,
      });
      setStaffNotice({
        tone: 'ok',
        text: res.savedToCloud
          ? `Cuenta «${res.record.email}» autorizada EN LA NUBE. Desde ahora puede iniciar sesión con Google en el PC de recepción y en el Portal Coaches con acceso total.`
          : `Cuenta «${res.record.email}» preparada en modo local. Inicia sesión primero con ${BOOTSTRAPPED_OWNER_EMAIL} para activarla en la nube para todos los dispositivos.`,
      });
      setStaffEmailInput('');
      setStaffLabelInput('');
    } catch (err) {
      setStaffNotice({
        tone: 'err',
        text: err instanceof Error ? err.message : 'No se pudo guardar el correo.',
      });
    } finally {
      setSavingStaff(false);
    }
  };

  const handleToggleFee = async (member: LiveGymMember) => {
    const next: FeeStatus = member.feeStatus === 'al-dia' ? 'pendiente' : 'al-dia';
    setBusyMemberId(member.id);
    try {
      await onToggleMemberFee(member.id, next);
    } finally {
      setBusyMemberId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Live Cloud Sync Status Bar (Gym PC <-> Spare Scanner Phone <-> Real Client Phones) */}
      <div
        className={`rounded-2xl p-5 border flex flex-col lg:flex-row lg:items-center justify-between gap-4 ${
          isLiveAdmin
            ? 'bg-emerald-950/30 border-emerald-500/45'
            : authUser
              ? 'bg-amber-950/25 border-amber-500/45'
              : 'bg-[#0D121B] border-[#00A8FF]/45'
        }`}
      >
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Wifi
              className={`w-4 h-4 ${
                isLiveAdmin
                  ? 'text-emerald-400'
                  : authUser
                    ? 'text-amber-400'
                    : 'text-[#33C1FF]'
              }`}
            />
            <span
              className={`text-xs font-bold uppercase tracking-wider ${
                isLiveAdmin
                  ? 'text-emerald-300'
                  : authUser
                    ? 'text-amber-300'
                    : 'text-[#33C1FF]'
              }`}
            >
              {isLiveAdmin
                ? `CONECTADO EN LA NUBE · ${liveMembers.length} socios reales sincronizados`
                : authUser
                  ? 'CONECTADO COMO SOCIO (Sin permisos de dirección / coach)'
                  : 'SIN CONECTAR A GOOGLE · Modo local en este ordenador'}
            </span>
          </div>
          <p className="text-sm text-slate-200 leading-relaxed">
            {isLiveAdmin ? (
              <>
                Sesión activa con <strong className="text-white">{authUser?.email}</strong>. Todo
                alta de cliente, rutina de Coach Javi o cambio de cuota se sincroniza al instante en
                todos los dispositivos.
              </>
            ) : authUser ? (
              <>
                Estás conectado como <strong className="text-white">{authUser.email}</strong> (cuenta
                de socio). Para gestionar el gimnasio o ver los socios reales en Javi, cambia a{' '}
                <span className="font-mono text-[#33C1FF]">{primaryGymEmail}</span> o añade tu correo
                abajo en «Cuenta Google del Gimnasio».
              </>
            ) : (
              <>
                Inicia sesión con la cuenta Google autorizada del gimnasio (
                <span className="font-mono text-[#33C1FF]">{primaryGymEmail}</span>) para guardar
                socios en la nube y verlos desde el Portal Coaches y el móvil lector.
              </>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {authUser ? (
            <button
              type="button"
              onClick={() => void onSignOutGoogle()}
              className="min-h-[42px] px-3.5 rounded-xl bg-[#131B28] hover:bg-white/10 border border-white/15 text-xs font-semibold text-slate-200 flex items-center gap-1.5 cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              Cambiar cuenta
            </button>
          ) : (
            <button
              type="button"
              disabled={isSigningIn}
              onClick={() => void onSignInGoogle()}
              className="min-h-[44px] px-4 rounded-xl bg-[#00A8FF] hover:bg-[#33C1FF] disabled:opacity-60 text-[#04070D] text-xs font-bold flex items-center gap-2 cursor-pointer"
            >
              <LogIn className="w-4 h-4" />
              {isSigningIn ? 'Conectando con Google...' : 'Conectar Google del Gimnasio'}
            </button>
          )}
          <button
            type="button"
            onClick={onOpenTurnstileScanner}
            className="min-h-[44px] px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-[#04070D] text-xs font-bold flex items-center gap-2 cursor-pointer"
          >
            <Camera className="w-4 h-4" />
            Abrir Lector QR Torno
          </button>
        </div>
      </div>

      {/* 1A. Authorized Gym & Coach Google Emails Manager (Switch from personal email to FitnessDreams gym email anytime) */}
      <div className="rounded-2xl bg-[#0D121B] border border-white/10 p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="space-y-0.5">
            <p className="text-xs font-bold text-[#33C1FF] flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5" />
              Cuenta Google del Gimnasio y Coaches Autorizados
            </p>
            <h3 className="text-base font-bold text-white">
              Cambia al correo oficial de FitnessDreams o añade a tus coaches cuando quieras
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Ahora mismo está autorizada tu cuenta{' '}
              <span className="font-mono text-slate-200">{BOOTSTRAPPED_OWNER_EMAIL}</span>. Cuando
              tengas el correo oficial del gimnasio (ej.{' '}
              <span className="font-mono text-[#33C1FF]">fitnessdream...@gmail.com</span>) o quieras
              que Javi y Joel entren con su Gmail propio, añádelo aquí abajo.
            </p>
          </div>
          <span className="text-xs font-mono text-emerald-300 shrink-0">
            {authorizedStaff.length} {authorizedStaff.length === 1 ? 'cuenta activa' : 'cuentas activas'}
          </span>
        </div>

        <form
          onSubmit={(e) => void handleAddStaffAccount(e)}
          className="rounded-xl bg-[#06080D] border border-white/10 p-3.5 space-y-3"
        >
          <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5">
            <div className="md:col-span-5 relative">
              <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="email"
                value={staffEmailInput}
                onChange={(e) => setStaffEmailInput(e.target.value)}
                placeholder="Nuevo correo Google (ej. fitnessdream@gmail.com)"
                aria-label="Correo Google oficial del gimnasio o coach"
                className="w-full min-h-[40px] rounded-lg bg-[#0D121B] border border-white/12 pl-9 pr-3 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-[#00A8FF]"
              />
            </div>
            <input
              type="text"
              value={staffLabelInput}
              onChange={(e) => setStaffLabelInput(e.target.value)}
              placeholder="Etiqueta (ej. Gimnasio FitnessDreams o Coach Javi)"
              aria-label="Nombre o etiqueta de la cuenta autorizada"
              className="md:col-span-3 min-h-[40px] rounded-lg bg-[#0D121B] border border-white/12 px-3 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-[#00A8FF]"
            />
            <select
              value={staffRoleInput}
              onChange={(e) => setStaffRoleInput(e.target.value as AuthorizedStaffRole)}
              aria-label="Rol de la cuenta autorizada"
              className="md:col-span-2 min-h-[40px] rounded-lg bg-[#0D121B] border border-white/12 px-2.5 text-xs text-white focus:outline-none focus:border-[#00A8FF]"
            >
              <option value="gym-main">Correo oficial gimnasio</option>
              <option value="coach">Coach / Entrenador</option>
              <option value="owner">Dirección</option>
              <option value="scanner">Lector QR Torno</option>
            </select>
            <button
              type="submit"
              disabled={savingStaff}
              className="md:col-span-2 min-h-[40px] px-3 rounded-lg bg-[#00A8FF] hover:bg-[#33C1FF] disabled:opacity-50 text-[#04070D] text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              {savingStaff ? 'Guardando...' : 'Autorizar'}
            </button>
          </div>
          {staffNotice && (
            <p
              role="status"
              className={`text-xs font-medium ${
                staffNotice.tone === 'ok' ? 'text-emerald-300' : 'text-red-300'
              }`}
            >
              {staffNotice.text}
            </p>
          )}
        </form>

        <div className="divide-y divide-white/8 border-t border-white/8">
          {authorizedStaff.map((staff) => (
            <div
              key={staff.staffId}
              className="py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs"
            >
              <div className="min-w-0">
                <p className="font-semibold text-white flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[#33C1FF]">{staff.email}</span>
                  <span className="text-[11px] text-slate-300">· {getStaffRoleLabel(staff.role)}</span>
                  {staff.isCloudSynced ? (
                    <span className="text-[11px] font-semibold text-emerald-400">· Activa en nube</span>
                  ) : (
                    <span className="text-[11px] font-semibold text-amber-300">
                      · Pendiente de conectar Google
                    </span>
                  )}
                </p>
                <p className="text-[11px] text-slate-400">{staff.label}</p>
              </div>
              {!staff.isBootstrappedOwner ? (
                <button
                  type="button"
                  onClick={() => void onRemoveAuthorizedStaff(staff.staffId)}
                  aria-label={`Quitar permiso a ${staff.email}`}
                  className="min-h-[34px] px-2.5 rounded-lg bg-red-600/15 hover:bg-red-600/30 border border-red-500/35 text-red-300 text-xs font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Quitar
                </button>
              ) : (
                <span className="text-[11px] text-slate-500 font-mono">Cuenta respaldo</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 1B. Opening-Day Launch Kit Bar: A3 Pedestal Poster + Setup PDF + Narrated Setup Video */}
      {onOpenPresentationKit && (
        <div className="rounded-2xl bg-[#0D121B] border border-[#00A8FF]/35 p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <p className="text-xs font-bold text-[#33C1FF]">
              Kit de Apertura Hoy · Cartel A3 + Guía PC + Vídeo Tutorial con Audio
            </p>
            <p className="text-xs text-slate-300 leading-relaxed">
              Imprime el Cartel A3 de la Mancuerna en el Pedestal con el QR limpio (sin pantalla previa
              de AI Studio) y sigue la guía PDF o el vídeo narrado para conectar recepción y tu móvil lector.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onOpenPresentationKit('poster')}
              className="min-h-[40px] px-3.5 rounded-xl bg-[#00A8FF] hover:bg-[#33C1FF] text-[#04070D] text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <QrCode className="w-4 h-4 shrink-0" />
              Cartel A3 QR
            </button>
            <button
              type="button"
              onClick={() => onOpenPresentationKit('setup-pdf')}
              className="min-h-[40px] px-3.5 rounded-xl bg-[#131B28] hover:border-[#00A8FF] border border-white/15 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <FileText className="w-4 h-4 text-[#33C1FF] shrink-0" />
              PDF Conexión PC
            </button>
            <button
              type="button"
              onClick={() => onOpenPresentationKit('setup-video')}
              className="min-h-[40px] px-3.5 rounded-xl bg-[#131B28] hover:border-[#00A8FF] border border-white/15 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <PlayCircle className="w-4 h-4 text-[#00A8FF] shrink-0" />
              Vídeo Audio PC
            </button>
          </div>
        </div>
      )}

      {/* 2. Two-Column Setup: Spare Phone Turnstile Scanner Launch + Real-Time Member Control */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 7 cols: Real Members Directory + 1-Click Fee Blocker + Walk-In Quick Add */}
        <div className="lg:col-span-7 space-y-5">
          <div className="rounded-2xl bg-[#0D121B] border border-white/10 p-5 sm:p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-bold text-white tracking-[0.01em]">
                  Control de Cuotas y Socios en Vivo
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Cambia cualquier socio entre <strong className="text-emerald-400">Al día</strong> y{' '}
                  <strong className="text-red-400">Cuota pendiente</strong> en 1 clic: el torno QR
                  reacciona al instante.
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs font-mono tabular-nums">
                <span className="text-emerald-400 font-bold">{paidCount} al día</span>
                <span className="text-slate-600">·</span>
                <span className="text-red-400 font-bold">{overdueCount} pendientes</span>
              </div>
            </div>

            {/* Quick Walk-In Test Client Form */}
            <form
              onSubmit={(e) => void handleAddWalkIn(e)}
              className="rounded-xl bg-[#06080D] border border-white/10 p-4 space-y-3"
            >
              <p className="text-xs font-semibold text-[#33C1FF] flex items-center gap-1.5">
                <UserPlus className="w-3.5 h-3.5" />
                Alta rápida desde recepción (añadir cliente de prueba ahora)
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Nombre del cliente (ej. Ana Ruiz)"
                  aria-label="Nombre del cliente de prueba"
                  className="min-h-[40px] rounded-lg bg-[#0D121B] border border-white/12 px-3 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-[#00A8FF]"
                />
                <input
                  type="tel"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="Teléfono (ej. 611 223 344)"
                  aria-label="Teléfono del cliente"
                  className="min-h-[40px] rounded-lg bg-[#0D121B] border border-white/12 px-3 text-xs font-mono text-white placeholder:text-slate-500 focus:outline-none focus:border-[#00A8FF]"
                />
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="Email (opcional)"
                  aria-label="Email del cliente"
                  className="min-h-[40px] rounded-lg bg-[#0D121B] border border-white/12 px-3 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-[#00A8FF]"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={newTier}
                    onChange={(e) =>
                      setNewTier(e.target.value as 'Socio Fundador' | 'Socio Club')
                    }
                    aria-label="Tarifa del cliente"
                    className="min-h-[38px] rounded-lg bg-[#0D121B] border border-white/12 px-2.5 text-xs text-white focus:outline-none focus:border-[#00A8FF]"
                  >
                    <option value="Socio Fundador">Socio Fundador (34,90 €)</option>
                    <option value="Socio Club">Socio Club (46,90 €)</option>
                  </select>

                  <select
                    value={newFeeStatus}
                    onChange={(e) => setNewFeeStatus(e.target.value as FeeStatus)}
                    aria-label="Estado inicial de cuota"
                    className="min-h-[38px] rounded-lg bg-[#0D121B] border border-white/12 px-2.5 text-xs text-white focus:outline-none focus:border-[#00A8FF]"
                  >
                    <option value="al-dia">Cuota al día (Luz verde)</option>
                    <option value="pendiente">Cuota pendiente (Alarma roja)</option>
                  </select>
                </div>

                <button
                  type="submit"
                  disabled={creating}
                  className="min-h-[38px] px-3.5 rounded-lg bg-[#00A8FF] hover:bg-[#33C1FF] disabled:opacity-50 text-[#04070D] text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {creating ? 'Guardando...' : 'Dar de alta'}
                </button>
              </div>

              {formNotice && (
                <p
                  role={formNotice.tone === 'err' ? 'alert' : 'status'}
                  className={`text-xs font-medium ${
                    formNotice.tone === 'err'
                      ? 'text-rose-300'
                      : formNotice.tone === 'ok'
                        ? 'text-emerald-300'
                        : 'text-amber-300'
                  }`}
                >
                  {formNotice.text}
                </p>
              )}
            </form>

            {/* Member List with 1-Click Fee Toggle & Scannable QR Preview */}
            {displayedMembers.length === 0 ? (
              <div className="rounded-xl bg-[#06080D] border border-white/8 p-6 text-center space-y-2">
                <p className="text-sm font-semibold text-white">
                  Aún no hay socios reales registrados en la nube
                </p>
                <p className="text-xs text-slate-400">
                  Usa el formulario de arriba para dar de alta tu primer cliente de prueba, o pasa
                  el enlace de la app a un amigo para que entre con Google desde su móvil.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-white/8 border-t border-white/8">
                {displayedMembers.map((member) => {
                  const isOverdue = member.feeStatus === 'pendiente';
                  return (
                    <div
                      key={member.id}
                      className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-white">{member.name}</p>
                          <span className="text-xs font-mono text-[#33C1FF]">
                            {member.memberCode}
                          </span>
                          <span
                            className={`text-[11px] font-bold ${
                              isOverdue ? 'text-red-400' : 'text-emerald-400'
                            }`}
                          >
                            · {isOverdue ? 'CUOTA PENDIENTE' : 'AL DÍA'}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400">
                          {member.tier} ({member.monthlyFee.toFixed(2)} €/mes) · Entradas:{' '}
                          <span className="font-mono text-slate-200">{member.totalCheckIns}</span> ·{' '}
                          {member.lastCheckInLabel}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => setPreviewQrMember(member)}
                          className="min-h-[38px] px-3 rounded-lg bg-[#131B28] hover:border-[#00A8FF] border border-white/12 text-xs font-semibold text-slate-200 flex items-center gap-1.5 cursor-pointer"
                        >
                          <QrCode className="w-3.5 h-3.5 text-[#33C1FF]" />
                          Ver QR
                        </button>
                        <button
                          type="button"
                          disabled={busyMemberId === member.id}
                          onClick={() => void handleToggleFee(member)}
                          aria-label={`Cambiar estado de cuota de ${member.name}`}
                          className={`min-h-[38px] px-3 rounded-lg text-xs font-bold cursor-pointer transition-colors whitespace-nowrap ${
                            isOverdue
                              ? 'bg-emerald-500 hover:bg-emerald-400 text-[#04070D]'
                              : 'bg-red-600/20 hover:bg-red-600/35 border border-red-500/45 text-red-300'
                          }`}
                        >
                          {isOverdue ? 'Marcar al día' : 'Marcar pendiente'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Live Turnstile Access Log Feed */}
          <div className="rounded-2xl bg-[#0D121B] border border-white/10 p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-[#00A8FF]" />
                  Registro del Torno en Directo
                </h3>
                <p className="text-xs text-slate-400">
                  Cada escaneo desde el móvil lector aparece aquí al segundo
                </p>
              </div>
              <span className="text-xs font-mono text-slate-400">
                {liveAccessLogs.length} registros
              </span>
            </div>

            {liveAccessLogs.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 border-t border-white/8">
                Esperando el primer escaneo QR. Pulsa{' '}
                <strong className="text-white">Ver QR</strong> en un socio arriba y apúntale con el
                móvil lector para ver la entrada en vivo aquí.
              </p>
            ) : (
              <div className="divide-y divide-white/8 border-t border-white/8 max-h-72 overflow-y-auto">
                {liveAccessLogs.map((log) => (
                  <div
                    key={log.id}
                    className="py-3 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {log.allowed ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      ) : (
                        <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="font-semibold text-white truncate">
                          {log.memberName}{' '}
                          <span className="font-mono text-slate-400">· {log.memberCode}</span>
                        </p>
                        <p className="text-[11px] text-slate-400 truncate">
                          {log.reason} · {log.scannerLabel}
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span
                        className={`font-bold ${
                          log.allowed ? 'text-emerald-400' : 'text-red-400'
                        }`}
                      >
                        {log.allowed ? 'ENTRA' : 'BLOQUEADO'}
                      </span>
                      <p className="text-[11px] font-mono text-slate-500">{log.createdAtLabel}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right 5 cols: Spare Phone QR Launcher + Step-by-Step PC Pilot Checklist */}
        <div className="lg:col-span-5 space-y-5">
          {/* Spare Mobile Phone as Turnstile QR Scanner Card */}
          <div className="rounded-2xl bg-[#0D121B] border border-[#00A8FF]/35 p-5 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#00A8FF]/15 border border-[#00A8FF]/40 flex items-center justify-center shrink-0">
                <Smartphone className="w-5 h-5 text-[#33C1FF]" />
              </div>
              <div>
                <p className="text-xs font-semibold text-[#33C1FF]">
                  Sin lector físico todavía · Solución inmediata
                </p>
                <h3 className="text-lg font-bold text-white">
                  Usar un móvil como Lector QR
                </h3>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Escanea este código QR con la cámara del móvil secundario que pondrás en la puerta:
              abrirá directamente el <strong className="text-white">Modo Lector QR del Torno</strong>{' '}
              con cámara frontal/trasera y pitidos verde/rojo.
            </p>

            <div className="rounded-xl bg-white p-3.5 flex flex-col items-center">
              <RealQrCode
                value={scannerUrl}
                size={156}
                label="Código QR para abrir el Modo Lector QR del Torno en un móvil secundario"
              />
              <p className="mt-2 text-[11px] font-mono text-slate-700 break-all text-center">
                {scannerUrl}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => void handleCopy(scannerUrl, 'scanner')}
                className="min-h-[40px] px-3 rounded-xl bg-[#131B28] hover:border-[#00A8FF] border border-white/12 text-xs font-semibold text-white flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {copiedKey === 'scanner' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    Enlace copiado
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-[#33C1FF]" />
                    Copiar enlace Lector
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => void handleCopy(clientAppUrl, 'client')}
                className="min-h-[40px] px-3 rounded-xl bg-[#131B28] hover:border-[#00A8FF] border border-white/12 text-xs font-semibold text-white flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {copiedKey === 'client' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    Enlace copiado
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-[#33C1FF]" />
                    Enlace para Socios
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Interactive 6-Step Pilot Test Checklist for the Gym PC */}
          <div className="rounded-2xl bg-[#0D121B] border border-white/10 p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ClipboardCheck className="w-5 h-5 text-[#00A8FF]" />
                <h3 className="text-base font-bold text-white">
                  Guía de Prueba Piloto en el PC
                </h3>
              </div>
              <span className="text-xs font-mono text-[#33C1FF]">
                {completedStepsCount}/{PILOT_STEPS.length}
              </span>
            </div>

            <div className="space-y-2.5">
              {PILOT_STEPS.map((step) => {
                const done = Boolean(checkedSteps[step.id]);
                return (
                  <button
                    key={step.id}
                    type="button"
                    onClick={() =>
                      setCheckedSteps((prev) => ({ ...prev, [step.id]: !prev[step.id] }))
                    }
                    aria-pressed={done}
                    className={`w-full text-left p-3 rounded-xl border transition-colors cursor-pointer flex items-start gap-2.5 ${
                      done
                        ? 'bg-emerald-500/10 border-emerald-500/35'
                        : 'bg-[#06080D] border-white/8 hover:border-white/20'
                    }`}
                  >
                    <span
                      className={`mt-0.5 w-4 h-4 rounded flex items-center justify-center shrink-0 border ${
                        done
                          ? 'bg-emerald-500 border-emerald-500 text-[#04070D]'
                          : 'border-slate-500'
                      }`}
                    >
                      {done && <Check className="w-3 h-3 stroke-[3]" />}
                    </span>
                    <div className="space-y-0.5 min-w-0">
                      <p
                        className={`text-xs font-semibold ${
                          done ? 'text-emerald-200 line-through' : 'text-white'
                        }`}
                      >
                        {step.title}
                      </p>
                      <p className="text-[11px] text-slate-400 leading-relaxed">{step.detail}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Member Scannable QR Preview Modal (for instant testing from PC screen with spare phone!) */}
      {previewQrMember && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`Pase QR de ${previewQrMember.name}`}
        >
          <div className="w-full max-w-sm rounded-2xl bg-[#0D121B] border border-white/15 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-[#33C1FF]">
                  Pase QR Real Escaneable
                </p>
                <h3 className="text-lg font-bold text-white">{previewQrMember.name}</h3>
              </div>
              <button
                type="button"
                onClick={() => setPreviewQrMember(null)}
                aria-label="Cerrar código QR"
                className="min-h-[40px] min-w-[40px] rounded-xl text-slate-400 hover:text-white hover:bg-white/8 flex items-center justify-center cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div
              className={`rounded-2xl bg-white p-4 flex flex-col items-center border-4 ${
                previewQrMember.feeStatus === 'pendiente'
                  ? 'border-red-500'
                  : 'border-emerald-400'
              }`}
            >
              <RealQrCode
                value={buildMemberQrPayload(previewQrMember.id, previewQrMember.memberCode)}
                size={200}
                fgColor={previewQrMember.feeStatus === 'pendiente' ? '#991B1B' : '#06080D'}
                label={`Código QR real de ${previewQrMember.name}`}
              />
              <p className="mt-2 font-mono text-xs font-bold text-slate-800">
                {previewQrMember.memberCode}
              </p>
            </div>

            <div
              className={`rounded-xl p-3 text-xs flex items-center gap-2 ${
                previewQrMember.feeStatus === 'pendiente'
                  ? 'bg-red-500/15 border border-red-500/40 text-red-200'
                  : 'bg-emerald-500/15 border border-emerald-500/40 text-emerald-200'
              }`}
            >
              {previewQrMember.feeStatus === 'pendiente' ? (
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              )}
              <span>
                Apunta el móvil en <strong>Modo Lector QR</strong> a esta pantalla para probar{' '}
                <strong>
                  {previewQrMember.feeStatus === 'pendiente'
                    ? 'la alarma roja de bloqueo'
                    : 'el acceso verde autorizado'}
                </strong>
                .
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
