export function isValidEmailAddress(raw?: string): boolean {
  const clean = String(raw || '').trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean);
}

export function normalizeEmail(raw?: string): string {
  return String(raw || '').trim().toLowerCase();
}

export function hasTripleName(raw?: string): boolean {
  const cleaned = String(raw || '')
    .trim()
    .replace(/\s+/g, ' ');
  if (cleaned.length < 5) return false;
  const parts = cleaned.split(' ').filter((w) => w.length >= 2);
  return parts.length >= 3;
}

export function sanitizeWhatsappInput(raw?: string): string {
  return String(raw || '')
    .trim()
    .replace(/[^\d+\s()-]/g, '')
    .slice(0, 32);
}

export function extractPhoneDigits(raw?: string): string {
  return String(raw || '').replace(/\D/g, '');
}

export function isValidWhatsappNumber(raw?: string): boolean {
  const digits = extractPhoneDigits(raw);
  return digits.length >= 10 && digits.length <= 15;
}

export function buildWhatsappChatUrl(raw?: string): string | null {
  let digits = extractPhoneDigits(raw);
  if (!digits || digits.length < 10) return null;
  // Convert Egyptian 01XXXXXXXXX local numbers cleanly to 201XXXXXXXXX
  if (digits.startsWith('01') && digits.length === 11) {
    digits = `2${digits}`;
  } else if (digits.startsWith('00')) {
    digits = digits.slice(2);
  }
  return `https://wa.me/${digits}`;
}
