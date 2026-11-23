export type GameSlug = 'pool8' | 'fc27' | 'custom';

export type ActiveView =
  | 'home'
  | 'games'
  | 'tournaments'
  | 'profile'
  | 'admin';

export type MatchFormatTag = '1v1' | '2v2' | '4v4';

export interface GameInfo {
  slug: GameSlug;
  nameAr: string;
  nameEn: string;
  modeLabel: string;
  scoringSystem: string;
  teamSize: number;
  imageUrl: string;
  activePlayersCount: number;
  summary: string;
  rulesHighlights: string[];
  updatedAtMs?: number;
}

export interface TeamRosterMember {
  name: string;
  username?: string;
  role?: string;
}

export interface BracketParticipant {
  id: string;
  name: string;
  teamName?: string;
  username: string;
  email?: string;
  hasEmail?: boolean;
  teammateUsername?: string;
  rosterMembers?: TeamRosterMember[];
  registeredByUid?: string;
  groupName: string;
  seed: number;
  gameId: string;
  isTeam: boolean;
  checkedInHandles?: string[];
  isDummy?: boolean;
}

export interface BracketMatch {
  id: string;
  roundIndex: number;
  matchNumber: number;
  groupName: string;
  seatA?: number;
  seatB?: number;
  leg?: 'ذهاب' | 'عودة' | 'مباراة واحدة';
  scheduledAt?: string;
  scheduledDate?: string;
  scheduledTime?: string;
  scheduledPeriod?: 'صباحاً' | 'الضهر' | 'العصر' | 'مساءً';
  scheduledDay?: string;
  pairKey?: string;
  participantA: BracketParticipant | null;
  participantB: BracketParticipant | null;
  scoreA: number | null;
  scoreB: number | null;
  winnerId: string | null;
  status: 'upcoming' | 'live' | 'pending_review' | 'completed';
}

export interface BracketRound {
  roundIndex: number;
  nameAr: string;
  matches: BracketMatch[];
}

export interface Tournament {
  id: string;
  title: string;
  gameSlug: GameSlug;
  customGameName?: string;
  modeTag: MatchFormatTag;
  formatLabel: string;
  venueName: string;
  prizePool: string;
  maxSlots: 4 | 8 | 16 | 32 | 64;
  registeredCount: number;
  registrationOpen: boolean;
  resultsEntryOpen?: boolean;
  lastAiMatchupSummary?: string;
  status: 'open' | 'ongoing' | 'completed';
  isFeatured: boolean;
  entryType: 'solo' | 'team';
  rules: string[];
  winnerName: string | null;
  rounds: BracketRound[];
  updatedAtMs?: number;
}

export interface GroupStandingRow {
  participant: BracketParticipant;
  groupName: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
}

export interface ResultSubmission {
  id: string;
  tournamentId: string;
  tournamentTitle: string;
  matchId: string;
  matchLabel: string;
  submittedBy: string;
  claimedWinnerId: string;
  claimedWinnerName: string;
  scoreA: number;
  scoreB: number;
  screenshotUrl: string;
  note: string;
  status: 'pending' | 'approved' | 'rejected';
}

export interface GameIdsMap {
  pool8: string;
  fc27: string;
}

export interface TeamMember {
  id: string;
  uid?: string;
  name: string;
  role: string;
  handle: string;
  verified: boolean;
  isOnline?: boolean;
  lastActiveAt?: string;
}

export interface TeamClan {
  id: string;
  name: string;
  tag: string;
  inviteCode: string;
  captainName: string;
  members: TeamMember[];
}

export interface PlayerProfile {
  id: string;
  playerCode: string;
  displayName: string;
  handle: string;
  email?: string;
  photoURL?: string;
  isGoogleSignedIn?: boolean;
  onboardingCompleted?: boolean;
  city: string;
  whatsappNumber?: string;
  phoneOrDiscord: string;
  gameIds: GameIdsMap;
  registeredTournamentIds: string[];
  lastActiveAt?: string;
}

export interface AdminPlayerSummary {
  id: string;
  displayName: string;
  handle: string;
  playerCode: string;
  email: string;
  whatsappNumber: string;
  city: string;
  onboardingCompleted?: boolean;
  updatedAt?: string;
  tournamentsCount?: number;
}

export interface LiveFeedItem {
  id: string;
  tournamentId: string;
  tournamentTitle: string;
  gameName: string;
  roundName: string;
  matchNumber: number;
  groupName: string;
  participantAName: string;
  participantBName: string;
  scoreA: number;
  scoreB: number;
  winnerName: string;
  approvedAt: string;
}

export interface PlayerNotification {
  id: string;
  tournamentId: string;
  tournamentTitle: string;
  participantId: string;
  recipientName: string;
  recipientEmail?: string;
  groupName: string;
  matchId?: string;
  matchLabel?: string;
  opponentName?: string;
  scheduledAt: string;
  subject: string;
  message: string;
  deliveryStatus: 'sent' | 'not_configured' | 'no_email' | 'failed';
  deliveryNote: string;
  createdAt: string;
}

export interface FriendChatMessage {
  id: string;
  clientMsgId?: string;
  channelId: string;
  senderUid: string;
  senderHandle: string;
  senderName: string;
  recipientUid: string;
  recipientHandle: string;
  text: string;
  createdAt: string;
  readBy?: string[];
}

export interface FriendRequest {
  id: string;
  fromUid: string;
  fromHandle: string;
  fromName: string;
  fromPlayerCode: string;
  toUid: string;
  toHandle: string;
  toName: string;
  toPlayerCode: string;
  role?: string;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: string;
  respondedAt?: string;
}

export interface PlatformState {
  schemaVersion?: number;
  games: GameInfo[];
  tournaments: Tournament[];
  submissions: ResultSubmission[];
  liveFeed: LiveFeedItem[];
  notifications?: PlayerNotification[];
  friendMessages?: FriendChatMessage[];
  friendRequests?: FriendRequest[];
  friendsByUid?: Record<string, TeamMember[]>;
  isViewerAdmin?: boolean;
  profile: PlayerProfile;
  profilesByUid?: Record<string, PlayerProfile>;
  activityByHandle?: Record<string, string>;
  team: TeamClan;
  adminHandles: string[];
  emailServiceConfigured?: boolean;
}
