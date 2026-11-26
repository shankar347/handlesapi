const crypto = require('crypto');
const env = require('../config/env');

const hashCode = (code) => crypto.createHash('sha256').update(String(code)).digest('hex');

let etherealTransportPromise = null;

const getEtherealTransport = async () => {
  if (!etherealTransportPromise) {
    etherealTransportPromise = (async () => {
      // eslint-disable-next-line global-require
      const nodemailer = require('nodemailer');
      const testAccount = await nodemailer.createTestAccount();
      // eslint-disable-next-line no-console
      console.log(
        `[email] Ethereal test inbox ready user=${testAccount.user} (set SMTP_* or RESEND_API_KEY for real mail)`,
      );
      return {
        transport: nodemailer.createTransport({
          host: testAccount.smtp.host,
          port: testAccount.smtp.port,
          secure: testAccount.smtp.secure,
          auth: { user: testAccount.user, pass: testAccount.pass },
        }),
        from: `"Handles" <${testAccount.user}>`,
        isTest: true,
      };
    })();
  }
  return etherealTransportPromise;
};

const deliverViaResend = async ({ to, subject, text, html }) => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;

  const from = process.env.SMTP_FROM || process.env.RESEND_FROM || 'Handles <onboarding@resend.dev>';
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to: [to], subject, text, html }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body?.message || `Resend failed (${response.status})`);
  }
  return { delivered: true, provider: 'resend', id: body?.id || null };
};

const deliverViaSmtp = async ({ to, subject, text, html }) => {
  const host = process.env.SMTP_HOST;
  if (!host) return null;

  // eslint-disable-next-line global-require
  const nodemailer = require('nodemailer');
  const transport = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' }
      : undefined,
  });
  const info = await transport.sendMail({
    from: process.env.SMTP_FROM || 'Handles <noreply@handles.app>',
    to,
    subject,
    text,
    html,
  });
  return { delivered: true, provider: 'smtp', id: info.messageId || null };
};

const deliverViaEthereal = async ({ to, subject, text, html }) => {
  // eslint-disable-next-line global-require
  const nodemailer = require('nodemailer');
  const { transport, from } = await getEtherealTransport();
  const info = await transport.sendMail({ from, to, subject, text, html });
  const previewUrl = nodemailer.getTestMessageUrl(info);
  // eslint-disable-next-line no-console
  console.log(`[email:ethereal] to=${to} preview=${previewUrl || 'n/a'}`);
  return {
    delivered: true,
    provider: 'ethereal',
    previewUrl: previewUrl || null,
    isTest: true,
  };
};

const deliverEmail = async ({ to, subject, text, html }) => {
  try {
    const resend = await deliverViaResend({ to, subject, text, html });
    if (resend) return resend;

    const smtp = await deliverViaSmtp({ to, subject, text, html });
    if (smtp) return smtp;

    // No real provider configured — still send via Ethereal so the pipeline works in local/dev,
    // and callers can fall back to returning the OTP code in the API response.
    if (!env.isProduction || process.env.EMAIL_ALLOW_TEST_FALLBACK === 'true') {
      return deliverViaEthereal({ to, subject, text, html });
    }

    // eslint-disable-next-line no-console
    console.error('[email] No RESEND_API_KEY or SMTP_HOST configured — email not sent');
    return {
      delivered: false,
      provider: 'none',
      error: 'Email provider not configured (set RESEND_API_KEY or SMTP_HOST)',
    };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[email] send failed', error.message);
    return {
      delivered: false,
      provider: 'error',
      error: error.message || 'Email send failed',
    };
  }
};

const issueEmailCode = async (user) => {
  const code = String(crypto.randomInt(100000, 999999));
  user.emailVerifyHash = hashCode(code);
  user.emailVerifyExpires = new Date(Date.now() + 30 * 60 * 1000);
  user.emailVerifySentAt = new Date();
  await user.save();

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#1E212D">
      <h2 style="margin:0 0 12px">Confirm your Handles email</h2>
      <p>Your verification code is:</p>
      <p style="font-size:28px;font-weight:700;letter-spacing:4px;color:#00ABBB">${code}</p>
      <p>This code expires in 30 minutes.</p>
    </div>
  `;

  const delivery = await deliverEmail({
    to: user.email,
    subject: 'Your Handles verification code',
    text: `Your Handles verification code is ${code}. It expires in 30 minutes.`,
    html,
  });

  const allowDevCode =
    !env.isProduction ||
    process.env.EMAIL_RETURN_DEV_CODE === 'true' ||
    !delivery.delivered ||
    delivery.isTest;

  // eslint-disable-next-line no-console
  console.log(
    `[email] otp issued to=${user.email} delivered=${delivery.delivered} provider=${delivery.provider}${
      allowDevCode ? ` code=${code}` : ''
    }`,
  );

  return {
    sent: Boolean(delivery.delivered),
    emailDelivered: Boolean(delivery.delivered && !delivery.isTest),
    provider: delivery.provider,
    previewUrl: delivery.previewUrl || undefined,
    error: delivery.error,
    // Always return code when mail isn't a real provider so the app can still verify.
    devCode: allowDevCode ? code : undefined,
  };
};

const codeMatches = (user, code) => {
  if (!user?.emailVerifyHash || !user.emailVerifyExpires) return false;
  if (user.emailVerifyExpires.getTime() < Date.now()) return false;
  const given = hashCode(String(code || '').trim());
  const a = Buffer.from(user.emailVerifyHash);
  const b = Buffer.from(given);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
};

module.exports = {
  issueEmailCode,
  codeMatches,
  deliverEmail,
};
