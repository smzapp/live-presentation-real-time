import type { MailMessage } from './mail.service.js';
import { appUrl } from './mail.service.js';

const BRAND = 'LivePresentation';

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// One layout for every message: inline styles only, a single call-to-action
// button, and the same link repeated as text underneath for clients that
// strip buttons (and for anyone who'd rather copy it).
function layout({
  heading,
  lines,
  action,
  footer,
}: {
  heading: string;
  lines: string[];
  action?: { label: string; url: string };
  footer?: string;
}) {
  const body = lines
    .map((line) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#3f3f46">${escapeHtml(line)}</p>`)
    .join('');
  const button = action
    ? `<p style="margin:24px 0"><a href="${action.url}" style="display:inline-block;background:#4f46e5;color:#ffffff;font-size:15px;font-weight:500;text-decoration:none;padding:11px 20px;border-radius:10px">${escapeHtml(action.label)}</a></p>
       <p style="margin:0 0 14px;font-size:13px;line-height:1.6;color:#71717a">Or paste this link into your browser:<br><span style="color:#4f46e5;word-break:break-all">${action.url}</span></p>`
    : '';
  const note = footer
    ? `<p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#71717a">${escapeHtml(footer)}</p>`
    : '';
  return `<!doctype html><html><body style="margin:0;background:#f4f4f5;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;padding:32px">
    <p style="margin:0 0 24px;font-size:15px;font-weight:600;color:#18181b">${BRAND}</p>
    <h1 style="margin:0 0 16px;font-size:21px;line-height:1.3;color:#18181b">${escapeHtml(heading)}</h1>
    ${body}${button}${note}
  </div>
</body></html>`;
}

function textVersion(lines: string[], action?: { label: string; url: string }, footer?: string) {
  const parts = [...lines];
  if (action) parts.push(`${action.label}: ${action.url}`);
  if (footer) parts.push(footer);
  return parts.join('\n\n');
}

export function verifyEmailMessage(to: string, name: string, token: string): MailMessage {
  const url = `${appUrl()}/verify-email?token=${encodeURIComponent(token)}`;
  const lines = [
    `Hi ${name},`,
    `Welcome to ${BRAND}. Confirm this is your email address and your account is ready to go.`,
  ];
  const action = { label: 'Confirm my email', url };
  const footer = "This link is good for 24 hours. If you didn't create an account, you can ignore this email.";
  return {
    to,
    subject: `Confirm your ${BRAND} email`,
    text: textVersion(lines, action, footer),
    html: layout({ heading: 'Confirm your email', lines, action, footer }),
  };
}

export function passwordResetMessage(to: string, name: string, token: string): MailMessage {
  const url = `${appUrl()}/reset-password?token=${encodeURIComponent(token)}`;
  const lines = [
    `Hi ${name},`,
    'Someone asked to reset the password for this account. Choose a new one here:',
  ];
  const action = { label: 'Choose a new password', url };
  const footer =
    "This link is good for 1 hour and can only be used once. If you didn't ask for it, nothing has changed — you can ignore this email.";
  return {
    to,
    subject: `Reset your ${BRAND} password`,
    text: textVersion(lines, action, footer),
    html: layout({ heading: 'Reset your password', lines, action, footer }),
  };
}

// Confirmation after the fact, so a password change someone didn't make
// doesn't go unnoticed.
export function passwordChangedMessage(to: string, name: string): MailMessage {
  const lines = [
    `Hi ${name},`,
    'Your password was just changed. If that was you, there is nothing else to do.',
  ];
  const footer = "If it wasn't you, reset your password now and contact support.";
  const action = { label: 'Sign in', url: `${appUrl()}/login` };
  return {
    to,
    subject: `Your ${BRAND} password was changed`,
    text: textVersion(lines, action, footer),
    html: layout({ heading: 'Your password was changed', lines, action, footer }),
  };
}

export function testMessage(to: string): MailMessage {
  const lines = [
    `This is a test email from your ${BRAND} installation.`,
    'If it reached you, your SMTP settings are working.',
  ];
  return {
    to,
    subject: `${BRAND} test email`,
    text: textVersion(lines),
    html: layout({ heading: 'Your mail settings work', lines }),
  };
}
