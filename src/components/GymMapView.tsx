import React, { useState } from 'react';
import { ArrowRight, CalendarCheck, Coffee, Dumbbell, Eye, Layers, Plus } from 'lucide-react';
import { TELJU_LOGO_URL } from '../data/seedData';
import { GYM_ZONES, TELJU_MACHINES } from '../data/teljuCatalog';
import type { GymZoneId, MainTab, TeljuMachine } from '../types/gym';

interface GymMapViewProps {
  onAddMachineToWorkout: (machine: TeljuMachine) => void;
  onNavigate: (tab: MainTab) => void;
}

export const GymMapView: React.FC<GymMapViewProps> = ({
  onAddMachineToWorkout,
  onNavigate,
}) => {
  const [selectedZoneId, setSelectedZoneId] = useState<GymZoneId>('fuerza-telju');
  const [mapMode, setMapMode] = useState<'interactivo' | 'plano-3d'>('interactivo');
  const [addedNotice, setAddedNotice] = useState<string | null>(null);

  const selectedZone = GYM_ZONES.find((z) => z.id === selectedZoneId) ?? GYM_ZONES[0];
  const zoneMachines = TELJU_MACHINES.filter((m) => m.zoneId === selectedZone.id);

  const handleAddMachine = (machine: TeljuMachine) => {
    onAddMachineToWorkout(machine);
    setAddedNotice(`${machine.name} añadida a tu entreno activo.`);
    window.setTimeout(() => setAddedNotice(null), 2600);
  };

  return (
    <div className="space-y-6">
      {/* Header & Map View Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <img
            src={TELJU_LOGO_URL}
            alt="Telju Fitness — Equipamiento oficial"
            className="w-12 h-14 object-contain rounded-lg shrink-0 mt-0.5"
          />
          <div>
            <p className="text-xs font-medium text-[#33C1FF]">
              Plano Oficial Telju Design Gym · FitnessDreams Benidorm
            </p>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-[0.01em] text-white mt-1">
              Mapa del Gimnasio y Maquinaria
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Toca cualquier zona para ver las máquinas Telju exactas, mancuernas, Sala Multifunción o la Cafetería Fit Café.
            </p>
          </div>
        </div>

        <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-[#0D121B] border border-white/10 self-start">
          <button
            type="button"
            onClick={() => setMapMode('interactivo')}
            className={`min-h-[40px] px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
              mapMode === 'interactivo'
                ? 'bg-[#00A8FF] text-[#04070D]'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            Mapa interactivo
          </button>
          <button
            type="button"
            onClick={() => setMapMode('plano-3d')}
            className={`min-h-[40px] px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
              mapMode === 'plano-3d'
                ? 'bg-[#00A8FF] text-[#04070D]'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            Render 3D Sala
          </button>
        </div>
      </div>

      {addedNotice && (
        <div
          role="status"
          className="rounded-xl bg-[#00A8FF]/15 border border-[#00A8FF]/40 px-4 py-3 text-sm text-white flex items-center justify-between gap-3"
        >
          <span>{addedNotice}</span>
          <button
            type="button"
            onClick={() => onNavigate('entreno')}
            className="text-xs font-semibold text-[#33C1FF] hover:underline whitespace-nowrap cursor-pointer"
          >
            Ir al entreno
          </button>
        </div>
      )}

      {/* Main Split: Interactive Map Canvas (left) + Selected Zone Inspector (right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 space-y-4">
          <div className="rounded-2xl bg-[#0D121B] border border-white/10 p-4 sm:p-5 overflow-hidden">
            {mapMode === 'interactivo' ? (
              <div className="space-y-4">
                <div className="w-full overflow-x-auto">
                  <svg
                    viewBox="0 0 1000 500"
                    className="w-full h-auto min-w-[540px] block"
                    role="img"
                    aria-label="Plano interactivo del club FitnessDreams Benidorm"
                  >
                    {/* Outer architectural silhouette faithful to benidormfd2.0.pdf */}
                    <path
                      d="M 24 120 Q 24 468 180 486 L 490 486 L 490 330 L 775 330 L 775 390 L 982 390 L 982 82 L 775 82 L 775 138 L 490 138 L 490 34 L 155 34 L 155 112 L 24 112 Z"
                      fill="#070A12"
                      stroke="#1E293B"
                      strokeWidth="3"
                    />

                    {/* Subtle architectural floor grid */}
                    <g stroke="#1E293B" strokeOpacity="0.35" strokeWidth="1">
                      <line x1="155" y1="34" x2="155" y2="486" />
                      <line x1="490" y1="138" x2="490" y2="330" />
                      <line x1="775" y1="82" x2="775" y2="390" />
                    </g>

                    {/* Clickable Zones */}
                    {GYM_ZONES.map((zone) => {
                      const isActive = zone.id === selectedZoneId;
                      const r = zone.mapRegion;
                      return (
                        <g
                          key={zone.id}
                          onClick={() => setSelectedZoneId(zone.id)}
                          className="cursor-pointer"
                          role="button"
                          tabIndex={0}
                          aria-label={`Seleccionar zona ${zone.name}`}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setSelectedZoneId(zone.id);
                            }
                          }}
                        >
                          <rect
                            x={r.x}
                            y={r.y}
                            width={r.w}
                            height={r.h}
                            rx="14"
                            fill={isActive ? zone.accentHex : '#111827'}
                            fillOpacity={isActive ? 0.24 : 0.72}
                            stroke={isActive ? zone.accentHex : '#334155'}
                            strokeWidth={isActive ? 3 : 1.5}
                          />
                          {/* Yellow tatami detail in Sala Multifunción matching real plan */}
                          {zone.id === 'multifuncion' && (
                            <rect
                              x={r.x + 28}
                              y={r.y + 30}
                              width={r.w - 56}
                              height={r.h - 80}
                              rx="8"
                              fill="#EAB308"
                              fillOpacity={isActive ? 0.42 : 0.22}
                              stroke="#FACC15"
                              strokeOpacity="0.5"
                              strokeWidth="1.5"
                            />
                          )}
                          {/* Blue locker bays matching real plan */}
                          {zone.id === 'vestuarios' && (
                            <rect
                              x={r.x + 14}
                              y={r.y + 18}
                              width={r.w - 28}
                              height={r.h - 36}
                              rx="8"
                              fill="#2563EB"
                              fillOpacity={isActive ? 0.35 : 0.18}
                            />
                          )}
                          <text
                            x={r.labelX}
                            y={r.labelY - 4}
                            textAnchor="middle"
                            fill={isActive ? '#FFFFFF' : '#CBD5E1'}
                            fontSize="16"
                            fontWeight="700"
                            fontFamily="Barlow Condensed, sans-serif"
                            letterSpacing="0.03em"
                          >
                            {zone.shortName}
                          </text>
                          <text
                            x={r.labelX}
                            y={r.labelY + 14}
                            textAnchor="middle"
                            fill={isActive ? '#BAE6FD' : '#64748B'}
                            fontSize="11"
                            fontFamily="Plus Jakarta Sans, sans-serif"
                          >
                            {zone.id === 'multifuncion'
                              ? 'Jiu-Jitsu · Boxeo · Jump'
                              : zone.id === 'cafeteria'
                                ? 'Protein Bar -15%'
                                : zone.id === 'fuerza-telju'
                                  ? 'Telju Shock & 4SHP'
                                  : zone.id === 'cardio'
                                    ? 'Línea 4HP / 4CA'
                                    : zone.id === 'peso-libre'
                                      ? 'Bancos & Multipower'
                                      : zone.id === 'funcional'
                                        ? 'TRX · Plyo · Ropes'
                                        : zone.id === 'recepcion'
                                          ? 'Torno QR / NFC'
                                          : 'Duchas & Taquillas'}
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                </div>

                {/* Accessible symmetrical 4x2 zone selector grid below map */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3 border-t border-white/8">
                  {GYM_ZONES.map((zone) => {
                    const isActive = zone.id === selectedZoneId;
                    return (
                      <button
                        key={zone.id}
                        type="button"
                        onClick={() => setSelectedZoneId(zone.id)}
                        aria-pressed={isActive}
                        className={`min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer whitespace-nowrap truncate ${
                          isActive
                            ? 'bg-[#00A8FF] text-[#04070D] font-bold'
                            : 'bg-[#131B28] text-slate-300 hover:text-white border border-white/8'
                        }`}
                      >
                        {zone.shortName}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-xl overflow-hidden border border-[#00A8FF]/30 bg-[#06080D]">
                  <img
                    src="/assets/images/fitnessdreams_sala_3d_render.jpg"
                    alt="Render arquitectónico 3D exclusivo de la sala FitnessDreams Benidorm"
                    className="w-full h-auto max-h-[540px] object-contain mx-auto"
                    referrerPolicy="no-referrer"
                  />
                </div>
                <p className="text-xs text-slate-400">
                  Render 3D exclusivo rediseñado para FitnessDreams Benidorm: sala curva de cardio y fuerza en negro y azul eléctrico, carril funcional, vestuarios azules con torno QR y Sala Multifunción con tatami y sacos al fondo.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Right: Selected Zone Detail Inspector */}
        <div className="lg:col-span-5 rounded-2xl bg-[#0D121B] border border-white/10 p-6 space-y-5">
          <div className="space-y-2">
            <p className="text-xs text-[#33C1FF] font-medium">
              Horario {selectedZone.schedule} · Zona seleccionada
            </p>
            <h2 className="text-2xl font-bold text-white tracking-tight">
              {selectedZone.name}
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              {selectedZone.description}
            </p>
          </div>

          <ul className="space-y-2 border-t border-white/8 pt-4">
            {selectedZone.highlights.map((item) => (
              <li key={item} className="text-sm text-slate-300 flex items-start gap-2.5">
                <span className="text-[#00A8FF] font-bold mt-0.5">·</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>

          {/* Contextual zone actions */}
          {selectedZone.id === 'multifuncion' && (
            <button
              type="button"
              onClick={() => onNavigate('clases')}
              className="w-full min-h-[46px] rounded-xl bg-[#00A8FF] hover:bg-[#33C1FF] text-[#04070D] font-semibold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <CalendarCheck className="w-4 h-4" />
              Reservar Jiu-Jitsu, Boxeo o Jumping Fitness
              <ArrowRight className="w-4 h-4" />
            </button>
          )}

          {selectedZone.id === 'cafeteria' && (
            <button
              type="button"
              onClick={() => onNavigate('club')}
              className="w-full min-h-[46px] rounded-xl bg-[#00A8FF] hover:bg-[#33C1FF] text-[#04070D] font-semibold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <Coffee className="w-4 h-4" />
              Ver carta Cafetería con -15% Socio Fundador
              <ArrowRight className="w-4 h-4" />
            </button>
          )}

          {/* Real Telju Machines inside this zone */}
          {zoneMachines.length > 0 && (
            <div className="space-y-3 border-t border-white/8 pt-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Dumbbell className="w-4 h-4 text-[#00A8FF]" />
                  Equipamiento Telju en esta zona
                </h3>
                <span className="text-xs font-mono tabular-nums text-slate-400">
                  {zoneMachines.length} uds.
                </span>
              </div>

              <div className="max-h-[320px] overflow-y-auto divide-y divide-white/8 pr-1">
                {zoneMachines.map((machine) => (
                  <div
                    key={machine.code}
                    className="py-3 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white truncate">
                        {machine.name}
                      </p>
                      <p className="text-xs text-slate-400 font-mono">
                        {machine.code} · {machine.muscleGroup}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAddMachine(machine)}
                      aria-label={`Añadir ${machine.name} al entreno`}
                      className="min-h-[40px] px-3 py-1.5 rounded-lg bg-[#131B28] hover:bg-[#00A8FF] hover:text-[#04070D] text-slate-200 border border-white/10 text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer shrink-0 whitespace-nowrap"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Añadir
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
