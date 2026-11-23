import type { Language } from '../i18n/LanguageContext.tsx';
import { translateSchedule } from '../i18n/helpers.ts';

function escapeHtml(raw: string): string {
  return String(raw || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface PlayerEmailTemplateParams {
  playerName: string;
  tournamentTitle: string;
  gameName?: string;
  groupName: string;
  scheduledAt: string;
  matchLabel?: string;
  opponentName?: string;
  venueName?: string;
  prizePool?: string;
  appUrl?: string;
  lang?: Language;
}

export function buildPlayerEmailTemplate(params: PlayerEmailTemplateParams): {
  subject: string;
  text: string;
  html: string;
} {
  const lang: Language = params.lang || 'ar';
  const isAr = lang === 'ar';

  const playerName = params.playerName.trim() || (isAr ? 'اللاعب' : 'Player');
  const tournamentTitle = params.tournamentTitle.trim();
  const gameName = (params.gameName || '').trim();
  const groupName = params.groupName.trim();
  const scheduledDisplay = translateSchedule(params.scheduledAt || 'لم يتحدد', lang);
  const matchLabel = (params.matchLabel || '').trim();
  const opponentName = (params.opponentName || '').trim();
  const venueName = (params.venueName || '').trim();
  const prizePool = (params.prizePool || '').trim();
  const appUrl = (params.appUrl || '').trim();

  const subject = isAr
    ? `🎮 أرينا برو | ${tournamentTitle} — ${groupName} (${scheduledDisplay})`
    : `🎮 Arena Pro | ${tournamentTitle} — ${groupName} (${scheduledDisplay})`;

  const textLines = [
    isAr ? `أهلاً ${playerName}،` : `Hello ${playerName},`,
    '',
    isAr
      ? `تم تحديث تفاصيل مشاركتك في بطولة "${tournamentTitle}" عبر منصة أرينا برو:`
      : `Your match details in "${tournamentTitle}" have been updated on Arena Pro:`,
    gameName ? `${isAr ? 'اللعبة' : 'Game'}: ${gameName}` : '',
    `${isAr ? 'المجموعة' : 'Group'}: ${groupName}`,
    matchLabel ? `${isAr ? 'المواجهة' : 'Match'}: ${matchLabel}` : '',
    opponentName ? `${isAr ? 'الخصم' : 'Opponent'}: ${opponentName}` : '',
    `${isAr ? 'الموعد' : 'Schedule'}: ${scheduledDisplay}`,
    venueName ? `${isAr ? 'المكان / الصالة' : 'Venue'}: ${venueName}` : '',
    prizePool ? `${isAr ? 'الجائزة' : 'Prize Pool'}: ${prizePool}` : '',
    appUrl ? `${isAr ? 'رابط المنصة' : 'Platform'}: ${appUrl}` : '',
  ].filter(Boolean);

  const dir = isAr ? 'rtl' : 'ltr';
  const align = isAr ? 'right' : 'left';

  const detailRow = (label: string, value: string, accent = '#FFFFFF') => `
    <tr>
      <td style="padding:10px 14px;border-bottom:1px solid rgba(255,255,255,0.08);color:#94A3B8;font-size:13px;width:36%;text-align:${align};">${escapeHtml(label)}</td>
      <td style="padding:10px 14px;border-bottom:1px solid rgba(255,255,255,0.08);color:${accent};font-size:14px;font-weight:700;text-align:${align};">${escapeHtml(value)}</td>
    </tr>
  `;

  const html = `<!doctype html>
<html lang="${lang}" dir="${dir}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:24px 12px;background-color:#070811;font-family:Arial,Helvetica,sans-serif;color:#E2E8F0;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;margin:0 auto;background-color:#0E1222;border:1px solid rgba(212,255,0,0.28);border-radius:16px;overflow:hidden;">
    <tr>
      <td style="height:4px;background:linear-gradient(90deg,#D4FF00,#22D3EE,#F02E97);"></td>
    </tr>
    <tr>
      <td style="padding:24px 24px 12px 24px;text-align:${align};">
        <div style="display:inline-block;padding:5px 12px;border-radius:8px;background-color:#D4FF00;color:#070811;font-size:12px;font-weight:900;letter-spacing:0.5px;">
          ${isAr ? 'أرينا برو · ARENA PRO' : 'ARENA PRO ESPORTS'}
        </div>
        <h1 style="margin:14px 0 6px 0;font-size:20px;line-height:1.4;color:#FFFFFF;">
          ${isAr ? `أهلاً ${escapeHtml(playerName)}` : `Hello ${escapeHtml(playerName)}`}
        </h1>
        <p style="margin:0;font-size:14px;line-height:1.6;color:#CBD5E1;">
          ${
            isAr
              ? `إليك تفاصيل مجموعتك وموعد مواجهتك في بطولة <strong style="color:#D4FF00;">${escapeHtml(tournamentTitle)}</strong>:`
              : `Here are your group and match schedule details for <strong style="color:#D4FF00;">${escapeHtml(tournamentTitle)}</strong>:`
          }
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding:12px 24px 20px 24px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#070811;border:1px solid rgba(255,255,255,0.1);border-radius:12px;overflow:hidden;">
          ${gameName ? detailRow(isAr ? 'اللعبة' : 'Game', gameName, '#22D3EE') : ''}
          ${detailRow(isAr ? 'المجموعة' : 'Group', groupName, '#22D3EE')}
          ${matchLabel ? detailRow(isAr ? 'المواجهة' : 'Match', matchLabel, '#FFFFFF') : ''}
          ${opponentName ? detailRow(isAr ? 'المنافس' : 'Opponent', opponentName, '#F472B6') : ''}
          ${detailRow(isAr ? 'الموعد' : 'Schedule', scheduledDisplay, '#D4FF00')}
          ${venueName ? detailRow(isAr ? 'الصالة / المكان' : 'Venue', venueName, '#E2E8F0') : ''}
          ${prizePool ? detailRow(isAr ? 'مجموع الجوائز' : 'Prize Pool', prizePool, '#34D399') : ''}
        </table>
      </td>
    </tr>
    ${
      appUrl
        ? `<tr>
      <td style="padding:0 24px 24px 24px;text-align:center;">
        <a href="${escapeHtml(appUrl)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:12px 26px;border-radius:10px;background-color:#D4FF00;color:#070811;font-size:14px;font-weight:900;text-decoration:none;">
          ${isAr ? 'فتح جدول البطولة في أرينا برو' : 'Open Bracket in Arena Pro'}
        </a>
      </td>
    </tr>`
        : ''
    }
    <tr>
      <td style="padding:14px 24px;background-color:#070811;border-top:1px solid rgba(255,255,255,0.06);text-align:center;font-size:11px;color:#64748B;">
        ${
          isAr
            ? 'تم إرسال هذه الرسالة من الإدارة الرسمية لمنصة أرينا برو (<span style="color:#D4FF00;direction:ltr;display:inline-block;">saeedyassin313@gmail.com</span>).'
            : 'Sent from the official Arena Pro administration (<span style="color:#D4FF00;">saeedyassin313@gmail.com</span>).'
        }
      </td>
    </tr>
  </table>
</body>
</html>`;

  return {
    subject,
    text: textLines.join('\n'),
    html,
  };
}
