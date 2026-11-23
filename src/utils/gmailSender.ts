export interface EmailDispatchTarget {
  name: string;
  email: string;
  subject: string;
  text: string;
  html: string;
}

function utf8ToBase64(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function toBase64Url(input: string): string {
  return utf8ToBase64(input)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function sendEmailViaGmailApi(opts: {
  accessToken: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  fromEmail?: string | null;
}): Promise<{ ok: boolean; status: number; error?: string }> {
  const boundary = `arena_pro_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const encodedSubject = `=?UTF-8?B?${utf8ToBase64(opts.subject)}?=`;

  const headers: string[] = [];
  if (opts.fromEmail && opts.fromEmail.includes('@')) {
    headers.push(`From: Arena Pro <${opts.fromEmail}>`);
  }
  headers.push(
    `To: ${opts.to}`,
    `Subject: ${encodedSubject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/plain; charset="UTF-8"`,
    `Content-Transfer-Encoding: base64`,
    ``,
    utf8ToBase64(opts.text),
    ``,
    `--${boundary}`,
    `Content-Type: text/html; charset="UTF-8"`,
    `Content-Transfer-Encoding: base64`,
    ``,
    utf8ToBase64(opts.html),
    ``,
    `--${boundary}--`
  );

  const raw = toBase64Url(headers.join('\r\n'));

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${opts.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw }),
  });

  if (!res.ok) {
    let errText = '';
    try {
      const errJson = (await res.json()) as { error?: { message?: string } };
      errText = errJson.error?.message || '';
    } catch {
      // ignore
    }
    return {
      ok: false,
      status: res.status,
      error: errText || `Gmail API error (${res.status})`,
    };
  }

  return { ok: true, status: res.status };
}
