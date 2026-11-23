import type { BracketMatch } from '../types.ts';

export type MatchPeriod = 'صباحاً' | 'الضهر' | 'العصر' | 'مساءً';

export const MATCH_PERIODS: {
  value: MatchPeriod;
  labelAr: string;
  labelEn: string;
}[] = [
  { value: 'صباحاً', labelAr: 'صباحاً', labelEn: 'AM' },
  { value: 'الضهر', labelAr: 'الضهر', labelEn: 'Noon' },
  { value: 'العصر', labelAr: 'العصر', labelEn: 'Afternoon' },
  { value: 'مساءً', labelAr: 'مساءً', labelEn: 'PM' },
];

export const ARABIC_WEEKDAYS = [
  'الأحد',
  'الإثنين',
  'الثلاثاء',
  'الأربعاء',
  'الخميس',
  'الجمعة',
  'السبت',
] as const;

export const ENGLISH_WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

export function parseLocalDateParts(dateStr?: string): {
  year: number;
  month: number;
  day: number;
} | null {
  if (!dateStr) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

export function getDayNameFromDate(
  dateStr?: string,
  lang: 'ar' | 'en' = 'ar'
): string {
  const parts = parseLocalDateParts(dateStr);
  if (!parts) return '';
  const dt = new Date(parts.year, parts.month - 1, parts.day, 12, 0, 0, 0);
  const idx = dt.getDay();
  return lang === 'ar' ? ARABIC_WEEKDAYS[idx] : ENGLISH_WEEKDAYS[idx];
}

export function getTodayIsoLocal(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function getNextWeekdayIsoLocal(targetWeekday: number): string {
  const d = new Date();
  const diff = (targetWeekday - d.getDay() + 7) % 7;
  return getTodayIsoLocal(diff);
}

export function to24HourFromPeriod(
  time12: string | undefined,
  period: MatchPeriod | undefined
): { hour24: number; minute: number } | null {
  if (!time12) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(time12.trim());
  if (!m) return null;
  const rawHour = Number(m[1]);
  const minute = Number(m[2]);
  if (rawHour < 0 || rawHour > 23 || minute < 0 || minute > 59) return null;

  let hour24 = rawHour;
  const p = period || 'مساءً';
  if (rawHour >= 1 && rawHour <= 12) {
    if (p === 'صباحاً') {
      hour24 = rawHour === 12 ? 0 : rawHour;
    } else if (p === 'الضهر') {
      hour24 = rawHour === 12 ? 12 : rawHour < 6 ? rawHour + 12 : rawHour;
    } else if (p === 'العصر') {
      hour24 = rawHour === 12 ? 12 : rawHour < 7 ? rawHour + 12 : rawHour;
    } else {
      // مساءً
      hour24 = rawHour === 12 ? 0 : rawHour < 12 ? rawHour + 12 : rawHour;
    }
  }
  return { hour24, minute };
}

export function buildScheduledTimestampMs(
  dateStr?: string,
  time12?: string,
  period?: MatchPeriod
): number | null {
  const parts = parseLocalDateParts(dateStr);
  const t = to24HourFromPeriod(time12, period);
  if (!parts || !t) return null;
  const dt = new Date(parts.year, parts.month - 1, parts.day, t.hour24, t.minute, 0, 0);
  const ms = dt.getTime();
  return Number.isFinite(ms) ? ms : null;
}

export function hasMatchResult(m: {
  winnerId?: string | null;
  scoreA?: number | null;
  scoreB?: number | null;
}): boolean {
  const hasWinner = Boolean(m.winnerId && String(m.winnerId).trim().length > 0);
  const hasScoreA =
    m.scoreA !== null && m.scoreA !== undefined && Number.isFinite(Number(m.scoreA));
  const hasScoreB =
    m.scoreB !== null && m.scoreB !== undefined && Number.isFinite(Number(m.scoreB));
  return hasWinner || (hasScoreA && hasScoreB);
}

export function suggestMatchStatusFromSchedule(params: {
  date?: string;
  time?: string;
  period?: MatchPeriod;
  hasWinner?: boolean;
  scoreA?: number | null;
  scoreB?: number | null;
  hasResult?: boolean;
  nowMs?: number;
}): BracketMatch['status'] {
  const resultRecorded =
    Boolean(params.hasResult) ||
    hasMatchResult({
      winnerId: params.hasWinner ? 'winner' : null,
      scoreA: params.scoreA,
      scoreB: params.scoreB,
    });
  if (resultRecorded) return 'completed';

  const scheduledMs = buildScheduledTimestampMs(
    params.date,
    params.time,
    params.period
  );
  if (scheduledMs === null) return 'upcoming';

  const now = params.nowMs ?? Date.now();
  if (now < scheduledMs) return 'upcoming';
  // Match transitions to "جارية" (live) once its scheduled time hits and stays live until a result is entered
  return 'live';
}

export function from24HourToPeriod(hour24: number, minute: number): {
  time12: string;
  period: MatchPeriod;
} {
  const normHour = ((hour24 % 24) + 24) % 24;
  const normMin = Math.max(0, Math.min(59, minute));
  let period: MatchPeriod = 'مساءً';
  if (normHour >= 4 && normHour <= 11) {
    period = 'صباحاً';
  } else if (normHour >= 12 && normHour <= 14) {
    period = 'الضهر';
  } else if (normHour >= 15 && normHour <= 17) {
    period = 'العصر';
  } else {
    period = 'مساءً';
  }
  const hour12 = normHour % 12 === 0 ? 12 : normHour % 12;
  return {
    time12: `${String(hour12).padStart(2, '0')}:${String(normMin).padStart(2, '0')}`,
    period,
  };
}

export function addMinutesToScheduleSlot(params: {
  dateStr: string;
  time12: string;
  period: MatchPeriod;
  addMinutes: number;
}): {
  scheduledDate: string;
  scheduledTime: string;
  scheduledPeriod: MatchPeriod;
  scheduledDay: string;
  scheduledAt: string;
} {
  const startMs = buildScheduledTimestampMs(params.dateStr, params.time12, params.period);
  const baseDate = startMs !== null ? new Date(startMs) : new Date();
  const nextDate = new Date(baseDate.getTime() + params.addMinutes * 60 * 1000);
  const yyyy = nextDate.getFullYear();
  const mm = String(nextDate.getMonth() + 1).padStart(2, '0');
  const dd = String(nextDate.getDate()).padStart(2, '0');
  const scheduledDate = `${yyyy}-${mm}-${dd}`;
  const { time12: scheduledTime, period: scheduledPeriod } = from24HourToPeriod(
    nextDate.getHours(),
    nextDate.getMinutes()
  );
  const scheduledDay = getDayNameFromDate(scheduledDate, 'ar');
  const scheduledAt = formatMatchScheduleDisplay({
    date: scheduledDate,
    time: scheduledTime,
    period: scheduledPeriod,
    dayName: scheduledDay,
  });
  return {
    scheduledDate,
    scheduledTime,
    scheduledPeriod,
    scheduledDay,
    scheduledAt,
  };
}

export function formatMatchScheduleDisplay(params: {
  date?: string;
  time?: string;
  period?: MatchPeriod;
  dayName?: string;
}): string {
  const cleanDate = params.date?.trim() || '';
  const cleanTime = params.time?.trim() || '';
  const cleanPeriod = params.period || 'الضهر';
  const day =
    params.dayName?.trim() || (cleanDate ? getDayNameFromDate(cleanDate, 'ar') : '');

  const datePart = [day, cleanDate].filter(Boolean).join(' ');
  const timePart = cleanTime ? `${cleanTime} ${cleanPeriod}` : '';

  if (datePart && timePart) return `${datePart} · ${timePart}`;
  if (datePart) return datePart;
  if (timePart) return timePart;
  return 'لم يتحدد';
}
