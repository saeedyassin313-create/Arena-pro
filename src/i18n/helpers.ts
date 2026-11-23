import type {
  BracketMatch,
  GameInfo,
  PlayerNotification,
  ResultSubmission,
  Tournament,
} from '../types.ts';
import type { Language } from './LanguageContext.tsx';

const GROUP_EN_MAP: Record<string, string> = {
  'المجموعة أ': 'Group A',
  'المجموعة ب': 'Group B',
  'المجموعة ج': 'Group C',
  'المجموعة د': 'Group D',
  'المجموعة هـ': 'Group E',
  'المجموعة و': 'Group F',
  'المجموعة ز': 'Group G',
  'المجموعة ح': 'Group H',
  'المجموعة ط': 'Group I',
  'المجموعة ي': 'Group J',
  'المجموعة ك': 'Group K',
  'المجموعة ل': 'Group L',
  'المجموعة م': 'Group M',
  'المجموعة ن': 'Group N',
  'المجموعة س': 'Group O',
  'المجموعة ع': 'Group P',
  'المواجهات المباشرة': 'Direct Knockout',
};

const ROUND_EN_MAP: Record<string, string> = {
  'دور المجموعات (8 مجموعات × 4 فرق)': 'Group Stage (8 Groups × 4 Teams)',
  'دور المجموعات (مجموعة واحدة × 4 فرق)': 'Group Stage (1 Group × 4 Teams)',
  'دور الـ 32 — المجموعات (8 × 4 فرق)': 'Group Stage (8 Groups × 4 Teams)',
  'دور الـ 8 مجموعات (ذهاب وعودة)': '8-Group Stage (Home & Away)',
  'دور الـ 64': 'Round of 64',
  'دور الـ 32': 'Round of 32',
  'دور الـ 16': 'Round of 16',
  'ربع النهائي': 'Quarterfinals',
  'نصف النهائي': 'Semifinals',
  'النهائي': 'Final',
};

export function translateGroupName(groupName: string, lang: Language): string {
  if (lang === 'ar') return groupName;
  return GROUP_EN_MAP[groupName] || groupName;
}

export function translateRoundName(roundName: string, lang: Language): string {
  if (lang === 'ar') return roundName;
  if (ROUND_EN_MAP[roundName]) return ROUND_EN_MAP[roundName];
  const groupMatch = roundName.match(/(\d+)\s*مجموعات|دور المجموعات\s*\((\d+)/);
  if (groupMatch) {
    const count = groupMatch[1] || groupMatch[2];
    return `Group Stage (${count} × 4 Teams)`;
  }
  const match = roundName.match(/^الدور\s+(\d+)$/);
  if (match) return `Round ${match[1]}`;
  return roundName;
}

export function translateLeg(leg: BracketMatch['leg'] | undefined, lang: Language): string {
  if (!leg) return lang === 'ar' ? 'مباراة واحدة' : 'Single Match';
  if (lang === 'ar') return leg;
  switch (leg) {
    case 'ذهاب':
      return '1st Leg';
    case 'عودة':
      return '2nd Leg';
    case 'مباراة واحدة':
      return 'Single Match';
    default:
      return leg;
  }
}

export function translateSchedule(scheduledAt: string | undefined, lang: Language): string {
  const val = scheduledAt?.trim() || 'لم يتحدد';
  if (lang === 'ar') return val;
  if (val === 'لم يتحدد') return 'TBD';
  return val
    .replace(/الأحد/g, 'Sun')
    .replace(/الإثنين/g, 'Mon')
    .replace(/الثلاثاء/g, 'Tue')
    .replace(/الأربعاء/g, 'Wed')
    .replace(/الخميس/g, 'Thu')
    .replace(/الجمعة/g, 'Fri')
    .replace(/السبت/g, 'Sat')
    .replace(/صباحاً/g, 'AM')
    .replace(/الضهر/g, 'Noon')
    .replace(/العصر/g, 'Afternoon')
    .replace(/مساءً/g, 'PM');
}

export function translateFormatLabel(formatLabel: string, lang: Language): string {
  if (lang === 'ar') return formatLabel;
  if (formatLabel.includes('1v1')) return '1v1 Format';
  if (formatLabel.includes('2v2')) return '2v2 Format';
  if (formatLabel.includes('4v4')) return '4v4 Format';
  return formatLabel;
}

export function translateTournamentStatus(status: Tournament['status'], lang: Language): string {
  if (lang === 'ar') {
    switch (status) {
      case 'open':
        return 'قائمة';
      case 'ongoing':
        return 'جارية';
      case 'completed':
        return 'منتهية';
    }
  }
  switch (status) {
    case 'open':
      return 'Open';
    case 'ongoing':
      return 'Ongoing';
    case 'completed':
      return 'Completed';
  }
}

export function translateMatchStatus(status: BracketMatch['status'], lang: Language): string {
  if (lang === 'ar') {
    switch (status) {
      case 'completed':
        return 'منتهية';
      case 'pending_review':
        return 'جارية (مراجعة)';
      case 'live':
        return 'جارية';
      default:
        return 'قائمة';
    }
  }
  switch (status) {
    case 'completed':
      return 'Completed';
    case 'pending_review':
      return 'Live (Review)';
    case 'live':
      return 'Live';
    default:
      return 'Upcoming';
  }
}

export function translateSubmissionStatus(
  status: ResultSubmission['status'],
  lang: Language
): string {
  if (lang === 'ar') {
    if (status === 'approved') return 'تم الاعتماد وتأهيل الفائز';
    if (status === 'rejected') return 'مرفوضة';
    return 'قيد المراجعة';
  }
  if (status === 'approved') return 'Approved & Advanced';
  if (status === 'rejected') return 'Rejected';
  return 'Pending Review';
}

export function translateDisplayName(name: string, lang: Language): string {
  if (lang === 'ar') return name;
  if (name === 'لاعب ضيف') return 'Guest Player';
  if (name === 'لاعب Google') return 'Google Player';
  return name;
}

export function translateTeamRole(role: string, lang: Language): string {
  if (lang === 'ar') return role;
  switch (role) {
    case 'قائد الفريق':
      return 'Team Captain';
    case 'شريك 2v2':
      return '2v2 Partner';
    case 'لاعب أساسي':
      return 'Core Player';
    case 'دعم تكتيكي':
      return 'Tactical Support';
    default:
      return role;
  }
}

export function translateGameInfo(
  game: GameInfo,
  lang: Language
): {
  displayName: string;
  modeLabel: string;
  scoringSystem: string;
  summary: string;
  rulesHighlights: string[];
} {
  if (lang === 'ar') {
    return {
      displayName: game.nameAr,
      modeLabel: game.modeLabel,
      scoringSystem: game.scoringSystem,
      summary: game.summary,
      rulesHighlights: game.rulesHighlights,
    };
  }

  if (game.slug === 'pool8') {
    return {
      displayName: game.nameEn,
      modeLabel: '1v1 & 2v2 Challenges',
      scoringSystem: 'Single Elimination',
      summary:
        'Online and venue-hosted 1v1 solo and 2v2 duo billiard tournaments tracked via Player ID.',
      rulesHighlights: game.rulesHighlights,
    };
  }

  if (game.slug === 'fc27') {
    return {
      displayName: game.nameEn,
      modeLabel: '1v1 & 2v2 Duos',
      scoringSystem: 'Direct Knockout (Best of 2)',
      summary:
        'Competitive 1v1 and 2v2 cup challenges hosted online and in partner gaming lounges.',
      rulesHighlights: game.rulesHighlights,
    };
  }

  return {
    displayName: game.nameEn || game.nameAr,
    modeLabel: game.modeLabel,
    scoringSystem: game.scoringSystem,
    summary: game.summary,
    rulesHighlights: game.rulesHighlights,
  };
}

export function translateNotificationDeliveryNote(
  n: PlayerNotification,
  lang: Language
): string {
  if (lang === 'ar') return n.deliveryNote;
  if (n.deliveryStatus === 'sent') {
    if (n.deliveryNote.includes('Gmail') && n.recipientEmail) {
      return `Sent directly via Gmail to ${n.recipientEmail}`;
    }
    return n.recipientEmail
      ? `Email sent directly to ${n.recipientEmail}`
      : 'Email delivered directly to player inbox.';
  }
  if (n.deliveryStatus === 'no_email') {
    return 'Saved in your Arena Pro notifications (no valid external email provided).';
  }
  if (n.deliveryStatus === 'failed') {
    return 'Saved in your Arena Pro notifications; direct email delivery failed.';
  }
  return 'Saved in your Arena Pro inbox. Connect Gmail or use the manual mail link to send by email.';
}
