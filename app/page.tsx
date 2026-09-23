"use client";

import { Sora, Inter } from "next/font/google";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "../app/globals.css";

// ---------------------------------------------------------------------------
// Tipografía
// ---------------------------------------------------------------------------
const sora = Sora({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-display" });
const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-body" });

// ---------------------------------------------------------------------------
// Constantes de juego
// ---------------------------------------------------------------------------
const GAME_DURATION = 60;
const LOW_TIME_THRESHOLD = 10;
const MAX_AMMO = 20;
const BASE_TARGETS = 3;
const MAX_TARGETS = 4;
const RANKING_STORAGE_KEY = "target-solo-ranking";
const DIFFICULTY_RAMP = 20; // sube dificultad cada 20s

// Imágenes (colócalas en la carpeta /public)
const GAME_BG_IMAGE = "/ekeko.png"; // fondo del área de disparo
const GAME_LOGO = "/logo-caja.webp"; // logo en la parte superior del área de disparo

type Screen = "menu" | "game" | "gameover" | "ranking" | "name";
type TargetSize = "small" | "medium" | "large";
type Difficulty = "easy" | "normal" | "hard";

interface Target {
  id: number;
  x: number;
  y: number;
  size: TargetSize;
  bornAt: number;
  lifespan: number;
  points: number;
}

interface RankingEntry {
  name: string;
  score: number;
  accuracy: number;
  maxCombo: number;
  date: string;
}

interface ShotMark {
  id: number;
  x: number;
  y: number;
  hit: boolean;
  points: number;
}

// ---------------------------------------------------------------------------
// Configuración por tamaño — TIEMPOS MÁS GENEROSOS
// ---------------------------------------------------------------------------
const SIZE_CONFIG: Record<TargetSize, { px: number; points: number; lifespan: number; color: string }> = {
  large: { px: 96, points: 50, lifespan: 5000, color: "#C81E2C" },
  medium: { px: 72, points: 100, lifespan: 4200, color: "#E8455A" },
  small: { px: 52, points: 200, lifespan: 3400, color: "#7A0F1C" },
};

// ---------------------------------------------------------------------------
// Configuración por dificultad — speedFactor más suave (1.0 = sin cambio)
// ---------------------------------------------------------------------------
const DIFFICULTY_CONFIG: Record<Difficulty, { label: string; speedFactor: number; spawnBias: TargetSize[] }> = {
  easy: {
    label: "Fácil",
    speedFactor: 1.0,
    spawnBias: ["large", "large", "medium", "medium", "small"],
  },
  normal: {
    label: "Normal",
    speedFactor: 0.92,
    spawnBias: ["large", "medium", "medium", "small", "small"],
  },
  hard: {
    label: "Difícil",
    speedFactor: 0.82,
    spawnBias: ["medium", "medium", "small", "small", "small"],
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInRange(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

function getDifficulty(elapsed: number): Difficulty {
  const stage = Math.floor(elapsed / DIFFICULTY_RAMP);
  if (stage === 0) return "easy";
  if (stage === 1) return "normal";
  return "hard";
}

function loadRanking(): RankingEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(RANKING_STORAGE_KEY);
    return stored ? (JSON.parse(stored) as RankingEntry[]) : [];
  } catch {
    return [];
  }
}

function saveRanking(ranking: RankingEntry[]) {
  try {
    localStorage.setItem(RANKING_STORAGE_KEY, JSON.stringify(ranking));
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Iconos
// ---------------------------------------------------------------------------
type IconProps = { className?: string };
const iconBase = "1.75";

const IconTarget = ({ className = "w-6 h-6" }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={iconBase} strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="5" />
    <circle cx="12" cy="12" r="1.5" fill="currentColor" />
  </svg>
);

const IconClock = ({ className = "w-4 h-4" }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={iconBase} strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3.5 2" />
  </svg>
);

const IconStar = ({ className = "w-4 h-4" }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={iconBase} strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M12 3.5l2.6 5.4 5.9.7-4.3 4.1 1.1 5.9L12 16.8l-5.3 2.8 1.1-5.9-4.3-4.1 5.9-.7z" />
  </svg>
);

const IconTrophy = ({ className = "w-6 h-6" }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={iconBase} strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M7 4h10v4a5 5 0 0 1-5 5 5 5 0 0 1-5-5V4Z" />
    <path d="M7 5H4a3 3 0 0 0 3 4M17 5h3a3 3 0 0 1-3 4" />
    <path d="M12 13v3m-3 4h6m-3 0v-4" />
  </svg>
);

const IconExit = ({ className = "w-4 h-4" }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={iconBase} strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 8l-4 4 4 4M6 12h11" />
  </svg>
);

const IconExpand = ({ className = "w-4 h-4" }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={iconBase} strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5" />
  </svg>
);

const IconCollapse = ({ className = "w-4 h-4" }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={iconBase} strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M4 9h5V4M20 9h-5V4M4 15h5v5M20 15h-5v5" />
  </svg>
);

const IconPlay = ({ className = "w-5 h-5" }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M8 5.5v13l11-6.5-11-6.5Z" />
  </svg>
);

const IconCrosshair = ({ className = "w-5 h-5" }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={iconBase} strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 1v5M12 18v5M1 12h5M18 12h5" />
  </svg>
);

const IconBullet = ({ className = "w-4 h-4" }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <rect x="9" y="2" width="6" height="14" rx="3" />
    <path d="M9 16h6v4a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2v-4Z" />
  </svg>
);

const IconFlame = ({ className = "w-4 h-4" }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={iconBase} strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M12 3c2 3 4 5 4 9a4 4 0 1 1-8 0c0-1.5.5-2.5 1.5-3.5C9 10 9 11 10 11c0-3 1-5 2-8Z" />
  </svg>
);

// ---------------------------------------------------------------------------
// Estilos base
// ---------------------------------------------------------------------------
const BRAND_BACKDROP =
  "relative bg-[radial-gradient(120%_100%_at_50%_-10%,#FF3B4E_0%,#C81E2C_45%,#7A0F1C_100%)] " +
  "before:content-[''] before:absolute before:inset-0 before:opacity-[0.06] before:pointer-events-none " +
  "before:bg-[radial-gradient(circle_at_1px_1px,#FFFFFF_1px,transparent_0)] before:bg-[length:22px_22px]";

const CARD_SURFACE = "rounded-3xl bg-white shadow-[0_25px_70px_-20px_rgba(0,0,0,0.55)] border border-black/5";

const BTN_PRIMARY =
  "inline-flex items-center justify-center gap-2 bg-[#C81E2C] hover:bg-[#A6172A] active:scale-[0.98] text-white font-semibold rounded-xl shadow-lg shadow-[#C81E2C]/30 transition-all duration-200";

const BTN_GHOST_LIGHT =
  "inline-flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-semibold rounded-full transition-colors duration-200";

// ---------------------------------------------------------------------------
// Diana visual
// ---------------------------------------------------------------------------
function TargetVisual({ target, onHit, disabled }: { target: Target; onHit: (t: Target) => void; disabled: boolean }) {
  const config = SIZE_CONFIG[target.size];
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onHit(target);
      }}
      disabled={disabled}
      aria-label={`Diana de ${target.points} puntos`}
      className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full transition-transform duration-150 hover:scale-110 active:scale-95 disabled:cursor-default touch-manipulation"
      style={{
        left: `${target.x}%`,
        top: `${target.y}%`,
        width: config.px,
        height: config.px,
        animation: `popIn 0.25s ease-out`,
      }}
    >
      <div
        className="w-full h-full rounded-full flex items-center justify-center shadow-2xl"
        style={{
          background: `radial-gradient(circle, #FFFFFF 0%, #FFFFFF 18%, ${config.color} 19%, ${config.color} 38%, #FFFFFF 39%, #FFFFFF 58%, ${config.color} 59%, ${config.color} 78%, #FFFFFF 79%, #FFFFFF 100%)`,
          boxShadow: `0 0 0 3px ${config.color}, 0 10px 30px -8px rgba(0,0,0,0.6), inset 0 0 0 2px rgba(255,255,255,0.5)`,
        }}
      >
        <div className="w-1/3 h-1/3 rounded-full bg-white shadow-inner flex items-center justify-center">
          <div className="w-1/2 h-1/2 rounded-full" style={{ background: config.color }} />
        </div>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------
export default function TargetSoloGame() {
  const [screen, setScreen] = useState<Screen>("menu");
  const [targets, setTargets] = useState<Target[]>([]);
  const [shots, setShots] = useState<ShotMark[]>([]);
  const [ammo, setAmmo] = useState(MAX_AMMO);
  const [hits, setHits] = useState(0);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION);
  const [active, setActive] = useState(false);
  const [ranking, setRanking] = useState<RankingEntry[]>([]);
  const [playerName, setPlayerName] = useState("");
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [timerPaused, setTimerPaused] = useState(false);
  const [flashKey, setFlashKey] = useState(0);

  const idRef = useRef(0);
  const playAreaRef = useRef<HTMLDivElement>(null);

  const elapsed = GAME_DURATION - timeLeft;
  const difficulty = useMemo(() => getDifficulty(elapsed), [elapsed]);
  const difficultyConfig = DIFFICULTY_CONFIG[difficulty];
  const isLowTime = timeLeft <= LOW_TIME_THRESHOLD;
  const totalShots = MAX_AMMO - ammo;
  const accuracy = totalShots > 0 ? Math.round((hits / totalShots) * 100) : 0;

  // Multiplicador según combo (máx x5)
  const comboMultiplier = useMemo(() => {
    if (combo >= 12) return 5;
    if (combo >= 8) return 4;
    if (combo >= 5) return 3;
    if (combo >= 3) return 2;
    return 1;
  }, [combo]);

  // Número de dianas según dificultad
  const activeTargetCount = useMemo(() => {
    const extra = Math.floor(elapsed / DIFFICULTY_RAMP);
    return Math.min(MAX_TARGETS, BASE_TARGETS + extra);
  }, [elapsed]);

  // ---------------------------------------------------------------------
  // Fullscreen
  // ---------------------------------------------------------------------
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else if (document.exitFullscreen) {
      document.exitFullscreen();
    }
  }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  // ---------------------------------------------------------------------
  // Ranking persistente
  // ---------------------------------------------------------------------
  useEffect(() => {
    setRanking(loadRanking());
  }, []);

  useEffect(() => {
    saveRanking(ranking);
  }, [ranking]);

  // ---------------------------------------------------------------------
  // Spawn de dianas
  // ---------------------------------------------------------------------
  const spawnTarget = useCallback((): Target => {
    const size = pickRandom<TargetSize>(difficultyConfig.spawnBias);
    const config = SIZE_CONFIG[size];
    idRef.current += 1;
    return {
      id: idRef.current,
      x: randomInRange(15, 85),
      y: randomInRange(24, 82), // mínimo 24 para no nacer debajo del logo
      size,
      bornAt: Date.now(),
      lifespan: config.lifespan * difficultyConfig.speedFactor,
      points: config.points,
    };
  }, [difficultyConfig]);

  // ---------------------------------------------------------------------
  // Iniciar partida
  // ---------------------------------------------------------------------
  const startGame = useCallback(() => {
    idRef.current = 0;
    setShots([]);
    setAmmo(MAX_AMMO);
    setHits(0);
    setScore(0);
    setCombo(0);
    setMaxCombo(0);
    setTimeLeft(GAME_DURATION);
    setActive(true);
    setScreen("game");
    setTimerPaused(false);
    // spawn inicial inmediato
    const initial: Target[] = [];
    for (let i = 0; i < BASE_TARGETS; i++) initial.push(spawnTarget());
    setTargets(initial);
  }, [spawnTarget]);

  // ---------------------------------------------------------------------
  // Mantener dianas vivas (reemplaza expiradas)
  // ---------------------------------------------------------------------
  useEffect(() => {
    if (!active || screen !== "game" || timerPaused) return;
    const interval = setInterval(() => {
      setTargets((prev) => {
        const now = Date.now();
        const alive = prev.filter((t) => now - t.bornAt < t.lifespan);
        const toAdd = Math.max(0, activeTargetCount - alive.length);
        if (toAdd === 0) return alive;
        const added: Target[] = [];
        for (let i = 0; i < toAdd; i++) added.push(spawnTarget());
        return [...alive, ...added];
      });
    }, 500);
    return () => clearInterval(interval);
  }, [active, screen, timerPaused, spawnTarget, activeTargetCount]);

  // ---------------------------------------------------------------------
  // Timer
  // ---------------------------------------------------------------------
  useEffect(() => {
    if (!active || screen !== "game" || timerPaused) return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          setActive(false);
          setScreen("gameover");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [active, screen, timerPaused]);

  // ---------------------------------------------------------------------
  // Fin por falta de munición
  // ---------------------------------------------------------------------
  useEffect(() => {
    if (!active || screen !== "game") return;
    if (ammo === 0) {
      const timeout = setTimeout(() => {
        setActive(false);
        setScreen("gameover");
      }, 1000);
      return () => clearTimeout(timeout);
    }
  }, [ammo, active, screen]);

  // ---------------------------------------------------------------------
  // Disparar (fallo)
  // ---------------------------------------------------------------------
  const handleShoot = useCallback(
    (clientX: number, clientY: number) => {
      if (!active || timerPaused || ammo <= 0) return;
      const area = playAreaRef.current;
      if (!area) return;
      const rect = area.getBoundingClientRect();
      const xPct = ((clientX - rect.left) / rect.width) * 100;
      const yPct = ((clientY - rect.top) / rect.height) * 100;

      setAmmo((a) => a - 1);
      setCombo(0);
      setShots((prev) => [
        ...prev,
        { id: idRef.current++, x: xPct, y: yPct, hit: false, points: 0 },
      ]);
    },
    [active, timerPaused, ammo]
  );

  // ---------------------------------------------------------------------
  // Acierto en diana
  // ---------------------------------------------------------------------
  const handleHit = useCallback(
    (target: Target) => {
      if (!active || timerPaused || ammo <= 0) return;

      const newCombo = combo + 1;
      const multiplier = newCombo >= 12 ? 5 : newCombo >= 8 ? 4 : newCombo >= 5 ? 3 : newCombo >= 3 ? 2 : 1;
      const gained = target.points * multiplier;

      setAmmo((a) => a - 1);
      setHits((h) => h + 1);
      setScore((s) => s + gained);
      setCombo(newCombo);
      setMaxCombo((m) => Math.max(m, newCombo));
      setFlashKey((k) => k + 1);
      setShots((prev) => [
        ...prev,
        { id: idRef.current++, x: target.x, y: target.y, hit: true, points: gained },
      ]);
      setTargets((prev) => prev.filter((t) => t.id !== target.id).concat(spawnTarget()));
    },
    [active, timerPaused, ammo, combo, spawnTarget]
  );

  // ---------------------------------------------------------------------
  // Limpiar marcas de disparo
  // ---------------------------------------------------------------------
  useEffect(() => {
    if (shots.length === 0) return;
    const timeout = setTimeout(() => {
      setShots((prev) => prev.slice(1));
    }, 900);
    return () => clearTimeout(timeout);
  }, [shots]);

  // ---------------------------------------------------------------------
  // Finalizar partida
  // ---------------------------------------------------------------------
  const resetGame = useCallback(() => setScreen("name"), []);

  const submitScore = useCallback(() => {
    const entry: RankingEntry = {
      name: playerName.trim() || "Anónimo",
      score,
      accuracy,
      maxCombo,
      date: new Date().toLocaleString(),
    };
    setRanking((prev) => [...prev, entry].sort((a, b) => b.score - a.score).slice(0, 10));
    setTargets([]);
    setShots([]);
    setAmmo(MAX_AMMO);
    setHits(0);
    setScore(0);
    setCombo(0);
    setMaxCombo(0);
    setTimeLeft(GAME_DURATION);
    setActive(false);
    setPlayerName("");
    setScreen("menu");
  }, [playerName, score, accuracy, maxCombo]);

  const exitToMenu = useCallback(() => {
    setActive(false);
    setScreen("menu");
    setShowExitConfirm(false);
    setTargets([]);
    setShots([]);
  }, []);

  const fontVars = `${sora.variable} ${inter.variable}`;

  // =====================================================================
  // PANTALLA: NOMBRE
  // =====================================================================
  if (screen === "name") {
    return (
      <div className={`${fontVars} font-[family-name:var(--font-body)] flex flex-col justify-center items-center min-h-screen p-6 ${BRAND_BACKDROP}`}>
        <div className={`relative w-full max-w-sm p-8 ${CARD_SURFACE}`}>
          <p className="text-xs font-semibold tracking-widest uppercase text-[#C81E2C] mb-2">Nuevo puntaje</p>
          <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold text-[#1A0A0D] mb-2">
            Guarda tu resultado
          </h1>
          <p className="text-[#7A0F1C]/70 text-sm mb-6">
            Puntaje: <span className="font-bold text-[#C81E2C]">{score}</span> · Combo máx: {maxCombo}×
          </p>
          <label htmlFor="player-name" className="block text-sm font-medium text-[#7A0F1C] mb-2">
            Tu nombre
          </label>
          <input
            id="player-name"
            type="text"
            placeholder="Ej. María Torres"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitScore()}
            maxLength={20}
            autoFocus
            className="w-full p-3 rounded-xl border border-black/10 bg-white mb-6 text-[#1A0A0D] outline-none focus:ring-2 focus:ring-[#C81E2C] focus:border-transparent transition-shadow"
          />
          <button onClick={submitScore} className={`w-full px-6 py-3 ${BTN_PRIMARY}`}>
            Guardar y volver al menú
          </button>
        </div>
      </div>
    );
  }

  // =====================================================================
  // PANTALLA: MENÚ
  // =====================================================================
  if (screen === "menu") {
    return (
      <div className={`${fontVars} font-[family-name:var(--font-body)] flex flex-col justify-center items-center min-h-screen p-6 text-center ${BRAND_BACKDROP}`}>
        <div className="relative flex flex-col items-center animate-[fadeUp_0.6s_ease-out]">
          <img
            src="logo-caja.webp"
            alt="Caja Huancayo"
            className="w-full max-w-[400px] h-auto mb-8 drop-shadow-[0_8px_24px_rgba(0,0,0,0.4)]"
          />

          <span className="inline-flex items-center gap-2 rounded-full bg-white/15 border border-white/25 px-4 py-1.5 text-xs font-semibold tracking-wide text-white mb-5 backdrop-blur-sm">
            <IconCrosshair className="w-3.5 h-3.5" />
            Modo jugador
          </span>

          <h1 className="font-[family-name:var(--font-display)] text-4xl sm:text-5xl font-extrabold text-[#000] leading-tight mb-3 max-w-md">
            Tiro al blanco
          </h1>
          <p className="text-white/75 max-w-xs mb-10">
            Encadena aciertos para multiplicar tus puntos. La dificultad aumenta cada 20 segundos.
          </p>

          <button
            onClick={startGame}
            className="group inline-flex items-center gap-2 bg-white hover:bg-[#FFF5F5] active:scale-[0.98] px-8 py-3.5 rounded-full text-[#7A0F1C] font-bold text-lg shadow-[0_15px_40px_-10px_rgba(0,0,0,0.5)] transition-all duration-200"
          >
            <IconPlay className="w-5 h-5 text-[#C81E2C] group-hover:translate-x-0.5 transition-transform" />
            Iniciar juego
          </button>

          <div className="flex items-center gap-6 mt-6">
            <button
              onClick={() => setScreen("ranking")}
              className="text-white/80 hover:text-white text-sm font-medium underline underline-offset-4 decoration-white/30 hover:decoration-white transition-colors"
            >
              Ver ranking
            </button>
            <span className="w-1 h-1 rounded-full bg-white/40" />
            <button
              onClick={toggleFullscreen}
              className="inline-flex items-center gap-1.5 text-white/80 hover:text-white text-sm font-medium transition-colors"
            >
              {isFullscreen ? <IconCollapse /> : <IconExpand />}
              {isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
            </button>
          </div>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-4 text-xs text-white/70 max-w-md">
           
            <div className="flex items-center gap-2">
              <IconFlame className="w-3.5 h-3.5 text-[#FFD700]" />
              <span>Combo hasta ×5</span>
            </div>
          </div>
        </div>

        <style jsx>{`
          @keyframes fadeUp {
            from { opacity: 0; transform: translateY(14px); }
            to { opacity: 1; transform: translateY(0); }
          }
          @media (prefers-reduced-motion: reduce) {
            .animate-\\[fadeUp_0\\.6s_ease-out\\] { animation: none; }
          }
        `}</style>
      </div>
    );
  }

  // =====================================================================
  // PANTALLA: RANKING
  // =====================================================================
  if (screen === "ranking") {
    const podium = ranking.slice(0, 3);
    const rest = ranking.slice(3);
    const podiumStyles = [
      "order-2 bg-gradient-to-b from-white to-[#FFE5E5] text-[#7A0F1C] h-32 border border-[#C81E2C]/20",
      "order-1 bg-gradient-to-b from-[#FFF5F5] to-[#FFD9D9] text-[#7A0F1C] h-28 border border-[#C81E2C]/15",
      "order-3 bg-gradient-to-b from-[#FFD9D9] to-[#FFB3B3] text-[#7A0F1C] h-24 border border-[#C81E2C]/15",
    ];

    return (
      <div className={`${fontVars} font-[family-name:var(--font-body)] min-h-screen p-6 flex flex-col items-center ${BRAND_BACKDROP}`}>
        <div className="relative w-full max-w-md flex flex-col items-center pt-4">
          <IconTrophy className="w-10 h-10 text-white mb-2" />
          <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold text-white mb-8">Ranking local</h1>

          {ranking.length === 0 ? (
            <div className="w-full rounded-2xl bg-white/10 border border-white/20 p-8 text-center backdrop-blur-sm">
              <p className="text-white/85">Aún no hay puntajes. ¡Sé el primero en jugar!</p>
            </div>
          ) : (
            <>
              {podium.length > 0 && (
                <div className="flex items-end justify-center gap-3 w-full mb-6">
                  {podium.map((r, i) => (
                    <div key={`${r.name}-${i}`} className={`flex-1 flex flex-col items-center rounded-t-2xl px-2 pt-3 pb-2 shadow-lg ${podiumStyles[i]}`}>
                      <span className="text-xs font-bold opacity-70">#{i + 1}</span>
                      <span className="font-semibold text-sm truncate w-full text-center">{r.name}</span>
                      <span className="font-[family-name:var(--font-display)] font-bold">{r.score}</span>
                      <span className="text-[10px] opacity-70 flex items-center gap-0.5">
                        <IconFlame className="w-2.5 h-2.5" /> {r.maxCombo}×
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {rest.length > 0 && (
                <ul className="w-full rounded-2xl bg-white shadow-xl overflow-hidden divide-y divide-black/5">
                  {rest.map((r, i) => (
                    <li key={`${r.name}-${i}`} className="flex items-center justify-between px-4 py-3 text-[#1A0A0D]">
                      <span className="text-sm font-semibold text-[#C81E2C] w-6">#{i + 4}</span>
                      <span className="flex-1 truncate text-sm font-medium">{r.name}</span>
                      <span className="text-xs text-[#7A0F1C]/60 w-10 text-right flex items-center justify-end gap-0.5">
                        <IconFlame className="w-2.5 h-2.5" />{r.maxCombo}
                      </span>
                      <span className="font-[family-name:var(--font-display)] font-bold text-sm w-16 text-right">{r.score}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          <button onClick={() => setScreen("menu")} className={`mt-8 px-6 py-2.5 text-sm ${BTN_GHOST_LIGHT}`}>
            <IconExit className="w-4 h-4 rotate-180" />
            Volver al menú
          </button>
        </div>
      </div>
    );
  }

  // =====================================================================
  // PANTALLA: GAME OVER
  // =====================================================================
  if (screen === "gameover") {
    const isWin = accuracy >= 75 && score >= 800;
    const isGreat = accuracy >= 60 && score >= 500;
    const title = isWin ? "¡Puntería perfecta!" : isGreat ? "¡Buen trabajo!" : "Fin del juego";
    return (
      <div className={`${fontVars} font-[family-name:var(--font-body)] flex flex-col justify-center items-center min-h-screen p-6 text-center ${BRAND_BACKDROP}`}>
        <div className={`w-full max-w-sm p-8 ${CARD_SURFACE}`}>
          <div className="mx-auto mb-4 w-14 h-14 rounded-full bg-[#FFE5E5] flex items-center justify-center">
            <IconTarget className="w-7 h-7 text-[#C81E2C]" />
          </div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-[#1A0A0D] mb-2">{title}</h1>
          <p className="text-[#7A0F1C]/70 mb-6 text-sm">
            {hits} aciertos de {totalShots} disparos
          </p>

          <div className="grid grid-cols-3 gap-2 mb-6">
            <div className="bg-[#FFF5F5] rounded-xl p-3">
              <p className="text-[10px] text-[#7A0F1C]/70 mb-1">Puntaje</p>
              <p className="font-[family-name:var(--font-display)] text-2xl font-extrabold text-[#C81E2C]">{score}</p>
            </div>
            <div className="bg-[#FFF5F5] rounded-xl p-3">
              <p className="text-[10px] text-[#7A0F1C]/70 mb-1">Precisión</p>
              <p className="font-[family-name:var(--font-display)] text-2xl font-extrabold text-[#C81E2C]">{accuracy}%</p>
            </div>
            <div className="bg-[#FFF5F5] rounded-xl p-3">
              <p className="text-[10px] text-[#7A0F1C]/70 mb-1">Combo</p>
              <p className="font-[family-name:var(--font-display)] text-2xl font-extrabold text-[#C81E2C] flex items-center justify-center gap-0.5">
                <IconFlame className="w-4 h-4" />{maxCombo}
              </p>
            </div>
          </div>

          <button onClick={resetGame} className={`w-full px-6 py-3 mb-3 ${BTN_PRIMARY}`}>
            Guardar puntaje
          </button>
          <button
            onClick={() => setScreen("menu")}
            className="w-full text-[#7A0F1C] hover:text-[#C81E2C] px-6 py-2 text-sm font-semibold transition-colors"
          >
            Volver al menú principal
          </button>
        </div>
      </div>
    );
  }

  // =====================================================================
  // PANTALLA: JUEGO
  // =====================================================================
  return (
    <div className={`${fontVars} font-[family-name:var(--font-body)] flex flex-col items-center min-h-screen p-3 sm:p-5 ${BRAND_BACKDROP}`}>
      {/* HUD superior */}
      <div className="relative w-full max-w-5xl flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-white/60 text-[10px] font-semibold tracking-wider">MUNICIÓN</span>
            <div className="flex items-center gap-0.5">
              {Array.from({ length: MAX_AMMO }).map((_, i) => (
                <IconBullet
                  key={i}
                  className={`w-2.5 h-2.5 transition-all duration-300 ${
                    i < ammo ? "text-white" : "text-white/15"
                  }`}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {combo >= 2 && (
            <div
              key={flashKey}
              className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-[#FFD700] to-[#FF8C00] px-3 py-1 text-xs font-extrabold text-[#7A0F1C] shadow-lg"
              style={{ animation: "comboPulse 0.4s ease-out" }}
            >
              <IconFlame className="w-3.5 h-3.5" />
              {combo}× ({comboMultiplier}x pts)
            </div>
          )}

          <div className="inline-flex items-center gap-1.5 rounded-full bg-white/15 border border-white/25 backdrop-blur-sm px-3 py-1.5 text-xs font-bold text-white">
            <span className="opacity-60">DIF</span>
            {difficultyConfig.label}
          </div>

          <div
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold transition-colors ${
              isLowTime ? "bg-white text-[#C81E2C] animate-pulse" : "bg-white/15 text-white border border-white/25 backdrop-blur-sm"
            }`}
          >
            <IconClock className="w-4 h-4" />
            {timeLeft}s
          </div>

          <div className="inline-flex items-center gap-1.5 rounded-full bg-white/15 border border-white/25 backdrop-blur-sm px-3 py-1.5 text-sm font-bold text-white">
            <IconStar className="w-4 h-4" />
            {score}
          </div>

          <button
            onClick={() => {
              setTimerPaused(true);
              setShowExitConfirm(true);
            }}
            aria-label="Salir del juego"
            className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 border border-white/25 text-white transition-colors"
          >
            <IconExit className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>



      {/* Área de juego */}
      <div
        ref={playAreaRef}
        onClick={(e) => handleShoot(e.clientX, e.clientY)}
        className="relative w-full max-w-5xl flex-1 min-h-[62vh] rounded-3xl overflow-hidden cursor-crosshair select-none touch-manipulation"
        style={{
          backgroundImage: `url('${GAME_BG_IMAGE}')`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          boxShadow: "0 25px 70px -20px rgba(0,0,0,0.7)",
          border: "1px solid rgba(255,255,255,0.15)",
        }}
      >
        {/* Overlay para que las dianas se vean bien sobre la imagen */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/10 to-black/30 pointer-events-none" />

        <div>
       {/* Logo superior */}
        <img
          src={GAME_LOGO}
          alt="Logo"
          className="absolute top-3 left-1/2 -translate-x-1/2 h-10 sm:h-12 w-auto pointer-events-none select-none drop-shadow-[0_4px_12px_rgba(0,0,0,0.6)]"
        />
   </div>


        {targets.map((t) => (
          <TargetVisual
            key={t.id}
            target={t}
            onHit={handleHit}
            disabled={!active || timerPaused || ammo <= 0}
          />
        ))}

        {shots.map((s) => (
          <div
            key={s.id}
            className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none"
            style={{ left: `${s.x}%`, top: `${s.y}%`, animation: "shotFade 0.9s ease-out forwards" }}
          >
            {s.hit ? (
              <div className="relative">
                <div className="w-12 h-12 rounded-full border-2 border-[#FFD700] animate-ping absolute inset-0" />
                <div className="w-12 h-12 rounded-full border-2 border-[#FFD700] bg-[#FFD700]/10 flex items-center justify-center relative">
                  <span className="text-[#FFD700] font-bold text-xs">+{s.points}</span>
                </div>
              </div>
            ) : (
              <div className="w-8 h-8 rounded-full border-2 border-white/50 flex items-center justify-center">
                <span className="text-white/70 text-xs font-bold">×</span>
              </div>
            )}
          </div>
        ))}

        {ammo === 0 && active && (
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center pointer-events-none">
            <p className="font-[family-name:var(--font-display)] text-white text-2xl font-bold">
              Sin munición
            </p>
          </div>
        )}
      </div>

      <p className="text-white/50 text-xs mt-3 text-center">
        Acierta consecutivamente para subir el multiplicador · Cuidado con fallar, reinicia el combo
      </p>

      {showExitConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white p-7 rounded-2xl max-w-sm w-full shadow-2xl border border-black/5">
            <h3 className="font-[family-name:var(--font-display)] text-xl font-bold text-[#1A0A0D] mb-2">
              ¿Salir del juego?
            </h3>
            <p className="text-[#7A0F1C]/70 mb-6 text-sm">Perderás tu progreso en esta partida.</p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowExitConfirm(false);
                  setTimerPaused(false);
                }}
                className="px-4 py-2 rounded-xl border border-black/10 text-[#1A0A0D] font-medium hover:bg-black/5 transition-colors"
              >
                Cancelar
              </button>
              <button onClick={exitToMenu} className={`px-4 py-2 ${BTN_PRIMARY}`}>
                Salir
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        @keyframes popIn {
          from { transform: translate(-50%, -50%) scale(0.3); opacity: 0; }
          to { transform: translate(-50%, -50%) scale(1); opacity: 1; }
        }
        @keyframes shotFade {
          0% { opacity: 1; transform: translate(-50%, -50%) scale(0.6); }
          40% { opacity: 1; transform: translate(-50%, -50%) scale(1.1); }
          100% { opacity: 0; transform: translate(-50%, -50%) scale(1.4); }
        }
        @keyframes comboPulse {
          0% { transform: scale(0.8); }
          60% { transform: scale(1.1); }
          100% { transform: scale(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          * { animation-duration: 0.01ms !important; }
        }
      `}</style>
    </div>
  );
}
