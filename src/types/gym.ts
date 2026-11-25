export type MuscleGroup =
  | 'Pecho'
  | 'Espalda'
  | 'Hombro'
  | 'Brazos'
  | 'Cuádriceps'
  | 'Glúteo / Femoral'
  | 'Core / Funcional'
  | 'Cardio';

export type EquipmentCategory = 'Máquinas Telju' | 'Mancuernas' | 'Cardio' | 'Funcional';

export type GymZoneId =
  | 'cardio'
  | 'fuerza-telju'
  | 'peso-libre'
  | 'funcional'
  | 'multifuncion'
  | 'cafeteria'
  | 'recepcion'
  | 'vestuarios';

export interface TeljuMachine {
  code: string;
  name: string;
  line: 'Telju Shock' | 'Telju Plate-Loaded' | 'Telju Cardio' | 'Iron Captain' | 'Mancuernas Libres';
  category: EquipmentCategory;
  trackingMode: 'strength' | 'cardio';
  muscleGroup: MuscleGroup;
  zoneId: GymZoneId;
  maxLoad?: string;
  tip: string;
  isPlateLoaded: boolean;
}

export interface GymZone {
  id: GymZoneId;
  name: string;
  shortName: string;
  description: string;
  schedule: string;
  highlights: string[];
  accentHex: string;
  mapRegion: {
    x: number;
    y: number;
    w: number;
    h: number;
    labelX: number;
    labelY: number;
  };
}

export interface WorkoutSet {
  id: string;
  weightKg: number; // for cardio: intensity level or speed km/h
  reps: number; // for cardio: duration in minutes
  rir: number;
  completed: boolean;
  previous?: string;
}

export interface ActiveExercise {
  id: string;
  machineCode: string;
  machineName: string;
  category: EquipmentCategory;
  trackingMode: 'strength' | 'cardio';
  muscleGroup: MuscleGroup;
  restSeconds: number;
  coachNote?: string;
  coachName?: string;
  coachAvatar?: string;
  sets: WorkoutSet[];
}

export interface CoachProfile {
  id: string;
  name: string;
  role: string;
  specialty: string;
  avatarUrl: string;
  accessLevel: string;
}

export type PhilosophyPillar = 'Superación' | 'Fuerza de voluntad' | 'Perseverancia';

export interface DailyQuote {
  id: string;
  text: string;
  pillar: PhilosophyPillar;
  signature: string;
}

export interface CoachRoutine {
  id: string;
  title: string;
  frequency: 'Diaria' | 'Semanal';
  dayLabel: string;
  coachId: string;
  coachName: string;
  coachRole: string;
  coachAvatar: string;
  goal: string;
  sentAt: string;
  isNew?: boolean;
  coachMessage: string;
  exercises: {
    machineCode: string;
    targetSets: number;
    targetReps: string;
    suggestedWeightKg: number;
    restSeconds: number;
    note?: string;
  }[];
}

export type ClassDiscipline = 'Jiu-Jitsu' | 'Boxeo' | 'Jumping Fitness';

export interface GymClassSession {
  id: string;
  discipline: ClassDiscipline;
  title: string;
  instructor: string;
  day: 'Lun' | 'Mar' | 'Mié' | 'Jue' | 'Vie' | 'Sáb';
  time: string;
  durationMin: number;
  capacity: number;
  bookedCount: number;
  isBookedByUser: boolean;
  level: 'Todos los niveles' | 'Iniciación' | 'Intermedio / Avanzado';
  description: string;
}

export interface HabitItem {
  id: string;
  label: string;
  detail: string;
  completed: boolean;
}

export interface ChallengeAttempt {
  id: string;
  memberName: string;
  memberTag: string;
  avatarUrl?: string;
  weightKg: number;
  durationSec: number;
  dateLabel: string;
  isCurrentUser?: boolean;
}

export interface StrengthLiftAttempt {
  id: string;
  exercise: 'press-banca' | 'sentadilla';
  memberName: string;
  memberTag: string;
  avatarUrl?: string;
  weightKg: number;
  reps: number;
  dateLabel: string;
  isCurrentUser?: boolean;
}

export type CafeCategory =
  | 'Plancha & Sandwichera Fit'
  | 'Vitrina Fría & Bowls'
  | 'Café, Matcha & Batidos'
  | 'Dulces Fit de Vitrina';

export interface CafeItem {
  id: string;
  name: string;
  category: CafeCategory;
  description: string;
  prepTag: string;
  macros: string;
  standardPrice: number;
}

export interface GuestPass {
  id: string;
  code: string;
  guestName: string;
  createdAt: string;
  status: 'Activo' | 'Canjeado';
}

export interface CompletedWorkout {
  id: string;
  title: string;
  dateLabel: string;
  totalVolumeKg: number;
  totalSets: number;
  durationMin: number;
}

export type FeeStatus = 'al-dia' | 'pendiente';

export interface MemberProfile {
  memberId?: string;
  isRegistered: boolean;
  name: string;
  email: string;
  phone: string;
  goal: string;
  avatarUrl: string;
  founderNumber: string;
  tier: 'Socio Fundador' | 'Socio Club';
  feeStatus: FeeStatus;
  monthlyFee: number;
  standardFee: number;
  founderDiscountCafePct: number;
  founderDiscountMerchPct: number;
  streakDays: number;
  weeklyGoalSessions: number;
  weeklyCompletedSessions: number;
  checkedInToday: boolean;
  lastCheckInTime: string | null;
  weeklyDaysDone: boolean[]; // L M X J V S D
}

export type MainTab = 'inicio' | 'entreno' | 'clases' | 'mapa' | 'club';

export type AppWorkspaceMode = 'socio' | 'direccion' | 'lector';

export interface ClubMemberRecord {
  id: string;
  name: string;
  memberTag: string;
  phone: string;
  plan: 'Socio Fundador' | 'Socio Club';
  monthlyFee: number;
  daysSinceLastVisit: number;
  lastVisitLabel: string;
  assignedCoach: string;
  preferredActivity: string;
  challengesCompleted: number;
  streakDays: number;
  outreachStatus: 'pendiente' | 'contactado' | 'reactivado';
  lastOutreachNote?: string;
  lastOutreachTime?: string;
}

export interface HourlyOccupancySlot {
  hour: string;
  avgAttendance: number;
  maxCapacity: number;
  dominantZone: string;
}

export type MonthlyChallengeCategory =
  | 'Mancuerna 70 kg'
  | 'Fuerza'
  | 'Constancia'
  | 'Cardio'
  | 'Sala Multifunción';

export interface MonthlyClubChallenge {
  id: string;
  title: string;
  category: MonthlyChallengeCategory;
  targetDescription: string;
  prize: string;
  endDateLabel: string;
  active: boolean;
  participantsCount: number;
  completedCount: number;
  joinedByUser: boolean;
}

export type MessageTopicTag =
  | 'Solicitud de rutina'
  | 'Duda técnica'
  | 'Seguimiento'
  | 'Mensaje directo';

export interface DirectMessage {
  id: string;
  coachId: string;
  memberId: string;
  senderRole: 'member' | 'coach';
  senderName: string;
  senderAvatar?: string;
  kind: 'text' | 'audio';
  text?: string;
  audioUrl?: string;
  audioDurationSec?: number;
  audioLabel?: string;
  timestampLabel: string;
  topicTag?: MessageTopicTag;
}

export type FriendshipStatus =
  | 'amigo'
  | 'solicitud-recibida'
  | 'solicitud-enviada'
  | 'ninguno';

export interface ClubFriendProfile {
  id: string;
  name: string;
  memberTag: string;
  specialty: string;
  streakDays: number;
  avatarUrl?: string;
  status: FriendshipStatus;
}

export type PeerChallengeStatus = 'pendiente' | 'aceptado' | 'completado' | 'rechazado';

export interface PeerWorkoutChallenge {
  id: string;
  challengerName: string;
  opponentId: string;
  opponentName: string;
  direction: 'enviado' | 'recibido';
  workoutTitle: string;
  targetGoal: string;
  stakeNote: string;
  status: PeerChallengeStatus;
  createdAt: string;
}

export interface SharedWorkoutPost {
  id: string;
  authorId: string;
  authorName: string;
  authorTag: string;
  authorAvatar?: string;
  workoutTitle: string;
  summary: string;
  machineCodes: string[];
  sharedWithLabel: string;
  sharedAt: string;
  cheersCount: number;
  cheeredByUser: boolean;
}


