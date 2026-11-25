const crypto = require('crypto');
const env = require('../config/env');

const hashCode = (code) => crypto.createHash('sha256').update(String(code)).digest('hex');

const deliverEmail = async ({ to, subject, text }) => {
  const host = process.env.SMTP_HOST;
  if (!host) {
    if (!env.isProduction) {
      // eslint-disable-next-line no-console
      console.log(`[email:dev] to=${to} subject="${subject}" ${text}`);
    }
    return { delivered: false, devLogged: !env.isProduction };
  }

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
  await transport.sendMail({
    from: process.env.SMTP_FROM || 'Handles <noreply@handles.app>',
    to,
    subject,
    text,
  });
  return { delivered: true };
};

const issueEmailCode = async (user) => {
  const code = String(crypto.randomInt(100000, 999999));
  user.emailVerifyHash = hashCode(code);
  user.emailVerifyExpires = new Date(Date.now() + 30 * 60 * 1000);
  user.emailVerifySentAt = new Date();
  await user.save();
  await deliverEmail({
    to: user.email,
    subject: 'Confirm your Handles email',
    text: `Your Handles verification code is ${code}. It expires in 30 minutes.`,
  });
  return {
    sent: true,
    devCode: env.isProduction ? undefined : code,
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
