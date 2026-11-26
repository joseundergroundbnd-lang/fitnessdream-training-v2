import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Award,
  BarChart3,
  Check,
  Clock,
  Dumbbell,
  Eye,
  FileText,
  Flame,
  MessageSquare,
  PlayCircle,
  Plus,
  Search,
  Send,
  Trash2,
  Trophy,
  UserCheck,
  Users,
} from 'lucide-react';
import {
  COACH_TEAM,
  INITIAL_HOURLY_OCCUPANCY,
  TELJU_LOGO_URL,
} from '../data/seedData';
import type {
  ChallengeAttempt,
  ClubMemberRecord,
  CoachProfile,
  CoachRoutine,
  DirectMessage,
  GymClassSession,
  MemberProfile,
  MonthlyChallengeCategory,
  MonthlyClubChallenge,
  StrengthLiftAttempt,
} from '../types/gym';
import {
  calculateRetentionFinancials,
  classifyHourlySaturation,
  computeClassOccupancyMetrics,
  getAtRiskMembers,
} from '../utils/gymLogic';
import type { User } from 'firebase/auth';
import type { LiveAccessLog, LiveGymMember } from '../services/liveGymService';
import type { FeeStatus } from '../types/gym';
import { CoachMessageThread } from './CoachMessageThread';
import { CoachRoutineBuilder } from './CoachRoutineBuilder';
import type { PresentationKitTab } from './PresentationKitModal';
import { ReceptionLivePanel } from './ReceptionLivePanel';

interface AdminDashboardViewProps {
  activeCoach: CoachProfile;
  onSelectCoach: (coachId: string) => void;
  members: ClubMemberRecord[];
  classes: GymClassSession[];
  monthlyChallenges: MonthlyClubChallenge[];
  coachRoutines: CoachRoutine[];
  mancuernaLeaderboard: ChallengeAttempt[];
  strengthLeaderboard: StrengthLiftAttempt[];
  onSendOutreach: (memberId: string, note: string) => void;
  onMarkReactivated: (memberId: string) => void;
  onCreateMonthlyChallenge: (challenge: {
    title: string;
    category: MonthlyChallengeCategory;
    targetDescription: string;
    prize: string;
    endDateLabel: string;
  }) => void;
  onToggleChallengeActive: (challengeId: string) => void;
  onDeleteChallenge: (challengeId: string) => void;
  onSendCoachRoutine: (routine: CoachRoutine) => void;
  onPreviewInMemberView: () => void;
  onPreviewRoutinesInMemberView: () => void;
  memberProfile: MemberProfile;
  directMessages: DirectMessage[];
  onSendDirectMessage: (msg: Omit<DirectMessage, 'id' | 'timestampLabel'>) => void;
  onOpenPresentationKit: (tab: PresentationKitTab) => void;
  authUser: User | null;
  isLiveAdmin: boolean;
  onSignInGoogle: () => Promise<void>;
  onSignOutGoogle: () => Promise<void>;
  liveMembers: LiveGymMember[];
  localDemoMembers: LiveGymMember[];
  liveAccessLogs: LiveAccessLog[];
  onToggleLiveMemberFee: (memberId: string, nextStatus: FeeStatus) => Promise<void>;
  onCreateWalkInMember: (input: {
    name: string;
    phone: string;
    email?: string;
    tier: 'Socio Fundador' | 'Socio Club';
    feeStatus: FeeStatus;
    assignedCoach: string;
  }) => Promise<void>;
  onOpenTurnstileScanner: () => void;
}

const CHALLENGE_CATEGORIES: MonthlyChallengeCategory[] = [
  'Constancia',
  'Mancuerna 70 kg',
  'Fuerza',
  'Sala Multifunción',
  'Cardio',
];

function buildDefaultCoachMessage(member: ClubMemberRecord, coachFirstName: string): string {
  const firstName = member.name.split(' ')[0];
  return `Hola ${firstName}, soy ${coachFirstName} de FitnessDreams. Llevamos ${member.daysSinceLastVisit} días sin verte por sala y te echamos de menos. ¿Te reservo esta semana una sesión rápida de 35 min adaptada a ${member.preferredActivity} para retomar el hábito sin presión?`;
}

export const AdminDashboardView: React.FC<AdminDashboardViewProps> = ({
  activeCoach,
  onSelectCoach,
  members,
  classes,
  monthlyChallenges,
  coachRoutines,
  mancuernaLeaderboard,
  strengthLeaderboard,
  onSendOutreach,
  onMarkReactivated,
  onCreateMonthlyChallenge,
  onToggleChallengeActive,
  onDeleteChallenge,
  onSendCoachRoutine,
  onPreviewInMemberView,
  onPreviewRoutinesInMemberView,
  memberProfile,
  directMessages,
  onSendDirectMessage,
  onOpenPresentationKit,
  authUser,
  isLiveAdmin,
  onSignInGoogle,
  onSignOutGoogle,
  liveMembers,
  localDemoMembers,
  liveAccessLogs,
  onToggleLiveMemberFee,
  onCreateWalkInMember,
  onOpenTurnstileScanner,
}) => {
  const [subtab, setSubtab] = useState<
    'recepcion' | 'retencion' | 'analitica' | 'retos' | 'rutinas' | 'mensajes'
  >('recepcion');
  const [chatMemberId, setChatMemberId] = useState<string>('current-user');
  const activeCoachFirstName = activeCoach.name.split(' ')[0];

  const coachThreadCount = useMemo(
    () => directMessages.filter((m) => m.coachId === activeCoach.id).length,
    [directMessages, activeCoach.id]
  );

  const chatContacts = useMemo(() => {
    const activeAppMember = {
      id: 'current-user',
      name: memberProfile.name,
      subtitle: `${memberProfile.tier} · Socio activo en App`,
      avatarUrl: memberProfile.avatarUrl,
    };
    const directoryContacts = members.slice(0, 6).map((m) => ({
      id: m.id,
      name: m.name,
      subtitle: `${m.memberTag} · ${m.preferredActivity}`,
      avatarUrl: undefined as string | undefined,
    }));
    return [activeAppMember, ...directoryContacts];
  }, [memberProfile.avatarUrl, memberProfile.name, memberProfile.tier, members]);

  const activeChatContact = useMemo(
    () => chatContacts.find((c) => c.id === chatMemberId) ?? chatContacts[0],
    [chatContacts, chatMemberId]
  );

  // Retention filter & composer state
  const [riskFilter, setRiskFilter] = useState<'en-riesgo' | 'contactados' | 'todos'>('en-riesgo');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [messageDraft, setMessageDraft] = useState('');
  const [retentionNotice, setRetentionNotice] = useState<string | null>(null);

  // Create monthly challenge form state
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<MonthlyChallengeCategory>('Constancia');
  const [targetDescription, setTargetDescription] = useState('');
  const [prize, setPrize] = useState('');
  const [endDateLabel, setEndDateLabel] = useState('30 Dic');
  const [challengeError, setChallengeError] = useState<string | null>(null);
  const [challengeSuccess, setChallengeSuccess] = useState<string | null>(null);

  const financials = useMemo(() => calculateRetentionFinancials(members, 10), [members]);
  const atRiskMembers = useMemo(() => getAtRiskMembers(members, 10), [members]);
  const classMetrics = useMemo(() => computeClassOccupancyMetrics(classes), [classes]);

  const highDemandClassCount = useMemo(
    () => classMetrics.filter((c) => c.occupancyPct >= 85).length,
    [classMetrics]
  );

  const activeChallenges = useMemo(
    () => monthlyChallenges.filter((c) => c.active),
    [monthlyChallenges]
  );

  const totalChallengeCompletions = useMemo(
    () => monthlyChallenges.reduce((sum, c) => sum + c.completedCount, 0),
    [monthlyChallenges]
  );

  const filteredMembers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let list: ClubMemberRecord[];
    if (riskFilter === 'en-riesgo') {
      list = atRiskMembers.filter((m) => m.outreachStatus === 'pendiente');
    } else if (riskFilter === 'contactados') {
      list = members.filter(
        (m) => m.outreachStatus === 'contactado' || m.outreachStatus === 'reactivado'
      );
    } else {
      list = [...members].sort((a, b) => b.daysSinceLastVisit - a.daysSinceLastVisit);
    }
    if (!q) return list;
    return list.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.memberTag.toLowerCase().includes(q) ||
        m.assignedCoach.toLowerCase().includes(q)
    );
  }, [atRiskMembers, members, riskFilter, searchQuery]);

  const selectedMember = useMemo(
    () => members.find((m) => m.id === selectedMemberId) ?? null,
    [members, selectedMemberId]
  );

  const challengeLeaders = useMemo(
    () =>
      [...members]
        .filter((m) => m.challengesCompleted > 0 || m.streakDays >= 7)
        .sort((a, b) => b.challengesCompleted - a.challengesCompleted || b.streakDays - a.streakDays),
    [members]
  );

  const peakHoursSummary = useMemo(() => {
    return INITIAL_HOURLY_OCCUPANCY.filter(
      (slot) => classifyHourlySaturation(slot.avgAttendance, slot.maxCapacity).status === 'Saturada'
    );
  }, []);

  const handleOpenComposer = (member: ClubMemberRecord) => {
    setSelectedMemberId(member.id);
    setMessageDraft(buildDefaultCoachMessage(member, activeCoachFirstName));
  };

  const handleConfirmOutreach = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMember) return;
    const trimmed = messageDraft.trim();
    if (!trimmed) return;
    onSendOutreach(selectedMember.id, trimmed);
    setRetentionNotice(
      `Aviso enviado por ${activeCoach.name} a ${selectedMember.name} (${selectedMember.phone}). Cuota de ${selectedMember.monthlyFee.toFixed(
        2
      )} €/mes marcada en seguimiento.`
    );
    setSelectedMemberId(null);
    setMessageDraft('');
    window.setTimeout(() => setRetentionNotice(null), 4500);
  };

  const handleSubmitChallenge = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !targetDescription.trim() || !prize.trim()) {
      setChallengeError('Completa título, objetivo medible y premio oficial antes de publicar.');
      return;
    }
    setChallengeError(null);
    onCreateMonthlyChallenge({
      title: title.trim(),
      category,
      targetDescription: targetDescription.trim(),
      prize: prize.trim(),
      endDateLabel: endDateLabel.trim() || 'Fin de mes',
    });
    setChallengeSuccess(
      `Reto «${title.trim()}» publicado por ${activeCoach.name}. Ya aparece visible con su premio en la app de los socios.`
    );
    setTitle('');
    setTargetDescription('');
    setPrize('');
    window.setTimeout(() => setChallengeSuccess(null), 5000);
  };

  return (
    <div className="space-y-6">
      {/* Executive Header with Full-Access Coach Selector (Javi Busta & Joel) */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <img
              src={activeCoach.avatarUrl}
              alt={`${activeCoach.name} — ${activeCoach.role}`}
              referrerPolicy="no-referrer"
              className="w-14 h-16 rounded-xl object-cover object-top border border-[#00A8FF]/60 shrink-0 mt-0.5"
            />
            <div>
              <p className="text-xs font-medium text-[#33C1FF]">
                {activeCoach.name} · {activeCoach.accessLevel}
              </p>
              <h1 className="text-3xl sm:text-4xl font-bold tracking-[0.01em] text-white mt-0.5">
                Panel de Dirección y Entrenadores
              </h1>
            </div>
          </div>

          {/* Active Coach Session Switcher (Both Javi and Joel have full access) */}
          <div
            className="inline-flex items-center gap-1.5 p-1 rounded-xl bg-[#0D121B] border border-white/10 self-start lg:self-auto"
            role="group"
            aria-label="Cambiar entrenador activo con acceso total"
          >
            {COACH_TEAM.map((coach) => {
              const isCurrent = activeCoach.id === coach.id;
              return (
                <button
                  key={coach.id}
                  type="button"
                  onClick={() => {
                    onSelectCoach(coach.id);
                    if (selectedMember) {
                      setMessageDraft(
                        buildDefaultCoachMessage(selectedMember, coach.name.split(' ')[0])
                      );
                    }
                  }}
                  aria-pressed={isCurrent}
                  className={`min-h-[40px] pl-1.5 pr-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap ${
                    isCurrent
                      ? 'bg-[#00A8FF] text-[#04070D]'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <img
                    src={coach.avatarUrl}
                    alt={coach.name}
                    referrerPolicy="no-referrer"
                    className="w-7 h-7 rounded-md object-cover object-top border border-black/20 shrink-0"
                  />
                  <span>Coach {coach.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div
            className="inline-flex flex-wrap items-center gap-1 p-1 rounded-xl bg-[#0D121B] border border-white/10"
            role="tablist"
            aria-label="Secciones del panel de dirección"
          >
            <button
              type="button"
              role="tab"
              aria-selected={subtab === 'recepcion'}
              onClick={() => setSubtab('recepcion')}
              className={`min-h-[40px] px-3.5 py-2 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap ${
                subtab === 'recepcion'
                  ? 'bg-[#00A8FF] text-[#04070D]'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Recepción y Torno QR
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={subtab === 'retencion'}
              onClick={() => setSubtab('retencion')}
              className={`min-h-[40px] px-3.5 py-2 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap ${
                subtab === 'retencion'
                  ? 'bg-[#00A8FF] text-[#04070D]'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Retención (+10 días)
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={subtab === 'analitica'}
              onClick={() => setSubtab('analitica')}
              className={`min-h-[40px] px-3.5 py-2 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap ${
                subtab === 'analitica'
                  ? 'bg-[#00A8FF] text-[#04070D]'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Analítica y Aforo
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={subtab === 'retos'}
              onClick={() => setSubtab('retos')}
              className={`min-h-[40px] px-3.5 py-2 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap ${
                subtab === 'retos'
                  ? 'bg-[#00A8FF] text-[#04070D]'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Retos y Premios ({activeChallenges.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={subtab === 'rutinas'}
              onClick={() => setSubtab('rutinas')}
              className={`min-h-[40px] px-3.5 py-2 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap ${
                subtab === 'rutinas'
                  ? 'bg-[#00A8FF] text-[#04070D]'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Enviar Rutina ({coachRoutines.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={subtab === 'mensajes'}
              onClick={() => setSubtab('mensajes')}
              className={`min-h-[40px] px-3.5 py-2 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap ${
                subtab === 'mensajes'
                  ? 'bg-[#00A8FF] text-[#04070D]'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Mensajes y Audios ({coachThreadCount})
            </button>
          </div>

          {/* Direct Presentation Kit for Javi (12-Page Official PDF + Mobile Demo Video) */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onOpenPresentationKit('pdf')}
              className="min-h-[42px] px-3.5 py-2 rounded-xl bg-[#0D121B] hover:border-[#00A8FF] border border-[#00A8FF]/45 text-xs font-semibold text-white flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
            >
              <FileText className="w-4 h-4 text-[#00A8FF] shrink-0" />
              <span>Descargar Guía PDF (Javi)</span>
            </button>
            <button
              type="button"
              onClick={() => onOpenPresentationKit('video')}
              className="min-h-[42px] px-3.5 py-2 rounded-xl bg-[#00A8FF] hover:bg-[#33C1FF] text-[#04070D] text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
            >
              <PlayCircle className="w-4 h-4 shrink-0" />
              <span>Vídeo Demo Móvil</span>
            </button>
          </div>
        </div>
      </div>

      {/* 4-Column Executive KPI Strip (Real Computed Numbers, Tabular Numerals) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl bg-[#0D121B] border border-red-500/30 p-5 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Socios en riesgo (+10 días)</span>
            <AlertTriangle className="w-4 h-4 text-red-400" />
          </div>
          <p className="text-2xl font-bold font-mono tabular-nums text-white">
            {financials.uncontactedCount}{' '}
            <span className="text-xs font-sans font-normal text-red-300">sin avisar</span>
          </p>
          <p className="text-xs text-slate-400 font-mono tabular-nums">
            {financials.atRiskCount} totales · {financials.contactedCount} en seguimiento
          </p>
        </div>

        <div className="rounded-2xl bg-[#0D121B] border border-white/10 p-5 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Cuotas en riesgo / protegidas</span>
            <Users className="w-4 h-4 text-[#00A8FF]" />
          </div>
          <p className="text-2xl font-bold font-mono tabular-nums text-white">
            {financials.monthlyRevenueAtRisk.toFixed(0)} €
            <span className="text-xs font-normal text-slate-400">/mes</span>
          </p>
          <p className="text-xs text-[#33C1FF] font-mono tabular-nums">
            {financials.annualRevenueAtRisk.toFixed(0)} €/año · {financials.monthlyRevenueProtected.toFixed(0)} €/mes protegidos
          </p>
        </div>

        <div className="rounded-2xl bg-[#0D121B] border border-white/10 p-5 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Clases llenas y picos</span>
            <BarChart3 className="w-4 h-4 text-[#00A8FF]" />
          </div>
          <p className="text-2xl font-bold font-mono tabular-nums text-white">
            {highDemandClassCount}{' '}
            <span className="text-xs font-sans font-normal text-slate-400">clases &ge;85%</span>
          </p>
          <p className="text-xs text-amber-300 font-mono tabular-nums">
            {peakHoursSummary.length} franjas saturadas (18:00–20:00)
          </p>
        </div>

        <div className="rounded-2xl bg-[#0D121B] border border-white/10 p-5 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Retos activos del mes</span>
            <Award className="w-4 h-4 text-[#00A8FF]" />
          </div>
          <p className="text-2xl font-bold font-mono tabular-nums text-white">
            {activeChallenges.length}{' '}
            <span className="text-xs font-sans font-normal text-slate-400">publicados</span>
          </p>
          <p className="text-xs text-slate-400 font-mono tabular-nums">
            {totalChallengeCompletions} retos completados por socios
          </p>
        </div>
      </div>

      {/* SUBTAB 0: RECEPCIÓN EN VIVO, CONTROL DE CUOTAS Y LECTOR QR */}
      {subtab === 'recepcion' && (
        <ReceptionLivePanel
          activeCoach={activeCoach}
          authUser={authUser}
          isLiveAdmin={isLiveAdmin}
          onSignInGoogle={onSignInGoogle}
          onSignOutGoogle={onSignOutGoogle}
          liveMembers={liveMembers}
          localDemoMembers={localDemoMembers}
          liveAccessLogs={liveAccessLogs}
          onToggleMemberFee={onToggleLiveMemberFee}
          onCreateWalkInMember={onCreateWalkInMember}
          onOpenTurnstileScanner={onOpenTurnstileScanner}
          onOpenPresentationKit={onOpenPresentationKit}
        />
      )}

      {/* SUBTAB 1: RETENCIÓN Y RIESGO DE ABANDONO (+10 DÍAS) */}
      {subtab === 'retencion' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left 7 cols: Risk Queue Table */}
          <div className="lg:col-span-7 rounded-2xl bg-[#0D121B] border border-white/10 p-5 sm:p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-bold text-white tracking-[0.01em]">
                  Socios en riesgo de abandonar
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Alerta automática tras 10 días sin fichar en el torno QR. Retener 1 socio ahorra 5× más que captarlo.
                </p>
              </div>
              <img
                src={TELJU_LOGO_URL}
                alt="Telju Fitness"
                referrerPolicy="no-referrer"
                className="hidden sm:block h-9 w-auto object-contain rounded"
              />
            </div>

            {retentionNotice && (
              <div
                role="status"
                className="rounded-xl bg-[#00A8FF]/15 border border-[#00A8FF]/40 px-4 py-3 text-xs text-white flex items-center gap-2"
              >
                <Check className="w-4 h-4 text-[#33C1FF] shrink-0" />
                <span>{retentionNotice}</span>
              </div>
            )}

            {/* Filter & Search Bar */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-[#06080D] border border-white/10 self-start">
                <button
                  type="button"
                  onClick={() => setRiskFilter('en-riesgo')}
                  aria-pressed={riskFilter === 'en-riesgo'}
                  className={`min-h-[36px] px-3 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap ${
                    riskFilter === 'en-riesgo'
                      ? 'bg-red-600 text-white'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Sin avisar ({financials.uncontactedCount})
                </button>
                <button
                  type="button"
                  onClick={() => setRiskFilter('contactados')}
                  aria-pressed={riskFilter === 'contactados'}
                  className={`min-h-[36px] px-3 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap ${
                    riskFilter === 'contactados'
                      ? 'bg-[#00A8FF] text-[#04070D]'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Seguimiento
                </button>
                <button
                  type="button"
                  onClick={() => setRiskFilter('todos')}
                  aria-pressed={riskFilter === 'todos'}
                  className={`min-h-[36px] px-3 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap ${
                    riskFilter === 'todos'
                      ? 'bg-[#00A8FF] text-[#04070D]'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Todos ({members.length})
                </button>
              </div>

              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  aria-label="Buscar socio por nombre o entrenador"
                  placeholder="Buscar socio o coach..."
                  className="w-full min-h-[42px] pl-9 pr-3.5 rounded-xl bg-[#06080D] border border-white/10 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-[#00A8FF]"
                />
              </div>
            </div>

            {/* Member Rows */}
            {filteredMembers.length === 0 ? (
              <div className="py-10 text-center space-y-2 border-t border-white/8">
                <UserCheck className="w-7 h-7 text-[#00A8FF] mx-auto" />
                <p className="text-sm font-semibold text-white">
                  Sin socios pendientes en este filtro
                </p>
                <p className="text-xs text-slate-400">
                  Todos los socios con +10 días de ausencia ya han sido contactados por el equipo.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-white/8 border-t border-white/8">
                {filteredMembers.map((member) => {
                  const isHighRisk =
                    member.daysSinceLastVisit >= 14 && member.outreachStatus === 'pendiente';
                  const isMediumRisk =
                    member.daysSinceLastVisit >= 10 &&
                    member.daysSinceLastVisit < 14 &&
                    member.outreachStatus === 'pendiente';
                  const isSelected = selectedMemberId === member.id;

                  return (
                    <div
                      key={member.id}
                      className={`py-4 px-3 -mx-3 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                        isSelected ? 'bg-[#00A8FF]/10 border border-[#00A8FF]/30' : ''
                      }`}
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <p className="text-sm font-semibold text-white">{member.name}</p>
                          <span className="text-xs font-mono text-slate-400">
                            {member.memberTag}
                          </span>
                          <span className="text-xs text-slate-500" aria-hidden="true">
                            ·
                          </span>
                          <span className="text-xs font-mono tabular-nums text-slate-300">
                            {member.monthlyFee.toFixed(2)} €/mes
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                          {isHighRisk && (
                            <span className="font-semibold text-red-400">
                              Riesgo alto · {member.daysSinceLastVisit} días sin venir
                            </span>
                          )}
                          {isMediumRisk && (
                            <span className="font-semibold text-amber-400">
                              Riesgo medio · {member.daysSinceLastVisit} días sin venir
                            </span>
                          )}
                          {member.outreachStatus === 'contactado' && (
                            <span className="font-semibold text-[#33C1FF]">
                              Contactado ({member.lastOutreachTime ?? 'Hoy'})
                            </span>
                          )}
                          {member.outreachStatus === 'reactivado' && (
                            <span className="font-semibold text-emerald-400">
                              Reactivado · Volvió a entrenar
                            </span>
                          )}
                          {member.daysSinceLastVisit < 10 &&
                            member.outreachStatus === 'pendiente' && (
                              <span className="text-emerald-400 font-medium">
                                Activo · {member.lastVisitLabel}
                              </span>
                            )}
                          <span className="text-slate-600" aria-hidden="true">
                            ·
                          </span>
                          <span className="text-slate-400">Coach: {member.assignedCoach}</span>
                        </div>

                        <p className="text-xs text-slate-400 truncate">
                          Actividad habitual: {member.preferredActivity} · Tel. {member.phone}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {member.daysSinceLastVisit >= 10 &&
                          member.outreachStatus !== 'reactivado' && (
                            <button
                              type="button"
                              onClick={() => handleOpenComposer(member)}
                              aria-label={`Escribir aviso a ${member.name}`}
                              className={`min-h-[40px] px-3.5 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                                member.outreachStatus === 'pendiente'
                                  ? 'bg-[#00A8FF] hover:bg-[#33C1FF] text-[#04070D]'
                                  : 'bg-[#131B28] hover:bg-[#1E293B] text-slate-200 border border-white/10'
                              }`}
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                              {member.outreachStatus === 'pendiente'
                                ? 'Escribir aviso'
                                : 'Reenviar aviso'}
                            </button>
                          )}

                        {member.outreachStatus === 'contactado' && (
                          <button
                            type="button"
                            onClick={() => onMarkReactivated(member.id)}
                            aria-label={`Marcar reactivado a ${member.name}`}
                            className="min-h-[40px] px-3 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 text-xs font-semibold cursor-pointer whitespace-nowrap"
                          >
                            Volvió hoy
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right 5 cols: Coach Outreach Composer */}
          <div className="lg:col-span-5 rounded-2xl bg-[#0D121B] border border-white/10 p-5 sm:p-6 space-y-5">
            <div className="flex items-center gap-3">
              <img
                src={activeCoach.avatarUrl}
                alt={`Coach ${activeCoach.name}`}
                referrerPolicy="no-referrer"
                className="w-11 h-12 rounded-xl object-cover object-top border border-[#00A8FF]/40 shrink-0"
              />
              <div>
                <p className="text-xs font-medium text-[#33C1FF]">
                  Acción directa de retención · Coach {activeCoach.name}
                </p>
                <h2 className="text-xl font-bold text-white">Aviso personalizado al socio</h2>
              </div>
            </div>

            {selectedMember ? (
              <form onSubmit={handleConfirmOutreach} className="space-y-4">
                <div className="border-y border-white/8 py-3 space-y-1">
                  <p className="text-sm font-semibold text-white">
                    Para: {selectedMember.name} ({selectedMember.memberTag})
                  </p>
                  <p className="text-xs text-slate-400">
                    {selectedMember.daysSinceLastVisit} días sin acudir · Tel.{' '}
                    {selectedMember.phone} · Cuota {selectedMember.monthlyFee.toFixed(2)} €/mes
                  </p>
                </div>

                {/* Quick Coach Templates */}
                <div className="space-y-1.5">
                  <p className="text-xs text-slate-400">
                    Plantillas rápidas de {activeCoachFirstName}:
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        setMessageDraft(
                          buildDefaultCoachMessage(selectedMember, activeCoachFirstName)
                        )
                      }
                      className="min-h-[34px] px-2.5 rounded-lg bg-[#131B28] hover:border-[#00A8FF] border border-white/10 text-[11px] text-slate-200 cursor-pointer"
                    >
                      Rutina rápida 35 min
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setMessageDraft(
                          `¡Hola ${selectedMember.name.split(' ')[0]}! Soy ${activeCoachFirstName} de FitnessDreams. Esta semana te invito a un Pro-Coffee en el Fit Café después de entrenar para revisar juntos tus objetivos. ¿Qué día te viene mejor?`
                        )
                      }
                      className="min-h-[34px] px-2.5 rounded-lg bg-[#131B28] hover:border-[#00A8FF] border border-white/10 text-[11px] text-slate-200 cursor-pointer"
                    >
                      Invitación Fit Café
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setMessageDraft(
                          `Hola ${selectedMember.name.split(' ')[0]}, soy ${activeCoachFirstName}. Hace ${selectedMember.daysSinceLastVisit} días que no pasas por FitnessDreams. Si necesitas cambiar horarios o adaptar tu rutina Telju, dime y hoy mismo te la envío a la app.`
                        )
                      }
                      className="min-h-[34px] px-2.5 rounded-lg bg-[#131B28] hover:border-[#00A8FF] border border-white/10 text-[11px] text-slate-200 cursor-pointer"
                    >
                      Revisión de rutina
                    </button>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="outreach-message"
                    className="block text-xs text-slate-400 mb-1.5"
                  >
                    Mensaje de seguimiento (App + WhatsApp)
                  </label>
                  <textarea
                    id="outreach-message"
                    rows={5}
                    value={messageDraft}
                    onChange={(e) => setMessageDraft(e.target.value)}
                    className="w-full rounded-xl bg-[#06080D] border border-white/12 p-3 text-sm text-white focus:outline-none focus:border-[#00A8FF]"
                  />
                </div>

                <div className="flex items-center gap-2.5">
                  <button
                    type="submit"
                    className="flex-1 min-h-[46px] rounded-xl bg-[#00A8FF] hover:bg-[#33C1FF] text-[#04070D] font-bold text-sm flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Send className="w-4 h-4" />
                    Enviar aviso de seguimiento
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedMemberId(null)}
                    className="min-h-[46px] px-4 rounded-xl bg-[#131B28] text-slate-300 hover:text-white border border-white/10 text-xs font-semibold cursor-pointer"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-slate-300 leading-relaxed">
                  Selecciona cualquier socio con{' '}
                  <strong className="text-white">+10 días sin entrenar</strong> y pulsa{' '}
                  <strong className="text-[#33C1FF]">Escribir aviso</strong> para enviar un mensaje
                  cercano de su entrenador antes de que solicite la baja.
                </p>

                <div className="border-t border-white/8 pt-4 space-y-2.5 text-xs text-slate-400">
                  <p className="font-semibold text-white">Por qué esto ahorra dinero al club:</p>
                  <p>
                    · Cada socio retenido mantiene entre{' '}
                    <span className="font-mono text-white">418 €</span> y{' '}
                    <span className="font-mono text-white">562 €/año</span> de facturación directa.
                  </p>
                  <p>
                    · Detectar la caída de hábito a los 10 días multiplica la reactivación frente a
                    esperar al recibo devuelto.
                  </p>
                </div>

                {atRiskMembers.find((m) => m.outreachStatus === 'pendiente') && (
                  <button
                    type="button"
                    onClick={() => {
                      const next = atRiskMembers.find((m) => m.outreachStatus === 'pendiente');
                      if (next) handleOpenComposer(next);
                    }}
                    className="w-full min-h-[44px] rounded-xl bg-[#00A8FF] hover:bg-[#33C1FF] text-[#04070D] font-bold text-xs flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <MessageSquare className="w-4 h-4" />
                    Atender al caso más urgente (
                    {atRiskMembers.find((m) => m.outreachStatus === 'pendiente')?.name})
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUBTAB 2: ANALÍTICA — HORAS SATURADAS, CLASES QUE LLENAN Y QUIÉN CUMPLE RETOS */}
      {subtab === 'analitica' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left 7 cols: Hourly Saturation Heatmap / Bar Chart */}
            <div className="lg:col-span-7 rounded-2xl bg-[#0D121B] border border-white/10 p-5 sm:p-6 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h2 className="text-2xl font-bold text-white tracking-[0.01em] flex items-center gap-2">
                    <Clock className="w-5 h-5 text-[#00A8FF]" />
                    Horas que se saturan (Aforo máx. 140)
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Media semanal por franja horaria medida desde los lectores de torno QR
                  </p>
                </div>
                <span className="text-xs font-mono text-red-400 shrink-0">
                  Pico: 19:00 (96% · 135 socios)
                </span>
              </div>

              <div className="space-y-2.5">
                {INITIAL_HOURLY_OCCUPANCY.map((slot) => {
                  const { pct, status } = classifyHourlySaturation(
                    slot.avgAttendance,
                    slot.maxCapacity
                  );
                  const barColor =
                    status === 'Saturada'
                      ? 'bg-red-500'
                      : status === 'Alta'
                        ? 'bg-amber-400'
                        : 'bg-[#00A8FF]';
                  const statusTextColor =
                    status === 'Saturada'
                      ? 'text-red-400'
                      : status === 'Alta'
                        ? 'text-amber-300'
                        : 'text-slate-400';

                  return (
                    <div
                      key={slot.hour}
                      className="grid grid-cols-12 items-center gap-3 text-xs py-1"
                    >
                      <span className="col-span-2 sm:col-span-1 font-mono tabular-nums font-semibold text-white">
                        {slot.hour}
                      </span>

                      <div className="col-span-5 sm:col-span-6 h-2.5 rounded-full bg-[#06080D] overflow-hidden border border-white/5">
                        <div
                          className={`h-full rounded-full ${barColor}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>

                      <span className="col-span-2 font-mono tabular-nums text-right text-slate-200">
                        {slot.avgAttendance}/{slot.maxCapacity}
                      </span>

                      <span
                        className={`col-span-3 font-medium text-right truncate ${statusTextColor}`}
                      >
                        {status} · {pct}%
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="border-t border-white/8 pt-4 text-xs text-slate-300 leading-relaxed">
                <strong className="text-white">Recomendación operativa:</strong> Entre las{' '}
                <span className="font-mono text-red-300">18:00 y 20:00</span> el club supera el 88%
                de aforo. Abrir una sesión extra de Jumping Fitness a las{' '}
                <span className="font-mono text-[#33C1FF]">17:00</span> o promocionar el Fit Café en
                horario valle (<span className="font-mono text-[#33C1FF]">12:00–15:00</span>)
                descarga la sala Telju.
              </div>
            </div>

            {/* Right 5 cols: Which Classes Fill Up (Live from state.classes) */}
            <div className="lg:col-span-5 rounded-2xl bg-[#0D121B] border border-white/10 p-5 sm:p-6 space-y-5">
              <div>
                <h2 className="text-2xl font-bold text-white tracking-[0.01em]">
                  Qué clases llenan (Sala Multifunción)
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Ordenadas por porcentaje real de ocupación en Jiu-Jitsu, Boxeo y Jumping Fitness
                </p>
              </div>

              <div className="divide-y divide-white/8">
                {classMetrics.map(({ session, occupancyPct, status }) => (
                  <div key={session.id} className="py-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white truncate">
                          {session.title}
                        </p>
                        <p className="text-xs text-slate-400">
                          {session.day} {session.time} · {session.discipline} · {session.instructor}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-mono tabular-nums font-bold text-white">
                          {session.bookedCount}/{session.capacity} ({occupancyPct}%)
                        </p>
                        <p
                          className={`text-[11px] font-semibold ${
                            status === 'Llena'
                              ? 'text-red-400'
                              : status === 'Alta demanda'
                                ? 'text-amber-300'
                                : 'text-[#33C1FF]'
                          }`}
                        >
                          {status}
                        </p>
                      </div>
                    </div>

                    <div className="h-1.5 rounded-full bg-[#06080D] overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          status === 'Llena'
                            ? 'bg-red-500'
                            : status === 'Alta demanda'
                              ? 'bg-amber-400'
                              : 'bg-[#00A8FF]'
                        }`}
                        style={{ width: `${occupancyPct}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Bottom Full-Width Row: Who Completes Challenges */}
          <div className="rounded-2xl bg-[#0D121B] border border-white/10 p-5 sm:p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-2xl font-bold text-white tracking-[0.01em] flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-[#00A8FF]" />
                  Quién cumple los retos del club
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Socios más constantes en retos mensuales, Pedestal 70 kg ({mancuernaLeaderboard.length} marcas) y Press Banca / Sentadilla ({strengthLeaderboard.length} registros)
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/10 text-xs text-slate-400">
                    <th className="py-2.5 pr-4 font-medium">Socio</th>
                    <th className="py-2.5 px-4 font-medium">Actividad principal</th>
                    <th className="py-2.5 px-4 font-medium text-right">Racha activa</th>
                    <th className="py-2.5 px-4 font-medium text-right">Retos cumplidos</th>
                    <th className="py-2.5 pl-4 font-medium text-right">Última visita</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/8 text-sm">
                  {challengeLeaders.map((member) => (
                    <tr key={member.id} className="hover:bg-white/[0.02]">
                      <td className="py-3 pr-4">
                        <p className="font-semibold text-white">{member.name}</p>
                        <p className="text-xs font-mono text-slate-400">
                          {member.memberTag} · {member.plan}
                        </p>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-300">
                        {member.preferredActivity}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-[#33C1FF]">
                        <span className="inline-flex items-center gap-1 justify-end">
                          <Flame className="w-3.5 h-3.5 text-[#00A8FF]" />
                          {member.streakDays} días
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-bold text-white">
                        {member.challengesCompleted} retos
                      </td>
                      <td className="py-3 pl-4 text-right text-xs text-slate-400">
                        {member.lastVisitLabel}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUBTAB 3: CREAR RETOS DEL MES Y PREMIOS DESDE EL PANEL */}
      {subtab === 'retos' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left 5 cols: Create Monthly Challenge Form */}
          <form
            onSubmit={handleSubmitChallenge}
            className="lg:col-span-5 rounded-2xl bg-[#0D121B] border border-white/10 p-5 sm:p-6 space-y-4"
          >
            <div>
              <p className="text-xs font-medium text-[#33C1FF]">
                Publicación directa en la app de socios
              </p>
              <h2 className="text-2xl font-bold text-white tracking-[0.01em] mt-0.5">
                Crear reto del mes y premio
              </h2>
            </div>

            {challengeError && (
              <div
                role="alert"
                className="rounded-xl bg-red-600/15 border border-red-500/40 px-4 py-3 text-xs text-red-200"
              >
                {challengeError}
              </div>
            )}

            {challengeSuccess && (
              <div
                role="status"
                className="rounded-xl bg-[#00A8FF]/15 border border-[#00A8FF]/40 px-4 py-3 text-xs text-white space-y-2"
              >
                <p>{challengeSuccess}</p>
                <button
                  type="button"
                  onClick={onPreviewInMemberView}
                  className="inline-flex items-center gap-1.5 text-[#33C1FF] font-semibold hover:underline cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5" />
                  Ver cómo lo ven los socios en Club
                </button>
              </div>
            )}

            <div>
              <label htmlFor="admin-challenge-title" className="block text-xs text-slate-400 mb-1.5">
                Título del reto del mes
              </label>
              <input
                id="admin-challenge-title"
                type="text"
                placeholder="Ej. Reto Navidad: 12 sesiones antes del 24"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full min-h-[44px] rounded-xl bg-[#06080D] border border-white/12 px-3.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-[#00A8FF]"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label
                  htmlFor="admin-challenge-category"
                  className="block text-xs text-slate-400 mb-1.5"
                >
                  Categoría
                </label>
                <select
                  id="admin-challenge-category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value as MonthlyChallengeCategory)}
                  className="w-full min-h-[44px] rounded-xl bg-[#06080D] border border-white/12 px-3 text-sm text-white focus:outline-none focus:border-[#00A8FF]"
                >
                  {CHALLENGE_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="admin-challenge-deadline"
                  className="block text-xs text-slate-400 mb-1.5"
                >
                  Fecha límite
                </label>
                <input
                  id="admin-challenge-deadline"
                  type="text"
                  placeholder="Ej. 31 Dic"
                  value={endDateLabel}
                  onChange={(e) => setEndDateLabel(e.target.value)}
                  className="w-full min-h-[44px] rounded-xl bg-[#06080D] border border-white/12 px-3.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-[#00A8FF]"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="admin-challenge-target"
                className="block text-xs text-slate-400 mb-1.5"
              >
                Objetivo para completarlo
              </label>
              <input
                id="admin-challenge-target"
                type="text"
                placeholder="Ej. Acumular 12 entradas QR o 100 kg en Press Banca"
                value={targetDescription}
                onChange={(e) => setTargetDescription(e.target.value)}
                className="w-full min-h-[44px] rounded-xl bg-[#06080D] border border-white/12 px-3.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-[#00A8FF]"
              />
            </div>

            <div>
              <label htmlFor="admin-challenge-prize" className="block text-xs text-slate-400 mb-1.5">
                Premio oficial para quien lo cumpla
              </label>
              <input
                id="admin-challenge-prize"
                type="text"
                placeholder="Ej. 1 mes gratis + 2 Batidos Blue Power en Fit Café"
                value={prize}
                onChange={(e) => setPrize(e.target.value)}
                className="w-full min-h-[44px] rounded-xl bg-[#06080D] border border-white/12 px-3.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-[#00A8FF]"
              />
            </div>

            <button
              type="submit"
              className="w-full min-h-[46px] rounded-xl bg-[#00A8FF] hover:bg-[#33C1FF] text-[#04070D] font-bold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Publicar reto del mes
            </button>
          </form>

          {/* Right 7 cols: Active & Paused Monthly Challenges List */}
          <div className="lg:col-span-7 rounded-2xl bg-[#0D121B] border border-white/10 p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-bold text-white tracking-[0.01em]">
                  Retos y premios publicados
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Todo reto activo aparece inmediatamente en la pestaña Club de los socios
                </p>
              </div>
              <button
                type="button"
                onClick={onPreviewInMemberView}
                className="min-h-[38px] px-3 rounded-xl bg-[#131B28] hover:border-[#00A8FF] border border-white/10 text-xs font-semibold text-slate-200 flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <Eye className="w-3.5 h-3.5 text-[#00A8FF]" />
                Ver en Vista Socio
              </button>
            </div>

            {monthlyChallenges.length === 0 ? (
              <div className="py-10 text-center space-y-2 border-t border-white/8">
                <Trophy className="w-7 h-7 text-slate-500 mx-auto" />
                <p className="text-sm font-semibold text-white">No hay retos creados todavía</p>
                <p className="text-xs text-slate-400">
                  Crea el primer reto del mes en el formulario para incentivar la constancia.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-white/8 border-t border-white/8">
                {monthlyChallenges.map((item) => {
                  const pct =
                    item.participantsCount > 0
                      ? Math.round((item.completedCount / item.participantsCount) * 100)
                      : 0;
                  return (
                    <div key={item.id} className="py-4 space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                        <div className="space-y-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-x-2 text-xs">
                            <span className="font-semibold text-[#33C1FF]">{item.category}</span>
                            <span className="text-slate-600" aria-hidden="true">
                              ·
                            </span>
                            <span className="text-slate-400">Hasta {item.endDateLabel}</span>
                            <span className="text-slate-600" aria-hidden="true">
                              ·
                            </span>
                            <span
                              className={`font-semibold ${
                                item.active ? 'text-emerald-400' : 'text-slate-500'
                              }`}
                            >
                              {item.active ? 'Activo en app' : 'Pausado'}
                            </span>
                          </div>
                          <h3 className="text-base font-bold text-white">{item.title}</h3>
                          <p className="text-xs text-slate-300">{item.targetDescription}</p>
                          <p className="text-xs text-[#33C1FF] font-medium">
                            Premio: {item.prize}
                          </p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => onToggleChallengeActive(item.id)}
                            className="min-h-[36px] px-3 rounded-lg bg-[#131B28] hover:border-[#00A8FF] border border-white/10 text-xs font-semibold text-slate-200 cursor-pointer whitespace-nowrap"
                          >
                            {item.active ? 'Pausar' : 'Activar'}
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteChallenge(item.id)}
                            aria-label={`Eliminar reto ${item.title}`}
                            className="min-h-[36px] px-2.5 rounded-lg bg-[#131B28] hover:bg-red-600/20 hover:border-red-500/40 border border-white/10 text-slate-400 hover:text-red-300 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-xs font-mono tabular-nums text-slate-400">
                        <span>{item.participantsCount} inscritos</span>
                        <span>
                          {item.completedCount} completados ({pct}%)
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUBTAB 4: ENVIAR RUTINA EXCLUSIVA A SOCIO (CONSTRUCTOR COMPLETO PARA TODOS LOS COACHES) */}
      {subtab === 'rutinas' && (
        <CoachRoutineBuilder
          activeCoach={activeCoach}
          onSelectCoach={onSelectCoach}
          authUser={authUser}
          isLiveAdmin={isLiveAdmin}
          onSignInGoogle={onSignInGoogle}
          liveMembers={liveMembers}
          localDemoMembers={localDemoMembers}
          coachRoutines={coachRoutines}
          onSendCoachRoutine={onSendCoachRoutine}
          onPreviewRoutinesInMemberView={onPreviewRoutinesInMemberView}
          onOpenPresentationKit={onOpenPresentationKit}
        />
      )}

      {/* SUBTAB 5: BIDIRECTIONAL COACH <-> MEMBER MESSAGES & VOICE AUDIOS */}
      {subtab === 'mensajes' && activeChatContact && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left 4 cols: Member Conversation Selector */}
          <div className="lg:col-span-4 rounded-2xl bg-[#0D121B] border border-white/10 p-5 space-y-4">
            <div>
              <p className="text-xs font-medium text-[#33C1FF]">
                Bandeja directa de Coach {activeCoach.name}
              </p>
              <h2 className="text-xl font-bold text-white mt-0.5">
                Socios (Texto y Audio)
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Responde solicitudes de rutina o dudas técnicas con mensaje escrito o nota de voz.
              </p>
            </div>

            <div className="space-y-2">
              {chatContacts.map((contact) => {
                const isSelected = activeChatContact.id === contact.id;
                const msgCount = directMessages.filter(
                  (m) => m.coachId === activeCoach.id && m.memberId === contact.id
                ).length;

                return (
                  <button
                    key={contact.id}
                    type="button"
                    onClick={() => setChatMemberId(contact.id)}
                    aria-pressed={isSelected}
                    className={`w-full p-3 rounded-xl border text-left flex items-center justify-between gap-3 transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-[#00A8FF]/14 border-[#00A8FF]'
                        : 'bg-[#06080D] border-white/10 hover:border-white/25'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{contact.name}</p>
                      <p className="text-xs text-slate-400 truncate">{contact.subtitle}</p>
                    </div>
                    <span className="text-xs font-mono tabular-nums text-[#33C1FF] shrink-0">
                      {msgCount}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right 8 cols: Live Thread as Active Coach */}
          <div className="lg:col-span-8">
            <CoachMessageThread
              viewerRole="coach"
              coach={activeCoach}
              memberId={activeChatContact.id}
              memberName={activeChatContact.name}
              memberAvatar={activeChatContact.avatarUrl}
              messages={directMessages}
              onSendMessage={onSendDirectMessage}
            />
          </div>
        </div>
      )}
    </div>
  );
};
