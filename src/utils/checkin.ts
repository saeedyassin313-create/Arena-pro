import type {
  BracketParticipant,
  MatchFormatTag,
  TeamRosterMember,
} from '../types.ts';

export type TeamReadinessStatus =
  | 'waiting'
  | 'one_ready'
  | 'partial_ready'
  | 'team_ready';

export interface TeamRosterCheckStatus {
  name: string;
  handle: string;
  role?: string;
  checkedIn: boolean;
}

export interface TeamCheckInSummary {
  requiredCount: number;
  arrivedCount: number;
  status: TeamReadinessStatus;
  badge: string;
  members: TeamRosterCheckStatus[];
}

export function normalizeCheckInKey(raw?: string): string {
  return String(raw || '')
    .trim()
    .replace(/^@+/, '')
    .toLowerCase();
}

export function extractScannedIdentifier(rawInput: string): string {
  const trimmed = String(rawInput || '').trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed) || trimmed.includes('addFriend=')) {
    try {
      const url = trimmed.startsWith('http')
        ? new URL(trimmed)
        : new URL(trimmed, 'https://arena-pro.app');
      const addFriend = url.searchParams.get('addFriend');
      if (addFriend && addFriend.trim()) {
        return addFriend.trim().replace(/^@+/, '');
      }
    } catch {
      const m = trimmed.match(/addFriend=([^&#\s]+)/i);
      if (m?.[1]) {
        try {
          return decodeURIComponent(m[1]).trim().replace(/^@+/, '');
        } catch {
          return m[1].trim().replace(/^@+/, '');
        }
      }
    }
  }
  return trimmed.replace(/^@+/, '');
}

export function getRequiredTeamSize(modeTag?: MatchFormatTag): number {
  if (modeTag === '4v4') return 4;
  if (modeTag === '2v2') return 2;
  return 1;
}

export function getParticipantRosterList(p: BracketParticipant): TeamRosterMember[] {
  if (Array.isArray(p.rosterMembers) && p.rosterMembers.length > 0) {
    return p.rosterMembers;
  }
  const base: TeamRosterMember[] = [
    {
      name: p.username || p.name,
      username: p.username,
    },
  ];
  if (p.teammateUsername) {
    base.push({
      name: p.teammateUsername,
      username: p.teammateUsername,
    });
  }
  return base;
}

export function getTeamCheckInSummary(
  p: BracketParticipant,
  modeTag?: MatchFormatTag
): TeamCheckInSummary {
  const requiredCount = getRequiredTeamSize(modeTag);
  const roster = getParticipantRosterList(p);
  const checkedSet = new Set(
    (p.checkedInHandles || []).map((h) => normalizeCheckInKey(h)).filter(Boolean)
  );

  const members: TeamRosterCheckStatus[] = roster.map((rm, idx) => {
    const handle = String(rm.username || (idx === 0 ? p.username : rm.name) || '').trim();
    const key = normalizeCheckInKey(handle);
    const nameKey = normalizeCheckInKey(rm.name);
    const checkedIn =
      (Boolean(key) && checkedSet.has(key)) ||
      (Boolean(nameKey) && checkedSet.has(nameKey)) ||
      (idx === 0 && Boolean(p.gameId) && checkedSet.has(normalizeCheckInKey(p.gameId)));

    return {
      name: rm.name || handle || `#${idx + 1}`,
      handle: handle || rm.name || '',
      role: rm.role,
      checkedIn,
    };
  });

  const arrivedCount = members.filter((m) => m.checkedIn).length;

  let status: TeamReadinessStatus = 'waiting';
  let badge = 'WAITING';

  if (arrivedCount >= requiredCount && requiredCount > 0) {
    status = 'team_ready';
    badge = 'TEAM READY';
  } else if (arrivedCount === 1) {
    status = 'one_ready';
    badge = 'ONE READY';
  } else if (arrivedCount > 1) {
    status = 'partial_ready';
    badge = `${arrivedCount}/${requiredCount} READY`;
  }

  return {
    requiredCount,
    arrivedCount,
    status,
    badge,
    members,
  };
}
