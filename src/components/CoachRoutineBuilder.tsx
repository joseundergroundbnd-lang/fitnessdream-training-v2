import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Bell,
  BellOff,
  Check,
  Clock,
  Copy,
  Dumbbell,
  Edit3,
  Eye,
  FileText,
  Flame,
  Link2,
  LogOut,
  MessageCircle,
  PlayCircle,
  Plus,
  Search,
  Send,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import { BOOTSTRAPPED_OWNER_EMAIL, OFFICIAL_GYM_EMAIL } from '../firebase';
import { COACH_TEAM } from '../data/seedData';
import { getMachineByCode, TELJU_MACHINES } from '../data/teljuCatalog';
import type { LiveGymMember } from '../services/liveGymService';
import type {
  CoachProfile,
  CoachRoutine,
  CoachRoutineCardioBlock,
  CoachRoutineExercise,
  DirectMessage,
  FeeStatus,
  MuscleGroup,
  PyramidPreset,
  RepSchemeMode,
  RoutineFrequency,
  TeljuMachine,
} from '../types/gym';
import {
  COACH_EQUIPMENT_FILTERS,
  INTENSITY_PRESETS,
  REST_SECONDS_PRESETS,
  ROUTINE_FREQUENCIES,
  STRENGTH_MUSCLE_GROUPS,
  clampSetsCount,
  filterExercisesByMuscleAndEquipment,
  formatPyramidRepsString,
  formatPyramidSummary,
  generatePyramidSetPlan,
  getFrequencyDescription,
  normalizeEquipmentCategory,
} from '../utils/routineBuilder';
import {
  DIRECT_SHARED_APP_URL,
  buildCoachPortalUrl,
  buildReceptionPcUrl,
  resolveDirectPublicUrl,
} from '../utils/pwaUtils';
import { buildCoachChatContacts } from '../utils/messaging';
import { mergeCoachDirectoryMembers } from '../utils/memberSync';
import type { NotificationPermissionState } from '../utils/notifications';
import { CoachMessageThread, type SendDirectMessageResult } from './CoachMessageThread';
import type { PresentationKitTab } from './PresentationKitModal';

interface CoachRoutineBuilderProps {
  activeCoach: CoachProfile;
  onSelectCoach: (coachId: string) => void;
  authUser: User | null;
  isLiveAdmin: boolean;
  isSigningIn?: boolean;
  primaryGymEmail?: string;
  onSignInGoogle: (loginHintEmail?: string) => Promise<void>;
  onSignOutGoogle?: () => Promise<void>;
  liveMembers: LiveGymMember[];
  localDemoMembers: LiveGymMember[];
  coachRoutines: CoachRoutine[];
  directMessages?: DirectMessage[];
  onSendDirectMessage?: (
    msg: Omit<DirectMessage, 'id' | 'timestampLabel'>
  ) => Promise<SendDirectMessageResult | void> | SendDirectMessageResult | void;
  notificationPermission?: NotificationPermissionState;
  onRequestNotificationPermission?: () => Promise<void>;
  onTestNotification?: () => Promise<void>;
  onSendCoachRoutine: (routine: CoachRoutine) => void;
  onCreateWalkInMember?: (input: {
    name: string;
    phone: string;
    email?: string;
    tier: 'Socio Fundador' | 'Socio Club';
    feeStatus: FeeStatus;
    assignedCoach: string;
  }) => Promise<{ savedToCloud: boolean; member: LiveGymMember }>;
  onPreviewRoutinesInMemberView: () => void;
  onOpenPresentationKit: (tab: PresentationKitTab) => void;
  isStandaloneCoachPortal?: boolean;
}

const CARDIO_MACHINES = TELJU_MACHINES.filter((m) => m.trackingMode === 'cardio');

const CARDIO_INTENSITY_PRESETS = [
  'Zona 2 · 10% incl. · 5 km/h',
  'LISS · Ritmo constante suave',
  'HIIT · 30s fuerte / 60s suave',
  'Moderado · 130–145 ppm',
  'Recuperación activa · 60% FC',
];

const FIXED_REP_PRESETS = ['6', '8', '10', '12', '15', '8-10', '10-12', '12-15'];

const DEFAULT_DAY_LABEL_BY_FREQ: Record<RoutineFrequency, string> = {
  Diaria: 'Sesión de hoy',
  Semanal: 'Plan semanal · Día 1',
  Mensual: 'Mesociclo 4 semanas · Bloque 1',
  Trimestral: 'Macrociclo 12 semanas · Fase 1',
};

export const CoachRoutineBuilder: React.FC<CoachRoutineBuilderProps> = ({
  activeCoach,
  onSelectCoach,
  authUser,
  isLiveAdmin,
  isSigningIn = false,
  primaryGymEmail = 'joseundergroundbnd@gmail.com',
  onSignInGoogle,
  onSignOutGoogle,
  liveMembers,
  localDemoMembers,
  coachRoutines,
  directMessages = [],
  onSendDirectMessage,
  notificationPermission,
  onRequestNotificationPermission,
  onTestNotification,
  onSendCoachRoutine,
  onCreateWalkInMember,
  onPreviewRoutinesInMemberView,
  onOpenPresentationKit,
  isStandaloneCoachPortal = false,
}) => {
  const [portalSection, setPortalSection] = useState<'rutinas' | 'chat'>('rutinas');

  // Inline "+ Nuevo socio" quick-add right inside Coach Javi's page
  const [showQuickAddMember, setShowQuickAddMember] = useState(false);
  const [quickMemberName, setQuickMemberName] = useState('');
  const [quickMemberPhone, setQuickMemberPhone] = useState('');
  const [quickMemberTier, setQuickMemberTier] = useState<'Socio Fundador' | 'Socio Club'>(
    'Socio Fundador'
  );
  const [quickMemberSaving, setQuickMemberSaving] = useState(false);
  const [quickMemberNotice, setQuickMemberNotice] = useState<{
    tone: 'ok' | 'warn' | 'err';
    text: string;
  } | null>(null);

  // Unified searchable member database: real Firestore members first, then reception walk-ins & demo fallback without duplicates
  const allDirectoryMembers = useMemo(
    () => mergeCoachDirectoryMembers(liveMembers, localDemoMembers),
    [liveMembers, localDemoMembers]
  );

  // Unified chat contacts: combines directory members AND any real member who sent a message (e.g. Unai Martínez)
  const chatContacts = useMemo(
    () =>
      buildCoachChatContacts({
        directoryMembers: allDirectoryMembers,
        directMessages,
        activeCoachId: activeCoach.id,
        authUid: authUser?.uid ?? null,
      }),
    [allDirectoryMembers, directMessages, activeCoach.id, authUser?.uid]
  );

  const realMembersCount = useMemo(
    () => allDirectoryMembers.filter((m) => m.isCloud || m.isRealMember).length,
    [allDirectoryMembers]
  );

  const activeCoachMessagesCount = useMemo(
    () => directMessages.filter((m) => m.coachId === activeCoach.id).length,
    [directMessages, activeCoach.id]
  );

  const waitingChatsCount = useMemo(
    () => chatContacts.filter((c) => c.hasMemberReplyWaiting).length,
    [chatContacts]
  );

  // Step 1: Member selection (exclusive recipient OR 'all') + active chat thread selection
  const [memberSearch, setMemberSearch] = useState('');
  const [selectedRecipientId, setSelectedRecipientId] = useState<string>(
    () => allDirectoryMembers[0]?.id ?? 'all'
  );
  const [selectedChatThreadId, setSelectedChatThreadId] = useState<string | null>(null);

  // If the first real cloud/reception member arrives while selection is still missing, keep it valid
  useEffect(() => {
    if (selectedRecipientId === 'all') return;
    const stillExists = allDirectoryMembers.some((m) => m.id === selectedRecipientId);
    if (!stillExists && allDirectoryMembers[0]) {
      setSelectedRecipientId(allDirectoryMembers[0].id);
    }
  }, [allDirectoryMembers, selectedRecipientId]);

  const activeChatContact = useMemo(() => {
    if (selectedChatThreadId) {
      const explicit = chatContacts.find((c) => c.threadMemberId === selectedChatThreadId);
      if (explicit) return explicit;
    }
    if (selectedRecipientId !== 'all') {
      const linked = chatContacts.find((c) => c.recipientMemberId === selectedRecipientId);
      if (linked) return linked;
    }
    return chatContacts[0] ?? null;
  }, [chatContacts, selectedChatThreadId, selectedRecipientId]);

  const filteredChatContacts = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    if (!q) return chatContacts;
    return chatContacts.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.subtitle.toLowerCase().includes(q) ||
        (c.memberCode && c.memberCode.toLowerCase().includes(q))
    );
  }, [chatContacts, memberSearch]);

  const handleSelectChatContact = (threadMemberId: string, recipientMemberId: string | null) => {
    setSelectedChatThreadId(threadMemberId);
    if (
      recipientMemberId &&
      allDirectoryMembers.some((m) => m.id === recipientMemberId)
    ) {
      setSelectedRecipientId(recipientMemberId);
    }
  };

  const handleQuickAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onCreateWalkInMember) return;
    const cleanName = quickMemberName.trim();
    if (!cleanName) {
      setQuickMemberNotice({
        tone: 'err',
        text: 'Escribe el nombre y apellidos del nuevo socio.',
      });
      return;
    }
    setQuickMemberSaving(true);
    setQuickMemberNotice(null);
    try {
      const res = await onCreateWalkInMember({
        name: cleanName,
        phone: quickMemberPhone.trim() || '600 000 000',
        tier: quickMemberTier,
        feeStatus: 'al-dia',
        assignedCoach: activeCoach.name,
      });
      setSelectedRecipientId(res.member.id);
      setSelectedChatThreadId(res.member.uid);
      setMemberSearch('');
      setQuickMemberName('');
      setQuickMemberPhone('');
      setShowQuickAddMember(false);
      setQuickMemberNotice(
        res.savedToCloud
          ? {
              tone: 'ok',
              text: `Socio «${res.member.name}» (${res.member.memberCode}) creado EN LA NUBE y seleccionado para enviar rutina o chatear.`,
            }
          : {
              tone: 'warn',
              text: `Socio «${res.member.name}» (${res.member.memberCode}) creado en modo local y seleccionado. Conecta Google arriba para sincronizarlo en la nube con otros dispositivos.`,
            }
      );
    } catch (err) {
      setQuickMemberNotice({
        tone: 'err',
        text:
          err instanceof Error
            ? err.message
            : 'No se pudo dar de alta al nuevo socio. Revisa tu conexión.',
      });
    } finally {
      setQuickMemberSaving(false);
    }
  };

  // Step 2: Plan duration & metadata
  const [frequency, setFrequency] = useState<RoutineFrequency>('Semanal');
  const [title, setTitle] = useState('');
  const [dayLabel, setDayLabel] = useState(DEFAULT_DAY_LABEL_BY_FREQ.Semanal);
  const [goal, setGoal] = useState('Hipertrofia y fuerza progresiva');
  const [coachMessage, setCoachMessage] = useState('');

  // Step 3: Muscle group & equipment explorer
  const [selectedMuscle, setSelectedMuscle] = useState<MuscleGroup>('Pecho');
  const [selectedEquipment, setSelectedEquipment] = useState<
    'todos' | 'Máquinas Telju' | 'Mancuernas y Barra' | 'Polea'
  >('todos');
  const [exerciseSearch, setExerciseSearch] = useState('');

  // Exercise Configurator Modal state (1-10 sets, fixed vs pyramid, weight/intensity, rest)
  const [configuringMachine, setConfiguringMachine] = useState<TeljuMachine | null>(null);
  const [editingExerciseIndex, setEditingExerciseIndex] = useState<number | null>(null);
  const [cfgSets, setCfgSets] = useState<number>(4);
  const [cfgRepScheme, setCfgRepScheme] = useState<RepSchemeMode>('fijas');
  const [cfgFixedReps, setCfgFixedReps] = useState<string>('10-12');
  const [cfgPyramidPreset, setCfgPyramidPreset] = useState<PyramidPreset>('ascendente');
  const [cfgCustomPyramid, setCfgCustomPyramid] = useState<string>('15-12-10-8');
  const [cfgWeightKg, setCfgWeightKg] = useState<number>(50);
  const [cfgIntensity, setCfgIntensity] = useState<string>('Alta (RPE 8 · RIR 2)');
  const [cfgRestSec, setCfgRestSec] = useState<number>(90);
  const [cfgNote, setCfgNote] = useState<string>('');

  // Built exercises in current routine draft
  const [draftExercises, setDraftExercises] = useState<CoachRoutineExercise[]>([]);

  // Step 4: Optional Cardio Block
  const [cardioEnabled, setCardioEnabled] = useState<boolean>(false);
  const [cardioMachineCode, setCardioMachineCode] = useState<string>(
    CARDIO_MACHINES[0]?.code ?? '4HP4TN'
  );
  const [cardioMinutes, setCardioMinutes] = useState<number>(20);
  const [cardioIntensity, setCardioIntensity] = useState<string>(CARDIO_INTENSITY_PRESETS[0]);
  const [cardioNote, setCardioNote] = useState<string>('');

  // Feedback, links panel & history filter
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [showLinksDrawer, setShowLinksDrawer] = useState<boolean>(isStandaloneCoachPortal);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [historyFilter, setHistoryFilter] = useState<'todos' | 'seleccionado'>('todos');

  const publicBaseUrl = useMemo(() => {
    if (typeof window === 'undefined') return DIRECT_SHARED_APP_URL;
    return resolveDirectPublicUrl(window.location.origin);
  }, []);

  const coachLinks = useMemo(
    () => [
      {
        key: 'coach-all',
        label: 'Enlace Portal Coaches (Todos los entrenadores)',
        url: buildCoachPortalUrl(publicBaseUrl),
      },
      {
        key: 'coach-javi',
        label: 'Enlace directo Coach Javi Busta',
        url: buildCoachPortalUrl(publicBaseUrl, 'javi'),
      },
      {
        key: 'coach-joel',
        label: 'Enlace directo Coach Joel',
        url: buildCoachPortalUrl(publicBaseUrl, 'joel'),
      },
      {
        key: 'reception-pc',
        label: 'Enlace Ordenador Recepción',
        url: buildReceptionPcUrl(publicBaseUrl),
      },
      {
        key: 'member-app',
        label: 'Enlace Socios (el del Cartel A3 QR)',
        url: publicBaseUrl,
      },
    ],
    [publicBaseUrl]
  );

  const selectedRecipient = useMemo(
    () =>
      selectedRecipientId === 'all'
        ? null
        : allDirectoryMembers.find((m) => m.id === selectedRecipientId) ?? null,
    [allDirectoryMembers, selectedRecipientId]
  );

  const filteredDirectoryMembers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    if (!q) return allDirectoryMembers;
    return allDirectoryMembers.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.memberCode.toLowerCase().includes(q) ||
        m.goal.toLowerCase().includes(q) ||
        m.assignedCoach.toLowerCase().includes(q)
    );
  }, [allDirectoryMembers, memberSearch]);

  const exercisesForMuscle = useMemo(() => {
    const list = filterExercisesByMuscleAndEquipment(
      TELJU_MACHINES,
      selectedMuscle,
      selectedEquipment
    );
    const q = exerciseSearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.code.toLowerCase().includes(q) ||
        m.line.toLowerCase().includes(q)
    );
  }, [selectedMuscle, selectedEquipment, exerciseSearch]);

  const equipmentCountsForMuscle = useMemo(() => {
    const allForMuscle = TELJU_MACHINES.filter((m) => m.muscleGroup === selectedMuscle);
    return {
      todos: allForMuscle.length,
      'Máquinas Telju': allForMuscle.filter(
        (m) => normalizeEquipmentCategory(m.category) === 'Máquinas Telju'
      ).length,
      'Mancuernas y Barra': allForMuscle.filter(
        (m) => normalizeEquipmentCategory(m.category) === 'Mancuernas y Barra'
      ).length,
      Polea: allForMuscle.filter((m) => normalizeEquipmentCategory(m.category) === 'Polea').length,
    };
  }, [selectedMuscle]);

  const livePyramidPreview = useMemo(
    () =>
      generatePyramidSetPlan(
        cfgSets,
        cfgPyramidPreset,
        cfgWeightKg,
        cfgPyramidPreset === 'personalizada' ? cfgCustomPyramid : undefined
      ),
    [cfgSets, cfgPyramidPreset, cfgWeightKg, cfgCustomPyramid]
  );

  const visibleHistoryRoutines = useMemo(() => {
    if (historyFilter === 'todos' || !selectedRecipient) return coachRoutines;
    return coachRoutines.filter(
      (r) =>
        r.targetMemberId === selectedRecipient.id ||
        r.targetMemberId === selectedRecipient.uid ||
        (r.targetMemberCode && r.targetMemberCode === selectedRecipient.memberCode)
    );
  }, [coachRoutines, historyFilter, selectedRecipient]);

  const handleCopyUrl = (key: string, url: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(url);
    }
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey(null), 2200);
  };

  const handleOpenExerciseConfigurator = (machine: TeljuMachine, existingIdx?: number) => {
    setConfiguringMachine(machine);
    if (existingIdx !== undefined && draftExercises[existingIdx]) {
      const ex = draftExercises[existingIdx];
      setEditingExerciseIndex(existingIdx);
      setCfgSets(clampSetsCount(ex.targetSets));
      setCfgRepScheme(ex.repScheme ?? 'fijas');
      setCfgFixedReps(ex.repScheme === 'piramide' ? '10-12' : ex.targetReps);
      setCfgPyramidPreset(ex.pyramidPreset ?? 'ascendente');
      setCfgCustomPyramid(ex.repScheme === 'piramide' ? ex.targetReps : '15-12-10-8');
      setCfgWeightKg(ex.suggestedWeightKg);
      setCfgIntensity(ex.intensityLabel ?? 'Alta (RPE 8 · RIR 2)');
      setCfgRestSec(ex.restSeconds || 90);
      setCfgNote(ex.note ?? '');
      return;
    }

    setEditingExerciseIndex(null);
    setCfgSets(4);
    setCfgRepScheme('fijas');
    setCfgFixedReps('10-12');
    setCfgPyramidPreset('ascendente');
    setCfgCustomPyramid('15-12-10-8');
    const defaultWeight =
      machine.category === 'Mancuernas y Barra'
        ? machine.isPlateLoaded
          ? 60
          : 20
        : machine.category === 'Polea'
          ? 25
          : machine.isPlateLoaded
            ? 70
            : 45;
    setCfgWeightKg(defaultWeight);
    setCfgIntensity('Alta (RPE 8 · RIR 2)');
    setCfgRestSec(90);
    setCfgNote('');
  };

  const handleConfirmConfiguredExercise = () => {
    if (!configuringMachine) return;
    const safeSets = clampSetsCount(cfgSets);
    const pyramidSets =
      cfgRepScheme === 'piramide'
        ? generatePyramidSetPlan(
            safeSets,
            cfgPyramidPreset,
            cfgWeightKg,
            cfgPyramidPreset === 'personalizada' ? cfgCustomPyramid : undefined
          )
        : undefined;

    const exerciseItem: CoachRoutineExercise = {
      machineCode: configuringMachine.code,
      exerciseName: configuringMachine.name,
      muscleGroup: configuringMachine.muscleGroup,
      equipmentType: normalizeEquipmentCategory(configuringMachine.category),
      targetSets: safeSets,
      repScheme: cfgRepScheme,
      targetReps:
        cfgRepScheme === 'piramide' && pyramidSets
          ? formatPyramidRepsString(pyramidSets)
          : cfgFixedReps.trim() || '10-12',
      pyramidPreset: cfgRepScheme === 'piramide' ? cfgPyramidPreset : undefined,
      pyramidSets,
      suggestedWeightKg: Math.max(0, Number(cfgWeightKg) || 0),
      intensityLabel: cfgIntensity.trim() || 'Alta (RPE 8 · RIR 2)',
      restSeconds: Math.max(15, Math.min(600, Number(cfgRestSec) || 90)),
      note: cfgNote.trim() || undefined,
    };

    if (editingExerciseIndex !== null) {
      setDraftExercises((prev) =>
        prev.map((item, idx) => (idx === editingExerciseIndex ? exerciseItem : item))
      );
    } else {
      setDraftExercises((prev) => [...prev, exerciseItem]);
    }

    setConfiguringMachine(null);
    setEditingExerciseIndex(null);
    setFormError(null);
  };

  const handleRemoveDraftExercise = (index: number) => {
    setDraftExercises((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSelectFrequency = (nextFreq: RoutineFrequency) => {
    setFrequency(nextFreq);
    setDayLabel(DEFAULT_DAY_LABEL_BY_FREQ[nextFreq]);
  };

  const handleSubmitRoutine = (e?: React.FormEvent) => {
    e?.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    if (draftExercises.length === 0 && !cardioEnabled) {
      setFormError('Añade al menos un ejercicio de fuerza o activa el bloque de cardio.');
      return;
    }

    const cleanTitle =
      title.trim() ||
      `Rutina ${selectedMuscle} (${frequency})${selectedRecipient ? ` · ${selectedRecipient.name.split(' ')[0]}` : ''}`;

    const selectedCardioMachine = CARDIO_MACHINES.find((m) => m.code === cardioMachineCode);
    const cardioBlock: CoachRoutineCardioBlock | undefined = cardioEnabled
      ? {
          enabled: true,
          machineCode: selectedCardioMachine?.code ?? '4HP4TN',
          machineName: selectedCardioMachine?.name ?? 'Cinta de Correr Health',
          durationMin: Math.max(5, Math.min(180, Number(cardioMinutes) || 20)),
          intensityLabel: cardioIntensity.trim() || 'Zona 2 · Moderada',
          note: cardioNote.trim() || undefined,
        }
      : undefined;

    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(
      now.getMinutes()
    ).padStart(2, '0')}`;

    const createdRoutine: CoachRoutine = {
      id: `cr-coach-${Date.now()}`,
      title: cleanTitle,
      frequency,
      dayLabel: dayLabel.trim() || DEFAULT_DAY_LABEL_BY_FREQ[frequency],
      targetMemberId: selectedRecipient ? selectedRecipient.id : 'all',
      targetMemberName: selectedRecipient ? selectedRecipient.name : 'Todos los socios',
      targetMemberCode: selectedRecipient ? selectedRecipient.memberCode : undefined,
      coachId: activeCoach.id,
      coachName: activeCoach.name,
      coachRole: activeCoach.role,
      coachAvatar: activeCoach.avatarUrl,
      goal: goal.trim() || 'Hipertrofia y constancia',
      sentAt: `Hoy, ${timeStr}`,
      isNew: true,
      coachMessage:
        coachMessage.trim() ||
        `Plan ${frequency.toLowerCase()} preparado por Coach ${activeCoach.name}. Controla cada serie y respeta los descansos.`,
      exercises: draftExercises,
      cardioBlock,
    };

    onSendCoachRoutine(createdRoutine);
    setFormSuccess(
      selectedRecipient
        ? `Rutina ${frequency.toLowerCase()} «${createdRoutine.title}» enviada exclusivamente a ${selectedRecipient.name} (${selectedRecipient.memberCode}) por Coach ${activeCoach.name}.`
        : `Rutina general «${createdRoutine.title}» publicada para todos los socios por Coach ${activeCoach.name}.`
    );
    setTitle('');
    setCoachMessage('');
    setDraftExercises([]);
    setCardioEnabled(false);
  };

  return (
    <div className="space-y-6">
      {/* TOP BAR: COACH IDENTITY, DEDICATED COACH LINKS, CLOUD SYNC & TUTORIAL GUIDES */}
      <div className="rounded-2xl bg-[#0D121B] border border-white/10 p-4 sm:p-6 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <img
              src={activeCoach.avatarUrl}
              alt={`Coach ${activeCoach.name}`}
              referrerPolicy="no-referrer"
              className="w-14 h-16 rounded-xl object-cover object-top border-2 border-[#00A8FF] shrink-0"
            />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-[#33C1FF]">
                Portal Exclusivo de Entrenadores · Acceso total para todos los coaches
              </p>
              <h2 className="text-2xl sm:text-3xl font-bold text-white leading-tight mt-0.5">
                Constructor de Rutinas · Coach {activeCoach.name}
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Base de datos de socios conectada ({allDirectoryMembers.length} perfiles) · Envío
                exclusivo a cada cliente con Telju, mancuernas/barra, polea, pirámides y cardio.
              </p>
            </div>
          </div>

          {/* Coach Switcher (ALL Coaches have full access) */}
          <div className="flex flex-wrap items-center gap-2">
            <div
              className="inline-flex items-center gap-1 p-1 rounded-xl bg-[#06080D] border border-white/10"
              role="group"
              aria-label="Seleccionar coach activo"
            >
              {COACH_TEAM.map((coach) => {
                const isSelected = activeCoach.id === coach.id;
                return (
                  <button
                    key={coach.id}
                    type="button"
                    onClick={() => onSelectCoach(coach.id)}
                    aria-pressed={isSelected}
                    className={`min-h-[40px] pl-1.5 pr-3 rounded-lg text-xs font-bold flex items-center gap-2 cursor-pointer whitespace-nowrap transition-colors ${
                      isSelected
                        ? 'bg-[#00A8FF] text-[#04070D]'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    <img
                      src={coach.avatarUrl}
                      alt={coach.name}
                      referrerPolicy="no-referrer"
                      className="w-6 h-6 rounded-md object-cover object-top shrink-0"
                    />
                    <span>{coach.name}</span>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => setShowLinksDrawer((v) => !v)}
              className="min-h-[42px] px-3.5 rounded-xl bg-[#06080D] hover:border-[#00A8FF] border border-white/15 text-xs font-semibold text-white flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Link2 className="w-4 h-4 text-[#00A8FF]" />
              <span>{showLinksDrawer ? 'Ocultar Enlaces' : 'Enlaces Coaches'}</span>
            </button>
          </div>
        </div>

        {/* Cloud Sync Bar + Direct Tutorial PDF & Enceladus Mobile Video Triggers */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-3 border-t border-white/8">
          <div className="flex flex-wrap items-center gap-2.5 text-xs">
            {authUser && isLiveAdmin ? (
              <div className="inline-flex flex-wrap items-center gap-2 px-3 py-2 rounded-xl bg-emerald-950/45 border border-emerald-500/45 text-emerald-200">
                <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                <span className="font-semibold">
                  CONECTADO ({authUser.email}) · {liveMembers.length} socios reales en la nube
                </span>
                {onSignOutGoogle && (
                  <button
                    type="button"
                    onClick={() => void onSignOutGoogle()}
                    className="ml-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/10 hover:bg-white/20 text-white font-semibold cursor-pointer"
                  >
                    <LogOut className="w-3 h-3" />
                    Cambiar cuenta
                  </button>
                )}
              </div>
            ) : authUser ? (
              <div className="inline-flex flex-wrap items-center gap-2 px-3 py-2 rounded-xl bg-amber-950/40 border border-amber-500/45 text-amber-200">
                <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                <span className="font-medium">
                  Conectado como <strong>{authUser.email}</strong> (cuenta de socio, sin acceso de
                  coach). Elige una cuenta autorizada del club:
                </span>
                <button
                  type="button"
                  disabled={isSigningIn}
                  onClick={() => void onSignInGoogle(OFFICIAL_GYM_EMAIL)}
                  className="px-2.5 py-1 rounded-lg bg-[#00A8FF] hover:bg-[#33C1FF] text-[#04070D] font-bold cursor-pointer whitespace-nowrap"
                >
                  {OFFICIAL_GYM_EMAIL}
                </button>
                <button
                  type="button"
                  disabled={isSigningIn}
                  onClick={() => void onSignInGoogle(BOOTSTRAPPED_OWNER_EMAIL)}
                  className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold cursor-pointer whitespace-nowrap"
                >
                  {BOOTSTRAPPED_OWNER_EMAIL}
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-amber-300 font-medium inline-flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                  Sin conectar a Google · Elige con cuál entrar (comparten los mismos socios):
                </span>
                <button
                  type="button"
                  disabled={isSigningIn}
                  onClick={() => void onSignInGoogle(OFFICIAL_GYM_EMAIL)}
                  className="min-h-[36px] px-3 rounded-lg bg-[#00A8FF] hover:bg-[#33C1FF] disabled:opacity-60 text-[#04070D] text-xs font-bold cursor-pointer whitespace-nowrap"
                >
                  {isSigningIn ? 'Conectando...' : `Entrar: ${OFFICIAL_GYM_EMAIL}`}
                </button>
                <button
                  type="button"
                  disabled={isSigningIn}
                  onClick={() => void onSignInGoogle(BOOTSTRAPPED_OWNER_EMAIL)}
                  className="min-h-[36px] px-3 rounded-lg bg-[#06080D] hover:border-[#00A8FF] disabled:opacity-60 border border-[#00A8FF]/50 text-white text-xs font-bold cursor-pointer whitespace-nowrap"
                >
                  {isSigningIn ? 'Conectando...' : `Entrar: ${BOOTSTRAPPED_OWNER_EMAIL}`}
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {onRequestNotificationPermission && notificationPermission !== 'unsupported' && (
              notificationPermission === 'granted' ? (
                <button
                  type="button"
                  onClick={() => void onTestNotification?.()}
                  className="min-h-[38px] px-3 rounded-lg bg-emerald-950/55 hover:bg-emerald-900/60 border border-emerald-500/45 text-xs font-semibold text-emerald-200 flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Bell className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Avisos Coach activos (Probar)</span>
                </button>
              ) : notificationPermission === 'denied' ? (
                <span className="min-h-[38px] px-3 rounded-lg bg-rose-950/50 border border-rose-500/40 text-xs font-semibold text-rose-200 inline-flex items-center gap-1.5 whitespace-nowrap">
                  <BellOff className="w-3.5 h-3.5 text-rose-400" />
                  <span>Notificaciones bloqueadas</span>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => void onRequestNotificationPermission()}
                  className="min-h-[38px] px-3 rounded-lg bg-[#00A8FF]/18 hover:bg-[#00A8FF] hover:text-[#04070D] border border-[#00A8FF]/60 text-xs font-bold text-[#33C1FF] flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-colors"
                >
                  <Bell className="w-3.5 h-3.5" />
                  <span>Activar notificaciones Coach</span>
                </button>
              )
            )}
            <button
              type="button"
              onClick={() => onOpenPresentationKit('coach-pdf')}
              className="min-h-[38px] px-3 rounded-lg bg-[#06080D] hover:border-[#00A8FF] border border-[#00A8FF]/45 text-xs font-semibold text-white flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <FileText className="w-3.5 h-3.5 text-[#00A8FF]" />
              <span>PDF Guía Rutina Coach</span>
            </button>
            <button
              type="button"
              onClick={() => onOpenPresentationKit('coach-video')}
              className="min-h-[38px] px-3 rounded-lg bg-[#00A8FF] hover:bg-[#33C1FF] text-[#04070D] text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <PlayCircle className="w-3.5 h-3.5" />
              <span>Vídeo Móvil (Enceladus)</span>
            </button>
          </div>
        </div>

        {/* Collapsible Dedicated Coach URLs Panel */}
        {showLinksDrawer && (
          <div className="rounded-xl bg-[#06080D] border border-[#00A8FF]/30 p-4 space-y-3">
            <div>
              <h3 className="text-sm font-bold text-white">
                Enlaces separados: Coaches vs Socios vs Recepción
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Los entrenadores entran por su enlace propio (sin pasar por el registro de socio) e
                inician sesión con la cuenta Google del gimnasio para acceder a la base de datos
                completa de socios.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {coachLinks.map((item) => (
                <div
                  key={item.key}
                  className="rounded-lg bg-[#0D121B] border border-white/10 px-3 py-2.5 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-white truncate">{item.label}</p>
                    <p className="text-[11px] font-mono text-[#33C1FF] truncate">{item.url}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopyUrl(item.key, item.url)}
                    aria-label={`Copiar ${item.label}`}
                    className="min-h-[36px] px-2.5 rounded-lg bg-white/6 hover:bg-[#00A8FF] hover:text-[#04070D] text-xs font-semibold text-slate-200 flex items-center gap-1 cursor-pointer shrink-0 transition-colors"
                  >
                    {copiedKey === item.key ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Copiado</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copiar</span>
                      </>
                    )}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        {/* Portal Mode Switcher: Routine Builder vs Live Member Chat & Voice Notes */}
        {onSendDirectMessage && (
          <div
            className="flex flex-wrap items-center gap-2 pt-3 border-t border-white/8"
            role="tablist"
            aria-label="Herramientas del Portal Coaches"
          >
            <button
              type="button"
              role="tab"
              aria-selected={portalSection === 'rutinas'}
              onClick={() => setPortalSection('rutinas')}
              className={`min-h-[42px] px-4 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer transition-colors ${
                portalSection === 'rutinas'
                  ? 'bg-[#00A8FF] text-[#04070D]'
                  : 'bg-[#06080D] border border-white/12 text-slate-300 hover:text-white hover:border-[#00A8FF]/50'
              }`}
            >
              <Dumbbell className="w-4 h-4 shrink-0" />
              <span>Constructor de Rutinas</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={portalSection === 'chat'}
              onClick={() => setPortalSection('chat')}
              className={`min-h-[42px] px-4 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer transition-colors ${
                portalSection === 'chat'
                  ? 'bg-[#00A8FF] text-[#04070D]'
                  : 'bg-[#06080D] border border-white/12 text-slate-300 hover:text-white hover:border-[#00A8FF]/50'
              }`}
            >
              <MessageCircle className="w-4 h-4 shrink-0" />
              <span>Chat y Audios con Socios</span>
              <span
                className={`px-1.5 py-0.5 rounded-md text-[11px] font-mono tabular-nums ${
                  portalSection === 'chat'
                    ? 'bg-[#04070D]/20 text-[#04070D]'
                    : waitingChatsCount > 0
                      ? 'bg-emerald-500/25 text-emerald-300'
                      : 'bg-[#00A8FF]/18 text-[#33C1FF]'
                }`}
              >
                {waitingChatsCount > 0 ? `${waitingChatsCount} nuevos · ` : ''}
                {activeCoachMessagesCount}
              </span>
            </button>
          </div>
        )}
      </div>

      {/* LIVE BIDIRECTIONAL COACH <-> REAL MEMBER CHAT & VOICE AUDIO INBOX */}
      {portalSection === 'chat' && onSendDirectMessage && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <section className="lg:col-span-4 rounded-2xl bg-[#0D121B] border border-white/10 p-5 space-y-4">
            <div>
              <p className="text-xs font-semibold text-[#33C1FF]">
                Comunicación Directa · Coach {activeCoach.name}
              </p>
              <h3 className="text-lg font-bold text-white mt-0.5">
                Bandeja de Socios (Texto y Audio)
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Los socios con mensajes recién recibidos aparecen primero. Pulsa cualquiera para
                escuchar sus audios y responder en directo.
              </p>
            </div>

            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                placeholder="Buscar socio por nombre o código FD-..."
                aria-label="Buscar socio para chatear"
                className="w-full min-h-[42px] pl-10 pr-3.5 rounded-xl bg-[#06080D] border border-white/12 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#00A8FF]"
              />
            </div>

            <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
              {filteredChatContacts.map((contact) => {
                const isSelected = activeChatContact?.threadMemberId === contact.threadMemberId;
                return (
                  <button
                    key={contact.threadMemberId}
                    type="button"
                    onClick={() =>
                      handleSelectChatContact(contact.threadMemberId, contact.recipientMemberId)
                    }
                    aria-pressed={isSelected}
                    className={`w-full p-3 rounded-xl border text-left flex items-center justify-between gap-2.5 transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-[#00A8FF]/14 border-[#00A8FF]'
                        : contact.hasMemberReplyWaiting
                          ? 'bg-emerald-950/30 border-emerald-500/40 hover:border-emerald-400'
                          : 'bg-[#06080D] border-white/10 hover:border-white/25'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate flex items-center gap-1.5">
                        {contact.hasMemberReplyWaiting && (
                          <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                        )}
                        <span className="truncate">{contact.name}</span>
                        {contact.isCloud ? (
                          <span className="text-[10px] font-mono text-emerald-300 shrink-0">
                            · Nube
                          </span>
                        ) : contact.isRealMember ? (
                          <span className="text-[10px] font-mono text-[#33C1FF] shrink-0">
                            · Alta
                          </span>
                        ) : null}
                      </p>
                      <p className="text-xs font-mono text-slate-400 truncate">
                        {contact.latestMessage
                          ? contact.latestMessage.kind === 'audio'
                            ? `Audio (${contact.latestMessage.audioDurationSec ?? 5}s) · ${contact.latestMessage.timestampLabel}`
                            : `${(contact.latestMessage.text || '').slice(0, 36)} · ${contact.latestMessage.timestampLabel}`
                          : contact.subtitle}
                      </p>
                      {contact.otherCoachCount > 0 && contact.activeCoachCount === 0 && (
                        <p className="text-[10px] text-amber-300 mt-0.5">
                          Tiene {contact.otherCoachCount} msg con otro coach
                        </p>
                      )}
                    </div>
                    <span
                      className={`text-xs font-mono tabular-nums shrink-0 px-2 py-0.5 rounded-md ${
                        contact.hasMemberReplyWaiting
                          ? 'bg-emerald-500/20 text-emerald-300 font-bold'
                          : 'text-[#33C1FF]'
                      }`}
                    >
                      {contact.activeCoachCount}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <div className="lg:col-span-8">
            {activeChatContact && (
              <CoachMessageThread
                viewerRole="coach"
                coach={activeCoach}
                memberId={activeChatContact.threadMemberId}
                memberName={activeChatContact.name}
                messages={directMessages}
                onSendMessage={onSendDirectMessage}
                isCloudConnected={Boolean(authUser && isLiveAdmin)}
                cloudStatusHint={
                  authUser && isLiveAdmin
                    ? `Conectado como ${authUser.email} · Recibiendo mensajes y audios reales de socios.`
                    : authUser
                      ? `Sesión ${authUser.email} sin permisos de Coach. Entra con ${primaryGymEmail} o autoriza este correo en Dirección.`
                      : `Conecta ${primaryGymEmail} (o una cuenta Coach autorizada) para recibir y responder mensajes reales.`
                }
                onConnectGoogle={onSignInGoogle}
                notificationPermission={notificationPermission}
                onRequestNotificationPermission={onRequestNotificationPermission}
                onTestNotification={onTestNotification}
              />
            )}
          </div>
        </div>
      )}

      {/* MAIN 2-COLUMN WORKSPACE: LEFT = 4-STEP BUILDER · RIGHT = LIVE CHATS + SUMMARY + SENT HISTORY */}
      {portalSection === 'rutinas' && (
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN (7 cols): STEPS 1 TO 4 */}
        <div className="xl:col-span-7 space-y-6">
          {/* PASO 1: BASE DE DATOS DE SOCIOS (SELECCIÓN EXCLUSIVA) */}
          <section className="rounded-2xl bg-[#0D121B] border border-white/10 p-4 sm:p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold text-[#33C1FF]">
                  01. Destinatario exclusivo · Base de datos de socios
                </p>
                <h3 className="text-xl font-bold text-white mt-0.5">
                  ¿A qué socio le envías esta rutina?
                </h3>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-mono tabular-nums text-slate-400">
                  {realMembersCount > 0 ? `${realMembersCount} reales/alta · ` : ''}
                  {filteredDirectoryMembers.length} de {allDirectoryMembers.length} socios
                </span>
                {onCreateWalkInMember && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowQuickAddMember((v) => !v);
                      setQuickMemberNotice(null);
                    }}
                    className="min-h-[36px] px-3 rounded-lg bg-[#00A8FF] hover:bg-[#33C1FF] text-[#04070D] text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>{showQuickAddMember ? 'Cerrar alta' : '+ Nuevo socio'}</span>
                  </button>
                )}
              </div>
            </div>

            {showQuickAddMember && onCreateWalkInMember && (
              <form
                onSubmit={(e) => void handleQuickAddMember(e)}
                className="rounded-xl bg-[#06080D] border border-[#00A8FF]/45 p-3.5 space-y-2.5"
              >
                <p className="text-xs font-semibold text-[#33C1FF]">
                  Alta rápida de nuevo socio directamente desde el Portal Coaches
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    type="text"
                    value={quickMemberName}
                    onChange={(e) => setQuickMemberName(e.target.value)}
                    placeholder="Nombre y apellidos (ej. Marta Sánchez)"
                    aria-label="Nombre del nuevo socio"
                    className="min-h-[40px] rounded-lg bg-[#0D121B] border border-white/12 px-3 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-[#00A8FF]"
                  />
                  <input
                    type="tel"
                    value={quickMemberPhone}
                    onChange={(e) => setQuickMemberPhone(e.target.value)}
                    placeholder="Teléfono (ej. 611 223 344)"
                    aria-label="Teléfono del nuevo socio"
                    className="min-h-[40px] rounded-lg bg-[#0D121B] border border-white/12 px-3 text-xs font-mono text-white placeholder:text-slate-500 focus:outline-none focus:border-[#00A8FF]"
                  />
                  <select
                    value={quickMemberTier}
                    onChange={(e) =>
                      setQuickMemberTier(e.target.value as 'Socio Fundador' | 'Socio Club')
                    }
                    aria-label="Tarifa del nuevo socio"
                    className="min-h-[40px] rounded-lg bg-[#0D121B] border border-white/12 px-2.5 text-xs text-white focus:outline-none focus:border-[#00A8FF]"
                  >
                    <option value="Socio Fundador">Socio Fundador (34,90 €)</option>
                    <option value="Socio Club">Socio Club (46,90 €)</option>
                  </select>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-slate-400">
                    {authUser && isLiveAdmin
                      ? 'Se guardará EN LA NUBE y aparecerá al instante en todos los dispositivos.'
                      : 'Modo local hasta que conectes Google arriba.'}
                  </span>
                  <button
                    type="submit"
                    disabled={quickMemberSaving}
                    className="min-h-[38px] px-3.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-[#04070D] text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{quickMemberSaving ? 'Guardando...' : 'Guardar nuevo socio'}</span>
                  </button>
                </div>
              </form>
            )}

            {quickMemberNotice && (
              <p
                role={quickMemberNotice.tone === 'err' ? 'alert' : 'status'}
                className={`text-xs font-medium rounded-lg px-3 py-2 border ${
                  quickMemberNotice.tone === 'err'
                    ? 'bg-rose-950/40 border-rose-500/40 text-rose-200'
                    : quickMemberNotice.tone === 'ok'
                      ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
                      : 'bg-amber-950/40 border-amber-500/40 text-amber-200'
                }`}
              >
                {quickMemberNotice.text}
              </p>
            )}

            {/* Search bar */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                aria-label="Buscar socio en la base de datos"
                placeholder="Buscar socio por nombre, código FD- o objetivo..."
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                className="w-full min-h-[44px] rounded-xl bg-[#06080D] border border-white/12 pl-10 pr-4 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#00A8FF]"
              />
            </div>

            {/* Recipient list */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-60 overflow-y-auto pr-1">
              {filteredDirectoryMembers.map((member) => {
                const isSelected = selectedRecipientId === member.id;
                return (
                  <button
                    key={member.id}
                    type="button"
                    onClick={() => {
                      setSelectedRecipientId(member.id);
                      const matchedThreadId =
                        authUser && member.uid === authUser.uid ? 'current-user' : member.uid;
                      setSelectedChatThreadId(matchedThreadId);
                    }}
                    aria-pressed={isSelected}
                    className={`min-h-[58px] p-3 rounded-xl border text-left transition-colors cursor-pointer flex items-center justify-between gap-2 ${
                      isSelected
                        ? 'bg-[#00A8FF]/16 border-[#00A8FF] text-white'
                        : 'bg-[#06080D] border-white/10 text-slate-200 hover:border-white/25'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-white truncate flex items-center gap-1.5">
                        <span className="truncate">{member.name}</span>
                        {member.isCloud ? (
                          <span className="text-[10px] font-mono text-emerald-300 shrink-0">
                            · Nube
                          </span>
                        ) : member.isRealMember ? (
                          <span className="text-[10px] font-mono text-[#33C1FF] shrink-0">
                            · Alta
                          </span>
                        ) : null}
                      </p>
                      <p className="text-xs text-slate-400 truncate font-mono tabular-nums">
                        {member.memberCode} · {member.tier} ·{' '}
                        {member.feeStatus === 'al-dia' ? 'Al día' : 'Cuota pendiente'}
                      </p>
                      <p className="text-[11px] text-slate-400 truncate mt-0.5">
                        {member.goal || 'Sala general'} · Coach {member.assignedCoach}
                      </p>
                    </div>
                    {isSelected && <UserCheck className="w-5 h-5 text-[#00A8FF] shrink-0" />}
                  </button>
                );
              })}

              {/* Optional general club template */}
              <button
                type="button"
                onClick={() => setSelectedRecipientId('all')}
                aria-pressed={selectedRecipientId === 'all'}
                className={`min-h-[58px] p-3 rounded-xl border text-left transition-colors cursor-pointer flex items-center justify-between gap-2 ${
                  selectedRecipientId === 'all'
                    ? 'bg-[#00A8FF]/16 border-[#00A8FF] text-white'
                    : 'bg-[#06080D] border-white/10 text-slate-300 hover:border-white/25'
                }`}
              >
                <div className="min-w-0">
                  <p className="text-sm font-bold text-white">Todos los socios (Plantilla club)</p>
                  <p className="text-xs text-slate-400">
                    Visible para toda la comunidad FitnessDreams
                  </p>
                </div>
                <Users className="w-5 h-5 text-[#33C1FF] shrink-0" />
              </button>
            </div>

            <div className="rounded-xl bg-[#06080D] border border-white/8 px-3.5 py-2.5 text-xs text-slate-300 flex items-center justify-between gap-2">
              <span>
                Envío configurado:{' '}
                <strong className="text-[#33C1FF]">
                  {selectedRecipient
                    ? `Exclusiva para ${selectedRecipient.name} (${selectedRecipient.memberCode})`
                    : 'Plantilla general para todos los socios'}
                </strong>
              </span>
              {selectedRecipient && (
                <span className="text-[11px] text-slate-400 hidden sm:inline">
                  Solo la verá este socio en su app
                </span>
              )}
            </div>
          </section>

          {/* PASO 2: PLANIFICACIÓN (DIARIA, SEMANAL, MENSUAL, TRIMESTRAL) */}
          <section className="rounded-2xl bg-[#0D121B] border border-white/10 p-4 sm:p-6 space-y-4">
            <div>
              <p className="text-xs font-semibold text-[#33C1FF]">
                02. Periodo y datos del entrenamiento
              </p>
              <h3 className="text-xl font-bold text-white mt-0.5">
                Duración: Diaria, Semanal, Mensual o Trimestral
              </h3>
            </div>

            <div
              className="grid grid-cols-2 sm:grid-cols-4 gap-2"
              role="group"
              aria-label="Seleccionar duración del plan"
            >
              {ROUTINE_FREQUENCIES.map((freq) => {
                const isSelected = frequency === freq;
                return (
                  <button
                    key={freq}
                    type="button"
                    onClick={() => handleSelectFrequency(freq)}
                    aria-pressed={isSelected}
                    className={`min-h-[52px] px-3 py-2 rounded-xl border text-left transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-[#00A8FF] border-[#00A8FF] text-[#04070D]'
                        : 'bg-[#06080D] border-white/10 text-slate-200 hover:border-white/25'
                    }`}
                  >
                    <p className="text-sm font-bold leading-tight">{freq}</p>
                    <p
                      className={`text-[11px] leading-tight mt-0.5 ${
                        isSelected ? 'text-[#04070D]/80 font-medium' : 'text-slate-400'
                      }`}
                    >
                      {getFrequencyDescription(freq)}
                    </p>
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label htmlFor="cb-title" className="block text-xs text-slate-400 mb-1.5">
                  Título de la rutina
                </label>
                <input
                  id="cb-title"
                  type="text"
                  placeholder="Ej. Pecho y Tríceps · Pirámide Telju"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full min-h-[44px] rounded-xl bg-[#06080D] border border-white/12 px-3.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#00A8FF]"
                />
              </div>
              <div>
                <label htmlFor="cb-daylabel" className="block text-xs text-slate-400 mb-1.5">
                  Día / Bloque / Fase
                </label>
                <input
                  id="cb-daylabel"
                  type="text"
                  placeholder="Ej. Lunes · Semana 1 a 4"
                  value={dayLabel}
                  onChange={(e) => setDayLabel(e.target.value)}
                  className="w-full min-h-[44px] rounded-xl bg-[#06080D] border border-white/12 px-3.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#00A8FF]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label htmlFor="cb-goal" className="block text-xs text-slate-400 mb-1.5">
                  Objetivo técnico
                </label>
                <input
                  id="cb-goal"
                  type="text"
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  className="w-full min-h-[44px] rounded-xl bg-[#06080D] border border-white/12 px-3.5 text-sm text-white focus:outline-none focus:border-[#00A8FF]"
                />
              </div>
              <div>
                <label htmlFor="cb-msg" className="block text-xs text-slate-400 mb-1.5">
                  Indicaciones de Coach {activeCoach.name}
                </label>
                <input
                  id="cb-msg"
                  type="text"
                  placeholder="Ej. Controla la bajada 3s y respeta los descansos"
                  value={coachMessage}
                  onChange={(e) => setCoachMessage(e.target.value)}
                  className="w-full min-h-[44px] rounded-xl bg-[#06080D] border border-white/12 px-3.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#00A8FF]"
                />
              </div>
            </div>
          </section>

          {/* PASO 3: GRUPOS MUSCULARES + MAQUINARIA TELJU / MANCUERNAS Y BARRA / POLEA */}
          <section className="rounded-2xl bg-[#0D121B] border border-white/10 p-4 sm:p-6 space-y-4">
            <div>
              <p className="text-xs font-semibold text-[#33C1FF]">
                03. Ejercicios por grupo muscular y equipamiento
              </p>
              <h3 className="text-xl font-bold text-white mt-0.5">
                Pincha un grupo muscular y elige ejercicio para configurar series
              </h3>
            </div>

            {/* Muscle group selector buttons */}
            <div
              className="grid grid-cols-2 sm:grid-cols-4 gap-2"
              role="tablist"
              aria-label="Seleccionar grupo muscular"
            >
              {STRENGTH_MUSCLE_GROUPS.map((muscle) => {
                const isSelected = selectedMuscle === muscle;
                return (
                  <button
                    key={muscle}
                    type="button"
                    role="tab"
                    aria-selected={isSelected}
                    onClick={() => {
                      setSelectedMuscle(muscle);
                      setExerciseSearch('');
                    }}
                    className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer whitespace-nowrap truncate ${
                      isSelected
                        ? 'bg-[#00A8FF] text-[#04070D]'
                        : 'bg-[#06080D] border border-white/10 text-slate-200 hover:border-[#00A8FF]/50'
                    }`}
                  >
                    {muscle}
                  </button>
                );
              })}
            </div>

            {/* Equipment Type Filter Bar: Telju, Mancuernas y Barra, Polea */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-1">
              <div
                className="flex flex-wrap items-center gap-1.5 p-1 rounded-xl bg-[#06080D] border border-white/10"
                role="group"
                aria-label="Filtrar por tipo de equipamiento"
              >
                {COACH_EQUIPMENT_FILTERS.map((eq) => {
                  const isSelected = selectedEquipment === eq;
                  const count = equipmentCountsForMuscle[eq];
                  const label = eq === 'todos' ? 'Todos' : eq;
                  return (
                    <button
                      key={eq}
                      type="button"
                      onClick={() => setSelectedEquipment(eq)}
                      aria-pressed={isSelected}
                      className={`min-h-[38px] px-3 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap transition-colors ${
                        isSelected
                          ? 'bg-[#00A8FF] text-[#04070D]'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      {label} ({count})
                    </button>
                  );
                })}
              </div>

              <input
                type="search"
                aria-label={`Filtrar ejercicios de ${selectedMuscle}`}
                placeholder={`Filtrar en ${selectedMuscle}...`}
                value={exerciseSearch}
                onChange={(e) => setExerciseSearch(e.target.value)}
                className="sm:w-52 min-h-[40px] rounded-xl bg-[#06080D] border border-white/12 px-3 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-[#00A8FF]"
              />
            </div>

            {/* Exercise list for selected muscle + equipment */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-80 overflow-y-auto pr-1">
              {exercisesForMuscle.map((machine) => {
                const alreadyAdded = draftExercises.some((ex) => ex.machineCode === machine.code);
                return (
                  <button
                    key={machine.code}
                    type="button"
                    onClick={() => handleOpenExerciseConfigurator(machine)}
                    className={`min-h-[68px] p-3.5 rounded-xl border text-left transition-colors cursor-pointer flex items-center justify-between gap-3 ${
                      alreadyAdded
                        ? 'bg-[#00A8FF]/12 border-[#00A8FF]/60 text-white'
                        : 'bg-[#06080D] border-white/10 hover:border-[#00A8FF]/60 text-slate-100'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-white leading-snug">{machine.name}</p>
                      <p className="text-xs text-[#33C1FF] mt-0.5">
                        {normalizeEquipmentCategory(machine.category)} · {machine.code}
                      </p>
                      {machine.maxLoad && (
                        <p className="text-[11px] text-slate-400 truncate mt-0.5">
                          {machine.maxLoad}
                        </p>
                      )}
                    </div>
                    <span className="min-w-[36px] min-h-[36px] rounded-lg bg-[#00A8FF]/15 text-[#33C1FF] flex items-center justify-center shrink-0">
                      {alreadyAdded ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* PASO 4: BLOQUE DE CARDIO OPCIONAL */}
          <section className="rounded-2xl bg-[#0D121B] border border-white/10 p-4 sm:p-6 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-[#33C1FF]">
                  04. Opción de Cardio (Telju Health &amp; Ciclo Indoor)
                </p>
                <h3 className="text-xl font-bold text-white mt-0.5">
                  Añadir bloque cardiovascular a la rutina
                </h3>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={cardioEnabled}
                onClick={() => setCardioEnabled((v) => !v)}
                className={`min-h-[42px] px-4 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
                  cardioEnabled
                    ? 'bg-[#00A8FF] text-[#04070D]'
                    : 'bg-[#06080D] border border-white/15 text-slate-300 hover:text-white'
                }`}
              >
                <Activity className="w-4 h-4" />
                <span>{cardioEnabled ? 'Cardio Activado' : 'Activar Cardio'}</span>
              </button>
            </div>

            {cardioEnabled && (
              <div className="space-y-4 pt-3 border-t border-white/8">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {CARDIO_MACHINES.map((cm) => {
                    const isSelected = cardioMachineCode === cm.code;
                    return (
                      <button
                        key={cm.code}
                        type="button"
                        onClick={() => setCardioMachineCode(cm.code)}
                        aria-pressed={isSelected}
                        className={`min-h-[48px] px-3 py-2 rounded-xl border text-left text-xs transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-[#00A8FF]/16 border-[#00A8FF] text-white'
                            : 'bg-[#06080D] border-white/10 text-slate-300 hover:border-white/25'
                        }`}
                      >
                        <p className="font-bold text-white truncate">{cm.name}</p>
                        <p className="font-mono text-[11px] text-slate-400">{cm.code}</p>
                      </button>
                    );
                  })}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label
                      htmlFor="cb-cardio-min"
                      className="block text-xs text-slate-400 mb-1.5"
                    >
                      Tiempo de cardio (minutos)
                    </label>
                    <div className="flex items-center gap-2">
                      {[15, 20, 30, 45].map((mins) => (
                        <button
                          key={mins}
                          type="button"
                          onClick={() => setCardioMinutes(mins)}
                          className={`min-h-[40px] px-3 rounded-lg text-xs font-mono font-bold cursor-pointer ${
                            cardioMinutes === mins
                              ? 'bg-[#00A8FF] text-[#04070D]'
                              : 'bg-[#06080D] border border-white/10 text-slate-300'
                          }`}
                        >
                          {mins}m
                        </button>
                      ))}
                      <input
                        id="cb-cardio-min"
                        type="number"
                        min={5}
                        max={180}
                        value={cardioMinutes}
                        onChange={(e) => setCardioMinutes(Number(e.target.value))}
                        className="w-20 min-h-[40px] rounded-lg bg-[#06080D] border border-white/12 px-2.5 text-sm font-mono tabular-nums text-white focus:outline-none focus:border-[#00A8FF]"
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="cb-cardio-int"
                      className="block text-xs text-slate-400 mb-1.5"
                    >
                      Intensidad / Inclinación / Protocolo
                    </label>
                    <select
                      id="cb-cardio-int"
                      value={cardioIntensity}
                      onChange={(e) => setCardioIntensity(e.target.value)}
                      className="w-full min-h-[42px] rounded-xl bg-[#06080D] border border-white/12 px-3 text-xs text-white focus:outline-none focus:border-[#00A8FF]"
                    >
                      {CARDIO_INTENSITY_PRESETS.map((preset) => (
                        <option key={preset} value={preset}>
                          {preset}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label htmlFor="cb-cardio-note" className="block text-xs text-slate-400 mb-1.5">
                    Nota de cardio (opcional)
                  </label>
                  <input
                    id="cb-cardio-note"
                    type="text"
                    placeholder="Ej. Al finalizar la sesión de pesas · mantener pulso estable"
                    value={cardioNote}
                    onChange={(e) => setCardioNote(e.target.value)}
                    className="w-full min-h-[42px] rounded-xl bg-[#06080D] border border-white/12 px-3.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-[#00A8FF]"
                  />
                </div>
              </div>
            )}
          </section>
        </div>

        {/* RIGHT COLUMN (5 cols): LIVE CHATS WITH MEMBERS + ROUTINE SUMMARY + SENT HISTORY */}
        <div className="xl:col-span-5 space-y-6">
          {/* EMBEDDED LIVE MEMBER CHATS & VOICE AUDIOS DIRECTLY INSIDE "ENVIAR RUTINA" */}
          {onSendDirectMessage && activeChatContact && (
            <section
              aria-label="Chats y audios en directo con socios"
              className="rounded-2xl bg-[#0D121B] border border-[#00A8FF]/35 p-4 space-y-3.5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-[#33C1FF] flex items-center gap-1.5">
                    <MessageCircle className="w-3.5 h-3.5" />
                    Chats y Audios en directo · Coach {activeCoach.name}
                  </p>
                  <h3 className="text-base font-bold text-white mt-0.5">
                    Mensajes de Socios aquí mismo
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setPortalSection('chat')}
                  className="min-h-[32px] px-2.5 rounded-lg bg-[#06080D] hover:border-[#00A8FF] border border-white/12 text-[11px] font-semibold text-slate-200 hover:text-white cursor-pointer whitespace-nowrap"
                >
                  Pantalla completa
                </button>
              </div>

              {/* Quick clickable inbox strip of members (sorted by newest incoming messages) */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                {chatContacts.slice(0, 8).map((contact) => {
                  const isSelected = activeChatContact.threadMemberId === contact.threadMemberId;
                  return (
                    <button
                      key={contact.threadMemberId}
                      type="button"
                      onClick={() =>
                        handleSelectChatContact(contact.threadMemberId, contact.recipientMemberId)
                      }
                      aria-pressed={isSelected}
                      className={`min-h-[36px] px-3 rounded-xl border text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 transition-colors ${
                        isSelected
                          ? 'bg-[#00A8FF] border-[#00A8FF] text-[#04070D]'
                          : contact.hasMemberReplyWaiting
                            ? 'bg-emerald-950/50 border-emerald-500/50 text-emerald-200 hover:border-emerald-400'
                            : 'bg-[#06080D] border-white/12 text-slate-200 hover:border-[#00A8FF]/50'
                      }`}
                    >
                      {contact.hasMemberReplyWaiting && !isSelected && (
                        <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                      )}
                      <span>{contact.name}</span>
                      {(contact.activeCoachCount > 0 || contact.otherCoachCount > 0) && (
                        <span
                          className={`text-[10px] font-mono tabular-nums px-1.5 py-0.5 rounded-md ${
                            isSelected
                              ? 'bg-[#04070D]/20 text-[#04070D]'
                              : 'bg-white/10 text-[#33C1FF]'
                          }`}
                        >
                          {contact.activeCoachCount > 0
                            ? contact.activeCoachCount
                            : `${contact.otherCoachCount}*`}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Alert if this member wrote to the OTHER coach so no message is ever missed */}
              {activeChatContact.otherCoachCount > 0 && activeChatContact.activeCoachCount === 0 && (
                <div className="rounded-xl bg-amber-950/40 border border-amber-500/40 px-3 py-2 text-xs text-amber-200 flex flex-wrap items-center justify-between gap-2">
                  <span>
                    {activeChatContact.name} envió {activeChatContact.otherCoachCount}{' '}
                    {activeChatContact.otherCoachCount === 1 ? 'mensaje' : 'mensajes'} al otro
                    Coach.
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const otherCoach = COACH_TEAM.find((c) => c.id !== activeCoach.id);
                      if (otherCoach) onSelectCoach(otherCoach.id);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-amber-400 text-[#04070D] font-bold text-[11px] cursor-pointer"
                  >
                    Ver con el otro Coach
                  </button>
                </div>
              )}

              <CoachMessageThread
                compact
                viewerRole="coach"
                coach={activeCoach}
                memberId={activeChatContact.threadMemberId}
                memberName={activeChatContact.name}
                messages={directMessages}
                onSendMessage={onSendDirectMessage}
                isCloudConnected={Boolean(authUser && isLiveAdmin)}
                cloudStatusHint={
                  authUser && isLiveAdmin
                    ? `En directo (${authUser.email}) · Lee, escucha audios y responde aquí mismo.`
                    : authUser
                      ? `Cuenta ${authUser.email} sin acceso Coach. Entra con ${primaryGymEmail}.`
                      : `Conecta Google (${primaryGymEmail}) para recibir mensajes y audios reales.`
                }
                onConnectGoogle={onSignInGoogle}
                notificationPermission={notificationPermission}
                onRequestNotificationPermission={onRequestNotificationPermission}
                onTestNotification={onTestNotification}
              />
            </section>
          )}

          <section className="rounded-2xl bg-[#0D121B] border border-[#00A8FF]/35 p-4 sm:p-6 space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs font-semibold text-[#33C1FF]">
                  05. Resumen antes de enviar · {frequency}
                </p>
                <h3 className="text-xl font-bold text-white mt-0.5">
                  {selectedRecipient
                    ? `Rutina para ${selectedRecipient.name}`
                    : 'Plantilla para todos los socios'}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {draftExercises.length} ejercicios de fuerza
                  {cardioEnabled ? ` + ${cardioMinutes} min cardio` : ''} · Firma Coach{' '}
                  {activeCoach.name}
                </p>
              </div>
              <Dumbbell className="w-5 h-5 text-[#00A8FF] shrink-0 mt-1" />
            </div>

            {formError && (
              <div
                role="alert"
                className="rounded-xl bg-red-600/15 border border-red-500/40 px-3.5 py-2.5 text-xs text-red-200"
              >
                {formError}
              </div>
            )}

            {formSuccess && (
              <div
                role="status"
                className="rounded-xl bg-[#00A8FF]/16 border border-[#00A8FF]/50 px-3.5 py-3 text-xs text-white space-y-2"
              >
                <p className="font-semibold">{formSuccess}</p>
                <button
                  type="button"
                  onClick={onPreviewRoutinesInMemberView}
                  className="inline-flex items-center gap-1.5 text-[#33C1FF] font-bold hover:underline cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5" />
                  Comprobar cómo la ve el socio en Entreno
                </button>
              </div>
            )}

            {/* Draft Exercises List */}
            {draftExercises.length === 0 && !cardioEnabled ? (
              <div className="rounded-xl bg-[#06080D] border border-dashed border-white/15 p-5 text-center space-y-1.5">
                <p className="text-sm font-semibold text-white">
                  Aún no has añadido ejercicios a esta rutina
                </p>
                <p className="text-xs text-slate-400">
                  Pincha un grupo muscular (Pecho, Espalda, Pierna...) y selecciona un ejercicio de
                  Telju, Mancuernas/Barra o Polea para fijar series (1–10), pirámide, peso y
                  descanso.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-white/8 border-t border-b border-white/8">
                {draftExercises.map((ex, idx) => {
                  const machine = getMachineByCode(ex.machineCode);
                  return (
                    <div key={`${ex.machineCode}-${idx}`} className="py-3 space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-white leading-snug">
                            {idx + 1}. {ex.exerciseName ?? machine?.name ?? ex.machineCode}
                          </p>
                          <p className="text-xs text-[#33C1FF]">
                            {ex.muscleGroup ?? machine?.muscleGroup} ·{' '}
                            {ex.equipmentType ??
                              normalizeEquipmentCategory(machine?.category ?? 'Máquinas Telju')}{' '}
                            · {ex.machineCode}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {machine && (
                            <button
                              type="button"
                              onClick={() => handleOpenExerciseConfigurator(machine, idx)}
                              aria-label={`Editar ${ex.exerciseName ?? machine.name}`}
                              className="min-w-[34px] min-h-[34px] rounded-lg bg-[#06080D] border border-white/10 text-slate-300 hover:text-[#33C1FF] flex items-center justify-center cursor-pointer"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleRemoveDraftExercise(idx)}
                            aria-label={`Quitar ${ex.exerciseName ?? ex.machineCode}`}
                            className="min-w-[34px] min-h-[34px] rounded-lg bg-[#06080D] border border-white/10 text-slate-400 hover:text-red-400 flex items-center justify-center cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs font-mono tabular-nums text-slate-300">
                        <span className="font-bold text-white">
                          {ex.targetSets} series ×{' '}
                          {ex.repScheme === 'piramide'
                            ? `Pirámide (${ex.targetReps})`
                            : `${ex.targetReps} reps`}
                        </span>
                        <span className="text-slate-600" aria-hidden="true">
                          ·
                        </span>
                        <span>{ex.suggestedWeightKg} kg</span>
                        {ex.intensityLabel && (
                          <>
                            <span className="text-slate-600" aria-hidden="true">
                              ·
                            </span>
                            <span className="text-[#33C1FF] font-sans">{ex.intensityLabel}</span>
                          </>
                        )}
                        <span className="text-slate-600" aria-hidden="true">
                          ·
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-400" />
                          {ex.restSeconds}s
                        </span>
                      </div>

                      {ex.note && (
                        <p className="text-xs text-slate-400 italic">Nota: {ex.note}</p>
                      )}
                    </div>
                  );
                })}

                {cardioEnabled && (
                  <div className="py-3 space-y-1">
                    <p className="text-sm font-bold text-emerald-300 flex items-center gap-1.5">
                      <Flame className="w-4 h-4" />
                      Cardio ·{' '}
                      {CARDIO_MACHINES.find((m) => m.code === cardioMachineCode)?.name ??
                        cardioMachineCode}
                    </p>
                    <p className="text-xs text-slate-300 font-mono tabular-nums">
                      {cardioMinutes} min · {cardioIntensity}
                    </p>
                    {cardioNote && <p className="text-xs text-slate-400">{cardioNote}</p>}
                  </div>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={() => handleSubmitRoutine()}
              className="w-full min-h-[48px] px-4 rounded-xl bg-[#00A8FF] hover:bg-[#33C1FF] text-[#04070D] font-bold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <Send className="w-4 h-4" />
              <span>
                {selectedRecipient
                  ? `Enviar rutina exclusiva a ${selectedRecipient.name}`
                  : 'Publicar rutina para todos los socios'}
              </span>
            </button>
          </section>

          {/* SENT ROUTINES HISTORY FILTERABLE BY MEMBER */}
          <section className="rounded-2xl bg-[#0D121B] border border-white/10 p-4 sm:p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-lg font-bold text-white">Historial de rutinas enviadas</h3>
                <p className="text-xs text-slate-400">
                  Sincronizadas para todos los coaches del club
                </p>
              </div>
              {selectedRecipient && (
                <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-[#06080D] border border-white/10">
                  <button
                    type="button"
                    onClick={() => setHistoryFilter('todos')}
                    className={`min-h-[32px] px-2.5 rounded-md text-[11px] font-semibold cursor-pointer ${
                      historyFilter === 'todos'
                        ? 'bg-[#00A8FF] text-[#04070D]'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    Todas ({coachRoutines.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setHistoryFilter('seleccionado')}
                    className={`min-h-[32px] px-2.5 rounded-md text-[11px] font-semibold cursor-pointer truncate max-w-[130px] ${
                      historyFilter === 'seleccionado'
                        ? 'bg-[#00A8FF] text-[#04070D]'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    Solo {selectedRecipient.name.split(' ')[0]}
                  </button>
                </div>
              )}
            </div>

            {visibleHistoryRoutines.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 text-center">
                Todavía no hay rutinas enviadas a {selectedRecipient?.name ?? 'este filtro'}.
              </p>
            ) : (
              <div className="divide-y divide-white/8 border-t border-white/8 max-h-96 overflow-y-auto pr-1">
                {visibleHistoryRoutines.map((routine) => (
                  <div key={routine.id} className="py-3.5 space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-1 text-xs">
                      <span className="font-semibold text-[#33C1FF]">
                        {routine.frequency} · Coach {routine.coachName}
                      </span>
                      <span className="text-slate-400">{routine.sentAt}</span>
                    </div>
                    <p className="text-sm font-bold text-white">{routine.title}</p>
                    <p className="text-xs text-emerald-300 font-medium">
                      Para:{' '}
                      {routine.targetMemberName
                        ? `${routine.targetMemberName}${routine.targetMemberCode ? ` (${routine.targetMemberCode})` : ''}`
                        : 'Todos los socios'}
                    </p>
                    <p className="text-[11px] font-mono text-slate-400">
                      {routine.exercises.length} ejercicios
                      {routine.cardioBlock?.enabled
                        ? ` + ${routine.cardioBlock.durationMin}m cardio`
                        : ''}{' '}
                      ·{' '}
                      {routine.exercises
                        .slice(0, 2)
                        .map((ex) => ex.exerciseName ?? getMachineByCode(ex.machineCode)?.name ?? ex.machineCode)
                        .join(' · ')}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
      )}

      {/* EXERCISE CONFIGURATOR MODAL (1-10 SERIES, FIXED REPS OR PYRAMID, WEIGHT/INTENSITY, REST) */}
      {configuringMachine && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`Configurar ${configuringMachine.name}`}
        >
          <div className="w-full sm:max-w-xl rounded-t-3xl sm:rounded-2xl bg-[#0D121B] border border-[#00A8FF]/45 p-5 sm:p-6 space-y-5 max-h-[92vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-[#33C1FF]">
                  {configuringMachine.muscleGroup} ·{' '}
                  {normalizeEquipmentCategory(configuringMachine.category)} ·{' '}
                  {configuringMachine.code}
                </p>
                <h3 className="text-xl font-bold text-white leading-snug mt-0.5">
                  {configuringMachine.name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setConfiguringMachine(null);
                  setEditingExerciseIndex(null);
                }}
                aria-label="Cerrar configurador de ejercicio"
                className="min-w-[40px] min-h-[40px] rounded-xl bg-[#06080D] border border-white/10 text-slate-300 hover:text-white flex items-center justify-center cursor-pointer shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 1. NUMBER OF SETS (1 TO 10) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-white">Número de series (1 a 10)</span>
                <span className="font-mono tabular-nums text-[#33C1FF] font-bold">
                  {cfgSets} {cfgSets === 1 ? 'serie' : 'series'}
                </span>
              </div>
              <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setCfgSets(num)}
                    aria-pressed={cfgSets === num}
                    className={`min-h-[44px] rounded-xl font-mono tabular-nums text-sm font-bold cursor-pointer transition-colors ${
                      cfgSets === num
                        ? 'bg-[#00A8FF] text-[#04070D]'
                        : 'bg-[#06080D] border border-white/12 text-slate-200 hover:border-[#00A8FF]/60'
                    }`}
                  >
                    {num}
                  </button>
                ))}
              </div>
            </div>

            {/* 2. REP SCHEME: FIXED REPS VS PYRAMID */}
            <div className="space-y-3">
              <span className="block text-xs font-semibold text-white">
                Sistema de repeticiones
              </span>
              <div
                className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-[#06080D] border border-white/10"
                role="group"
                aria-label="Elegir repeticiones fijas o pirámide"
              >
                <button
                  type="button"
                  onClick={() => setCfgRepScheme('fijas')}
                  aria-pressed={cfgRepScheme === 'fijas'}
                  className={`min-h-[42px] rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                    cfgRepScheme === 'fijas'
                      ? 'bg-[#00A8FF] text-[#04070D]'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Repeticiones fijas
                </button>
                <button
                  type="button"
                  onClick={() => setCfgRepScheme('piramide')}
                  aria-pressed={cfgRepScheme === 'piramide'}
                  className={`min-h-[42px] rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                    cfgRepScheme === 'piramide'
                      ? 'bg-[#00A8FF] text-[#04070D]'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Pirámide (Progresiva)
                </button>
              </div>

              {cfgRepScheme === 'fijas' ? (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-1.5">
                    {FIXED_REP_PRESETS.map((rep) => (
                      <button
                        key={rep}
                        type="button"
                        onClick={() => setCfgFixedReps(rep)}
                        className={`min-h-[38px] px-3 rounded-lg font-mono text-xs font-bold cursor-pointer ${
                          cfgFixedReps === rep
                            ? 'bg-[#00A8FF] text-[#04070D]'
                            : 'bg-[#06080D] border border-white/10 text-slate-300 hover:text-white'
                        }`}
                      >
                        {rep} reps
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    aria-label="Repeticiones personalizadas"
                    value={cfgFixedReps}
                    onChange={(e) => setCfgFixedReps(e.target.value)}
                    placeholder="Ej. 10-12 o 15"
                    className="w-full min-h-[42px] rounded-xl bg-[#06080D] border border-white/12 px-3.5 text-sm font-mono text-white focus:outline-none focus:border-[#00A8FF]"
                  />
                </div>
              ) : (
                <div className="space-y-3 rounded-xl bg-[#06080D] border border-[#00A8FF]/30 p-3.5">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                    {(
                      [
                        { id: 'ascendente', label: 'Ascendente' },
                        { id: 'descendente', label: 'Descendente' },
                        { id: 'doble', label: 'Doble' },
                        { id: 'personalizada', label: 'Manual' },
                      ] as const
                    ).map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => setCfgPyramidPreset(preset.id)}
                        className={`min-h-[38px] px-2 rounded-lg text-xs font-bold cursor-pointer ${
                          cfgPyramidPreset === preset.id
                            ? 'bg-[#00A8FF] text-[#04070D]'
                            : 'bg-[#0D121B] border border-white/10 text-slate-300 hover:text-white'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>

                  {cfgPyramidPreset === 'personalizada' && (
                    <div>
                      <label
                        htmlFor="cfg-custom-pyr"
                        className="block text-[11px] text-slate-400 mb-1"
                      >
                        Escribe las repeticiones por serie separadas por guion (ej. 15-12-10-8)
                      </label>
                      <input
                        id="cfg-custom-pyr"
                        type="text"
                        value={cfgCustomPyramid}
                        onChange={(e) => setCfgCustomPyramid(e.target.value)}
                        className="w-full min-h-[40px] rounded-lg bg-[#0D121B] border border-white/15 px-3 text-sm font-mono text-white focus:outline-none focus:border-[#00A8FF]"
                      />
                    </div>
                  )}

                  <div className="space-y-1">
                    <p className="text-[11px] font-semibold text-[#33C1FF]">
                      Vista previa pirámide ({formatPyramidSummary(livePyramidPreview)}):
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                      {livePyramidPreview.map((s) => (
                        <div
                          key={s.setNumber}
                          className="rounded-lg bg-[#0D121B] border border-white/8 px-2.5 py-1.5 text-[11px] font-mono tabular-nums"
                        >
                          <span className="text-slate-400">S{s.setNumber}: </span>
                          <span className="text-white font-bold">{s.reps}r</span>
                          <span className="text-[#33C1FF]"> · {s.weightKg}kg</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* 3. WEIGHT & INTENSITY */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label htmlFor="cfg-weight" className="block text-xs font-semibold text-white mb-1.5">
                  Peso orientativo (kg)
                </label>
                <input
                  id="cfg-weight"
                  type="number"
                  min={0}
                  step={2.5}
                  value={cfgWeightKg}
                  onChange={(e) => setCfgWeightKg(Number(e.target.value))}
                  className="w-full min-h-[44px] rounded-xl bg-[#06080D] border border-white/12 px-3.5 text-sm font-mono tabular-nums text-white focus:outline-none focus:border-[#00A8FF]"
                />
              </div>

              <div>
                <label
                  htmlFor="cfg-intensity"
                  className="block text-xs font-semibold text-white mb-1.5"
                >
                  Intensidad (RPE / RIR / % 1RM)
                </label>
                <select
                  id="cfg-intensity"
                  value={cfgIntensity}
                  onChange={(e) => setCfgIntensity(e.target.value)}
                  className="w-full min-h-[44px] rounded-xl bg-[#06080D] border border-white/12 px-3 text-xs text-white focus:outline-none focus:border-[#00A8FF]"
                >
                  {INTENSITY_PRESETS.map((preset) => (
                    <option key={preset} value={preset}>
                      {preset}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* 4. REST BETWEEN SETS */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-white">Descanso entre series</span>
                <span className="font-mono tabular-nums text-[#33C1FF] font-bold">
                  {cfgRestSec} segundos
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {REST_SECONDS_PRESETS.map((sec) => (
                  <button
                    key={sec}
                    type="button"
                    onClick={() => setCfgRestSec(sec)}
                    aria-pressed={cfgRestSec === sec}
                    className={`min-h-[40px] px-3 rounded-lg font-mono tabular-nums text-xs font-bold cursor-pointer ${
                      cfgRestSec === sec
                        ? 'bg-[#00A8FF] text-[#04070D]'
                        : 'bg-[#06080D] border border-white/10 text-slate-300 hover:text-white'
                    }`}
                  >
                    {sec}s
                  </button>
                ))}
              </div>
            </div>

            {/* 5. TECHNICAL NOTE */}
            <div>
              <label htmlFor="cfg-note" className="block text-xs text-slate-400 mb-1.5">
                Indicación técnica para el socio (opcional)
              </label>
              <input
                id="cfg-note"
                type="text"
                placeholder={configuringMachine.tip}
                value={cfgNote}
                onChange={(e) => setCfgNote(e.target.value)}
                className="w-full min-h-[42px] rounded-xl bg-[#06080D] border border-white/12 px-3.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-[#00A8FF]"
              />
            </div>

            {/* MODAL ACTIONS */}
            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={() => {
                  setConfiguringMachine(null);
                  setEditingExerciseIndex(null);
                }}
                className="min-h-[44px] px-4 rounded-xl bg-white/6 text-xs font-semibold text-slate-300 hover:text-white cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmConfiguredExercise}
                className="min-h-[44px] px-5 rounded-xl bg-[#00A8FF] hover:bg-[#33C1FF] text-[#04070D] text-xs font-bold flex items-center gap-2 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>
                  {editingExerciseIndex !== null
                    ? 'Guardar cambios'
                    : 'Añadir ejercicio a la rutina'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
