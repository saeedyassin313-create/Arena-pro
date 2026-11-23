import type {
  BracketMatch,
  BracketParticipant,
  BracketRound,
  GameInfo,
  GroupStandingRow,
  PlatformState,
  Tournament,
} from '../types.ts';

const ROUND_LABELS: Record<number, string> = {
  64: 'دور الـ 64',
  32: 'دور الـ 32',
  16: 'دور الـ 16',
  8: 'ربع النهائي',
  4: 'نصف النهائي',
  2: 'النهائي',
};

export const GROUP_NAMES = [
  'المجموعة أ',
  'المجموعة ب',
  'المجموعة ج',
  'المجموعة د',
  'المجموعة هـ',
  'المجموعة و',
  'المجموعة ز',
  'المجموعة ح',
  'المجموعة ط',
  'المجموعة ي',
  'المجموعة ك',
  'المجموعة ل',
  'المجموعة م',
  'المجموعة ن',
  'المجموعة س',
  'المجموعة ع',
];

export function getGroupsForTournament(tournament: Tournament): string[] {
  const needed = Math.max(1, Math.ceil(tournament.maxSlots / 4));
  const groups = GROUP_NAMES.slice(0, Math.min(needed, GROUP_NAMES.length));
  const round0 = tournament.rounds[0];
  if (round0) {
    for (const m of round0.matches) {
      if (m.groupName && !groups.includes(m.groupName)) groups.push(m.groupName);
      if (m.participantA?.groupName && !groups.includes(m.participantA.groupName)) {
        groups.push(m.participantA.groupName);
      }
      if (m.participantB?.groupName && !groups.includes(m.participantB.groupName)) {
        groups.push(m.participantB.groupName);
      }
    }
  }
  return groups;
}

const ARABIC_TEAM_NAMES = [
  'صقور النيل',
  'ذئاب الرياض',
  'فرسان القاهرة',
  'نخبة جدة',
  'عاصفة الشام',
  'أبطال الدلتا',
  'رعد الخليج',
  'حراس الإسكندرية',
  'نسور الأردن',
  'شباب الدار',
  'فيلق الميدان',
  'كتيبة النصر',
  'أسياد الساحة',
  'نجوم المتوسط',
  'فرقة الصاعقة',
  'مغاوير العرب',
  'درع الشرق',
  'أشبال الرافدين',
  'قناصة الصحراء',
  'تحدي الجيزة',
  'فخر الكويت',
  'موج البحرين',
  'أسود الأطلس',
  'برق دبي',
  'أبطال عمان',
  'سهام اليمن',
  'نار التحدي',
  'وحدة النخبة',
  'صناع المجد',
  'رواد الأرينا',
  'كتيبة الفجر',
  'محاربو السحاب',
  'قوة الطليعة',
  'عشيرة الصقر',
  'تحالف القمة',
  'فرسان المعادي',
  'نخبة الدوحة',
  'أبطال طنطا',
  'ذئاب الشمال',
  'سواعد المنصورة',
  'حلف النجوم',
  'طلائع السويس',
  'أساطير الكأس',
  'نادي الأبطال',
  'فرقة الهجوم',
  'عاصفة الجنوب',
  'رماة القمة',
  'درع العاصمة',
  'صقور حلب',
  'أجنحة الفوز',
  'قافلة النصر',
  'نجوم الزمالك',
  'فريق البركان',
  'شعلة التحدي',
  'ميدان الفرسان',
  'كتيبة السهم',
  'حراس المرمى',
  'نخبة الباتل',
  'أبطال القاعة',
  'فرسان الفجر',
  'صقور الغرب',
  'تيار القمة',
  'وادي الملوك',
  'حلف الميدان',
];

export const GROUP_ROUND_ROBIN_PAIRS: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [2, 3],
  [0, 2],
  [1, 3],
  [0, 3],
  [1, 2],
];

export function getGroupStageLabel(numGroups: number): string {
  if (numGroups === 8) return 'دور المجموعات (8 مجموعات × 4 فرق)';
  if (numGroups === 1) return 'دور المجموعات (مجموعة واحدة × 4 فرق)';
  return `دور المجموعات (${numGroups} مجموعات × 4 فرق)`;
}

export function buildGroupStageMatches(
  tournamentId: string,
  groupSeatsMap: Map<string, (BracketParticipant | null)[]>,
  groupsOrder: string[],
  preAdvanceSample = false
): BracketMatch[] {
  const matches: BracketMatch[] = [];
  let matchNumber = 1;

  for (let gIdx = 0; gIdx < groupsOrder.length; gIdx++) {
    const groupName = groupsOrder[gIdx];
    const seats = groupSeatsMap.get(groupName) || [null, null, null, null];

    for (let pIdx = 0; pIdx < GROUP_ROUND_ROBIN_PAIRS.length; pIdx++) {
      const [seatA, seatB] = GROUP_ROUND_ROBIN_PAIRS[pIdx];
      const participantA = seats[seatA] ? { ...seats[seatA]!, groupName } : null;
      const participantB = seats[seatB] ? { ...seats[seatB]!, groupName } : null;

      let scoreA: number | null = null;
      let scoreB: number | null = null;
      let winnerId: string | null = null;
      let status: BracketMatch['status'] = 'upcoming';

      if (participantA && participantB) {
        if (preAdvanceSample) {
          const aWins = (gIdx + pIdx) % 2 === 0;
          scoreA = aWins ? 2 : 1;
          scoreB = aWins ? 1 : 2;
          winnerId = aWins ? participantA.id : participantB.id;
          status = 'completed';
        } else {
          status = 'live';
        }
      }

      matches.push({
        id: `${tournamentId}-r0-m${matchNumber}`,
        roundIndex: 0,
        matchNumber,
        groupName,
        seatA,
        seatB,
        leg: 'مباراة واحدة',
        scheduledAt: 'لم يتحدد',
        participantA,
        participantB,
        scoreA,
        scoreB,
        winnerId,
        status,
      });
      matchNumber++;
    }
  }

  return matches;
}

export function generateBracketRounds(
  tournamentId: string,
  maxSlots: 4 | 8 | 16 | 32 | 64,
  filledCount: number,
  isTeam: boolean,
  preAdvanceSample = false,
  is2v2 = false
): { rounds: BracketRound[]; participants: BracketParticipant[] } {
  const numGroups = Math.max(1, Math.ceil(maxSlots / 4));
  const groupsOrder = GROUP_NAMES.slice(0, Math.min(numGroups, GROUP_NAMES.length));
  const participants: BracketParticipant[] = [];

  for (let i = 0; i < filledCount; i++) {
    const baseName = ARABIC_TEAM_NAMES[i % ARABIC_TEAM_NAMES.length];
    const suffix = i >= ARABIC_TEAM_NAMES.length ? ` ${i + 1}` : '';
    const groupName = groupsOrder[Math.floor(i / 4) % groupsOrder.length];
    const username = `player_${i + 101}`;
    participants.push({
      id: `${tournamentId}-p-${i + 1}`,
      name: `${baseName}${suffix}`,
      username,
      teammateUsername: is2v2 ? `mate_${i + 201}` : undefined,
      groupName,
      seed: i + 1,
      gameId: `${518200 + i * 137}`,
      isTeam,
    });
  }

  const groupSeatsMap = new Map<string, (BracketParticipant | null)[]>();
  for (const gn of groupsOrder) {
    groupSeatsMap.set(gn, [null, null, null, null]);
  }
  participants.forEach((p, idx) => {
    const gn = groupsOrder[Math.floor(idx / 4) % groupsOrder.length];
    const seatIdx = idx % 4;
    p.groupName = gn;
    const seats = groupSeatsMap.get(gn)!;
    seats[seatIdx] = p;
  });

  // Round 0: Group Stage (4 teams per group, 6 round-robin matches per group)
  const round0Matches = buildGroupStageMatches(
    tournamentId,
    groupSeatsMap,
    groupsOrder,
    preAdvanceSample
  );

  const rounds: BracketRound[] = [
    {
      roundIndex: 0,
      nameAr: getGroupStageLabel(numGroups),
      matches: round0Matches,
    },
  ];

  // Knockout Stage starts from top 2 of each group (e.g. 8 groups × 2 = 16 -> Round of 16!)
  let currentRoundSize = Math.max(2, numGroups * 2);
  let roundIndex = 1;

  while (currentRoundSize >= 2) {
    const matchCount = currentRoundSize / 2;
    const matches: BracketMatch[] = [];

    for (let m = 0; m < matchCount; m++) {
      matches.push({
        id: `${tournamentId}-r${roundIndex}-m${m + 1}`,
        roundIndex,
        matchNumber: m + 1,
        groupName: 'المواجهات المباشرة',
        leg: 'مباراة واحدة',
        scheduledAt: 'لم يتحدد',
        participantA: null,
        participantB: null,
        scoreA: null,
        scoreB: null,
        winnerId: null,
        status: 'upcoming',
      });
    }

    rounds.push({
      roundIndex,
      nameAr: ROUND_LABELS[currentRoundSize] || `الدور ${roundIndex + 1}`,
      matches,
    });

    currentRoundSize = currentRoundSize / 2;
    roundIndex++;
  }

  return { rounds, participants };
}

export function computeGroupStandings(
  tournament: Tournament
): Record<string, GroupStandingRow[]> {
  const result: Record<string, GroupStandingRow[]> = {};
  for (const gn of getGroupsForTournament(tournament)) {
    result[gn] = [];
  }

  const round0 = tournament.rounds[0];
  if (!round0) return result;

  const map = new Map<string, GroupStandingRow>();
  const ensureRow = (p: BracketParticipant, fallbackGroup: string): GroupStandingRow => {
    const existing = map.get(p.id);
    if (existing) return existing;
    const gn = GROUP_NAMES.includes(p.groupName) ? p.groupName : fallbackGroup;
    const row: GroupStandingRow = {
      participant: p,
      groupName: gn,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      points: 0,
    };
    map.set(p.id, row);
    return row;
  };

  for (const m of round0.matches) {
    if (m.participantA) ensureRow(m.participantA, m.groupName);
    if (m.participantB) ensureRow(m.participantB, m.groupName);

    if (
      m.status === 'completed' &&
      m.participantA &&
      m.participantB &&
      m.scoreA !== null &&
      m.scoreB !== null
    ) {
      const rowA = ensureRow(m.participantA, m.groupName);
      const rowB = ensureRow(m.participantB, m.groupName);
      const sA = Number(m.scoreA) || 0;
      const sB = Number(m.scoreB) || 0;

      rowA.played += 1;
      rowB.played += 1;
      rowA.goalsFor += sA;
      rowA.goalsAgainst += sB;
      rowB.goalsFor += sB;
      rowB.goalsAgainst += sA;

      if (m.winnerId === m.participantA.id || sA > sB) {
        rowA.wins += 1;
        rowA.points += 3;
        rowB.losses += 1;
      } else if (m.winnerId === m.participantB.id || sB > sA) {
        rowB.wins += 1;
        rowB.points += 3;
        rowA.losses += 1;
      } else {
        rowA.draws += 1;
        rowB.draws += 1;
        rowA.points += 1;
        rowB.points += 1;
      }
    }
  }

  for (const row of map.values()) {
    if (!result[row.groupName]) result[row.groupName] = [];
    result[row.groupName].push(row);
  }

  for (const gn of Object.keys(result)) {
    result[gn].sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      const diffA = a.goalsFor - a.goalsAgainst;
      const diffB = b.goalsFor - b.goalsAgainst;
      if (diffB !== diffA) return diffB - diffA;
      if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
      return a.participant.seed - b.participant.seed;
    });
  }

  return result;
}

export function createInitialState(): PlatformState {
  const games: GameInfo[] = [
    {
      slug: 'pool8',
      nameAr: '8 Ball Pool',
      nameEn: '8 Ball Pool',
      modeLabel: 'تحديات 1v1 و 2v2',
      scoringSystem: 'خروج المغلوب السريع',
      teamSize: 1,
      imageUrl: '/assets/aistudio/images__1__94f930d6.jpeg',
      activePlayersCount: 1480,
      summary: 'بطولات الكافيهات والأونلاين بنظام التحدي الفردي 1v1 أو الثنائي 2v2 عبر اليوزر نيم.',
      rulesHighlights: [],
    },
    {
      slug: 'fc27',
      nameAr: 'EA Sports FC 27',
      nameEn: 'EA Sports FC 27',
      modeLabel: '1 ضد 1 و ثنائيات 2v2',
      scoringSystem: 'إقصاء مباشر (الأفضل من مباراتين)',
      teamSize: 1,
      imageUrl: '/assets/aistudio/FC27-ut-guide_09aef642.jpg',
      activePlayersCount: 2490,
      summary: 'تحديات الكؤوس الفردية 1v1 والثنائية 2v2 في أماكن التحدي وأونلاين.',
      rulesHighlights: [],
    },
  ];

  const tournaments: Tournament[] = [];
  const submissions: PlatformState['submissions'] = [];
  const liveFeed: PlatformState['liveFeed'] = [];

  const profile = {
    id: 'player-main',
    playerCode: 'ARENA-1042',
    displayName: 'لاعب ضيف',
    handle: 'Player_Guest',
    city: 'القاهرة',
    whatsappNumber: '',
    phoneOrDiscord: '',
    gameIds: {
      pool8: '',
      fc27: '',
    },
    registeredTournamentIds: [],
  };

  const team = {
    id: 'team-nisoor',
    name: 'نسور أرينا برو',
    tag: 'PRO',
    inviteCode: 'ARENA-PRO-2026',
    captainName: 'لاعب ضيف',
    members: [],
  };

  return {
    schemaVersion: 8,
    games,
    tournaments,
    submissions,
    liveFeed,
    notifications: [],
    profile,
    team,
    adminHandles: ['saeedyassin313@gmail.com', 'arenapro185@gmail.com'],
  };
}
