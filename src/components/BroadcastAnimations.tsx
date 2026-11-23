import { useEffect, useId, useRef, useState } from 'react';
import { Award, Crown, Trophy } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { BracketMatch } from '../types.ts';

/* ============================================================================
   #4 — Broadcast Scoreboard Slot-Roll / Flip Animation
   ============================================================================ */

interface BroadcastScoreValueProps {
  value: number | null;
  isWinner?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function BroadcastScoreValue({
  value,
  isWinner = false,
  size = 'md',
  className = '',
}: BroadcastScoreValueProps) {
  const prefersReduced = useReducedMotion();
  const prevValueRef = useRef<number | null>(value);
  const [pulseFlash, setPulseFlash] = useState(false);

  useEffect(() => {
    if (prevValueRef.current !== value) {
      prevValueRef.current = value;
      if (value !== null && !prefersReduced) {
        setPulseFlash(true);
        const timer = window.setTimeout(() => setPulseFlash(false), 650);
        return () => window.clearTimeout(timer);
      }
    }
    return undefined;
  }, [value, prefersReduced]);

  const display = value !== null ? String(value) : '—';
  const sizeClass =
    size === 'sm'
      ? 'min-w-[1.6ch] h-5 text-xs'
      : size === 'lg'
      ? 'min-w-[2ch] h-7 text-base'
      : 'min-w-[1.8ch] h-6 text-sm';

  return (
    <span
      className={`relative inline-flex items-center justify-center overflow-hidden font-mono-num font-bold tabular-nums select-none rounded-md px-1 ${sizeClass} ${
        isWinner ? 'arena-winner-gold-score font-extrabold' : 'text-[#D4FF00]'
      } ${className}`}
    >
      {pulseFlash && !prefersReduced && (
        <motion.span
          aria-hidden="true"
          initial={{ opacity: 0.85, scale: 0.75 }}
          animate={{ opacity: 0, scale: 1.55 }}
          transition={{ duration: 0.58, ease: [0.16, 1, 0.3, 1] }}
          className="absolute inset-0 rounded-md ring-2 ring-[#D4FF00] pointer-events-none"
        />
      )}

      {prefersReduced ? (
        <span>{display}</span>
      ) : (
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={display}
            initial={{ y: 14, opacity: 0, scale: 0.86 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -14, opacity: 0, scale: 0.86 }}
            transition={{
              type: 'spring',
              stiffness: 440,
              damping: 28,
              mass: 0.7,
            }}
            className="inline-block leading-none"
          >
            {display}
          </motion.span>
        </AnimatePresence>
      )}
    </span>
  );
}

interface BroadcastScorePairProps {
  scoreA: number | null;
  scoreB: number | null;
  winnerSide?: 'A' | 'B' | null;
  className?: string;
}

export function BroadcastScorePair({
  scoreA,
  scoreB,
  winnerSide = null,
  className = '',
}: BroadcastScorePairProps) {
  return (
    <span
      dir="ltr"
      className={`inline-flex items-center gap-1 font-mono-num font-bold shrink-0 px-2 py-0.5 rounded-lg arena-score-chip ${className}`}
    >
      <BroadcastScoreValue value={scoreA} isWinner={winnerSide === 'A'} size="sm" />
      <span className="text-slate-400 text-xs" aria-hidden="true">
        -
      </span>
      <BroadcastScoreValue value={scoreB} isWinner={winnerSide === 'B'} size="sm" />
    </span>
  );
}

/* ============================================================================
   #3 — SVG Neon Path Draw for Tournament Bracket Advancement
   ============================================================================ */

interface BracketPairConnectorsProps {
  matches: BracketMatch[];
  slotHeight: number;
  totalTreeHeight: number;
  isRtl: boolean;
}

export function BracketPairConnectors({
  matches,
  slotHeight,
  totalTreeHeight,
  isRtl,
}: BracketPairConnectorsProps) {
  const prefersReduced = useReducedMotion();
  const gradUid = useId().replace(/:/g, '');
  const pairCount = Math.floor(matches.length / 2);

  if (pairCount <= 0 || totalTreeHeight <= 0) return null;

  const width = 48;
  const startX = isRtl ? width : 0;
  const endX = isRtl ? 0 : width;
  const midX = width / 2;

  return (
    <div
      aria-hidden="true"
      className="relative shrink-0 self-end pointer-events-none"
      style={{ width: `${width}px`, height: `${totalTreeHeight}px` }}
    >
      <svg
        width={width}
        height={totalTreeHeight}
        viewBox={`0 0 ${width} ${totalTreeHeight}`}
        fill="none"
        className="block overflow-visible"
      >
        <defs>
          <linearGradient
            id={`arenaNeonGrad-${gradUid}`}
            x1={isRtl ? '100%' : '0%'}
            y1="0%"
            x2={isRtl ? '0%' : '100%'}
            y2="0%"
          >
            <stop offset="0%" stopColor="#F59E0B" />
            <stop offset="55%" stopColor="#FBBF24" />
            <stop offset="100%" stopColor="#FDE68A" />
          </linearGradient>
          <filter
            id={`arenaNeonGlow-${gradUid}`}
            x="-40%"
            y="-40%"
            width="180%"
            height="180%"
          >
            <feGaussianBlur stdDeviation="2.4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {Array.from({ length: pairCount }).map((_, pairIdx) => {
          const topMatch = matches[pairIdx * 2];
          const botMatch = matches[pairIdx * 2 + 1];

          const yTop = (pairIdx * 2 + 0.5) * slotHeight;
          const yBot = (pairIdx * 2 + 1.5) * slotHeight;
          const yMid = (pairIdx * 2 + 1) * slotHeight;

          const topPath = `M ${startX} ${yTop} C ${midX} ${yTop}, ${midX} ${yMid}, ${endX} ${yMid}`;
          const botPath = `M ${startX} ${yBot} C ${midX} ${yBot}, ${midX} ${yMid}, ${endX} ${yMid}`;

          const topAdvanced = Boolean(topMatch?.winnerId || topMatch?.status === 'completed');
          const botAdvanced = Boolean(botMatch?.winnerId || botMatch?.status === 'completed');
          const anyAdvanced = topAdvanced || botAdvanced;

          return (
            <g key={`${topMatch?.id || pairIdx}-${botMatch?.id || pairIdx}`}>
              {/* Subtle baseline structural guides */}
              <path
                d={topPath}
                stroke="rgba(124, 58, 237, 0.34)"
                strokeWidth="1.75"
                strokeLinecap="round"
              />
              <path
                d={botPath}
                stroke="rgba(124, 58, 237, 0.34)"
                strokeWidth="1.75"
                strokeLinecap="round"
              />

              {/* Animated SVG Neon Laser Beam for Top Match Winner */}
              {topAdvanced && (
                <>
                  <motion.path
                    key={`top-laser-${topMatch.id}-${topMatch.winnerId || 'done'}`}
                    d={topPath}
                    stroke={`url(#arenaNeonGrad-${gradUid})`}
                    strokeWidth="2.6"
                    strokeLinecap="round"
                    filter={`url(#arenaNeonGlow-${gradUid})`}
                    initial={prefersReduced ? { pathLength: 1, opacity: 1 } : { pathLength: 0, opacity: 0.35 }}
                    animate={{ pathLength: 1, opacity: 1 }}
                    transition={
                      prefersReduced
                        ? { duration: 0 }
                        : { duration: 0.58, ease: [0.16, 1, 0.3, 1] }
                    }
                  />
                  {!prefersReduced && (
                    <motion.path
                      d={topPath}
                      stroke="#FFFFFF"
                      strokeOpacity="0.85"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeDasharray="8 58"
                      initial={{ strokeDashoffset: 66 }}
                      animate={{ strokeDashoffset: -66 }}
                      transition={{
                        duration: 2.1,
                        repeat: Infinity,
                        ease: 'linear',
                        repeatDelay: 0.6,
                      }}
                    />
                  )}
                </>
              )}

              {/* Animated SVG Neon Laser Beam for Bottom Match Winner */}
              {botAdvanced && (
                <>
                  <motion.path
                    key={`bot-laser-${botMatch.id}-${botMatch.winnerId || 'done'}`}
                    d={botPath}
                    stroke={`url(#arenaNeonGrad-${gradUid})`}
                    strokeWidth="2.6"
                    strokeLinecap="round"
                    filter={`url(#arenaNeonGlow-${gradUid})`}
                    initial={prefersReduced ? { pathLength: 1, opacity: 1 } : { pathLength: 0, opacity: 0.35 }}
                    animate={{ pathLength: 1, opacity: 1 }}
                    transition={
                      prefersReduced
                        ? { duration: 0 }
                        : { duration: 0.58, ease: [0.16, 1, 0.3, 1] }
                    }
                  />
                  {!prefersReduced && (
                    <motion.path
                      d={botPath}
                      stroke="#FFFFFF"
                      strokeOpacity="0.85"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeDasharray="8 58"
                      initial={{ strokeDashoffset: 66 }}
                      animate={{ strokeDashoffset: -66 }}
                      transition={{
                        duration: 2.1,
                        repeat: Infinity,
                        ease: 'linear',
                        delay: 0.35,
                        repeatDelay: 0.6,
                      }}
                    />
                  )}
                </>
              )}

              {/* Origin Terminal Anchor Dots */}
              <circle
                cx={startX}
                cy={yTop}
                r={topAdvanced ? 3 : 2}
                fill={topAdvanced ? '#FBBF24' : 'rgba(148,163,184,0.4)'}
              />
              <circle
                cx={startX}
                cy={yBot}
                r={botAdvanced ? 3 : 2}
                fill={botAdvanced ? '#FBBF24' : 'rgba(148,163,184,0.4)'}
              />

              {/* Target Junction Node */}
              <motion.circle
                cx={endX}
                cy={yMid}
                r={anyAdvanced ? 3.8 : 2.2}
                fill={anyAdvanced ? '#F59E0B' : 'rgba(124,58,237,0.4)'}
                initial={false}
                animate={
                  anyAdvanced && !prefersReduced
                    ? { scale: [1, 1.35, 1] }
                    : { scale: 1 }
                }
                transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

interface BracketChampionBeamProps {
  isCrowned: boolean;
  isRtl: boolean;
  height: number;
}

export function BracketChampionBeam({ isCrowned, isRtl, height }: BracketChampionBeamProps) {
  const prefersReduced = useReducedMotion();
  const gradUid = useId().replace(/:/g, '');
  const width = 40;
  const startX = isRtl ? width : 0;
  const endX = isRtl ? 0 : width;
  const midY = Math.max(20, height / 2);
  const path = `M ${startX} ${midY} L ${endX} ${midY}`;

  return (
    <div
      aria-hidden="true"
      className="relative shrink-0 pointer-events-none flex items-center"
      style={{ width: `${width}px`, height: `${height}px` }}
    >
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} fill="none">
        <defs>
          <linearGradient
            id={`arenaChampBeam-${gradUid}`}
            x1={isRtl ? '100%' : '0%'}
            y1="0%"
            x2={isRtl ? '0%' : '100%'}
            y2="0%"
          >
            <stop offset="0%" stopColor="#22D3EE" />
            <stop offset="50%" stopColor="#D4FF00" />
            <stop offset="100%" stopColor="#F59E0B" />
          </linearGradient>
        </defs>
        <path
          d={path}
          stroke="rgba(212, 255, 0, 0.28)"
          strokeWidth="2"
          strokeDasharray={isCrowned ? undefined : '4 4'}
        />
        {isCrowned && (
          <>
            <motion.path
              d={path}
              stroke={`url(#arenaChampBeam-${gradUid})`}
              strokeWidth="3"
              strokeLinecap="round"
              initial={prefersReduced ? { pathLength: 1 } : { pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
            />
            <circle cx={endX} cy={midY} r="4" fill="#F59E0B" />
          </>
        )}
      </svg>
    </div>
  );
}

/* ============================================================================
   #7 — Champion Spotlight Reveal (Hero Banner + Pedestal)
   ============================================================================ */

interface ChampionSpotlightBannerProps {
  winnerName: string;
  tournamentTitle: string;
  prizePool?: string;
  isAr: boolean;
  onInspectWinner?: () => void;
}

const SPARK_COORDS = [
  { x: -24, y: -18, delay: 0, size: 7 },
  { x: 26, y: -16, delay: 0.45, size: 6 },
  { x: -28, y: 14, delay: 0.9, size: 5 },
  { x: 28, y: 16, delay: 0.25, size: 7 },
  { x: 0, y: -26, delay: 0.65, size: 6 },
  { x: 18, y: 24, delay: 1.15, size: 5 },
];

export function ChampionSpotlightBanner({
  winnerName,
  tournamentTitle,
  prizePool,
  isAr,
  onInspectWinner,
}: ChampionSpotlightBannerProps) {
  const prefersReduced = useReducedMotion();

  const content = (
    <motion.div
      key={winnerName}
      initial={prefersReduced ? { opacity: 1 } : { opacity: 0, y: 10, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className="relative mt-3 rounded-2xl border p-4 sm:p-5 overflow-hidden arena-champion-spotlight"
    >
      {/* Subtle Championship Sheen Sweep (GPU transform/opacity only) */}
      {!prefersReduced && (
        <motion.div
          aria-hidden="true"
          initial={{ x: '-120%', opacity: 0 }}
          animate={{ x: '240%', opacity: [0, 0.55, 0] }}
          transition={{
            duration: 2.2,
            repeat: Infinity,
            repeatDelay: 4.2,
            ease: 'easeInOut',
          }}
          className="pointer-events-none absolute inset-y-0 w-1/3 skew-x-[-20deg] bg-gradient-to-r from-transparent via-amber-300/20 to-transparent"
        />
      )}

      <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          {/* Rotating Orbital Halo + Spring Trophy Crest */}
          <div className="relative w-14 h-14 shrink-0 flex items-center justify-center">
            {!prefersReduced && (
              <motion.div
                aria-hidden="true"
                animate={{ rotate: 360 }}
                transition={{ duration: 12, repeat: Infinity, ease: 'linear' }}
                className="absolute inset-0 rounded-2xl p-[1.5px] arena-champion-halo"
              >
                <div className="w-full h-full rounded-[14px] arena-champion-halo-core" />
              </motion.div>
            )}

            {/* Controlled Orbital Micro-Sparks around the Trophy Emblem Only */}
            {!prefersReduced &&
              SPARK_COORDS.map((spark, idx) => (
                <motion.span
                  key={idx}
                  aria-hidden="true"
                  initial={{ opacity: 0, scale: 0.4 }}
                  animate={{
                    opacity: [0, 0.95, 0],
                    scale: [0.4, 1.15, 0.4],
                    y: [spark.y, spark.y - 5, spark.y],
                  }}
                  transition={{
                    duration: 2.4,
                    delay: spark.delay,
                    repeat: Infinity,
                    ease: 'easeInOut',
                  }}
                  style={{
                    left: '50%',
                    top: '50%',
                    marginLeft: spark.x,
                    marginTop: 0,
                    width: spark.size,
                    height: spark.size,
                  }}
                  className="pointer-events-none absolute rotate-45 rounded-[1px] bg-amber-400"
                />
              ))}

            <motion.div
              initial={prefersReduced ? { scale: 1 } : { scale: 0.65, rotate: -10 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 18, delay: 0.08 }}
              className="relative z-10 w-11 h-11 rounded-xl flex items-center justify-center arena-champion-crest"
            >
              <Crown className="w-5 h-5" />
            </motion.div>
          </div>

          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold arena-champion-kicker">
              <Award className="w-3.5 h-3.5 shrink-0" />
              <span>{isAr ? 'منصة التتويج · البطل الرسمي المتوّج' : 'Championship Spotlight · Official Winner'}</span>
            </div>
            <div className="text-lg sm:text-xl font-extrabold truncate arena-champion-name">
              {winnerName}
            </div>
            <div className="text-xs truncate arena-champion-meta">
              {tournamentTitle}
              {prizePool ? ` · ${isAr ? 'الجائزة:' : 'Prize:'} ${prizePool}` : ''}
            </div>
          </div>
        </div>

        {onInspectWinner && (
          <button
            type="button"
            onClick={onInspectWinner}
            className="min-h-[40px] px-4 py-2 rounded-xl text-xs font-extrabold transition-colors whitespace-nowrap shrink-0 arena-champion-cta self-start sm:self-center"
          >
            {isAr ? 'تشكيلة البطل' : 'Champion Roster'}
          </button>
        )}
      </div>
    </motion.div>
  );

  return content;
}

interface ChampionPedestalCardProps {
  championName: string | null;
  isAr: boolean;
  onInspectChampion?: () => void;
}

export function ChampionPedestalCard({
  championName,
  isAr,
  onInspectChampion,
}: ChampionPedestalCardProps) {
  const prefersReduced = useReducedMotion();
  const isCrowned = Boolean(championName);

  return (
    <motion.div
      initial={false}
      animate={isCrowned && !prefersReduced ? { scale: [0.95, 1.02, 1] } : { scale: 1 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className={`w-[186px] rounded-2xl border p-4 text-center space-y-2.5 shadow-lg relative overflow-hidden ${
        isCrowned
          ? 'arena-champion-spotlight'
          : 'bg-[#070811] border-white/[0.12]'
      }`}
    >
      <div className="relative w-12 h-12 mx-auto flex items-center justify-center">
        {isCrowned && !prefersReduced && (
          <motion.div
            aria-hidden="true"
            animate={{ rotate: 360 }}
            transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
            className="absolute inset-0 rounded-xl p-[1.5px] arena-champion-halo"
          >
            <div className="w-full h-full rounded-[10px] arena-champion-halo-core" />
          </motion.div>
        )}
        <div
          className={`relative z-10 w-10 h-10 rounded-xl flex items-center justify-center ${
            isCrowned
              ? 'arena-champion-crest'
              : 'bg-[#D4FF00]/15 border border-[#D4FF00]/35 text-[#D4FF00]'
          }`}
        >
          {isCrowned ? <Crown className="w-5 h-5" /> : <Trophy className="w-5 h-5" />}
        </div>
      </div>

      <div
        className={`text-[11px] font-bold tracking-wide ${
          isCrowned ? 'arena-champion-kicker' : 'text-[#22D3EE]'
        }`}
      >
        {isAr ? 'كأس البطولة' : 'Arena Crown'}
      </div>

      {isCrowned && onInspectChampion ? (
        <button
          type="button"
          onClick={onInspectChampion}
          className="text-sm font-extrabold hover:underline truncate block w-full arena-champion-name"
        >
          {championName}
        </button>
      ) : (
        <div
          className={`text-sm font-extrabold truncate ${
            isCrowned ? 'arena-champion-name' : 'text-slate-300 text-xs font-bold'
          }`}
        >
          {championName || (isAr ? 'لم يُحسم بعد' : 'To Be Crowned')}
        </div>
      )}
    </motion.div>
  );
}
