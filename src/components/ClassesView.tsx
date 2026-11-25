import React, { useMemo, useState } from 'react';
import { CalendarCheck, Check, Clock, ShieldCheck, Users } from 'lucide-react';
import type { ClassDiscipline, GymClassSession } from '../types/gym';

interface ClassesViewProps {
  classes: GymClassSession[];
  onToggleBooking: (classId: string) => string | null;
}

const DAYS: ('Todos' | GymClassSession['day'])[] = ['Todos', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const DISCIPLINES: ('Todas' | ClassDiscipline)[] = [
  'Todas',
  'Jiu-Jitsu',
  'Boxeo',
  'Jumping Fitness',
];

export const ClassesView: React.FC<ClassesViewProps> = ({ classes, onToggleBooking }) => {
  const [selectedDay, setSelectedDay] = useState<'Todos' | GymClassSession['day']>('Todos');
  const [selectedDiscipline, setSelectedDiscipline] = useState<'Todas' | ClassDiscipline>('Todas');
  const [notice, setNotice] = useState<{ text: string; isError?: boolean } | null>(null);

  const filteredClasses = useMemo(() => {
    return classes.filter((c) => {
      const matchDay = selectedDay === 'Todos' || c.day === selectedDay;
      const matchDiscipline =
        selectedDiscipline === 'Todas' || c.discipline === selectedDiscipline;
      return matchDay && matchDiscipline;
    });
  }, [classes, selectedDay, selectedDiscipline]);

  const myBookedCount = useMemo(
    () => classes.filter((c) => c.isBookedByUser).length,
    [classes]
  );

  const handleBookClick = (session: GymClassSession) => {
    const err = onToggleBooking(session.id);
    if (err) {
      setNotice({ text: err, isError: true });
    } else if (session.isBookedByUser) {
      setNotice({ text: `Reserva cancelada: ${session.title} (${session.day} ${session.time}).` });
    } else {
      setNotice({
        text: `Plaza confirmada en Sala Multifunción: ${session.title} (${session.day} ${session.time}).`,
      });
    }
    window.setTimeout(() => setNotice(null), 3200);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-[#33C1FF]">
            Sala Multifunción · Tatami, Sacos y Camas Elásticas
          </p>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-[0.01em] text-white mt-1">
            Reserva tus Clases Dirigidas
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Jiu-Jitsu, Boxeo y Jumping Fitness (Body Jump). Como Socio Fundador tienes prioridad de reserva 48h antes.
          </p>
        </div>

        <div className="rounded-xl bg-[#0D121B] border border-white/10 px-4 py-3 flex items-center gap-3 self-start">
          <CalendarCheck className="w-5 h-5 text-[#00A8FF]" />
          <div>
            <p className="text-xs text-slate-400">Mis reservas activas</p>
            <p className="text-base font-bold font-mono tabular-nums text-white">
              {myBookedCount} {myBookedCount === 1 ? 'clase' : 'clases'}
            </p>
          </div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="rounded-2xl bg-[#0D121B] border border-white/10 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por disciplina">
            {DISCIPLINES.map((disc) => {
              const active = selectedDiscipline === disc;
              return (
                <button
                  key={disc}
                  type="button"
                  onClick={() => setSelectedDiscipline(disc)}
                  className={`min-h-[40px] px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                    active
                      ? 'bg-[#00A8FF] text-[#04070D]'
                      : 'bg-[#131B28] text-slate-300 hover:text-white border border-white/8'
                  }`}
                >
                  {disc}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por día">
            {DAYS.map((day) => {
              const active = selectedDay === day;
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => setSelectedDay(day)}
                  className={`min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    active
                      ? 'bg-white text-[#06080D] font-bold'
                      : 'bg-[#06080D] text-slate-400 hover:text-white border border-white/8'
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {notice && (
        <div
          role="status"
          className={`rounded-xl px-4 py-3 text-sm border ${
            notice.isError
              ? 'bg-amber-500/12 border-amber-400/40 text-amber-200'
              : 'bg-[#00A8FF]/15 border-[#00A8FF]/40 text-white'
          }`}
        >
          {notice.text}
        </div>
      )}

      {/* Class Cards Grid */}
      {filteredClasses.length === 0 ? (
        <div className="rounded-2xl bg-[#0D121B] border border-white/10 p-10 text-center space-y-2">
          <p className="text-base font-semibold text-white">No hay sesiones para este filtro</p>
          <p className="text-xs text-slate-400">Prueba seleccionando otro día o todas las disciplinas.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {filteredClasses.map((session) => {
            const spotsLeft = Math.max(0, session.capacity - session.bookedCount);
            const isFull = spotsLeft === 0 && !session.isBookedByUser;
            const fillPct = Math.round((session.bookedCount / session.capacity) * 100);

            return (
              <article
                key={session.id}
                className="rounded-2xl bg-[#0D121B] border border-white/10 p-6 flex flex-col justify-between gap-5"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="font-semibold text-[#33C1FF]">
                      {session.discipline} · {session.level}
                    </span>
                    <span className="font-mono tabular-nums text-slate-300 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      {session.day} {session.time} · {session.durationMin} min
                    </span>
                  </div>

                  <div>
                    <h2 className="text-2xl font-bold text-white tracking-tight">
                      {session.title}
                    </h2>
                    <p className="text-xs text-slate-400 mt-1">
                      Coach {session.instructor} · Sala Multifunción
                    </p>
                  </div>

                  <p className="text-sm text-slate-300 leading-relaxed">
                    {session.description}
                  </p>
                </div>

                <div className="space-y-3 pt-3 border-t border-white/8">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400 flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5" />
                        Plazas ocupadas
                      </span>
                      <span className="font-mono tabular-nums text-slate-200">
                        {session.bookedCount}/{session.capacity} (
                        {isFull ? 'Completa' : `${spotsLeft} libres`})
                      </span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-[#131B28] overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${
                          isFull ? 'bg-amber-400' : 'bg-[#00A8FF]'
                        }`}
                        style={{ width: `${fillPct}%` }}
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleBookClick(session)}
                    className={`w-full min-h-[46px] rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                      session.isBookedByUser
                        ? 'bg-[#00A8FF]/18 border border-[#00A8FF] text-[#33C1FF] hover:bg-[#00A8FF]/25'
                        : isFull
                          ? 'bg-[#131B28] text-slate-400 border border-white/10 hover:text-white'
                          : 'bg-[#00A8FF] hover:bg-[#33C1FF] text-[#04070D] font-bold'
                    }`}
                  >
                    {session.isBookedByUser ? (
                      <>
                        <Check className="w-4 h-4" />
                        Plaza reservada · Cancelar
                      </>
                    ) : isFull ? (
                      'Clase completa'
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4" />
                        Reservar plaza
                      </>
                    )}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};
