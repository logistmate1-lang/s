import process from 'node:process';
import { Resend } from 'resend';

export const DEFAULT_OWNER_EMAIL = 'logistmate1@gmail.com';
export const MAX_MESSAGE_LENGTH = 2000;

export interface SendOutcome {
  ok: boolean;
  status: number;
  provider?: string;
  id?: string;
  code?: string;
  recipientEmail?: string;
  error?: string;
}

function stripSurroundingQuotes(value: string): string {
  return value.trim().replace(/^["'](.*)["']$/, '$1').trim();
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isValidEmailAddress(value: string): boolean {
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value);
}

function isValidFromAddress(value: string): boolean {
  if (!value || value.startsWith('re_')) return false;
  const bracketMatch = value.match(/<([^<>]+)>/);
  const emailPart = bracketMatch ? bracketMatch[1].trim() : value.trim();
  return isValidEmailAddress(emailPart);
}

export function resolveRecipientEmail(): string {
  const override = stripSurroundingQuotes(process.env.SECRET_MESSAGE_TO_EMAIL || '');
  return isValidEmailAddress(override) ? override : DEFAULT_OWNER_EMAIL;
}

function buildEmailHtml(message: string): string {
  return `
    <div style="font-family: Georgia, serif; max-width: 560px; margin: 0 auto; padding: 24px; background: #0b0e1c; color: #f1f5f9; border-radius: 12px;">
      <p style="font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; color: #fda4af; margin: 0 0 12px;">
        Secret message · For Hamidabonu
      </p>
      <p style="font-size: 16px; line-height: 1.7; white-space: pre-wrap; margin: 0; color: #e2e8f0;">${escapeHtml(message)}</p>
    </div>
  `;
}

export async function dispatchSecretMessage(message: string): Promise<SendOutcome> {
  const toEmail = resolveRecipientEmail();
  const resendApiKey = stripSurroundingQuotes(process.env.RESEND_API_KEY || '');

  if (!resendApiKey) {
    return {
      ok: false,
      status: 503,
      code: 'MISSING_RESEND_CONFIG',
      recipientEmail: toEmail,
      error:
        'Resend is not configured on the server yet. Add RESEND_API_KEY in your environment variables and restart/redeploy.',
    };
  }

  const resend = new Resend(resendApiKey);
  const configuredFrom = stripSurroundingQuotes(process.env.RESEND_FROM_EMAIL || '');
  const fromEmail = isValidFromAddress(configuredFrom)
    ? configuredFrom
    : 'For Hamidabonu <onboarding@resend.dev>';

  const { data, error } = await resend.emails.send({
    from: fromEmail,
    to: [toEmail],
    subject: 'New secret message (For Hamidabonu)',
    text: `You received a new secret message:\n\n${message}`,
    html: buildEmailHtml(message),
  });

  if (error) {
    return {
      ok: false,
      status: 502,
      code: 'RESEND_SEND_FAILED',
      provider: 'resend',
      recipientEmail: toEmail,
      error: error.message || `Could not send email to ${toEmail} via Resend.`,
    };
  }

  return {
    ok: true,
    status: 200,
    provider: 'resend',
    recipientEmail: toEmail,
    ...(data?.id ? { id: data.id } : {}),
  };
}
